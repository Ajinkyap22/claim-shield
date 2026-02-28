"""
Explicit code extractor: finds ICD-10 and CPT codes already written in the clinical note.
These are seeded into ChromaDB so they score highly in future vector queries.
"""
import re

# CPT codes are 5-digit numbers in range 10000–99999, often preceded by "CPT" keyword
# This avoids matching zip codes, room numbers, dosages, etc.
_CPT_PATTERN = re.compile(
    r"(?:CPT\s*:?\s*)?(\b[1-9]\d{4}\b)",
    re.IGNORECASE,
)
# Only accept 5-digit numbers that appear after a CPT label OR fall in valid CPT ranges
_VALID_CPT_PREFIXES = {"1", "2", "3", "4", "5", "6", "7", "8", "9"}
_CPT_RANGE = range(10000, 100000)


def extract_explicit_codes(text: str) -> tuple[list[str], list[str]]:
    """
    Extract ICD-10 and CPT codes explicitly written in the text.
    Returns (icd_codes, cpt_codes) as deduplicated lists.
    """
    icd_codes = re.findall(r"\b[A-Z]\d{2}(?:\.\d+)?\b", text)

    # Only extract CPT codes that appear with a "CPT" label to avoid false positives
    cpt_codes = re.findall(r"CPT\s*:?\s*(\d{5})\b", text, re.IGNORECASE)

    return list(set(icd_codes)), list(set(cpt_codes))