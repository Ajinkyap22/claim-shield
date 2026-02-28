#!/usr/bin/env npx tsx
/**
 * End-to-end test: Data Extraction Pipe → Validation → Scoring.
 *
 * Reads a clinical note from sample-data/lumbar-spine-note.txt, sends it
 * through the full pipeline:
 *   1. data-extraction-pipe /process  → FHIR R4 Bundle
 *   2. FHIR → ClaimBundle transform   (inline, since mapping-service is not yet built)
 *   3. validation-service /validate    → validation_result + clinical_context
 *   4. scoring-service /score          → ComplianceCheckResponse
 *
 * Prerequisites:
 *   1. Set env vars: OPENROUTER_API_KEY
 *   2. Start data-extraction-pipe:  cd apps/data-extraction-pipe && uvicorn api:app --port 8010
 *   3. Start validation-service:    cd apps/validation-service && npm run dev
 *   4. Start scoring-service:       cd apps/scoring-service && npm run dev
 *   5. Start policy-service:        cd apps/policy-service && npm run dev
 *
 * Usage:
 *   npx tsx apps/scripts/test-extraction-to-scoring.ts
 *   npx tsx apps/scripts/test-extraction-to-scoring.ts --skip-ingest   # if policy already ingested
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AETNA_POLICY_TEXT, AETNA_INGEST_METADATA } from "./sample-aetna-policy.js";
import type { ClaimBundle } from "@compliance-shield/shared";

// ── Service URLs ──

const EXTRACTION_SERVICE =
  process.env.EXTRACTION_SERVICE_URL || "http://localhost:8010";
const VALIDATION_SERVICE =
  process.env.VALIDATION_SERVICE_URL || "http://localhost:8003";
const SCORING_SERVICE =
  process.env.SCORING_SERVICE_URL || "http://localhost:8004";
const POLICY_SERVICE =
  process.env.POLICY_SERVICE_URL || "http://localhost:8005";

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
  console.log(
    `\n${BOLD}━━━ Step 1: Ingesting Aetna CPB 0236 Policy ━━━${RESET}\n`
  );

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

// ── Step 2: Data Extraction Pipe ──

interface FhirResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}

interface FhirEntry {
  fullUrl: string;
  resource: FhirResource;
}

interface FhirBundle {
  resourceType: string;
  id: string;
  type: string;
  entry: FhirEntry[];
}

interface ExtractionResponse {
  fhir_bundle: FhirBundle;
}

async function callExtraction(text: string): Promise<ExtractionResponse> {
  const resp = await fetch(`${EXTRACTION_SERVICE}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Extraction failed (${resp.status}): ${body}`);
  }

  return (await resp.json()) as ExtractionResponse;
}

function printFhirBundle(bundle: FhirBundle): void {
  console.log(`\n  ${BOLD}FHIR Bundle${RESET}`);
  console.log(`  Bundle ID: ${bundle.id}`);
  console.log(`  Resources: ${bundle.entry.length}`);

  for (const entry of bundle.entry) {
    const r = entry.resource;
    const type = r.resourceType;
    let detail = "";

    if (type === "Patient") {
      const names = r.name as Array<{ text?: string }> | undefined;
      detail = names?.[0]?.text || "unknown";
    } else if (type === "Practitioner") {
      const names = r.name as Array<{ text?: string }> | undefined;
      detail = names?.[0]?.text || "unknown";
    } else if (type === "Organization") {
      detail = (r.name as string) || "unknown";
    } else if (type === "Condition") {
      const code = r.code as {
        coding?: Array<{ code?: string; display?: string }>;
      };
      const c = code?.coding?.[0];
      detail = `${c?.code || "?"} – ${c?.display || "?"}`;
    } else if (type === "Procedure") {
      const code = r.code as {
        coding?: Array<{ code?: string; display?: string }>;
      };
      const c = code?.coding?.[0];
      detail = `${c?.code || "?"} – ${c?.display || "?"}`;
    } else if (type === "Claim") {
      const items = r.item as Array<unknown> | undefined;
      detail = `${items?.length || 0} line items`;
    }

    console.log(`    ${CYAN}${type.padEnd(16)}${RESET} ${detail}`);
  }
}

// ── Step 3: FHIR → ClaimBundle transformation ──
// This bridges the gap until the mapping-service is implemented.

function fhirToClaimBundle(bundle: FhirBundle): ClaimBundle {
  const resources = bundle.entry.map((e) => e.resource);

  // Extract patient
  const patientRes = resources.find((r) => r.resourceType === "Patient");
  const patientNames = patientRes?.name as
    | Array<{ text?: string }>
    | undefined;
  const patientName = patientNames?.[0]?.text || "Unknown";
  const patientDob = (patientRes?.birthDate as string) || "1900-01-01";

  // Extract practitioner
  const practitionerRes = resources.find(
    (r) => r.resourceType === "Practitioner"
  );
  const practitionerIds = practitionerRes?.identifier as
    | Array<{ value?: string }>
    | undefined;
  const providerNpi = practitionerIds?.[0]?.value || null;

  // Extract organization
  const orgRes = resources.find((r) => r.resourceType === "Organization");
  const facilityName = (orgRes?.name as string) || null;

  // Extract conditions
  const conditionResources = resources.filter(
    (r) => r.resourceType === "Condition"
  );
  const conditions = conditionResources.map((c) => {
    const codeObj = c.code as {
      coding?: Array<{ code?: string; display?: string }>;
    };
    const coding = codeObj?.coding?.[0];
    const clinicalStatus = c.clinicalStatus as {
      coding?: Array<{ code?: string }>;
    };
    return {
      code: coding?.code || "",
      display: coding?.display || "",
      clinical_status: (clinicalStatus?.coding?.[0]?.code || "active") as
        | "active"
        | "resolved"
        | "inactive",
      onset_date: null,
      severity: null,
    };
  });

  // Extract procedures
  const procedureResources = resources.filter(
    (r) => r.resourceType === "Procedure"
  );
  const procedures = procedureResources.map((p) => {
    const codeObj = p.code as {
      coding?: Array<{ code?: string; display?: string }>;
    };
    const coding = codeObj?.coding?.[0];
    const statusVal = (p.status as string) || "completed";
    return {
      code: coding?.code || "",
      display: coding?.display || "",
      status: statusVal as "proposed" | "completed" | "in-progress",
      date: (p.performedDateTime as string) || null,
      body_site: null,
    };
  });

  // Extract claim resource
  const claimRes = resources.find((r) => r.resourceType === "Claim");
  const claimType = (() => {
    const typeObj = claimRes?.type as {
      coding?: Array<{ code?: string }>;
    };
    return (typeObj?.coding?.[0]?.code || "professional") as
      | "professional"
      | "pharmacy";
  })();

  const serviceDate = (claimRes?.created as string) || null;

  const diagnosisCodes = conditions.map((c) => c.code);
  const procedureCodes = procedures.map((p) => p.code);

  return {
    patient: {
      name: patientName,
      dob: patientDob,
      gender: "male" as const,
      member_id: null,
      payer_id: null,
    },
    conditions,
    procedures,
    medications: [],
    claim: {
      claim_type: claimType,
      priority: "normal" as const,
      diagnosis_codes: diagnosisCodes,
      procedure_codes: procedureCodes,
      medication_codes: [],
      provider_npi: providerNpi,
      facility_type: facilityName,
      service_date: serviceDate,
    },
    supporting_info: {
      conservative_treatment: null,
      physical_exam_findings: null,
      symptom_duration_weeks: null,
      prior_imaging: null,
      lab_results: null,
      lifestyle_modifications: null,
      prior_medications: [],
    },
  };
}

// ── Step 4: Validation ──

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

function normalizeValidationConfidences(output: ValidationOutput): void {
  for (const check of [
    output.validation_result.medical_necessity,
    output.validation_result.step_therapy,
    output.validation_result.documentation,
  ]) {
    if (check.confidence > 1 && check.confidence <= 100) {
      check.confidence /= 100;
    }
  }
}

async function callValidation(
  bundle: ClaimBundle
): Promise<ValidationOutput> {
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

// ── Step 5: Scoring ──

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

  console.log(`\n  ${BOLD}Scoring Result${RESET}`);
  console.log(`  ${BOLD}Score: ${color}${result.score}/100${RESET} denial risk`);
  console.log(`  ${DIM}${result.scoreExplanation}${RESET}`);

  if (result.validationIssues && result.validationIssues.length > 0) {
    console.log(`\n  ${BOLD}Validation Issues:${RESET}`);
    for (const issue of result.validationIssues) {
      const icon =
        issue.type === "error"
          ? `${RED}✗`
          : issue.type === "warn"
            ? `${YELLOW}⚠`
            : `${CYAN}ℹ`;
      console.log(
        `    ${icon}${RESET} [${issue.code || ""}] ${issue.title}`
      );
      if (issue.detail) {
        console.log(`      ${DIM}${issue.detail}${RESET}`);
      }
    }
  }

  if (result.recommendations && result.recommendations.length > 0) {
    console.log(`\n  ${BOLD}Recommendations:${RESET}`);
    for (const rec of result.recommendations) {
      const pColor =
        rec.priority === "high"
          ? RED
          : rec.priority === "medium"
            ? YELLOW
            : GREEN;
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

// ── Main ──

async function main() {
  console.log(
    `${BOLD}╔══════════════════════════════════════════════════════════════════╗${RESET}`
  );
  console.log(
    `${BOLD}║   Compliance Shield — Extraction → Scoring Full E2E Test       ║${RESET}`
  );
  console.log(
    `${BOLD}╚══════════════════════════════════════════════════════════════════╝${RESET}`
  );
  console.log();

  // Health checks
  console.log("Checking service health...");
  const extractionOk = await checkHealth(
    "data-extraction-pipe",
    EXTRACTION_SERVICE
  );
  const validationOk = await checkHealth(
    "validation-service",
    VALIDATION_SERVICE
  );
  const scoringOk = await checkHealth("scoring-service", SCORING_SERVICE);
  const policyOk = await checkHealth("policy-service", POLICY_SERVICE);

  if (!extractionOk || !validationOk || !scoringOk || !policyOk) {
    console.error("\nServices not ready. Start them first:");
    console.error(
      "  Terminal 1: cd apps/data-extraction-pipe && uvicorn api:app --port 8010"
    );
    console.error("  Terminal 2: cd apps/validation-service && npm run dev");
    console.error("  Terminal 3: cd apps/scoring-service && npm run dev");
    console.error("  Terminal 4: cd apps/policy-service && npm run dev");
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

  // Read clinical note
  const notePath = resolve(
    import.meta.dirname || process.cwd(),
    "../../sample-data/lumbar-spine-note.txt"
  );
  const clinicalNote = readFileSync(notePath, "utf-8");

  console.log(
    `\n${BOLD}━━━ Step 2: Data Extraction (clinical note → FHIR Bundle) ━━━${RESET}\n`
  );
  console.log(
    `  ${DIM}Input: ${notePath}${RESET}`
  );
  console.log(
    `  ${DIM}Text length: ${clinicalNote.length} chars${RESET}`
  );

  console.log(`\n  ${CYAN}▶ Calling data-extraction-pipe /process...${RESET}`);
  const extractStart = Date.now();
  const extractionResult = await callExtraction(clinicalNote);
  const extractElapsed = ((Date.now() - extractStart) / 1000).toFixed(1);
  console.log(`  ${DIM}Extraction completed in ${extractElapsed}s${RESET}`);

  printFhirBundle(extractionResult.fhir_bundle);

  // Transform FHIR → ClaimBundle
  console.log(
    `\n${BOLD}━━━ Step 3: FHIR → ClaimBundle Transformation ━━━${RESET}\n`
  );
  const claimBundle = fhirToClaimBundle(extractionResult.fhir_bundle);

  console.log(`  Patient:    ${claimBundle.patient.name}`);
  console.log(`  DOB:        ${claimBundle.patient.dob}`);
  console.log(`  Diagnoses:  ${claimBundle.claim.diagnosis_codes.join(", ")}`);
  console.log(`  Procedures: ${claimBundle.claim.procedure_codes.join(", ")}`);
  console.log(
    `  Provider:   NPI ${claimBundle.claim.provider_npi || "N/A"}`
  );

  // Validation
  console.log(
    `\n${BOLD}━━━ Step 4: Clinical Validation ━━━${RESET}\n`
  );
  console.log(`  ${CYAN}▶ Calling validation-service /validate...${RESET}`);
  const valStart = Date.now();
  const validationOutput = await callValidation(claimBundle);
  normalizeValidationConfidences(validationOutput);
  const valElapsed = ((Date.now() - valStart) / 1000).toFixed(1);
  console.log(`  ${DIM}Validation completed in ${valElapsed}s${RESET}`);
  printValidation(validationOutput);

  // Scoring
  const payers = ["aetna"];
  console.log(
    `\n${BOLD}━━━ Step 5: Payer Scoring (${payers.join(", ")}) ━━━${RESET}\n`
  );
  console.log(`  ${CYAN}▶ Calling scoring-service /score...${RESET}`);
  const scoreStart = Date.now();
  const scoringResult = await callScoring(
    claimBundle,
    validationOutput.validation_result,
    validationOutput.clinical_context,
    payers
  );
  const scoreElapsed = ((Date.now() - scoreStart) / 1000).toFixed(1);
  console.log(`  ${DIM}Scoring completed in ${scoreElapsed}s${RESET}`);
  printScoringResult(scoringResult);

  // Print raw JSON
  console.log(
    `\n${BOLD}━━━ Raw ComplianceCheckResponse JSON ━━━${RESET}`
  );
  console.log(JSON.stringify(scoringResult, null, 2));

  // Print raw FHIR bundle for reference
  console.log(
    `\n${BOLD}━━━ Raw FHIR Bundle JSON ━━━${RESET}`
  );
  console.log(JSON.stringify(extractionResult.fhir_bundle, null, 2));

  console.log(`\n${BOLD}━━━ Full E2E Test Complete ━━━${RESET}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
