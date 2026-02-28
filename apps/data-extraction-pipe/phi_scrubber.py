"""
PHI Scrubber: preprocessing layer that de-identifies clinical notes.
Replaces PHI with placeholders and returns a mapping for reattachment (e.g. from DB).
"""
import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PHIMap:
    """Stored PHI for reattachment after downstream processing."""
    patient_name: str | None = None
    dob: str | None = None
    provider_id: str | None = None  # NPI
    provider_name: str | None = None
    facility: str | None = None
    insurer: str | None = None
    dates: list[dict[str, str]] = field(default_factory=list)  # [{"token": "[SERVICE_DATE]", "value": "02/25/2026"}, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "patient_name": self.patient_name,
            "dob": self.dob,
            "provider_id": self.provider_id,
            "provider_name": self.provider_name,
            "facility": self.facility,
            "insurer": self.insurer,
            "dates": self.dates,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> "PHIMap":
        if not d:
            return cls()
        return cls(
            patient_name=d.get("patient_name"),
            dob=d.get("dob"),
            provider_id=d.get("provider_id"),
            provider_name=d.get("provider_name"),
            facility=d.get("facility"),
            insurer=d.get("insurer"),
            dates=list(d.get("dates") or []),
        )


# Placeholder tokens (must match what we emit)
PATIENT_NAME = "[PATIENT_NAME]"
DOB = "[DOB]"
PROVIDER_ID = "[PROVIDER_ID]"
PROVIDER_NAME = "[PROVIDER_NAME]"
FACILITY = "[FACILITY]"

# Relative date tokens
SERVICE_DATE = "[SERVICE_DATE]"
DATE_IMAGING = "[DATE_IMAGING]"
DATE_GENERIC_PREFIX = "[DATE_"


def scrub_phi(raw_text: str) -> tuple[str, PHIMap]:
    """
    Scrub PHI from raw clinical note. Returns (scrubbed_text, phi_map).
    phi_map holds original values for reattachment from DB.
    """
    phi = PHIMap()
    text = raw_text

    # ---- 1. Patient name (e.g. "Patient: Michael R." or "Patient: John Doe,") ----
    patient_match = re.search(
        r"Patient:\s*([A-Za-z][A-Za-z\.\-\s]+?)(?=\s*,|\s+DOB|\s*$)",
        text,
        re.MULTILINE | re.DOTALL,
    )
    if patient_match:
        name = patient_match.group(1).strip()
        phi.patient_name = name
        text = text.replace(patient_match.group(0), f"Patient: {PATIENT_NAME}", 1)

    # ---- 2. DOB (DOB 11/08/1975 or DOB: 11/08/1975, various date formats) ----
    dob_patterns = [
        r"DOB[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})",
        r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s*\(DOB\)",
    ]
    for pat in dob_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            phi.dob = m.group(1).strip()
            text = re.sub(pat, f"DOB {DOB}", text, count=1, flags=re.IGNORECASE)
            break

    # ---- 3. NPI (10 digits, often "NPI: 9876543210") ----
    npi_match = re.search(r"NPI[:\s]*(\d{10})", text, re.IGNORECASE)
    if npi_match:
        phi.provider_id = npi_match.group(1)
        text = text.replace(npi_match.group(0), f"NPI: {PROVIDER_ID}", 1)

    # ---- 4. Facility (e.g. "Facility: Central Spine & Pain Management Center") ----
    facility_match = re.search(r"Facility[:\s]+(.+?)(?=\s*$|\s*NPI:)", text, re.MULTILINE | re.DOTALL | re.IGNORECASE)
    if facility_match:
        phi.facility = facility_match.group(1).strip()
        text = (
            text[: facility_match.start(1)]
            + FACILITY
            + text[facility_match.end(1) :]
        )

    # ---- 5. Attending / provider name ----
    attending_match = re.search(
        r"Attending[:\s]+(Dr\.?\s*[A-Za-z][A-Za-z\.\-\s]+?,?\s*M\.?D\.?).*?(?=\s*Facility:|\s*$)",
        text,
        re.MULTILINE | re.IGNORECASE,
    )
    if attending_match:
        phi.provider_name = attending_match.group(1).strip()
        text = (
            text[: attending_match.start(1)]
            + PROVIDER_NAME
            + text[attending_match.end(1) :]
        )

    # ---- 6. Insurer / Payer ----
    insurer_match = re.search(
        r"(?:Insurer|Insurance|Payer|Payor)[:\s]+(.+?)(?=\s*\n|\s*$)",
        text,
        re.MULTILINE | re.IGNORECASE,
    )
    if insurer_match:
        phi.insurer = insurer_match.group(1).strip()

    # ---- 7. Exact dates → relative tokens ----
    dos_match = re.search(
        r"Date of Service[:\s]+(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})",
        text,
        re.IGNORECASE,
    )
    if dos_match:
        phi.dates.append({"token": SERVICE_DATE, "value": dos_match.group(1)})
        text = re.sub(
            r"Date of Service[:\s]+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}",
            f"Date of Service: {SERVICE_DATE}",
            text,
            count=1,
            flags=re.IGNORECASE,
        )

    # Other standalone dates
    date_pattern = re.compile(r"\b(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\b")
    date_index = [0]

    def replace_date(match: re.Match) -> str:
        val = match.group(1)
        if val == phi.dob or any(d["value"] == val for d in phi.dates):
            return match.group(0)
        idx = date_index[0]
        date_index[0] += 1
        if idx == 0 and not any(d["token"] == DATE_IMAGING for d in phi.dates):
            token = DATE_IMAGING
        else:
            token = f"{DATE_GENERIC_PREFIX}{idx + 1}]"
        phi.dates.append({"token": token, "value": val})
        return token

    text = date_pattern.sub(replace_date, text)

    return text.strip(), phi


def scrub(text: str) -> tuple[str, PHIMap]:
    """Alias for scrub_phi."""
    return scrub_phi(text)
