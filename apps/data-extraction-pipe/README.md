# data-extraction-pipe

A clinical NLP pipeline that converts raw clinical notes into structured **FHIR R4 Bundles** with verified ICD-10 and CPT codes. Exposed as a REST API.

---

## How it works

```
Raw clinical note
       │
       ▼
[1]  PHI Scrubber          — replace patient name, DOB, NPI, dates with placeholders
       │
       ▼
[1b] Explicit Code Extract — find ICD/CPT codes already written in the note → seed ChromaDB
       │
       ▼
[2]  NER (BioBERT)         — extract medical entities (diseases, symptoms, procedures…)
       │
       ▼
[3]  Negation Filter       — drop negated entities ("no evidence of…"), low-confidence spans
       │
       ▼
[4]  Entity Merger         — group fragments into full phrases, attach anatomy to symptoms
       │
       ▼
[5]  Code Fetcher          — look up real ICD-10 / CPT codes from NLM API + SQLite cache
       │
       ▼
[6]  Vector Store          — upsert codes into ChromaDB → query top-3 semantic matches
       │
       ▼
[7]  LLM (OpenRouter)      — pick final codes from verified candidates only (no hallucination)
       │
       ▼
[8]  FHIR Builder          — validate JSON → reattach PHI → emit FHIR R4 Bundle
```

---

## Pipeline steps in detail

### Step 1 — PHI Scrubber (`phi_scrubber.py`)
Strips Protected Health Information before anything is sent to the NER model or LLM.

| PHI field | Placeholder |
|---|---|
| Patient name | `[PATIENT_NAME]` |
| Date of birth | `[DOB]` |
| NPI number | `[PROVIDER_ID]` |
| Attending physician | `[PROVIDER_NAME]` |
| Facility name | `[FACILITY]` |
| Date of service | `[SERVICE_DATE]` |
| Other dates | `[DATE_IMAGING]`, `[DATE_2]`, … |

All original values are stored in a `PHIMap` object and reattached in Step 8.

---

### Step 1b — Explicit Code Extractor (`code_extractor.py`)
Scans the scrubbed note for codes that were already written by the clinician.

- **ICD-10**: matched by pattern `[A-Z]\d{2}(\.\d+)?` (e.g. `M54.50`)
- **CPT**: only extracted when prefixed by the word `CPT` (e.g. `CPT: 99213`) to avoid false positives from zip codes or room numbers

Extracted codes are seeded into ChromaDB immediately so they rank highly in later vector searches.

---

### Step 2 — NER (`pipeline.py` → HuggingFace)
Uses `d4data/biomedical-ner-all` with `aggregation_strategy="max"`.

Entity types extracted:

| Label | Maps to |
|---|---|
| `Disease_disorder` | ICD-10 |
| `Sign_symptom` | ICD-10 |
| `Biological_structure` | ICD-10 |
| `Therapeutic_procedure` | CPT |
| `Diagnostic_procedure` | CPT |
| `Medication` | (informational, no code assigned) |

The model is loaded once at server startup and reused for all requests.

---

### Step 3 — Negation Filter (`negation_filter.py`)
Implements the **NegEx algorithm** to drop entities that are:

- **Negated** — detected via pre-window triggers (`no`, `denies`, `ruled out`, `free of`, …) or post-window triggers (`was ruled out`, `unlikely`)
- **Low confidence** — score below `0.75`
- **Non-codeable** — entity types not in the codeable set

A 150-character pre-window and 80-character post-window is scanned around each entity span. Termination tokens (`but`, `however`, `although`, …) stop the negation from propagating past a clause boundary.

---

### Step 4 — Entity Merger (`entity_merger.py`)
Assembles fragmented NER spans into meaningful clinical phrases:

- **Adjacent span merge** — spans of the same type within ≤25 characters are joined
- **Sentence grouping** — entities are scoped to their containing sentence for context
- **Cross-sentence anatomy attachment** — a `Biological_structure` entity within 150 chars of a preceding `Sign_symptom` is merged into it (e.g. "pain" + "lumbar spine" → "pain lumbar spine")

Output is a list of `MergedEntity` objects carrying the merged text, type, confidence score, character offsets, and sentence context.

---

### Steps 5-6 — Code Fetcher + Vector Store (`code_fetcher.py`, `vector_store.py`)

**Code Fetcher**
For each merged entity:
1. Check SQLite cache (`data/codes.db`) for existing matches
2. If cache misses, call the **NLM Clinical Tables API** (free, no auth required)
3. Cache any results returned by the API

25 common CPT codes are seeded into the SQLite cache on first run (spine injections, PT codes, office visits, imaging, EMG/nerve studies).

**Vector Store (ChromaDB)**
- Persistent client at `data/chroma_db/`
- Two collections: `icd10_codes` and `cpt_codes`
- Embeddings: `all-MiniLM-L6-v2` via `DefaultEmbeddingFunction` (~80 MB, auto-downloaded on first run)
- Fetched codes are upserted into ChromaDB; then a semantic similarity query returns the **top-3 candidates** per entity

---

### Step 7 — LLM Code Selection (`llm_client.py`)
Sends the scrubbed note + NER entities + vector candidates to an LLM via **OpenRouter**.

The prompt explicitly instructs the model to:
- Select codes **only** from the verified candidate list
- Never invent or guess codes
- Output a single JSON object (no markdown)
- Use placeholder tokens so PHI can be reattached

If `OPENROUTER_API_KEY` is not set, or the LLM call fails, the pipeline falls back to using the top vector candidate for each entity automatically.

---

### Step 8 — FHIR Builder (`fhir_builder.py`)
Validates the LLM JSON output, reattaches PHI from the `PHIMap`, then assembles a **FHIR R4 Bundle**.

Resources included in each bundle:

| Resource | Content |
|---|---|
| `Patient` | Name, date of birth |
| `Practitioner` | Provider name + NPI identifier |
| `Organization` | Facility name |
| `Claim` | Status, type, priority, diagnosis refs, procedure line items |
| `Condition` (×N) | One per ICD-10 diagnosis with clinical/verification status |
| `Procedure` (×N) | One per CPT procedure with performed date |

Code systems used:

| Field | URI |
|---|---|
| ICD-10 | `http://hl7.org/fhir/sid/icd-10-cm` |
| CPT | `http://www.ama-assn.org/go/cpt` |
| NPI | `http://hl7.org/fhir/sid/us-npi` |

---

## API

Start the server:
```bash
uvicorn api:app --host 0.0.0.0 --port 8000
```

### `POST /process`
Convert a clinical note to a FHIR R4 Bundle.

**Request**
```json
{
  "text": "Patient: John Doe, DOB 11/08/1975\nDate of Service: 02/25/2026\n..."
}
```

**Response**
```json
{
  "fhir_bundle": {
    "resourceType": "Bundle",
    "type": "collection",
    "entry": [
      { "fullUrl": "urn:uuid:...", "resource": { "resourceType": "Patient", ... } },
      { "fullUrl": "urn:uuid:...", "resource": { "resourceType": "Practitioner", ... } },
      { "fullUrl": "urn:uuid:...", "resource": { "resourceType": "Organization", ... } },
      { "fullUrl": "urn:uuid:...", "resource": { "resourceType": "Claim", ... } },
      { "fullUrl": "urn:uuid:...", "resource": { "resourceType": "Condition", ... } },
      { "fullUrl": "urn:uuid:...", "resource": { "resourceType": "Procedure", ... } }
    ]
  }
}
```

### `GET /health`
```json
{ "status": "ok" }
```

Interactive docs available at `http://localhost:8000/docs` (Swagger UI).

---

## Database schema (`db/schema.sql`)

| Table | Purpose |
|---|---|
| `icd_codes` | ICD-10 code cache (fetched from NLM API) |
| `cpt_codes` | CPT code cache (seeded + fetched from NLM API) |
| `snomed_concepts` | SNOMED CT concept descriptions |
| `snomed_icd_map` | SNOMED → ICD-10 crosswalk |
| `phi_store` | PHI store keyed by document ID for reattachment |

SQLite databases:
- `data/codes.db` — ICD/CPT code cache used by the fetcher
- `data/claim_shield.db` — main application database (schema above)

---

## File reference

| File | Role |
|---|---|
| `pipeline.py` | Orchestrates all 8 steps; exposes `run_pipeline(text)` |
| `api.py` | FastAPI server; warms up model on startup |
| `phi_scrubber.py` | Regex-based PHI de-identification |
| `phi_reattach.py` | Substitutes placeholders back with real PHI values |
| `code_extractor.py` | Extracts explicit ICD/CPT codes from note text |
| `negation_filter.py` | NegEx negation detection + confidence filter |
| `entity_merger.py` | Adjacent span merge + sentence grouping |
| `code_fetcher.py` | NLM API + SQLite cache for real codes |
| `vector_store.py` | ChromaDB init, upsert, and semantic query |
| `code_assigner.py` | Per-entity fetch → upsert → query; prompt formatter; fallback claim builder |
| `llm_client.py` | OpenRouter LLM client; prompt construction |
| `claim_validator.py` | JSON schema validation of LLM output |
| `fhir_builder.py` | FHIR R4 Bundle assembly |
| `ner_explorer.py` | Standalone script to explore raw NER output |
| `sample_text.py` | Example clinical note for local testing |

---

## Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
cp .env.example .env   # then fill in OPENROUTER_API_KEY

# Run directly (uses sample_text.py)
python pipeline.py

# Run as API server
uvicorn api:app --host 0.0.0.0 --port 8000
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | No | API key from openrouter.ai. If unset, pipeline uses vector fallback. |
| `OPENROUTER_MODEL` | No | Model to use. Default: `openai/gpt-4o-mini` |

---

## Dependencies

| Package | Purpose |
|---|---|
| `transformers` + `torch` | NER model (`d4data/biomedical-ner-all`) |
| `chromadb` | Persistent vector store |
| `requests` | NLM Clinical Tables API calls |
| `fastapi` + `uvicorn` | REST API server |
| `python-dotenv` | `.env` file loading |
| `openrouter` | LLM client (optional) |
