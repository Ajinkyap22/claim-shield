# Healthcare Claim Shield — Data Requirements & Sources

What data you need locally, what you don’t, and where to get it.

---

## 1. What you need (reference data only)

You do **not** need real patient data, historical claims, or live EHR data. You only need **reference datasets** to validate and look up codes.

| Data | Purpose | Needed? | Keep locally? |
|------|---------|--------|----------------|
| **ICD-10 (diagnosis codes)** | Validate and look up diagnosis codes extracted from the note; “medical dataset check” in the pipeline. | **Yes** | Yes — bundle a subset or full list. |
| **CPT (procedure codes)** | Optional: validate procedure codes; improves “medical check” and policy alignment. | Optional | Yes if you use it — subset is enough for demo. |
| **Policy PDFs** | User uploads at runtime; no dataset to ship. | No dataset | No — user provides. |
| **Doctor notes / dictation** | User input (text or audio); no dataset to ship. | No dataset | No — user provides. |

So: the only **dataset you need to have present locally** (or in the repo) is **ICD-10**, and optionally **CPT**.

---

## 2. ICD-10 — where to get it

ICD-10 is used to validate that diagnoses from the note map to valid codes. You can use a **small subset** (e.g. 100–500 codes) for the hackathon or a **larger/full** list for a more realistic demo.

### Official (free)

- **CDC/NCHS (US ICD-10-CM)**  
  - FTP: `https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Publications/ICD10CM/`  
  - Contains code tables and descriptions by year (e.g. 2025, 2026).  
  - Format: ZIP with TXT/XML; you’ll need to parse and convert to JSON/CSV.

- **CMS**  
  - https://www.cms.gov/Medicare/Coding/ICD10  
  - Links to code sets and updates; same idea as CDC for US use.

### Pre-processed / easy to use

- **GitHub: ICD-10-CSV**  
  - https://github.com/Bobrovskiy/ICD-10-CSV  
  - CSV with code, short/long description, HIPAA coverage, etc.  
  - Easy to filter to a subset and convert to `data/icd10-sample.json` (or `icd10.json`).

- **Row Zero (spreadsheet)**  
  - https://rowzero.com/datasets/icd-10-codes  
  - Spreadsheet of ICD-10 codes with descriptions; export to CSV then to JSON if needed.

- **WHO / `icd` (R package, data)**  
  - https://github.com/jackwasey/icd (and related repos)  
  - Some repos expose ICD-10 data in structured form; check license and format.

### Suggested for the repo

1. **Demo / hackathon:** Create `data/icd10-sample.json` with **~200–500 common codes** (e.g. top chapters: infectious, circulatory, respiratory, injury, symptoms). Pull from Bobrovskiy/ICD-10-CSV or CDC, filter, then save as JSON array of `{ "code": "I10", "description": "Essential (primary) hypertension" }` (or similar).
2. **Closer to real use:** Bundle a larger subset (e.g. 5k–10k codes) or the full ICD-10-CM list as `data/icd10.json` and load it once at startup.

---

## 3. CPT (optional) — where to get it

CPT is owned by the AMA; full datasets are **not** free. For a hackathon you can:

- **Use a small hand-picked list:** 50–100 common procedure codes (e.g. office visits 99202–99215, common procedures) in `data/cpt-sample.json`. Descriptions can be taken from public CMS/AMA summaries or simplified.
- **HCPCS Level II API (free):**  
  - NLM: https://clinicaltables.nlm.nih.gov/apidoc/hcpcs/v3/doc.html  
  - Free search API; good for “look up by term” at runtime. No need to store the full set locally if you’re okay calling the API.
- **CMS PPL API:** Has procedure codes and pricing but requires registration; optional for later.

So: **CPT is optional.** If you want it locally, use a small **curated `data/cpt-sample.json`**; otherwise skip or use the NLM HCPCS API for lookups.

---

## 4. What you do NOT need

- **Real patient data or PHI** — All input is provided by the user (note, policy PDF). No need to ship or store real claims/patients.
- **Historical claims database** — You’re doing pre-submit checks; no need for past claim data.
- **Live EHR integration** — Not required for the hackathon; the “dataset” is only the code reference (ICD-10, optionally CPT).
- **Proprietary policy libraries** — Policies are user-uploaded PDFs.

---

## 5. Optional: sample data for demos

To make the demo smooth and repeatable:

- **Sample doctor note(s):** 1–2 short `.txt` or markdown files in `data/sample_notes/` (e.g. a paragraph of clinical text with a few diagnoses/procedures). Use these in the UI or API examples.
- **Sample policy PDF:** 1 anonymized or synthetic “insurance policy” PDF (5–10 pages) in `data/sample_policy.pdf` so judges can run the full flow without uploading their own. Create a fake policy with a few sections (e.g. “Prior authorization,” “Exclusions,” “Documentation requirements”) for the Payer Agent to cite.

These are **convenience assets**, not a required “dataset”; the only **required** reference dataset is ICD-10 (and optionally CPT).

---

## 6. Summary

| What | Where to get it | Put in repo |
|------|------------------|-------------|
| **ICD-10** (required) | CDC FTP, or GitHub ICD-10-CSV, or Row Zero → convert to JSON | `data/icd10-sample.json` (or `icd10.json`) |
| **CPT** (optional) | Small curated list, or NLM HCPCS API at runtime | `data/cpt-sample.json` or API only |
| **Sample note** | Write 1–2 short clinical paragraphs | `data/sample_notes/` (optional) |
| **Sample policy PDF** | Create 1 synthetic policy (5–10 pages) | `data/sample_policy.pdf` (optional) |

You **do** need a **certain dataset present locally** for the medical check: **ICD-10** (and optionally CPT). Policy and doctor notes are **user-provided at runtime**; no need to ship those as data.
