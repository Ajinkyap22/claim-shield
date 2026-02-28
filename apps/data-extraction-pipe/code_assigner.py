"""
Code assigner: per-entity fetch → upsert → vector query → top-3 candidates.
Also provides LLM prompt formatting and a fallback FHIR claim builder.
"""
from dataclasses import dataclass, field

import chromadb

from code_fetcher import CodeResult, fetch_codes_for_entity
from entity_merger import MergedEntity
from vector_store import query_codes, upsert_codes

ENTITY_TO_CODE_TYPE: dict[str, str] = {
    "Sign_symptom": "icd10",
    "Disease_disorder": "icd10",
    "Biological_structure": "icd10",
    "Therapeutic_procedure": "cpt",
    "Diagnostic_procedure": "cpt",
}

_TYPE_HINTS: dict[str, str] = {
    "Sign_symptom": "[symptom]",
    "Disease_disorder": "[disease]",
    "Biological_structure": "[anatomy]",
    "Therapeutic_procedure": "[procedure]",
    "Diagnostic_procedure": "[diagnostic]",
    "Medication": "[medication]",
}


@dataclass
class CodedEntity:
    entity: MergedEntity
    code_type: str
    candidates: list[dict] = field(default_factory=list)
    assigned_code: str = ""
    assigned_description: str = ""


def _get_query_text(entity: MergedEntity) -> str:
    """Build a rich query string: expand short spans with sentence context + type hint."""
    text = entity.text
    words = text.split()
    if len(words) < 3 and entity.sentence_context:
        ctx = entity.sentence_context
        idx = ctx.find(text)
        if idx != -1:
            prefix = ctx[max(0, idx - 30):idx].strip()
            suffix = ctx[idx + len(text):idx + len(text) + 30].strip()
            text = f"{prefix} {text} {suffix}".strip()
    hint = _TYPE_HINTS.get(entity.entity_group, "")
    return f"{text} {hint}".strip()


def assign_codes_to_entities(
    merged_entities: list[MergedEntity],
    chroma_client: chromadb.PersistentClient,
    top_k: int = 3,
) -> list[CodedEntity]:
    """
    For each entity:
    1. Determine code type (skip if not mappable)
    2. Fetch real codes from NLM API + SQLite cache
    3. Upsert fetched codes into ChromaDB
    4. Query ChromaDB for top-k semantic matches
    5. Set assigned_code = top candidate (LLM may override)
    """
    coded: list[CodedEntity] = []

    for entity in merged_entities:
        code_type = ENTITY_TO_CODE_TYPE.get(entity.entity_group)
        if not code_type:
            continue

        fetched = fetch_codes_for_entity(entity.text, entity.entity_group)
        if fetched:
            upsert_codes(fetched, code_type, chroma_client)

        query = _get_query_text(entity)
        candidates = query_codes(query, code_type, top_k=top_k, client=chroma_client)

        coded.append(CodedEntity(
            entity=entity,
            code_type=code_type,
            candidates=candidates,
            assigned_code=candidates[0]["code"] if candidates else "",
            assigned_description=candidates[0]["description"] if candidates else entity.text,
        ))

    return coded


def format_candidates_for_prompt(coded_entities: list[CodedEntity]) -> str:
    """
    Format vector search results as a structured block to inject into the LLM prompt.
    Example output:
        Entity: "low back pain radiating to left leg" (Sign_symptom)
        ICD-10 Candidates:
          1. M54.50 - Low back pain, unspecified (similarity: 0.91)
          ...
    """
    lines: list[str] = []
    for ce in coded_entities:
        type_label = "ICD-10" if ce.code_type == "icd10" else "CPT"
        lines.append(f'Entity: "{ce.entity.text}" ({ce.entity.entity_group})')
        lines.append(f"{type_label} Candidates:")
        if ce.candidates:
            for i, c in enumerate(ce.candidates, 1):
                lines.append(f"  {i}. {c['code']} - {c['description']} (similarity: {c['distance']:.2f})")
        else:
            lines.append("  (no candidates found — use your best judgment)")
        lines.append("")
    return "\n".join(lines)


def build_claim_from_coded_entities(
    coded_entities: list[CodedEntity],
    phi_map=None,
) -> dict:
    """
    Fallback claim builder when LLM fails.
    Builds the standard claim dict directly from vector-assigned codes.
    """
    diagnoses = []
    procedures = []
    for ce in coded_entities:
        if ce.code_type == "icd10" and ce.assigned_code:
            diagnoses.append({"code": ce.assigned_code, "display": ce.assigned_description})
        elif ce.code_type == "cpt" and ce.assigned_code:
            procedures.append({
                "code": ce.assigned_code,
                "display": ce.assigned_description,
                "diagnosisLinkId": 1,
            })
    return {
        "patient": "[PATIENT_NAME]",
        "dateOfBirth": "[DOB]",
        "dateOfService": "[SERVICE_DATE]",
        "provider": "[PROVIDER_NAME]",
        "npi": "[PROVIDER_ID]",
        "facility": "[FACILITY]",
        "diagnoses": diagnoses,
        "procedures": procedures,
    }
