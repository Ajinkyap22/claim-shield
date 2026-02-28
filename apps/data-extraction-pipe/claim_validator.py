"""
JSON Validator: parse and validate LLM output as claim-ready JSON.
Handles markdown code blocks and optional schema checks.
"""
import json
import re
from typing import Any


def extract_json_from_text(llm_text: str) -> str:
    """Extract JSON string from LLM response (may be wrapped in ```json ... ```)."""
    text = llm_text.strip()
    # Code block: ```json ... ``` or ``` ... ```
    match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text


def validate_claim_json(raw: str) -> dict[str, Any]:
    """
    Parse LLM output as JSON and return validated claim structure.
    Raises ValueError if not valid JSON. Does not enforce full schema; optional keys allowed.
    """
    json_str = extract_json_from_text(raw)
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON from LLM: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("Claim JSON must be a JSON object")
    return data


def validate_claim_json_with_schema(raw: str) -> dict[str, Any]:
    """
    Parse and validate that claim has expected top-level keys for downstream FHIR.
    Normalizes diagnosis/diagnoses and procedure/procedures.
    """
    data = validate_claim_json(raw)
    # Normalize common LLM key variants
    if "diagnosis" in data and "diagnoses" not in data:
        data["diagnoses"] = data.pop("diagnosis") if isinstance(data["diagnosis"], list) else [data.pop("diagnosis")]
    if "procedure" in data and "procedures" not in data:
        data["procedures"] = data.pop("procedure") if isinstance(data["procedure"], list) else [data.pop("procedure")]
    expected = {"diagnoses", "procedures"}
    missing = expected - set(data.keys())
    if missing:
        raise ValueError(f"Claim JSON missing required keys: {missing}. Got keys: {list(data.keys())}")
    if not isinstance(data.get("diagnoses"), list):
        data["diagnoses"] = list(data.get("diagnoses") or [])
    if not isinstance(data.get("procedures"), list):
        data["procedures"] = list(data.get("procedures") or [])
    return data
