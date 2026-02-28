"""
Reattach PHI from DB (phi_map) into structured JSON after downstream processing.
Replaces placeholders [PATIENT_NAME], [DOB], [PROVIDER_ID], etc. with stored values.
"""
from typing import Any
from copy import deepcopy

from phi_scrubber import PHIMap, PATIENT_NAME, DOB, PROVIDER_ID, PROVIDER_NAME, FACILITY, SERVICE_DATE, DATE_IMAGING, DATE_GENERIC_PREFIX


def _replacement_map(phi: PHIMap) -> dict[str, str]:
    """Build token -> value map for string replacement."""
    m: dict[str, str] = {}
    if phi.patient_name is not None:
        m[PATIENT_NAME] = phi.patient_name
    if phi.dob is not None:
        m[DOB] = phi.dob
    if phi.provider_id is not None:
        m[PROVIDER_ID] = phi.provider_id
    if phi.provider_name is not None:
        m[PROVIDER_NAME] = phi.provider_name
    if phi.facility is not None:
        m[FACILITY] = phi.facility
    for d in phi.dates:
        m[d["token"]] = d["value"]
    # [DATE_1], [DATE_2], ...
    for d in phi.dates:
        token = d["token"]
        if token.startswith(DATE_GENERIC_PREFIX) and token != DATE_IMAGING:
            m[token] = d["value"]
    return m


def _replace_in_string(s: str, repl: dict[str, str]) -> str:
    for token, value in repl.items():
        s = s.replace(token, value)
    return s


def reattach_phi(data: dict[str, Any] | list[Any], phi_map: PHIMap) -> dict[str, Any] | list[Any]:
    """
    Recursively replace PHI placeholders in structured data with values from phi_map.
    Returns a deep copy with placeholders filled. Safe for nested dicts/lists/strings.
    """
    repl = _replacement_map(phi_map)

    def walk(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: walk(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [walk(v) for v in obj]
        if isinstance(obj, str):
            return _replace_in_string(obj, repl)
        return obj

    return walk(deepcopy(data))


