#!/usr/bin/env npx tsx
/**
 * End-to-end test for the clinical-to-scoring RAG pipeline.
 *
 * Prerequisites:
 *   1. Set env vars: OPENAI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME, OPENROUTER_API_KEY
 *   2. Start policy-service:  cd policy-service && npm run dev
 *   3. Start scoring-service: cd scoring-service && npm run dev
 *
 * Usage:
 *   npx tsx scripts/test-scoring-flow.ts
 *   npx tsx scripts/test-scoring-flow.ts --skip-ingest   # if policy already ingested
 */

import { AETNA_POLICY_TEXT, AETNA_INGEST_METADATA } from "./sample-aetna-policy.js";
import {
  APPROVE_CLAIM_BUNDLE,
  APPROVE_CLINICAL_CONTEXT,
  APPROVE_VALIDATION_RESULT,
  DENY_CLAIM_BUNDLE,
  DENY_CLINICAL_CONTEXT,
  DENY_VALIDATION_RESULT,
} from "./sample-claims.js";

const POLICY_SERVICE = process.env.POLICY_SERVICE_URL || "http://localhost:8005";
const SCORING_SERVICE = process.env.SCORING_SERVICE_URL || "http://localhost:8004";

const skipIngest = process.argv.includes("--skip-ingest");

function riskColor(level: string): string {
  if (level === "low") return "\x1b[32m";
  if (level === "medium") return "\x1b[33m";
  return "\x1b[31m";
}
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

async function checkHealth(name: string, url: string): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/health`);
    if (resp.ok) {
      console.log(`  ✓ ${name} is healthy`);
      return true;
    }
    console.log(`  ✗ ${name} returned ${resp.status}`);
    return false;
  } catch {
    console.log(`  ✗ ${name} is not reachable at ${url}`);
    return false;
  }
}

async function ingestPolicy(): Promise<string> {
  console.log("\n━━━ Step 1: Ingesting Aetna CPB 0236 Policy ━━━\n");

  const resp = await fetch(`${POLICY_SERVICE}/policies/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...AETNA_INGEST_METADATA,
      text: AETNA_POLICY_TEXT,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Ingest failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as {
    policy_id: string;
    criteria_count: number;
    chunks_processed: number;
  };

  console.log(`  Policy ID:         ${data.policy_id}`);
  console.log(`  Chunks processed:  ${data.chunks_processed}`);
  console.log(`  Criteria extracted: ${data.criteria_count}`);

  return data.policy_id;
}

async function scoreScenario(
  name: string,
  bundle: typeof APPROVE_CLAIM_BUNDLE,
  context: typeof APPROVE_CLINICAL_CONTEXT,
  validation: typeof APPROVE_VALIDATION_RESULT,
  payers: string[]
): Promise<void> {
  console.log(`\n━━━ Scoring: ${name} ━━━\n`);
  console.log(`  Patient: ${bundle.patient.name}`);
  console.log(`  Diagnoses: ${bundle.claim.diagnosis_codes.join(", ")}`);
  console.log(`  Procedure: ${bundle.procedures[0]?.display || "N/A"}`);
  console.log(`  Conservative weeks: ${context.conservative_treatment.total_conservative_weeks}`);
  console.log(`  Radiculopathy: ${context.clinical_indicators.radiculopathy}`);
  console.log(`  Neuro exam: ${context.neurological_exam.exam_completeness}`);
  console.log(`  Payers: ${payers.join(", ")}`);

  const start = Date.now();

  const resp = await fetch(`${SCORING_SERVICE}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claim_bundle: bundle,
      validation_result: validation,
      clinical_context: context,
      payers,
    }),
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`  ERROR (${resp.status}): ${text}`);
    return;
  }

  const data = (await resp.json()) as {
    payer_scores: Record<
      string,
      {
        payer_name: string;
        denial_probability: number;
        risk_level: string;
        rules_evaluated: {
          rule_id: string;
          description: string;
          category: string;
          passed: boolean;
          score: number;
          weight: number;
          reasoning: string;
        }[];
        recommendations: string[];
        summary: string;
      }
    >;
  };

  console.log(`\n  ${DIM}Scored in ${elapsed}s${RESET}\n`);

  for (const [payerId, score] of Object.entries(data.payer_scores)) {
    const color = riskColor(score.risk_level);
    const pct = Math.round(score.denial_probability * 100);

    console.log(
      `  ${BOLD}${score.payer_name} (${payerId})${RESET}`
    );
    console.log(
      `  Denial probability: ${color}${pct}%${RESET} (${color}${score.risk_level}${RESET})`
    );
    console.log(`  Summary: ${score.summary}`);

    if (score.rules_evaluated.length > 0) {
      console.log(`\n  Rules evaluated:`);
      for (const rule of score.rules_evaluated) {
        const icon = rule.passed ? "✓" : "✗";
        const rColor = rule.passed ? "\x1b[32m" : "\x1b[31m";
        console.log(
          `    ${rColor}${icon}${RESET} [${rule.category}] ${rule.description} — score: ${rule.score}, weight: ${rule.weight}`
        );
        console.log(`      ${DIM}${rule.reasoning}${RESET}`);
      }
    }

    if (score.recommendations.length > 0) {
      console.log(`\n  Recommendations:`);
      for (const rec of score.recommendations) {
        console.log(`    → ${rec}`);
      }
    }
    console.log();
  }
}

async function main() {
  console.log(`${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║   Compliance Shield — RAG Scoring Pipeline Test         ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}`);
  console.log();

  // Health checks
  console.log("Checking service health...");
  const policyOk = await checkHealth("policy-service", POLICY_SERVICE);
  const scoringOk = await checkHealth("scoring-service", SCORING_SERVICE);

  if (!policyOk || !scoringOk) {
    console.error("\nServices not ready. Start them first:");
    console.error("  Terminal 1: cd policy-service && npm run dev");
    console.error("  Terminal 2: cd scoring-service && npm run dev");
    process.exit(1);
  }

  // Step 1: Ingest policy
  if (skipIngest) {
    console.log("\n━━━ Step 1: Skipping policy ingestion (--skip-ingest) ━━━");
  } else {
    await ingestPolicy();
  }

  // Step 2: Score the "approve" scenario
  await scoreScenario(
    "MRI Lumbar — Likely Approval (John Smith)",
    APPROVE_CLAIM_BUNDLE,
    APPROVE_CLINICAL_CONTEXT,
    APPROVE_VALIDATION_RESULT,
    ["aetna"]
  );

  // Step 3: Score the "deny" scenario
  await scoreScenario(
    "MRI Lumbar — Likely Denial (Maria Garcia)",
    DENY_CLAIM_BUNDLE,
    DENY_CLINICAL_CONTEXT,
    DENY_VALIDATION_RESULT,
    ["aetna"]
  );

  console.log(`${BOLD}━━━ Test complete ━━━${RESET}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
