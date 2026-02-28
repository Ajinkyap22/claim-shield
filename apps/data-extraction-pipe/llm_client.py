"""
LLM client: OpenRouter integration for claim-shield.
Get your API key at https://openrouter.ai/settings/keys
"""
import os
from pathlib import Path

# Load .env from this directory or project root (so OPENROUTER_* are set)
try:
    from dotenv import load_dotenv
    _dir = Path(__file__).resolve().parent
    load_dotenv(_dir / ".env") or load_dotenv(_dir.parent.parent / ".env")
except ImportError:
    pass  # use env vars only if python-dotenv not installed

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")


# Base prompt — placeholders allow PHI to be reattached from DB after LLM call
DEFAULT_PROMPT = """Output a single JSON object (no markdown) with exactly these keys.
Use the placeholders as shown so we can reattach PHI later.

- patient: "[PATIENT_NAME]"
- dateOfBirth: "[DOB]"
- dateOfService: "[SERVICE_DATE]"
- provider: "[PROVIDER_NAME]"
- npi: "[PROVIDER_ID]"
- facility: "[FACILITY]"
- diagnoses: array of { "code": "ICD-10 code", "display": "description" }
- procedures: array of { "code": "CPT code", "display": "description", "diagnosisLinkId": N }
  (diagnosisLinkId = 1-based index into diagnoses array)

Include severity and temporal context in display where relevant.
For diagnosisLinkId, link each procedure to its most specific and clinically relevant diagnosis
(e.g. link an epidural or nerve block injection to radiculopathy or disc displacement, not generic
low back pain; link therapeutic exercises to the primary musculoskeletal diagnosis).
Do not default all procedures to diagnosisLinkId 1 — use the index of the best-matching diagnosis."""


def build_prompt_with_candidates(candidates_text: str) -> str:
    """
    Extend DEFAULT_PROMPT with verified code candidates from vector search.
    Instructs the LLM to pick from real codes only — no hallucination.
    """
    return (
        DEFAULT_PROMPT
        + "\n\nIMPORTANT: Select codes ONLY from the verified candidates listed below. "
        "Do not invent or guess codes. If no candidate fits an entity, omit it.\n\n"
        "--- VERIFIED CODE CANDIDATES (NLM API + vector search) ---\n"
        + candidates_text
        + "--- END CANDIDATES ---\n"
    )


def query_openrouter(
    entities: list,
    text: str,
    prompt_instruction: str | None = None,
) -> str | None:
    """
    Send extracted entities and clinical note to OpenRouter for structured extraction.

    Args:
        entities: List of NER entity dicts with 'word' and 'entity_group' keys.
        text: Scrubbed clinical note text (PHI already removed).
        prompt_instruction: Custom instruction string. Defaults to DEFAULT_PROMPT.
    """
    if not OPENROUTER_API_KEY:
        print("OPENROUTER_API_KEY not set; skipping LLM call.")
        return None
    try:
        from openrouter import OpenRouter
        entities_str = "\n".join(
            f"- {e.get('word', '')} ({e.get('entity_group', e.get('entity', ''))})"
            for e in entities
        )
        instruction = prompt_instruction if prompt_instruction is not None else DEFAULT_PROMPT
        # Send full text — truncation loses procedures in longer notes
        prompt = (
            f"Given this clinical note and the entities extracted by NER:\n\n"
            f"Entities extracted:\n{entities_str}\n\n"
            f"Clinical note:\n{text}\n\n"
            f"{instruction}"
        )

        with OpenRouter(api_key=OPENROUTER_API_KEY) as client:
            response = client.chat.send(
                model=OPENROUTER_MODEL,
                messages=[{"role": "user", "content": prompt}],
            )
        return response.choices[0].message.content
    except ImportError:
        print("Install OpenRouter SDK: pip install openrouter")
        return None
