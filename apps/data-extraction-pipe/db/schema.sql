-- Claim Shield reference data and PHI store (SQLite)

-- SNOMED concepts (for vector search)
CREATE TABLE IF NOT EXISTS snomed_concepts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snomed_id TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snomed_concepts_snomed_id ON snomed_concepts(snomed_id);

-- SNOMED → ICD-10 crosswalk (official mapping)
CREATE TABLE IF NOT EXISTS snomed_icd_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snomed_id TEXT NOT NULL,
    icd_code TEXT NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (snomed_id) REFERENCES snomed_concepts(snomed_id)
);
CREATE INDEX IF NOT EXISTS idx_snomed_icd_snomed ON snomed_icd_map(snomed_id);
CREATE INDEX IF NOT EXISTS idx_snomed_icd_icd ON snomed_icd_map(icd_code);

-- ICD-10 codes (for validation and LLM descriptions)
CREATE TABLE IF NOT EXISTS icd_codes (
    code TEXT PRIMARY KEY,
    description TEXT
);

-- CPT codes (procedures — mirrors icd_codes)
CREATE TABLE IF NOT EXISTS cpt_codes (
    code TEXT PRIMARY KEY,
    description TEXT
);

-- PHI store: reattach after downstream processing (per document/claim)
CREATE TABLE IF NOT EXISTS phi_store (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL UNIQUE,
    patient_name TEXT,
    dob TEXT,
    provider_id TEXT,
    provider_name TEXT,
    facility TEXT,
    dates_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_phi_store_document_id ON phi_store(document_id);
