"""
Main pipeline: clinical note → FHIR R4 Bundle.

Step 0: Initialize ChromaDB vector store
Step 1: PHI scrub (de-identify)
Step 1b: Extract any ICD/CPT codes already written in the note → seed into ChromaDB
Step 2: NER (d4data/biomedical-ner-all)
Step 3: Negation filter + confidence threshold
Step 4: Entity merger (sentence grouping + adjacent span merge)
Step 5-6: Fetch real codes (NLM API + SQLite cache) → upsert to ChromaDB → query top-3 per entity
Step 7: LLM (OpenRouter) selects codes from verified candidates only
Step 8: Validate JSON → reattach PHI → build FHIR R4 Bundle
         (fallback: build claim directly from vector results if LLM fails)

Call run_pipeline(text) to execute the full pipeline and get back a FHIR bundle dict.
"""
from transformers import pipeline as hf_pipeline, AutoTokenizer, AutoModelForTokenClassification

from llm_client import query_openrouter, build_prompt_with_candidates
from phi_scrubber import scrub_phi
from claim_validator import validate_claim_json_with_schema
from phi_reattach import reattach_phi
from fhir_builder import build_fhir_bundle
from code_extractor import extract_explicit_codes
from negation_filter import filter_entities
from entity_merger import merge_entities
from code_assigner import (
    assign_codes_to_entities,
    format_candidates_for_prompt,
    build_claim_from_coded_entities,
)
from vector_store import initialize_vector_store, upsert_codes
from code_fetcher import CodeResult, lookup_code_description

# ── Lazy-loaded globals (initialized once, reused across requests) ────────────
_ner = None
_chroma_client = None


def _get_resources():
    """Initialize NER model and ChromaDB client once; reuse on subsequent calls."""
    global _ner, _chroma_client

    if _chroma_client is None:
        print("[init] Initializing vector store...")
        _chroma_client = initialize_vector_store()

    if _ner is None:
        print("[init] Loading NER model (d4data/biomedical-ner-all)...")
        model_name = "d4data/biomedical-ner-all"
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForTokenClassification.from_pretrained(model_name)
        _ner = hf_pipeline("ner", model=model, tokenizer=tokenizer, aggregation_strategy="max")
        print("[init] NER model ready.")

    return _ner, _chroma_client


def run_pipeline(raw_text: str) -> tuple[dict, list[dict] | None]:
    """
    Run the full clinical NLP → FHIR R4 pipeline on raw_text.

    Args:
        raw_text: Unredacted clinical note (may contain PHI).

    Returns:
        Tuple of (FHIR R4 Bundle dict, token_usage list or None).
    """
    import datetime
    print("start time:", datetime.datetime.now())

    ner, chroma_client = _get_resources()

    # ── Step 1: PHI scrub ────────────────────────────────────────────────────
    print("\n[1] Scrubbing PHI...")
    scrubbed_text, phi_map = scrub_phi(raw_text)
    # Do not log phi_map: it contains PHI (patient name, DOB, NPI, etc.)

    # ── Step 1b: Extract explicit codes already in the note ──────────────────
    print("\n[1b] Extracting explicit codes from text...")
    explicit_icd, explicit_cpt = extract_explicit_codes(scrubbed_text)
    print(f"     Explicit ICD: {explicit_icd}")
    print(f"     Explicit CPT: {explicit_cpt}")

    if explicit_icd:
        upsert_codes(
            [CodeResult(code=c, description=lookup_code_description(c, "icd10") or c, source="static") for c in explicit_icd],
            "icd10",
            chroma_client,
        )
    if explicit_cpt:
        upsert_codes(
            [CodeResult(code=c, description=lookup_code_description(c, "cpt") or c, source="static") for c in explicit_cpt],
            "cpt",
            chroma_client,
        )

    # ── Step 2: NER ──────────────────────────────────────────────────────────
    print("\n[2] Running NER...")
    raw_ner_result = ner(scrubbed_text)
    print(f"    Raw entities: {len(raw_ner_result)}")

    # ── Step 3: Negation filter ───────────────────────────────────────────────
    print("\n[3] Applying negation filter...")
    filtered = filter_entities(raw_ner_result, scrubbed_text)
    print(f"    After filter: {len(filtered)} entities (dropped {len(raw_ner_result) - len(filtered)})")

    # ── Step 4: Entity merger ─────────────────────────────────────────────────
    print("\n[4] Merging entities...")
    merged = merge_entities(filtered, scrubbed_text)

    # Deduplicate: same (lowercased text, entity_group) → keep highest score
    seen: dict[tuple, object] = {}
    for e in merged:
        key = (e.text.lower().strip(), e.entity_group)
        if key not in seen or e.score > seen[key].score:
            seen[key] = e
    merged = list(seen.values())

    print(f"    Merged entities: {len(merged)}")
    # Do not log entity text: it may contain clinical terms that could be identifying in context

    # ── Steps 5-6: Code fetch + vector DB ────────────────────────────────────
    print("\n[5-6] Fetching real codes and querying vector store...")
    coded_entities = assign_codes_to_entities(merged, chroma_client)
    candidates_text = format_candidates_for_prompt(coded_entities)
    # Do not log candidates_text: may contain clinical/claim content
    print("    Candidates: prepared for LLM")

    # ── Step 7: LLM with grounded candidates ──────────────────────────────────
    print("\n[7] Querying LLM (codes grounded by vector search)...")
    openrouter_response, llm_usage = query_openrouter(
        [{"word": ce.entity.text, "entity_group": ce.entity.entity_group} for ce in coded_entities],
        scrubbed_text,
        prompt_instruction=build_prompt_with_candidates(candidates_text),
    )
    token_usage = [llm_usage] if llm_usage else []
    # Do not log LLM response: it may contain reattached PHI after downstream processing
    if openrouter_response:
        print("    LLM response: received (length omitted for PHI)")
    else:
        print("    LLM response: none")

    # ── Step 8: Validate → PHI reattach → FHIR ───────────────────────────────
    print("\n[8] Building FHIR bundle...")
    if openrouter_response:
        try:
            claim_json = validate_claim_json_with_schema(openrouter_response)
            print("    JSON validated (LLM path).")
        except ValueError as e:
            print(f"    JSON validation failed ({e}), using vector fallback.")
            claim_json = build_claim_from_coded_entities(coded_entities)
    else:
        print("    No LLM response, using vector fallback.")
        claim_json = build_claim_from_coded_entities(coded_entities)

    claim_with_phi = reattach_phi(claim_json, phi_map)
    fhir_bundle = build_fhir_bundle(claim_with_phi, phi_map)

    print(f"    Resources in bundle: {len(fhir_bundle.get('entry', []))}")
    print("\nend time:", datetime.datetime.now())
    return fhir_bundle, token_usage


# ── Direct script execution ───────────────────────────────────────────────────
if __name__ == "__main__":
    from sample_text import text as raw_text
    result, usage = run_pipeline(raw_text)
    # Do not print full result: it contains reattached PHI
    entry_count = len(result.get("entry", []))
    print(f"\nPipeline complete. Bundle has {entry_count} entries.")
    if usage:
        print(f"Token usage: {usage}")
