# Healthcare Claim Shield

**See the denial before the payer does.** A dual-agent system that pre-adjudicates healthcare claims: a **Clinician Agent** and a **Payer Agent** evaluate documentation against policy and produce a **Denial Risk Score** (0–100) plus **policy-cited recommendations** so providers can fix gaps before submission.

- **Input:** Clinical note (text or audio) + optional insurance policy PDF  
- **Output:** Denial risk score, claim summary, clinician vs payer view, and actionable recommendations with policy section references  

Built for revenue cycle and billing teams; embeddable in workflows or callable via API.

---

Turborepo + pnpm workspace. Frontend (Next.js) in `apps/frontend`; gateway and services (Node, Go, Python) in `apps/`.

## Prerequisites

### Installing pnpm (macOS)

If pnpm isn’t installed, use one of these options:

**Option 1: Corepack**  
```bash
corepack enable
corepack prepare pnpm@latest --activate
```
Then run `pnpm --version` to confirm (you want pnpm 9+).

**Option 2: Homebrew**  
```bash
brew install pnpm
```

**Option 3: npm**  
```bash
npm install -g pnpm
```

After installation, run `pnpm --version` to confirm you have pnpm 9 or later.

## Commands (from repo root)

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies for all workspace packages |
| `pnpm dev` | Run all apps in dev mode |
| `pnpm dev --filter=frontend` | Run only the frontend |
| `pnpm build` | Build all apps |
| `pnpm lint` | Lint all apps |

## Structure

```
apps/
  frontend/            # Next.js UI (input form, results, denial score)
  gateway/             # Express orchestrator (claim-check API, pipeline)
  validation-service/   # Clinician agent (medical necessity, step therapy, documentation)
  scoring-service/      # Payer agent (denial risk score, policy criteria)
  policy-service/      # Policy PDF ingest, chunking, Pinecone + RAG search
  data-extraction-pipe/ # Python: clinical text → FHIR (NER, ICD-10/CPT, PHI scrub)
  extract-file/        # Go: audio transcription, PDF/image text extraction
  shared-ts/           # Shared types (FHIR, validation, scoring, claim-check)
```

Each app has a `.env.example`; copy to `.env` and set values (e.g. `OPENROUTER_API_KEY`, `PINECONE_*` for policy-service).
