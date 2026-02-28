# Scripts

Utility scripts for testing and data generation in the Compliance Shield pipeline.

## Prerequisites

1. Install dependencies:

   ```bash
   cd apps/scripts
   npm install
   ```

2. Set the required environment variables:

   ```bash
   export OPENAI_API_KEY="..."
   export PINECONE_API_KEY="..."
   export PINECONE_INDEX_NAME="..."
   export OPENROUTER_API_KEY="..."
   ```

3. Start the backend services (needed for the scoring test):

   ```bash
   # Terminal 1
   cd apps/policy-service && npm run dev

   # Terminal 2
   cd apps/scoring-service && npm run dev
   ```

## Scripts

### Test Scoring Flow

End-to-end test for the clinical-to-scoring RAG pipeline. Ingests an Aetna policy, then scores two sample claims (one likely-approval, one likely-denial) against it.

```bash
# Full run (ingest policy + score both scenarios)
npm run test:scoring

# Skip policy ingestion (if already ingested)
npm run test:scoring:skip-ingest
```

You can override the default service URLs via environment variables:

```bash
POLICY_SERVICE_URL=http://localhost:8005  # default
SCORING_SERVICE_URL=http://localhost:8004 # default
```

### Generate Lumbar Sample PDF

Generates a PDF from the canonical lumbar spine clinical note text file (`sample-data/lumbar-spine-note.txt`). Requires `pdf-lib`.

```bash
node generate-lumbar-sample-pdf.mjs
```

The output is written to `sample-data/lumbar-spine-note.pdf`.

## Data Files

| File | Description |
|---|---|
| `sample-aetna-policy.ts` | Aetna CPB 0236 (MRI/CT of the Spine) policy text and ingestion metadata |
| `sample-claims.ts` | Two pre-built claim bundles with clinical context and validation results for testing |
