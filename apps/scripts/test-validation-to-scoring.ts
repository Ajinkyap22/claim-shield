#!/usr/bin/env npx tsx
/**
 * End-to-end test: Validation Service → Scoring Service.
 *
 * Sends ClaimBundle to the validation service, then forwards the result
 * (validation_result + clinical_context) to the scoring service. Prints
 * the final ComplianceCheckResponse (frontend-ready format).
 *
 * Prerequisites:
 *   1. Set env vars: OPENROUTER_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME
 *   2. Start validation-service:  cd apps/validation-service && npm run dev
 *   3. Start scoring-service:     cd apps/scoring-service && npm run dev
 *   4. Start policy-service:      cd apps/policy-service && npm run dev
 *
 * Usage:
 *   npx tsx test-validation-to-scoring.ts
 *   npx tsx test-validation-to-scoring.ts --skip-ingest   # if policy already ingested
 */

import { AETNA_POLICY_TEXT, AETNA_INGEST_METADATA } from "./sample-aetna-policy.js";
import { APPROVE_CLAIM_BUNDLE, DENY_CLAIM_BUNDLE } from "./sample-claims.js";
import type { ClaimBundle } from "@compliance-shield/shared";

// ── Service URLs ──

const VALIDATION_SERVICE = process.env.VALIDATION_SERVICE_URL || "http://localhost:8003";
const SCORING_SERVICE = process.env.SCORING_SERVICE_URL || "http://localhost:8004";
const POLICY_SERVICE = process.env.POLICY_SERVICE_URL || "http://localhost:8005";

const skipIngest = process.argv.includes("--skip-ingest");

// ── ANSI helpers ──

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function statusColor(status: string): string {
  if (status === "pass") return GREEN;
  if (status === "pass_with_findings") return YELLOW;
  return RED;
}

function riskColor(score: number): string {
  if (score < 35) return GREEN;
  if (score < 65) return YELLOW;
  return RED;
}

// ── Health checks ──

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

// ── Policy ingestion ──

async function ingestPolicy(): Promise<void> {
  console.log(`\n${BOLD}━━━ Step 1: Ingesting Aetna CPB 0236 Policy ━━━${RESET}\n`);

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
}

// ── Validation call ──

interface ValidationOutput {
  validation_result: {
    overall_status: string;
    medical_necessity: CheckResult;
    step_therapy: CheckResult;
    documentation: CheckResult;
  };
  clinical_context: Record<string, unknown>;
}

interface CheckResult {
  status: string;
  confidence: number;
  findings: string;
  evidence: string[];
  recommendations: string[];
}

async function callValidation(bundle: ClaimBundle): Promise<ValidationOutput> {
  const resp = await fetch(`${VALIDATION_SERVICE}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Validation failed (${resp.status}): ${text}`);
  }

  return (await resp.json()) as ValidationOutput;
}

function printValidation(output: ValidationOutput): void {
  const vr = output.validation_result;
  const color = statusColor(vr.overall_status);
  console.log(`\n  ${BOLD}Validation Result${RESET}`);
  console.log(`  Overall status: ${color}${vr.overall_status}${RESET}`);

  const checks = [
    { name: "Medical Necessity", result: vr.medical_necessity },
    { name: "Step Therapy", result: vr.step_therapy },
    { name: "Documentation", result: vr.documentation },
  ];

  for (const { name, result } of checks) {
    const c = statusColor(result.status);
    console.log(
      `\n    ${BOLD}${name}${RESET}: ${c}${result.status}${RESET} (confidence: ${result.confidence})`
    );
    console.log(`    ${DIM}${result.findings}${RESET}`);
    if (result.evidence.length > 0) {
      for (const e of result.evidence) {
        console.log(`      • ${e}`);
      }
    }
    if (result.recommendations.length > 0) {
      console.log(`    ${YELLOW}Recommendations:${RESET}`);
      for (const r of result.recommendations) {
        console.log(`      → ${r}`);
      }
    }
  }
}

// ── Scoring call ──

interface ComplianceCheckResponse {
  score: number;
  scoreExplanation: string;
  recommendations?: Array<{
    id?: string | number;
    priority?: string;
    title: string;
    detail?: string;
    citation: string;
    action?: string;
  }>;
  validationIssues?: Array<{
    type: "error" | "warn" | "info";
    code?: string;
    title: string;
    detail?: string;
  }>;
  payerComparison?: Array<{
    payerName: string;
    score?: number;
    statusLabel?: string;
    note?: string;
  }>;
  meta?: { analyzedInMs?: number; policyName?: string };
}

async function callScoring(
  bundle: ClaimBundle,
  validationResult: ValidationOutput["validation_result"],
  clinicalContext: Record<string, unknown>,
  payers: string[]
): Promise<ComplianceCheckResponse> {
  const resp = await fetch(`${SCORING_SERVICE}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claim_bundle: bundle,
      validation_result: validationResult,
      clinical_context: clinicalContext,
      payers,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Scoring failed (${resp.status}): ${text}`);
  }

  return (await resp.json()) as ComplianceCheckResponse;
}

function printScoringResult(result: ComplianceCheckResponse): void {
  const color = riskColor(result.score);

  console.log(`\n  ${BOLD}Scoring Result (ComplianceCheckResponse)${RESET}`);
  console.log(`  ${BOLD}Score: ${color}${result.score}/100${RESET} denial risk`);
  console.log(`  ${DIM}${result.scoreExplanation}${RESET}`);

  if (result.validationIssues && result.validationIssues.length > 0) {
    console.log(`\n  ${BOLD}Validation Issues:${RESET}`);
    for (const issue of result.validationIssues) {
      const icon =
        issue.type === "error" ? `${RED}✗` : issue.type === "warn" ? `${YELLOW}⚠` : `${CYAN}ℹ`;
      console.log(`    ${icon}${RESET} [${issue.code || ""}] ${issue.title}`);
      if (issue.detail) {
        console.log(`      ${DIM}${issue.detail}${RESET}`);
      }
    }
  }

  if (result.recommendations && result.recommendations.length > 0) {
    console.log(`\n  ${BOLD}Recommendations:${RESET}`);
    for (const rec of result.recommendations) {
      const pColor =
        rec.priority === "high" ? RED : rec.priority === "medium" ? YELLOW : GREEN;
      console.log(
        `    ${pColor}[${rec.priority || "?"}]${RESET} ${rec.title}`
      );
      if (rec.detail) {
        console.log(`      ${DIM}${rec.detail}${RESET}`);
      }
      console.log(`      ${DIM}Citation: ${rec.citation}${RESET}`);
    }
  }

  if (result.payerComparison && result.payerComparison.length > 0) {
    console.log(`\n  ${BOLD}Payer Comparison:${RESET}`);
    console.log(
      `    ${"Payer".padEnd(15)} ${"Score".padEnd(8)} ${"Status".padEnd(18)} Note`
    );
    console.log(`    ${"─".repeat(70)}`);
    for (const p of result.payerComparison) {
      const pColor = riskColor(p.score ?? 50);
      console.log(
        `    ${(p.payerName || "").padEnd(15)} ${pColor}${String(p.score ?? "–").padEnd(8)}${RESET} ${(p.statusLabel || "").padEnd(18)} ${DIM}${p.note || ""}${RESET}`
      );
    }
  }

  if (result.meta?.analyzedInMs) {
    console.log(
      `\n  ${DIM}Scoring completed in ${(result.meta.analyzedInMs / 1000).toFixed(1)}s${RESET}`
    );
  }
}

// ── Run a full scenario ──

async function runScenario(
  name: string,
  bundle: ClaimBundle,
  payers: string[]
): Promise<void> {
  console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║  ${name.padEnd(55)}║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}`);

  console.log(`\n  Patient:   ${bundle.patient.name}`);
  console.log(`  Diagnoses: ${bundle.claim.diagnosis_codes.join(", ")}`);
  console.log(`  Procedure: ${bundle.procedures[0]?.display || "N/A"}`);
  console.log(`  Symptoms:  ${bundle.supporting_info.symptom_duration_weeks} weeks`);
  console.log(`  Payers:    ${payers.join(", ")}`);

  // Step A: Validation
  console.log(`\n  ${CYAN}▶ Calling validation service...${RESET}`);
  const valStart = Date.now();
  const validationOutput = await callValidation(bundle);
  const valElapsed = ((Date.now() - valStart) / 1000).toFixed(1);
  console.log(`  ${DIM}Validation completed in ${valElapsed}s${RESET}`);
  printValidation(validationOutput);

  // Step B: Scoring
  console.log(`\n  ${CYAN}▶ Calling scoring service...${RESET}`);
  const scoreStart = Date.now();
  const scoringResult = await callScoring(
    bundle,
    validationOutput.validation_result,
    validationOutput.clinical_context,
    payers
  );
  const scoreElapsed = ((Date.now() - scoreStart) / 1000).toFixed(1);
  console.log(`  ${DIM}Scoring completed in ${scoreElapsed}s${RESET}`);
  printScoringResult(scoringResult);

  // Print raw JSON for debugging
  console.log(`\n  ${DIM}─── Raw ComplianceCheckResponse JSON ───${RESET}`);
  console.log(JSON.stringify(scoringResult, null, 2));
}

// ── Main ──

async function main() {
  console.log(
    `${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}`
  );
  console.log(
    `${BOLD}║   Compliance Shield — Validation → Scoring E2E Test     ║${RESET}`
  );
  console.log(
    `${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}`
  );
  console.log();

  // Health checks
  console.log("Checking service health...");
  const validationOk = await checkHealth("validation-service", VALIDATION_SERVICE);
  const scoringOk = await checkHealth("scoring-service", SCORING_SERVICE);
  const policyOk = await checkHealth("policy-service", POLICY_SERVICE);

  if (!validationOk || !scoringOk || !policyOk) {
    console.error("\nServices not ready. Start them first:");
    console.error("  Terminal 1: cd apps/validation-service && npm run dev");
    console.error("  Terminal 2: cd apps/scoring-service && npm run dev");
    console.error("  Terminal 3: cd apps/policy-service && npm run dev");
    process.exit(1);
  }

  // Policy ingestion
  if (skipIngest) {
    console.log(
      `\n${BOLD}━━━ Step 1: Skipping policy ingestion (--skip-ingest) ━━━${RESET}`
    );
  } else {
    await ingestPolicy();
  }

  // Scenario 1: Likely Approval
  await runScenario(
    "Scenario 1: MRI Lumbar — Likely Approval (John Smith)",
    APPROVE_CLAIM_BUNDLE,
    ["aetna"]
  );

  // Scenario 2: Likely Denial
  await runScenario(
    "Scenario 2: MRI Lumbar — Likely Denial (Maria Garcia)",
    DENY_CLAIM_BUNDLE,
    ["aetna"]
  );

  console.log(`\n${BOLD}━━━ E2E Test Complete ━━━${RESET}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
