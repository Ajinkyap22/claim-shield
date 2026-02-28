# Compliance Shield

**Healthcare Insurance Compliance Denial Score System**

Predicts insurance claim denial probability across multiple payers by analyzing clinical documentation against real payer coverage policies. Shows _why_ each payer would deny and _what to fix_ — before the claim is submitted.

Uses a **RAG (Retrieval-Augmented Generation)** pipeline: payer policy PDFs are ingested, chunked, and stored as vector embeddings in Pinecone. At scoring time, relevant policy criteria are retrieved via similarity search and evaluated by an LLM against the claim's clinical facts.

---

## Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────────┐
│   Frontend   │──────▶│     Gateway      │──────▶│  extraction-service  │  port 8001
│  (Next.js)   │◀──────│   (Express.js)   │──────▶│  mapping-service     │  port 8002
│  port 3000   │       │  Orchestrator    │──────▶│  validation-service  │  port 8003
└──────────────┘       │    port 8000     │──────▶│  scoring-service     │  port 8004
                       └──────────────────┘       └──────────┬───────────┘
                                                             │
                                                             ▼
                                                  ┌──────────────────────┐
                                                  │   policy-service     │  port 8005
                                                  │  (RAG + Pinecone)    │
                                                  └──────────────────────┘
```

**Communication:** All services communicate via REST (HTTP/JSON). The gateway orchestrates the pipeline by calling each service sequentially and passing the output of one as input to the next.

**Pipeline runs asynchronously** — frontend receives a `pipeline_id` immediately and polls for progress.

**External dependencies:**

- **OpenRouter** — single LLM provider for all chat completion calls (validation checks, fact extraction, policy extraction, claim scoring)
- **Pinecone** — vector database for policy criteria storage + built-in embedding inference (multilingual-e5-large)

---

## HIPAA & production readiness

The system is built with HIPAA-minded safeguards that are feasible within the current scope:

- **No persistent storage of ePHI:** The gateway and pipeline keep claim data only in memory. Pipeline results are removed after the client fetches them (or after a 10-minute TTL if never fetched), so ePHI is not retained at rest.
- **Secure transport:** In production, all APIs (frontend–gateway and gateway–services) must use **HTTPS**. Set `NEXT_PUBLIC_API_URL` and all service URLs to `https://` endpoints; HTTP is for local development only.
- **No PHI in logs:** Services do not log PHI or full claim payloads; only non-identifying metadata (e.g. pipeline_id, stage, timing) is logged in production.

For a production deployment, additional steps are operational and contractual: authentication/authorization for result access, a Business Associate Agreement (BAA) with the LLM provider, and standard administrative safeguards (risk analysis, workforce training, incident response). The architecture is designed so that integrating this system into a production setting does not require re-architecting for HIPAA; it requires these production safeguards.

---

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. EXTRACTION         2. MAPPING           3. FHIR BUNDLE                  │
│  ┌────────────┐       ┌──────────────┐     ┌────────────────┐              │
│  │ PDF/Image/ │──────▶│ ICD-10 + CPT │────▶│  ClaimBundle   │              │
│  │ Audio/Text │       │   mapping    │     │  (structured)  │              │
│  └────────────┘       └──────────────┘     └───────┬────────┘              │
│                                                     │                       │
│                              ┌──────────────────────┘                       │
│                              ▼                                              │
│  4. CLINICAL VALIDATION (4 parallel LLM calls)                              │
│  ┌───────────────┬───────────────┬──────────────┬─────────────────┐        │
│  │ Medical       │  Step         │  Documentation│ Fact Extraction │        │
│  │ Necessity     │  Therapy      │  Completeness │ → ClinicalContext│       │
│  └───────┬───────┴───────┬───────┴──────┬────────┴───────┬─────────┘       │
│          └───────────────┼──────────────┘                │                  │
│                          ▼                               ▼                  │
│  5. RAG-BASED PAYER DENIAL SCORING                                          │
│  ┌──────────────────────────────────────────────────────────┐              │
│  │  For each payer:                                          │              │
│  │  ① Build semantic query from ClinicalContext              │              │
│  │  ② Retrieve matching PolicyCriteria from Pinecone         │              │
│  │  ③ Send criteria + claim facts to LLM via OpenRouter      │              │
│  │  ④ Parse structured PayerScoreBreakdown                   │              │
│  └──────────────────────────────────────────────────────────┘              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────┐               │
│  │  (Parallel) Policy Ingestion (one-time, per payer)      │               │
│  │  Upload PDF → chunk → LLM extracts criteria → embed →   │               │
│  │  store in Pinecone                                       │               │
│  └─────────────────────────────────────────────────────────┘               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**LLM calls per pipeline run:** ~8 total

- 1 extraction (if image/audio)
- 1 ICD-10 mapping
- 3 parallel validation checks (medical necessity, step therapy, documentation)
- 1 clinical fact extraction (ClinicalContext)
- 1 per payer scoring (e.g. 1 for Aetna = 1, or 3 if scoring UHC+Aetna+Cigna)

**Scoring engine is LLM-based** — dynamically evaluates claims against real payer policies retrieved from a vector store.

---

## Key Architectural Decision: RAG-Based Scoring

The original design used hardcoded deterministic rules per payer. This was replaced with a RAG pipeline for extensibility:

| Aspect         | Before (Deterministic)                 | After (RAG)                                     |
| -------------- | -------------------------------------- | ----------------------------------------------- |
| Adding a payer | Write new Python rules, redeploy       | Upload policy PDF via API                       |
| Policy updates | Code change required                   | Re-ingest updated PDF                           |
| Rule accuracy  | Manually encoded from reading policies | LLM extracts criteria directly from policy text |
| Scoring        | Weighted formula, deterministic        | LLM evaluates claim against retrieved criteria  |
| Extensibility  | Limited to coded procedures            | Any procedure/treatment policy can be ingested  |

---

## Policy Ingestion Pipeline (policy-service)

```
Policy PDF/Text
      │
      ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────┐
│  PDF Parse   │────▶│  Section-Aware   │────▶│  LLM Extraction │────▶│ Pinecone │
│  (pdf-parse) │     │  Chunking        │     │  (OpenRouter)   │     │ Upsert   │
└─────────────┘     └──────────────────┘     └─────────────────┘     └──────────┘
                                                     │
                                              PolicyCriterion[]
                                              (structured JSON)
```

Each `PolicyCriterion` captures:

- `procedure_categories` — normalized (e.g. `mri_spine`, `ct_spine`, `physical_therapy`)
- `body_regions` — normalized (e.g. `lumbar`, `cervical`, `thoracic`)
- `category` — `step_therapy`, `medical_necessity`, `documentation`, `coding`, `red_flag_bypass`, `general`
- `requirement` — human-readable policy requirement
- `requirement_type` — `mandatory`, `recommended`, `conditional`
- `conditions`, `exceptions`, `evidence_requirements` — specifics from the policy text
- `raw_text`, `section_reference` — traceability back to source document

Embeddings are generated using **Pinecone's built-in inference API** (`multilingual-e5-large`), not a separate OpenAI embedding call.

---

## Demo Claim: MRI Lumbar Spine (CPT 72148)

The system ships with two test scenarios (in `apps/scripts/sample-claims.ts`):

| Scenario        | Patient                                                     | Treatment History                | Expected Outcome        |
| --------------- | ----------------------------------------------------------- | -------------------------------- | ----------------------- |
| Likely Approval | John Smith, 60M, radiculopathy, positive SLR, motor deficit | 8 weeks PT + NSAIDs, prior X-ray | Low denial probability  |
| Likely Denial   | Maria Garcia, 47F, nonspecific LBP, normal exam             | 2 weeks OTC ibuprofen only       | High denial probability |

Sample Aetna CPB 0236 policy text is included in `apps/scripts/sample-aetna-policy.ts` for testing the ingestion and scoring pipeline.

---

## Tech Stack

### Backend (TypeScript / Node.js)

| Package                       | Service(s)                  | Purpose                                          |
| ----------------------------- | --------------------------- | ------------------------------------------------ |
| `express` 5                   | All services                | HTTP framework                                   |
| `zod` 3                       | All services                | Runtime schema validation, shared data contracts |
| `openai` SDK                  | validation, policy, scoring | OpenRouter-compatible LLM calls                  |
| `@pinecone-database/pinecone` | policy-service              | Vector database + built-in embeddings            |
| `multer`                      | gateway, policy-service     | File upload handling                             |
| `pdf-parse`                   | policy-service              | PDF text extraction                              |
| `uuid`                        | gateway, policy-service     | ID generation                                    |
| `cors`                        | All services                | Cross-origin requests                            |
| `dotenv`                      | validation, policy, scoring | Environment variable loading                     |
| `tsx`                         | All services (dev)          | TypeScript execution with watch mode             |

### Frontend (TypeScript)

| Package                 | Purpose                        |
| ----------------------- | ------------------------------ |
| `next` 16 (App Router)  | React framework                |
| `shadcn/ui`             | Component primitives           |
| `recharts`              | Score gauge visualizations     |
| `@tanstack/react-query` | API state management + polling |
| `tailwindcss` 4         | Styling                        |

### External Services

| Service        | Purpose                              | Key                  |
| -------------- | ------------------------------------ | -------------------- |
| **OpenRouter** | All LLM chat completions (Claude)    | `OPENROUTER_API_KEY` |
| **Pinecone**   | Vector storage + embedding inference | `PINECONE_API_KEY`   |

---

## Project Structure

```
claim-shield/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json                          # Root: turbo monorepo config
├── pnpm-workspace.yaml
├── turbo.json
│
├── sample-data/                          # Sample clinical documents
│   ├── lumbar-spine-note.pdf
│   ├── lumbar-spine-note.txt
│   └── lumbar-spine-dictation-script.txt
│
└── apps/
    ├── shared-ts/                        # Shared TypeScript package — data contracts
    │   ├── package.json                  # @compliance-shield/shared
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts                  # Re-exports all modules
    │       ├── fhir.ts                   # Patient, Condition, Procedure, Claim, ClaimBundle
    │       ├── extraction.ts             # ExtractionResult
    │       ├── mapping.ts                # ICD10Mapping
    │       ├── validation.ts             # CheckResult, ClinicalValidationResult
    │       ├── clinical-context.ts       # ClinicalContext (structured clinical facts)
    │       ├── scoring.ts               # RuleResult, PayerScoreBreakdown, PipelineResult
    │       ├── policy.ts                # PolicyCriterion, PolicySearchRequest/Result
    │       └── pipeline.ts              # PipelineStage, PipelineStatus
    │
    ├── gateway/                          # API Gateway — orchestrates pipeline (port 8000)
    │   ├── package.json
    │   ├── Dockerfile
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts                  # Express app
    │       ├── config.ts                 # Service URLs from env
    │       ├── state.ts                  # In-memory pipeline state store
    │       ├── orchestrator.ts           # Calls each service in sequence
    │       ├── middleware/               # Express middleware
    │       └── routes/
    │           ├── pipeline.ts           # POST /run, GET /{id}, GET /{id}/result
    │           ├── fixtures.ts           # GET /fixtures, GET /fixtures/{id}
    │           └── health.ts             # GET /health
    │
    ├── policy-service/                   # Service: Policy ingestion & RAG retrieval (port 8005)
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts                  # Express app (ingest, search, list, delete)
    │       ├── config.ts                 # OpenRouter + Pinecone config
    │       ├── pdf-parser.ts             # PDF → text, section-aware chunking
    │       ├── policy-extractor.ts       # LLM: text chunks → PolicyCriterion[]
    │       ├── embedder.ts               # Pinecone inference API for embeddings
    │       └── pinecone-client.ts        # Upsert, search, delete vectors + registry
    │
    ├── validation-service/               # Service: Clinical validation agent (port 8003)
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts                  # Express app (POST /validate)
    │       ├── config.ts                 # OpenRouter config
    │       └── agents/
    │           ├── clinical-validation.ts # 3 parallel LLM checks + fact extraction
    │           └── fact-extractor.ts     # LLM: ClaimBundle → ClinicalContext
    │
    ├── scoring-service/                  # Service: RAG-based payer denial scoring (port 8004)
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts                  # Express app (POST /score)
    │       ├── config.ts                 # OpenRouter + policy-service URL
    │       ├── evaluator.ts              # RAG pipeline: query → retrieve → LLM → score
    │       ├── policy-client.ts          # HTTP client to policy-service /policies/search
    │       └── openrouter-client.ts      # OpenAI SDK wrapper for OpenRouter
    │
    ├── scripts/                          # Test & utility scripts
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── sample-aetna-policy.ts        # Aetna CPB 0236 policy text for testing
    │   ├── sample-claims.ts              # Pre-built approve/deny test fixtures
    │   ├── test-scoring-flow.ts          # E2E test: ingest policy → score claims
    │   └── generate-lumbar-sample-pdf.mjs # Generate sample clinical note PDF
    │
    └── frontend/                         # Next.js dashboard (port 3000)
        ├── package.json
        ├── next.config.ts
        ├── tsconfig.json
        └── src/
            ├── app/
            │   ├── page.tsx
            │   ├── layout.tsx
            │   ├── ComplianceShieldApp.tsx
            │   └── QueryProvider.tsx
            ├── api/
            │   └── compliance.ts         # Gateway API client
            ├── components/
            │   ├── Header.tsx
            │   ├── InputForm.tsx
            │   ├── LoadingState.tsx
            │   ├── ResultsPanel.tsx
            │   ├── ScoreGauge.tsx
            │   ├── ClaimSummary.tsx
            │   ├── DualAgentView.tsx
            │   ├── ValidationIssues.tsx
            │   └── RecommendationsList.tsx
            ├── hooks/
            │   └── useComplianceCheckMutation.ts
            ├── lib/
            │   └── formatCitation.ts
            └── types/
                └── compliance.ts
```

---

## API Contracts

### Gateway API (Frontend-facing, port 8000)

All paths prefixed with `/api`.

#### `POST /api/pipeline/run` — Start a pipeline

Accepts `multipart/form-data`:

| Field    | Type   | Required | Description                                            |
| -------- | ------ | -------- | ------------------------------------------------------ |
| `file`   | File   | No\*     | Clinical document (PDF, image, audio)                  |
| `text`   | string | No\*     | Raw clinical note text                                 |
| `payers` | string | No       | Comma-separated payer IDs (default: `uhc,aetna,cigna`) |

\*One of `file` or `text` must be provided.

**Response** (`PipelineStatus`):

```json
{
  "pipeline_id": "a1b2c3d4e5f6",
  "current_stage": "queued",
  "progress_pct": 0.0,
  "error": null,
  "stages": [
    { "stage": "extracting", "status": "pending", "message": "", "data": null },
    { "stage": "mapping", "status": "pending", "message": "", "data": null },
    {
      "stage": "building_bundle",
      "status": "pending",
      "message": "",
      "data": null
    },
    { "stage": "validating", "status": "pending", "message": "", "data": null },
    { "stage": "scoring", "status": "pending", "message": "", "data": null }
  ]
}
```

#### `GET /api/pipeline/{pipeline_id}` — Poll progress

**Response** (`PipelineStatus`): Same shape as above. `stages[].status` will be `"pending"`, `"in_progress"`, `"completed"`, or `"failed"`. `stages[].data` contains intermediate output once completed. `progress_pct` goes from 0 to 100. `current_stage` becomes `"completed"` or `"failed"` when done.

Frontend should poll every ~1 second until `current_stage` is `"completed"` or `"failed"`.

#### `GET /api/pipeline/{pipeline_id}/result` — Get final result

Returns `404` if pipeline hasn't completed. On success:

```json
{
  "claim_bundle": { "patient": {}, "conditions": [], "procedures": [], "claim": {}, "supporting_info": {} },
  "validation_result": {
    "overall_status": "pass | pass_with_findings | fail",
    "medical_necessity": { "status": "...", "confidence": 0.9, "findings": "...", "evidence": [], "recommendations": [] },
    "step_therapy": { "..." },
    "documentation": { "..." }
  },
  "clinical_context": {
    "procedure_category": "mri_spine",
    "body_region": "lumbar",
    "conservative_treatment": { "physical_therapy_completed": true, "..." },
    "neurological_exam": { "straight_leg_raise": { "..." }, "..." },
    "imaging_history": { "..." },
    "clinical_indicators": { "..." },
    "documentation_quality": { "..." }
  },
  "payer_scores": {
    "aetna": {
      "payer_id": "aetna",
      "payer_name": "Aetna",
      "denial_probability": 0.25,
      "risk_level": "low",
      "rules_evaluated": [
        {
          "rule_id": "criterion-uuid",
          "description": "Conservative treatment >= 6 weeks",
          "category": "step_therapy",
          "passed": true,
          "score": 0.9,
          "weight": 0.3,
          "reasoning": "Patient completed 8 weeks of conservative treatment including PT and NSAIDs",
          "evidence": ["8 weeks physical therapy", "Naproxen 500mg BID"]
        }
      ],
      "recommendations": [],
      "summary": "Claim meets Aetna's key coverage criteria..."
    }
  },
  "processing_time_seconds": 12.5
}
```

#### `GET /api/fixtures` — List demo claims

#### `GET /api/fixtures/{fixture_id}` — Load demo claim

#### `GET /api/health`

---

### Internal Service APIs

#### Policy Service (port 8005)

**`POST /policies/ingest`** — Ingest a payer coverage policy

Accepts `multipart/form-data`:

| Field         | Type   | Required | Description                                      |
| ------------- | ------ | -------- | ------------------------------------------------ |
| `file`        | File   | No\*     | Policy PDF document                              |
| `text`        | string | No\*     | Policy text content                              |
| `payer_id`    | string | Yes      | Payer identifier (e.g. `aetna`)                  |
| `payer_name`  | string | Yes      | Display name (e.g. `Aetna`)                      |
| `policy_name` | string | Yes      | Policy name (e.g. `CPB 0236 - MRI of the Spine`) |
| `source_url`  | string | No       | URL where the policy was obtained                |

\*One of `file` or `text` must be provided.

Response:

```json
{
  "policy_id": "uuid",
  "payer_id": "aetna",
  "criteria_count": 38,
  "chunks_processed": 4
}
```

**`POST /policies/search`** — Retrieve relevant policy criteria via similarity search

Request:

```json
{
  "procedure_category": "mri_spine",
  "query_text": "Procedure: mri_spine (lumbar). Diagnoses: M54.41, M54.5. radiculopathy present. 8 weeks conservative treatment",
  "payer_id": "aetna",
  "top_k": 15
}
```

Response:

```json
{
  "criteria": [
    {
      "criterion_id": "uuid",
      "payer_id": "aetna",
      "payer_name": "Aetna",
      "policy_id": "uuid",
      "policy_name": "CPB 0236 - MRI of the Spine",
      "procedure_categories": ["mri_spine"],
      "body_regions": ["lumbar"],
      "category": "step_therapy",
      "requirement": "Conservative treatment for at least 6 weeks before MRI",
      "requirement_type": "mandatory",
      "conditions": ["6 weeks of physical therapy or medication management"],
      "exceptions": [
        "cauda equina syndrome",
        "progressive neurological deficit"
      ],
      "evidence_requirements": [
        "physical therapy records",
        "medication history"
      ],
      "raw_text": "...",
      "section_reference": "Clinical Indications",
      "similarity_score": 0.92
    }
  ],
  "total_results": 15
}
```

**`GET /policies`** — List all ingested policies

**`DELETE /policies/:policyId`** — Remove a policy and its vectors

**`GET /health`**

---

#### Validation Service (port 8003)

**`POST /validate`**

Request: `ClaimBundle` JSON.

Response:

```json
{
  "validation_result": {
    "overall_status": "pass | pass_with_findings | fail",
    "medical_necessity": {
      "status": "pass",
      "confidence": 0.9,
      "findings": "Lumbar radiculopathy with positive SLR and motor deficit supports medical necessity",
      "evidence": ["positive straight leg raise", "EHL 4/5", "failed 6 weeks conservative treatment"],
      "recommendations": []
    },
    "step_therapy": { "..." },
    "documentation": { "..." }
  },
  "clinical_context": {
    "procedure_category": "mri_spine",
    "body_region": "lumbar",
    "conservative_treatment": {
      "physical_therapy_completed": true,
      "physical_therapy_weeks": 6,
      "nsaid_trial": true,
      "total_conservative_weeks": 8,
      "treatments_tried": ["physical_therapy", "nsaids"]
    },
    "neurological_exam": {
      "straight_leg_raise": { "positive": true, "side": "left", "angle_degrees": 35 },
      "motor_exam": { "deficit_present": true, "muscle_groups_tested": ["EHL"], "weakest_grade": "4/5" },
      "exam_completeness": "full"
    },
    "clinical_indicators": {
      "radiculopathy": true,
      "symptom_duration_weeks": 8,
      "pain_severity": "moderate",
      "functional_limitation": true
    },
    "documentation_quality": {
      "has_physical_exam": true,
      "has_treatment_history": true,
      "missing_elements": []
    }
  }
}
```

The `ClinicalContext` is extracted by a dedicated LLM call (`fact-extractor.ts`) that converts free-text clinical documentation into machine-readable structured facts. This is critical for the scoring service to build accurate semantic queries for policy retrieval.

---

#### Scoring Service (port 8004)

**`POST /score`**

Request:

```json
{
  "claim_bundle": { "..." },
  "validation_result": { "..." },
  "clinical_context": { "..." },
  "payers": ["aetna"]
}
```

Response:

```json
{
  "payer_scores": {
    "aetna": {
      "payer_id": "aetna",
      "payer_name": "Aetna",
      "denial_probability": 0.25,
      "risk_level": "low",
      "rules_evaluated": [
        {
          "rule_id": "criterion-uuid",
          "description": "Conservative treatment >= 6 weeks required before MRI",
          "category": "step_therapy",
          "passed": true,
          "score": 0.9,
          "weight": 0.3,
          "reasoning": "Patient completed 8 weeks of conservative treatment...",
          "evidence": ["8 weeks PT documented", "Naproxen trial documented"]
        }
      ],
      "recommendations": [],
      "summary": "Claim meets Aetna's major coverage requirements..."
    }
  }
}
```

The scoring service:

1. Builds a semantic query from `ClinicalContext` (procedure, diagnoses, treatment history, exam findings)
2. Calls `policy-service /policies/search` to retrieve the top-K matching `PolicyCriterion` entries
3. Sends the criteria + full clinical facts to the LLM via OpenRouter
4. Parses the structured `PayerScoreBreakdown` response

If no policies are found for a payer, returns `denial_probability: 0.5` with a note to upload the payer's policy.

---

## Data Models Reference

### ClaimBundle (core input data structure)

```
ClaimBundle
├── patient: Patient
│   ├── name: string
│   ├── dob: string (ISO date)
│   ├── gender: "male" | "female" | "other"
│   ├── member_id: string?
│   └── payer_id: string?
│
├── conditions: Condition[]
│   ├── code: string              # ICD-10 (e.g. "M54.5")
│   ├── display: string           # "Low back pain"
│   ├── clinical_status: "active" | "resolved" | "inactive"
│   ├── onset_date: string?
│   └── severity: "mild" | "moderate" | "severe" | null
│
├── procedures: Procedure[]
│   ├── code: string              # CPT (e.g. "72148")
│   ├── display: string           # "MRI lumbar spine w/o contrast"
│   ├── status: "proposed" | "completed" | "in-progress"
│   ├── date: string?
│   └── body_site: string?
│
├── medications: Medication[]
│   ├── code: string
│   ├── display: string
│   ├── dosage: string?
│   ├── frequency: string?
│   └── duration_weeks: number?
│
├── claim: Claim
│   ├── claim_type: "professional" | "pharmacy"
│   ├── priority: "normal" | "urgent"
│   ├── diagnosis_codes: string[]
│   ├── procedure_codes: string[]
│   ├── medication_codes: string[]
│   ├── provider_npi: string?
│   ├── facility_type: string?
│   └── service_date: string?
│
└── supporting_info: SupportingInfo
    ├── conservative_treatment: string?
    ├── physical_exam_findings: string?
    ├── symptom_duration_weeks: number?
    ├── prior_imaging: string?
    ├── lab_results: Record<string, string>?
    ├── lifestyle_modifications: string?
    └── prior_medications: string[]?
```

### ClinicalContext (extracted structured facts)

```
ClinicalContext
├── procedure_category: string              # "mri_spine", "ct_spine", etc.
├── body_region: string                     # "lumbar", "cervical", etc.
│
├── conservative_treatment:
│   ├── physical_therapy_completed: boolean
│   ├── physical_therapy_weeks: number?
│   ├── physical_therapy_sessions: number?
│   ├── nsaid_trial: boolean
│   ├── nsaid_duration_weeks: number?
│   ├── muscle_relaxant_trial: boolean
│   ├── analgesic_trial: boolean
│   ├── activity_modification: boolean
│   ├── total_conservative_weeks: number?
│   └── treatments_tried: string[]
│
├── neurological_exam:
│   ├── straight_leg_raise: { positive, side, angle_degrees }?
│   ├── motor_exam: { deficit_present, muscle_groups_tested, weakest_grade, laterality }?
│   ├── sensory_exam: { deficit_present, dermatomal_mapping, affected_dermatomes }?
│   ├── reflex_exam: { abnormal, reflexes_tested, findings }?
│   ├── nerve_root_level: string?
│   └── exam_completeness: "full" | "partial" | "absent"
│
├── imaging_history:
│   ├── prior_xray: boolean
│   ├── prior_xray_findings: string?
│   ├── prior_mri: boolean
│   ├── prior_ct: boolean
│   └── prior_imaging_modalities: string[]
│
├── clinical_indicators:
│   ├── spinal_stenosis: boolean
│   ├── cauda_equina_syndrome: boolean
│   ├── progressive_neurological_deficit: boolean
│   ├── radiculopathy: boolean
│   ├── symptom_duration_weeks: number?
│   ├── pain_severity: "mild" | "moderate" | "severe" | null
│   ├── functional_limitation: boolean
│   ├── red_flags_present: string[]
│   └── ... (other indicators)
│
└── documentation_quality:
    ├── has_physical_exam: boolean
    ├── has_history_of_present_illness: boolean
    ├── has_treatment_history: boolean
    ├── has_functional_assessment: boolean
    ├── has_prior_imaging_results: boolean
    └── missing_elements: string[]
```

### PolicyCriterion (vector-stored policy rule)

```
PolicyCriterion
├── criterion_id: string (UUID)
├── payer_id: string
├── payer_name: string
├── policy_id: string
├── policy_name: string
├── procedure_categories: string[]      # normalized categories
├── body_regions: string[]              # normalized regions
├── category: string                    # step_therapy, medical_necessity, etc.
├── requirement: string                 # human-readable policy requirement
├── requirement_type: "mandatory" | "recommended" | "conditional"
├── conditions: string[]                # specific thresholds
├── exceptions: string[]                # bypass conditions
├── evidence_requirements: string[]     # required documentation
├── raw_text: string                    # original policy text
└── section_reference: string           # source section title
```

### PayerScoreBreakdown (scoring output)

```
PayerScoreBreakdown
├── payer_id: string
├── payer_name: string
├── denial_probability: number (0.0–1.0)
├── risk_level: "low" | "medium" | "high"
├── rules_evaluated: RuleResult[]
│   ├── rule_id: string                 # maps to criterion_id
│   ├── description: string
│   ├── category: string
│   ├── passed: boolean
│   ├── score: number (0.0–1.0)
│   ├── weight: number (0.0–1.0)
│   ├── reasoning: string
│   └── evidence: string[]
├── recommendations: string[]
└── summary: string
```

### PipelineStatus (for frontend polling)

```
PipelineStatus
├── pipeline_id: string
├── current_stage: "queued" | "extracting" | "mapping" | "building_bundle" | "validating" | "scoring" | "completed" | "failed"
├── progress_pct: number (0–100)
├── error: string?
└── stages: PipelineStageDetail[]
    ├── stage: PipelineStage
    ├── status: "pending" | "in_progress" | "completed" | "failed"
    ├── message: string
    └── data: any?
```

---

## Environment Variables

```bash
# LLM provider (all services use OpenRouter exclusively)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4    # default model for all LLM calls

# Vector database (policy-service uses Pinecone for storage + embeddings)
PINECONE_API_KEY=pc-...
PINECONE_INDEX_NAME=claim-shield-policies

# Service URLs (for inter-service communication)
EXTRACTION_SERVICE_URL=http://localhost:8001
MAPPING_SERVICE_URL=http://localhost:8002
VALIDATION_SERVICE_URL=http://localhost:8003
SCORING_SERVICE_URL=http://localhost:8004
POLICY_SERVICE_URL=http://localhost:8005
```

No OpenAI API key is required. All LLM chat completions go through OpenRouter. All embeddings use Pinecone's built-in inference API.

---

## Setup & Running

### Prerequisites

- Node.js 20+
- pnpm 9+ (package manager)
- OpenRouter API key
- Pinecone API key (with an index named `claim-shield-policies`, dimension 1024, cosine metric)

### Environment

```bash
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY and PINECONE_API_KEY
```

Copy `.env` into each service directory, or each service can have its own `.env`:

```bash
cp .env apps/policy-service/.env
cp .env apps/scoring-service/.env
cp .env apps/validation-service/.env
```

### Option A: Docker Compose

```bash
docker compose up --build
```

Services will be available at:

- Frontend: http://localhost:3000
- Gateway API: http://localhost:8000
- Extraction: http://localhost:8001
- Mapping: http://localhost:8002
- Validation: http://localhost:8003
- Scoring: http://localhost:8004
- Policy: http://localhost:8005

### Option B: Run services individually

```bash
# Build shared types first
cd apps/shared-ts && npm install && npm run build && cd ../..

# Terminal 1: Gateway
cd apps/gateway && npm install && npm run dev

# Terminal 2: Policy service
cd apps/policy-service && npm install && npm run dev

# Terminal 3: Validation service
cd apps/validation-service && npm install && npm run dev

# Terminal 4: Scoring service
cd apps/scoring-service && npm install && npm run dev

# Terminal 5: Frontend
cd apps/frontend && npm install && npm run dev
```

---

## Testing

### End-to-end test script

The `apps/scripts/` directory contains a complete test runner:

```bash
cd apps/scripts && npm install

# Full test: ingest Aetna policy + score both test claims
npx tsx test-scoring-flow.ts

# Skip ingestion (if policy already ingested)
npx tsx test-scoring-flow.ts --skip-ingest
```

The test script:

1. Health-checks the policy-service and scoring-service
2. Ingests the Aetna CPB 0236 sample policy (PDF text → chunks → LLM extraction → Pinecone upsert)
3. Scores a "likely approval" claim (John Smith — 8 weeks PT, radiculopathy, full neuro exam)
4. Scores a "likely denial" claim (Maria Garcia — 2 weeks ibuprofen, no neuro findings)
5. Prints detailed results including denial probability, risk level, rule breakdowns, and recommendations

### Quick smoke test with curl

```bash
# Health checks
curl http://localhost:8005/health    # policy-service
curl http://localhost:8004/health    # scoring-service
curl http://localhost:8003/health    # validation-service

# List ingested policies
curl http://localhost:8005/policies

# Search policies
curl -X POST http://localhost:8005/policies/search \
  -H "Content-Type: application/json" \
  -d '{"procedure_category":"mri_spine","query_text":"MRI lumbar spine radiculopathy","payer_id":"aetna","top_k":5}'

# Start full pipeline via gateway
curl -X POST http://localhost:8000/api/pipeline/run \
  -F "text=Patient: John Smith. Low back pain for 8 weeks..." \
  -F "payers=aetna"

# Poll status
curl http://localhost:8000/api/pipeline/{pipeline_id}

# Get result
curl http://localhost:8000/api/pipeline/{pipeline_id}/result
```
