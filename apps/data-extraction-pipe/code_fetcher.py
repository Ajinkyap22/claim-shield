"""
Code fetcher: NLM Clinical Tables API + SQLite cache.
Fetches real ICD-10 / CPT codes for a given entity text.
No auth required — NLM API is free and public.
"""
import sqlite3
import requests
from dataclasses import dataclass
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "codes.db"

NLM_ICD_URL = "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search"
# NLM procedures API is deprecated/empty — CPT is AMA-proprietary, no free public API exists.
# CPT coverage relies on COMMON_CPT_CODES seeds + explicit codes extracted from notes.
NLM_CPT_URL = None

# Seed data — common ICD-10 codes (spine/pain/neurology) inserted on first run
COMMON_ICD_CODES = [
    ("M54.50", "Low back pain, unspecified"),
    ("M54.51", "Vertebrogenic low back pain"),
    ("M54.59", "Other low back pain"),
    ("M54.16", "Radiculopathy, lumbar region"),
    ("M54.12", "Radiculopathy, cervical region"),
    ("M54.10", "Radiculopathy, site unspecified"),
    ("M54.30", "Sciatica, unspecified side"),
    ("M54.31", "Sciatica, right side"),
    ("M54.32", "Sciatica, left side"),
    ("M54.40", "Lumbago with sciatica, unspecified side"),
    ("M51.16", "Intervertebral disc degeneration, lumbar region"),
    ("M51.26", "Other intervertebral disc displacement, lumbar region"),
    ("M51.37", "Other intervertebral disc degeneration, lumbosacral region"),
    ("M47.816", "Spondylosis with radiculopathy, lumbar region"),
    ("M47.806", "Spondylosis without myelopathy or radiculopathy, lumbar region"),
    ("M48.06", "Spinal stenosis, lumbar region"),
    ("M48.061", "Spinal stenosis, lumbar region without neurogenic claudication"),
    ("M48.062", "Spinal stenosis, lumbar region with neurogenic claudication"),
    ("M62.81", "Muscle weakness, generalized"),
    ("M76.60", "Achilles tendinitis, unspecified leg"),
    ("M76.61", "Achilles tendinitis, right leg"),
    ("M76.62", "Achilles tendinitis, left leg"),
    ("M79.3", "Panniculitis"),
    ("M79.7", "Fibromyalgia"),
    ("G54.4", "Lumbosacral root disorders"),
    ("G89.29", "Other chronic pain"),
    ("R52", "Pain, unspecified"),
    ("R68.89", "Other general symptoms and signs"),
    ("M53.3", "Sacrococcygeal disorders"),
    ("M50.12", "Cervical disc degeneration, mid-cervical region"),
]

# Seed data — common CPT codes inserted on first run
COMMON_CPT_CODES = [
    ("97110", "Therapeutic exercises"),
    ("97140", "Manual therapy techniques"),
    ("97530", "Therapeutic activities"),
    ("97001", "Physical therapy evaluation"),
    ("97002", "Physical therapy re-evaluation"),
    ("97012", "Mechanical traction"),
    ("97035", "Ultrasound therapy"),
    ("62321", "Injection, interlaminar epidural, cervical/thoracic"),
    ("62323", "Injection, interlaminar epidural, lumbar/sacral"),
    ("64483", "Injection, anesthetic/steroid, transforaminal epidural, lumbar/sacral"),
    ("64490", "Injection, diagnostic/therapeutic, facet joint, cervical/thoracic"),
    ("64493", "Injection, diagnostic/therapeutic, facet joint, lumbar/sacral"),
    ("99213", "Office visit, established patient, low complexity"),
    ("99214", "Office visit, established patient, moderate complexity"),
    ("99215", "Office visit, established patient, high complexity"),
    ("99203", "Office visit, new patient, low complexity"),
    ("99204", "Office visit, new patient, moderate complexity"),
    ("72148", "MRI lumbar spine without contrast"),
    ("72156", "MRI lumbar spine with and without contrast"),
    ("72141", "MRI cervical spine without contrast"),
    ("72100", "X-ray lumbar spine, 2-3 views"),
    ("72110", "X-ray lumbar spine, minimum 4 views"),
    ("20610", "Arthrocentesis, aspiration/injection, major joint"),
    ("20605", "Arthrocentesis, aspiration/injection, intermediate joint"),
    ("95910", "Nerve conduction study, 5-6 studies"),
    ("95885", "EMG, extremity, limited study"),
    ("95886", "EMG, extremity, complete study"),
]


@dataclass
class CodeResult:
    code: str
    description: str
    source: str  # "cache" | "nlm_api" | "static"


def _get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS icd_codes (code TEXT PRIMARY KEY, description TEXT)")
    conn.execute("CREATE TABLE IF NOT EXISTS cpt_codes (code TEXT PRIMARY KEY, description TEXT)")
    conn.commit()
    return conn


def seed_common_icd_codes(conn: sqlite3.Connection) -> None:
    for code, description in COMMON_ICD_CODES:
        conn.execute(
            "INSERT OR IGNORE INTO icd_codes (code, description) VALUES (?, ?)",
            (code, description),
        )
    conn.commit()


def seed_common_cpt_codes(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM cpt_codes").fetchone()[0]
    if count == 0:
        conn.executemany(
            "INSERT OR IGNORE INTO cpt_codes (code, description) VALUES (?, ?)",
            COMMON_CPT_CODES,
        )
        conn.commit()


def lookup_code_description(code: str, code_type: str) -> str | None:
    """
    Look up the description for a known code value (exact match).
    Checks SQLite cache first, then falls back to NLM API.
    Returns None if not found.
    """
    conn = _get_db()
    table = "icd_codes" if code_type == "icd10" else "cpt_codes"
    row = conn.execute(f"SELECT description FROM {table} WHERE code = ?", (code,)).fetchone()
    conn.close()
    if row:
        return row[0]
    # Fall back to NLM API for ICD-10 only (no free CPT API)
    if code_type != "icd10":
        return None
    fetched = _nlm_fetch(NLM_ICD_URL, code)
    for c, d in fetched:
        if c == code:
            return d
    return None


def _cache_lookup(conn: sqlite3.Connection, table: str, query: str) -> list[CodeResult]:
    rows = conn.execute(
        f"SELECT code, description FROM {table} WHERE description LIKE ? LIMIT 10",
        (f"%{query}%",),
    ).fetchall()
    return [CodeResult(code=r[0], description=r[1], source="cache") for r in rows]


def _nlm_fetch(url: str, query: str) -> list[tuple[str, str]]:
    try:
        resp = requests.get(
            url,
            params={"sf": "code,name", "terms": query, "maxList": 10},
            timeout=6,
        )
        resp.raise_for_status()
        data = resp.json()
        # NLM response format: [total, [codes], null, [[code, name], ...]]
        if len(data) >= 4 and data[3]:
            return [(item[0], item[1]) for item in data[3]]
    except Exception:
        pass
    return []


def fetch_codes_for_entity(entity_text: str, entity_group: str) -> list[CodeResult]:
    """
    Fetch ICD-10 or CPT codes for an entity.
    Checks SQLite cache first; falls back to NLM API for ICD-10 (CPT has no free API).
    """
    conn = _get_db()
    seed_common_cpt_codes(conn)

    is_icd = entity_group in {"Sign_symptom", "Disease_disorder", "Biological_structure"}
    table = "icd_codes" if is_icd else "cpt_codes"

    cached = _cache_lookup(conn, table, entity_text)
    if cached:
        conn.close()
        return cached

    # CPT: no free NLM API — rely on seeded codes and explicit extraction from notes
    if not is_icd:
        conn.close()
        return []

    fetched = _nlm_fetch(NLM_ICD_URL, entity_text)
    if fetched:
        conn.executemany(
            f"INSERT OR IGNORE INTO {table} (code, description) VALUES (?, ?)",
            fetched,
        )
        conn.commit()
        conn.close()
        return [CodeResult(code=c, description=d, source="nlm_api") for c, d in fetched]

    conn.close()
    return []
