"""
Vector store: ChromaDB in-process, persistent.
Stores ICD-10 and CPT codes as embeddings for semantic similarity search.
Bootstraps from SQLite cache on first run.
"""
import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
from pathlib import Path

from code_fetcher import CodeResult, _get_db, seed_common_cpt_codes, seed_common_icd_codes, COMMON_ICD_CODES, COMMON_CPT_CODES

CHROMA_DIR = str(Path(__file__).parent / "data" / "chroma_db")

_ef = DefaultEmbeddingFunction()  # all-MiniLM-L6-v2, auto-downloaded ~80MB on first run


def _get_collections(client: chromadb.PersistentClient) -> tuple:
    icd_col = client.get_or_create_collection("icd10_codes", embedding_function=_ef)
    cpt_col = client.get_or_create_collection("cpt_codes", embedding_function=_ef)
    return icd_col, cpt_col


def _bootstrap_from_sqlite(client: chromadb.PersistentClient) -> None:
    """Load all codes from SQLite into ChromaDB on first run (skips if collection already has data)."""
    icd_col, cpt_col = _get_collections(client)
    conn = _get_db()

    for col, table in [(icd_col, "icd_codes"), (cpt_col, "cpt_codes")]:
        if col.count() > 0:
            continue
        rows = conn.execute(f"SELECT code, description FROM {table}").fetchall()
        if not rows:
            continue
        for i in range(0, len(rows), 100):
            batch = rows[i:i + 100]
            col.upsert(
                ids=[r[0] for r in batch],
                documents=[f"{r[0]}: {r[1]}" for r in batch],
                metadatas=[{"code": r[0], "description": r[1]} for r in batch],
            )

    conn.close()


def _upsert_seed_codes(client: chromadb.PersistentClient) -> None:
    """Upsert common ICD/CPT seed codes directly into ChromaDB (always runs, uses INSERT OR IGNORE in SQLite)."""
    icd_col, cpt_col = _get_collections(client)
    for col, rows in [(icd_col, COMMON_ICD_CODES), (cpt_col, COMMON_CPT_CODES)]:
        for i in range(0, len(rows), 100):
            batch = rows[i:i + 100]
            col.upsert(
                ids=[r[0] for r in batch],
                documents=[f"{r[0]}: {r[1]}" for r in batch],
                metadatas=[{"code": r[0], "description": r[1]} for r in batch],
            )


def initialize_vector_store() -> chromadb.PersistentClient:
    """
    Create/open ChromaDB client, seed CPT/ICD codes, bootstrap from SQLite.
    Call once at pipeline startup.
    """
    client = chromadb.PersistentClient(path=CHROMA_DIR)
    conn = _get_db()
    seed_common_cpt_codes(conn)
    seed_common_icd_codes(conn)
    conn.close()
    _bootstrap_from_sqlite(client)
    _upsert_seed_codes(client)  # ensure seed codes are always present in ChromaDB
    return client


def upsert_codes(
    codes: list[CodeResult],
    code_type: str,
    client: chromadb.PersistentClient,
) -> None:
    """Add or update codes in the appropriate ChromaDB collection. Batches 100 at a time."""
    if not codes:
        return
    icd_col, cpt_col = _get_collections(client)
    col = icd_col if code_type == "icd10" else cpt_col

    for i in range(0, len(codes), 100):
        batch = codes[i:i + 100]
        col.upsert(
            ids=[c.code for c in batch],
            documents=[f"{c.code}: {c.description}" for c in batch],
            metadatas=[{"code": c.code, "description": c.description} for c in batch],
        )


def query_codes(
    query_text: str,
    code_type: str,
    top_k: int = 3,
    client: chromadb.PersistentClient = None,
) -> list[dict]:
    """
    Semantic search for top-k codes matching query_text.
    Returns list of {code, description, distance} dicts (distance = cosine similarity 0-1).
    """
    icd_col, cpt_col = _get_collections(client)
    col = icd_col if code_type == "icd10" else cpt_col

    count = col.count()
    if count == 0:
        return []

    results = col.query(query_texts=[query_text], n_results=min(top_k, count))
    out = []
    for code_id, meta, dist in zip(
        results["ids"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        similarity = round(1 - dist, 4) if dist is not None else 0.0
        out.append({
            "code": meta["code"],
            "description": meta["description"],
            "distance": similarity,
        })
    return out
