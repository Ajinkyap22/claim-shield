"""
FHIR R4 Builder: build FHIR Bundle from validated claim JSON (after PHI reattachment).
Produces Patient, Practitioner, Organization, Claim, Condition, Procedure.
Uses minimal required fields for FHIR R4 compatibility.
"""
import re
import uuid
from typing import Any

# Matches unreplaced PHI placeholder tokens like [PATIENT_NAME], [DOB], [SERVICE_DATE], etc.
_PLACEHOLDER_RE = re.compile(r'^\[(?:PATIENT_NAME|DOB|PROVIDER_ID|PROVIDER_NAME|FACILITY|SERVICE_DATE|DATE_\w+)\]$')


def _is_placeholder(s: str | None) -> bool:
    """Return True if the value is still an unreplaced PHI placeholder token."""
    return bool(s and _PLACEHOLDER_RE.match(str(s).strip()))


def _new_id() -> str:
    return str(uuid.uuid4())


def build_fhir_bundle(
    claim: dict[str, Any],
    phi_map: Any = None,
) -> dict[str, Any]:
    """
    Build a FHIR R4 Bundle containing Patient, Practitioner, Organization, Claim, Conditions, Procedures.
    claim: validated + reattached claim JSON (patient, dateOfService, provider, npi, facility, diagnoses, procedures).
    phi_map: optional PHIMap for fallback PHI (if claim keys still missing).
    """
    # Use claim (already reattached) and optional phi for fallback
    # Strip out any values that are still unreplaced PHI placeholder tokens
    def _val(v: str | None) -> str | None:
        return None if _is_placeholder(v) else v

    patient_name = _val(claim.get("patient")) or (phi_map.patient_name if phi_map else None) or "Unknown"
    dob = _val(claim.get("dateOfBirth")) or (phi_map.dob if phi_map else None)
    provider_name = _val(claim.get("provider")) or (phi_map.provider_name if phi_map else None) or "Unknown"
    npi = _val(claim.get("npi")) or (phi_map.provider_id if phi_map else None)
    facility = _val(claim.get("facility")) or (phi_map.facility if phi_map else None)
    insurer = _val(claim.get("payer")) or (phi_map.insurer if phi_map and hasattr(phi_map, "insurer") else None) or "Unknown"
    raw_dos = _val(claim.get("dateOfService")) or (phi_map.dates[0]["value"] if phi_map and phi_map.dates else None)
    date_of_service = _normalize_fhir_date(raw_dos) if raw_dos else None

    patient_id = _new_id()
    practitioner_id = _new_id()
    org_id = _new_id()
    claim_id = _new_id()

    # Patient
    patient = {
        "resourceType": "Patient",
        "id": patient_id,
        "meta": {"profile": ["http://hl7.org/fhir/StructureDefinition/Patient"]},
        "name": [{"use": "official", "text": patient_name}],
    }
    dob_normalized = _normalize_fhir_date(dob) if dob else None
    if dob_normalized and not _is_placeholder(dob_normalized):
        patient["birthDate"] = dob_normalized

    # Practitioner
    practitioner = {
        "resourceType": "Practitioner",
        "id": practitioner_id,
        "meta": {"profile": ["http://hl7.org/fhir/StructureDefinition/Practitioner"]},
        "name": [{"use": "official", "text": provider_name}],
    }
    if npi and not _is_placeholder(npi):
        practitioner["identifier"] = [
            {"system": "http://hl7.org/fhir/sid/us-npi", "value": npi}
        ]

    # Organization (facility)
    organization = {
        "resourceType": "Organization",
        "id": org_id,
        "meta": {"profile": ["http://hl7.org/fhir/StructureDefinition/Organization"]},
        "name": facility or "Unknown",
    }

    # Conditions (diagnoses)
    conditions = []
    diagnosis_refs = []
    for i, dx in enumerate(claim.get("diagnoses") or []):
        if isinstance(dx, str):
            dx = {"display": dx}
        cond_id = _new_id()
        code = dx.get("code") or dx.get("icd10") or ""
        display = dx.get("display") or dx.get("description") or code
        conditions.append({
            "resourceType": "Condition",
            "id": cond_id,
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]},
            "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}]},
            "code": {
                "coding": [
                    {"system": "http://hl7.org/fhir/sid/icd-10-cm", "code": code, "display": display}
                ]
            },
            "subject": {"reference": f"Patient/{patient_id}"},
        })
        diagnosis_refs.append({"sequence": i + 1, "diagnosisReference": {"reference": f"Condition/{cond_id}"}})

    # Procedures
    procedures = []
    claim_items = []
    for i, px in enumerate(claim.get("procedures") or []):
        if isinstance(px, str):
            px = {"display": px}
        proc_id = _new_id()
        code = px.get("code") or px.get("cpt") or ""
        display = px.get("display") or px.get("description") or code
        proc_date = _normalize_fhir_date(px.get("performedDateTime") or "") or date_of_service
        proc_resource = {
            "resourceType": "Procedure",
            "id": proc_id,
            "status": "completed",
            "code": {
                "coding": [
                    {"system": "http://www.ama-assn.org/go/cpt", "code": code, "display": display}
                ]
            },
            "subject": {"reference": f"Patient/{patient_id}"},
        }
        if proc_date and not _is_placeholder(proc_date):
            proc_resource["performedDateTime"] = proc_date
        procedures.append(proc_resource)
        # Claim item (line item) — only include diagnosisLinkId when diagnoses exist
        link_id = px.get("diagnosisLinkId")
        claim_item: dict[str, Any] = {
            "sequence": i + 1,
            "productOrService": {
                "coding": [{"system": "http://www.ama-assn.org/go/cpt", "code": code, "display": display}]
            },
        }
        if diagnosis_refs:
            claim_item["diagnosisLinkId"] = [link_id if isinstance(link_id, int) else 1]
        claim_items.append(claim_item)

    # Claim resource
    fhir_claim = {
        "resourceType": "Claim",
        "id": claim_id,
        "meta": {"profile": ["http://hl7.org/fhir/StructureDefinition/Claim"]},
        "status": "active",
        "type": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/claim-type", "code": "professional"}]},
        "use": "claim",
        "patient": {"reference": f"Patient/{patient_id}"},
        **({"created": date_of_service} if date_of_service and not _is_placeholder(date_of_service) else {}),
        "priority": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/processpriority", "code": "normal"}]},
        "provider": {"reference": f"Practitioner/{practitioner_id}"},
        "insurer": {"display": insurer},
        "facility": {"reference": f"Organization/{org_id}"},
        "diagnosis": diagnosis_refs,
        "item": claim_items,
    }

    # Bundle
    entries = [
        {"fullUrl": f"urn:uuid:{patient_id}", "resource": patient},
        {"fullUrl": f"urn:uuid:{practitioner_id}", "resource": practitioner},
        {"fullUrl": f"urn:uuid:{org_id}", "resource": organization},
        {"fullUrl": f"urn:uuid:{claim_id}", "resource": fhir_claim},
    ]
    for c in conditions:
        entries.append({"fullUrl": f"urn:uuid:{c['id']}", "resource": c})
    for p in procedures:
        entries.append({"fullUrl": f"urn:uuid:{p['id']}", "resource": p})

    return {
        "resourceType": "Bundle",
        "id": _new_id(),
        "meta": {"profile": ["http://hl7.org/fhir/StructureDefinition/Bundle"]},
        "type": "collection",
        "entry": entries,
    }


def _normalize_fhir_date(s: str) -> str:
    """Try to normalize to FHIR date (YYYY-MM-DD)."""
    if not s:
        return s
    s = s.strip()
    # Already YYYY-MM-DD
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    # MM/DD/YYYY or MM-DD-YYYY
    parts = s.replace("-", "/").split("/")
    if len(parts) == 3:
        m, d, y = parts[0].zfill(2), parts[1].zfill(2), parts[2]
        if len(y) == 2:
            y = "20" + y
        return f"{y}-{m}-{d}"
    return s
