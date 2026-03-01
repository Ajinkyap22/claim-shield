import {
  PipelineStage,
  ClaimBundleSchema,
  ClinicalValidationResultSchema,
  ClinicalContextSchema,
  PayerScoreBreakdownSchema,
  DEFAULT_CLINICAL_CONTEXT_INPUT,
} from "@compliance-shield/shared";
import type {
  ClaimBundle,
  ClinicalValidationResult,
  ClinicalContext,
  PayerScoreBreakdown,
  PipelineResult,
  LLMCallUsage,
  ServiceTokenUsage,
} from "@compliance-shield/shared";
import { config } from "./config.js";
import {
  advanceStage,
  completeStage,
  failPipeline,
  finishPipeline,
} from "./state.js";

/** File part for extract-file request (frontend-shaped input). */
export interface PipelineFilePart {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface PipelineInput {
  pipelineId: string;
  clinicalNote: string;
  audioFiles: PipelineFilePart[];
  policyFiles: PipelineFilePart[];
  documentationFiles: PipelineFilePart[];
  payers: string[];
}

/** Response from extract-file service (Go ExtractedResponse). */
export interface ExtractedFile {
  fileName: string;
  text: string;
  error?: string;
}

export interface ExtractedResponse {
  clinicalNote: string;
  audioFiles: ExtractedFile[];
  policyFiles: ExtractedFile[];
  documentationFiles: ExtractedFile[];
  token_usage?: LLMCallUsage[];
}

interface ValidationOutput {
  validation_result: ClinicalValidationResult;
  clinical_context: ClinicalContext;
  token_usage?: LLMCallUsage[];
}

export async function runPipeline(input: PipelineInput): Promise<void> {
  const { pipelineId } = input;
  const start = Date.now();
  // Debug: log pipeline start with safe metadata only (no PHI)
  console.log(
    `[orchestrator] Pipeline ${pipelineId} starting — ` +
      `clinicalNote=${input.clinicalNote ? `${input.clinicalNote.length} chars` : "empty"}, ` +
      `audioFiles=${input.audioFiles?.length ?? 0}, ` +
      `policyFiles=${input.policyFiles?.length ?? 0}, ` +
      `documentationFiles=${input.documentationFiles?.length ?? 0}, ` +
      `payers=[${input.payers?.join(",") ?? ""}]`,
  );

  try {
    // Token usage accumulator — collect from all services
    const usageByService: Record<string, LLMCallUsage[]> = {};

    // Stage 1: Extraction via extract-file service
    advanceStage(
      pipelineId,
      PipelineStage.EXTRACTING,
      "Extracting clinical data...",
    );
    const extracted = await callExtractFile(input);
    if (extracted.token_usage?.length) {
      usageByService["extract-file"] = extracted.token_usage;
    }
    const rawText = mergeExtractedResponse(extracted);
    completeStage(
      pipelineId,
      PipelineStage.EXTRACTING,
      `Extracted ${rawText.length} chars from clinical note and files`,
      extracted,
    );

    // Stage 2 & 3: Policy ingest and mapping run in parallel (neither depends on the other)
    const policyFilesToIngest = (extracted.policyFiles ?? []).filter(
      (f) => f.text?.trim() && !f.error,
    );
    const hasPolicyFiles = policyFilesToIngest.length > 0;

    advanceStage(
      pipelineId,
      PipelineStage.POLICY_INGEST,
      "Sending policy data to policy service...",
    );
    advanceStage(
      pipelineId,
      PipelineStage.MAPPING,
      "Mapping to ICD-10 / CPT codes...",
    );

    let policyIngestResults: PolicyIngestResult[];
    let bundle: ClaimBundle;
    let mappingUsage: LLMCallUsage[] = [];

    if (hasPolicyFiles) {
      let processResult: ProcessResult;
      let ingestResults: PolicyIngestResultWithUsage;
      [ingestResults, processResult] = await Promise.all([
        callPolicyIngest(extracted.policyFiles ?? []),
        callProcess(rawText),
      ]);
      policyIngestResults = ingestResults.results;
      if (ingestResults.token_usage.length) {
        usageByService["policy-ingest"] = ingestResults.token_usage;
      }
      bundle = processResult.bundle;
      mappingUsage = processResult.token_usage;
      if (policyIngestResults.length === 0) {
        failPipeline(
          pipelineId,
          "Policy ingest produced no results; cannot proceed to mapping.",
        );
        return;
      }
    } else {
      policyIngestResults = [];
      const processResult = await callProcess(rawText);
      bundle = processResult.bundle;
      mappingUsage = processResult.token_usage;
    }
    if (mappingUsage.length) {
      usageByService["mapping"] = mappingUsage;
    }

    completeStage(
      pipelineId,
      PipelineStage.POLICY_INGEST,
      `Ingested ${policyIngestResults.length} policy document(s)`,
      policyIngestResults,
    );
    const mappingCount =
      bundle.conditions.length + bundle.procedures.length;
    completeStage(
      pipelineId,
      PipelineStage.MAPPING,
      `Found ${mappingCount} code mappings`,
      { count: mappingCount },
    );

    advanceStage(
      pipelineId,
      PipelineStage.BUILDING_BUNDLE,
      "Building FHIR record...",
    );
    completeStage(
      pipelineId,
      PipelineStage.BUILDING_BUNDLE,
      "FHIR-like claim bundle ready",
      bundle,
    );

    // Stage 5: Clinical Validation + Fact Extraction
    advanceStage(
      pipelineId,
      PipelineStage.VALIDATING,
      "Validating clinical documentation...",
    );
    const { validation_result, clinical_context, token_usage: validationUsage } =
      await callValidation(bundle);
    if (validationUsage?.length) {
      usageByService["validation"] = validationUsage;
    }
    completeStage(
      pipelineId,
      PipelineStage.VALIDATING,
      `Validation: ${validation_result.overall_status}`,
      { validation_result, clinical_context },
    );

    // Stage 6: Payer Denial Scoring — use payers from this run's policy ingest only (not default/top payers)
    const payersForScoring =
      policyIngestResults.length > 0
        ? [...new Set(policyIngestResults.map((p) => p.payer_id))]
        : [];
    advanceStage(
      pipelineId,
      PipelineStage.SCORING,
      "Scoring against payer policies...",
    );
    const { scores: payerScores, token_usage: scoringUsage } = await callScoring(
      bundle,
      validation_result,
      clinical_context,
      payersForScoring,
    );
    if (scoringUsage.length) {
      usageByService["scoring"] = scoringUsage;
    }
    completeStage(
      pipelineId,
      PipelineStage.SCORING,
      "Denial scores computed for all payers",
      payerScores,
    );

    // Build consolidated token_usage for PipelineResult
    const token_usage: ServiceTokenUsage[] = Object.entries(usageByService).map(
      ([service, calls]) => ({ service, calls }),
    );

    const elapsed = (Date.now() - start) / 1000;

    // Log consolidated token usage summary
    logTokenUsageSummary(pipelineId, token_usage);

    console.log(
      `[orchestrator] Pipeline ${pipelineId} COMPLETED in ${elapsed.toFixed(2)}s — ` +
        `conditions=${bundle.conditions.length}, procedures=${bundle.procedures.length}, ` +
        `payerScores=${Object.keys(payerScores).length}`,
    );
    const result: PipelineResult = {
      claim_bundle: bundle,
      validation_result,
      clinical_context,
      payer_scores: payerScores,
      processing_time_seconds: Math.round(elapsed * 100) / 100,
      token_usage: token_usage.length > 0 ? token_usage : undefined,
    };
    finishPipeline(pipelineId, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.error(
      `[orchestrator] Pipeline ${pipelineId} FAILED after ${elapsed}s — ${message}`,
    );
    if (err instanceof Error && err.cause) {
      console.error(`[orchestrator] Cause:`, err.cause);
    }
    failPipeline(pipelineId, message);
  }
}

// -- Service call helpers --

/** Merges clinical note + audio + documentation into one string for mapping. Policy data is excluded and will be handled by a separate policy service. */
function mergeExtractedResponse(res: ExtractedResponse): string {
  const parts: string[] = [];
  if (res.clinicalNote?.trim()) parts.push(res.clinicalNote.trim());
  for (const f of res.audioFiles ?? []) {
    if (f.text?.trim() && !f.error) parts.push(f.text.trim());
  }
  for (const f of res.documentationFiles ?? []) {
    if (f.text?.trim() && !f.error) parts.push(f.text.trim());
  }
  // Policy files are not included here; a separate policy service will use them.
  return parts.join("\n\n") || "";
}

/** Log a formatted token usage summary to console. */
function logTokenUsageSummary(pipelineId: string, usage: ServiceTokenUsage[]): void {
  if (usage.length === 0) return;

  const lines: string[] = [`[orchestrator] Pipeline ${pipelineId} Token Usage:`];
  let totalPrompt = 0;
  let totalCompletion = 0;
  let totalTokens = 0;
  let totalCalls = 0;

  for (const svc of usage) {
    const p = svc.calls.reduce((s: number, c: LLMCallUsage) => s + c.prompt_tokens, 0);
    const c = svc.calls.reduce((s: number, u: LLMCallUsage) => s + u.completion_tokens, 0);
    const t = svc.calls.reduce((s: number, u: LLMCallUsage) => s + u.total_tokens, 0);
    totalPrompt += p;
    totalCompletion += c;
    totalTokens += t;
    totalCalls += svc.calls.length;
    lines.push(
      `  ${svc.service.padEnd(16)} prompt=${p}  completion=${c}  total=${t}  (${svc.calls.length} call${svc.calls.length === 1 ? "" : "s"})`,
    );
  }
  lines.push(
    `  ${"TOTAL".padEnd(16)} prompt=${totalPrompt}  completion=${totalCompletion}  total=${totalTokens}  (${totalCalls} call${totalCalls === 1 ? "" : "s"})`,
  );
  console.log(lines.join("\n"));
}

/** Response from policy-service POST /policies/ingest (one per policy document). */
export interface PolicyIngestResult {
  policy_id: string;
  payer_id: string;
  payer_name: string;
  policy_name: string;
  criteria_count: number;
  chunks_processed?: number;
  criteria?: unknown[];
}

interface PolicyIngestResultWithUsage {
  results: PolicyIngestResult[];
  token_usage: LLMCallUsage[];
}

/** Timeout for policy ingest (large PDFs can take several minutes due to many LLM calls). */
const POLICY_INGEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Send extracted policy text to the policy service via multipart/form-data; returns one result per document ingested. */
async function callPolicyIngest(
  policyFiles: ExtractedFile[],
): Promise<PolicyIngestResultWithUsage> {
  if (policyFiles.length === 0) {
    console.log("[orchestrator] callPolicyIngest — no policy files, skipping");
    return { results: [], token_usage: [] };
  }

  console.log(
    `[orchestrator] callPolicyIngest — processing ${policyFiles.length} file(s)`,
  );
  const results: PolicyIngestResult[] = [];
  const allUsage: LLMCallUsage[] = [];
  for (let i = 0; i < policyFiles.length; i++) {
    const f = policyFiles[i];
    if (!f.text?.trim() || f.error) {
      console.log(
        `[orchestrator] callPolicyIngest — skipping file ${i + 1} (empty or errored)`,
      );
      continue;
    }
    const url = `${config.policyServiceUrl}/policies/ingest`;
    console.log(
      `[orchestrator] callPolicyIngest → POST ${url} (file ${i + 1}/${policyFiles.length}, textLen=${f.text.trim().length})`,
    );
    const form = new FormData();
    form.append("text", f.text.trim());
    form.append(
      "metadata",
      JSON.stringify({
        payer_id: "user",
        payer_name: "User",
        policy_name: f.fileName || "Policy",
      }),
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), POLICY_INGEST_TIMEOUT_MS);
    const t0 = Date.now();
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const elapsed = Date.now() - t0;
      if (err instanceof Error && err.name === "AbortError") {
        console.error(
          `[orchestrator] callPolicyIngest TIMEOUT after ${elapsed}ms for file ${i + 1}`,
        );
        throw new Error(
          "Policy ingest timed out (10 min). Large PDFs take many LLM calls; try a smaller document or try again.",
        );
      }
      console.error(
        `[orchestrator] callPolicyIngest FAILED after ${elapsed}ms for file ${i + 1} — ${err instanceof Error ? err.message : err}`,
      );
      if (err instanceof Error && err.cause) {
        console.error(`[orchestrator] callPolicyIngest cause:`, err.cause);
      }
      throw err;
    }
    clearTimeout(timeoutId);
    const elapsed = Date.now() - t0;
    console.log(
      `[orchestrator] callPolicyIngest ← ${resp.status} (${elapsed}ms) for file ${i + 1}`,
    );
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Policy service ingest failed (${resp.status}): ${text}`);
    }
    const data = (await resp.json()) as PolicyIngestResult & { token_usage?: LLMCallUsage[] };
    const { token_usage: tu, ...ingestResult } = data;
    results.push(ingestResult);
    if (tu?.length) allUsage.push(...tu);
  }
  console.log(
    `[orchestrator] callPolicyIngest — done, ${results.length} result(s)`,
  );
  return { results, token_usage: allUsage };
}

async function callExtractFile(
  input: PipelineInput,
): Promise<ExtractedResponse> {
  const url = `${config.extractFileServiceUrl}/api/extract`;
  console.log(`[orchestrator] callExtractFile → POST ${url}`);
  const form = new FormData();
  form.append("clinicalNote", input.clinicalNote ?? "");

  for (const f of input.audioFiles ?? []) {
    const blob = new Blob([new Uint8Array(f.buffer)], { type: f.mimetype });
    form.append("audioFiles", blob, f.originalname || "audio");
  }
  for (const f of input.policyFiles ?? []) {
    const blob = new Blob([new Uint8Array(f.buffer)], { type: f.mimetype });
    form.append("policyFiles", blob, f.originalname || "policy");
  }
  for (const f of input.documentationFiles ?? []) {
    const blob = new Blob([new Uint8Array(f.buffer)], { type: f.mimetype });
    form.append("documentationFiles", blob, f.originalname || "documentation");
  }

  const hasClinicalInput =
    (input.clinicalNote?.trim()?.length ?? 0) > 0 ||
    (input.audioFiles?.length ?? 0) > 0 ||
    (input.documentationFiles?.length ?? 0) > 0;
  if (!hasClinicalInput) {
    throw new Error(
      "At least one of clinical note, audio, or documentation must be provided",
    );
  }

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, { method: "POST", body: form });
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(
      `[orchestrator] callExtractFile FAILED after ${elapsed}ms — ${err instanceof Error ? err.message : err}`,
    );
    if (err instanceof Error && err.cause) {
      console.error(`[orchestrator] callExtractFile cause:`, err.cause);
    }
    throw err;
  }
  const elapsed = Date.now() - t0;
  console.log(
    `[orchestrator] callExtractFile ← ${resp.status} (${elapsed}ms)`,
  );
  if (!resp.ok) throw new Error(`Extract-file service error: ${resp.status}`);
  return (await resp.json()) as ExtractedResponse;
}

/** FHIR R4 Bundle entry from data-extraction-pipe (resourceType on resource). */
interface FhirBundleEntry {
  resource?: {
    resourceType?: string;
    name?: Array<{ text?: string }>;
    birthDate?: string;
    code?: { coding?: Array<{ code?: string; display?: string }> };
    status?: string;
    performedDateTime?: string;
    diagnosis?: Array<{ diagnosisReference?: { reference?: string } }>;
    item?: Array<{
      productOrService?: { coding?: Array<{ code?: string }> };
    }>;
    type?: { coding?: Array<{ code?: string }> };
    priority?: { coding?: Array<{ code?: string }> };
    created?: string;
    provider?: { reference?: string };
  };
}

/** Convert FHIR R4 Bundle from data-extraction-pipe to ClaimBundle for validation/scoring. */
function fhirBundleToClaimBundle(fhir: {
  entry?: FhirBundleEntry[];
}): ClaimBundle {
  const entries = fhir.entry ?? [];
  const patientRes = entries.find(
    (e) => e.resource?.resourceType === "Patient",
  )?.resource;
  const conditionsRes = entries.filter(
    (e) => e.resource?.resourceType === "Condition",
  );
  const proceduresRes = entries.filter(
    (e) => e.resource?.resourceType === "Procedure",
  );
  const claimRes = entries.find(
    (e) => e.resource?.resourceType === "Claim",
  )?.resource;

  const patient = {
    name: patientRes?.name?.[0]?.text ?? "Unknown",
    dob: patientRes?.birthDate ?? "",
    gender: "male" as const,
    member_id: null,
    payer_id: null,
  };

  const conditions = conditionsRes.map((e) => {
    const c = e.resource?.code?.coding?.[0];
    return {
      code: c?.code ?? "",
      display: c?.display ?? "",
      clinical_status: "active" as const,
      onset_date: null,
      severity: null,
    };
  });

  const procedures = proceduresRes.map((e) => {
    const c = e.resource?.code?.coding?.[0];
    return {
      code: c?.code ?? "",
      display: c?.display ?? "",
      status: (e.resource?.status === "completed"
        ? "completed"
        : "proposed") as "completed" | "proposed" | "in-progress",
      date: e.resource?.performedDateTime ?? null,
      body_site: null,
    };
  });

  const diagnosisCodes = conditions.map((c) => c.code);
  const procedureCodes = procedures.map((p) => p.code);

  const claim = {
    claim_type: "professional" as const,
    priority: (claimRes?.priority?.coding?.[0]?.code as "normal" | "urgent") ?? "normal",
    diagnosis_codes: diagnosisCodes,
    procedure_codes: procedureCodes,
    medication_codes: [] as string[],
    provider_npi: null,
    facility_type: null,
    service_date: claimRes?.created ?? null,
  };

  return ClaimBundleSchema.parse({
    patient,
    conditions,
    procedures,
    medications: [],
    claim,
    supporting_info: {},
  });
}

interface ProcessResult {
  bundle: ClaimBundle;
  token_usage: LLMCallUsage[];
}

/** Call mapping service /process; returns ClaimBundle (converted from FHIR bundle). */
async function callProcess(rawText: string): Promise<ProcessResult> {
  const url = `${config.mappingServiceUrl}/process`;
  console.log(
    `[orchestrator] callProcess → POST ${url} (textLen=${rawText.length})`,
  );
  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawText }),
    });
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(
      `[orchestrator] callProcess FAILED after ${elapsed}ms — ${err instanceof Error ? err.message : err}`,
    );
    if (err instanceof Error && err.cause) {
      console.error(`[orchestrator] callProcess cause:`, err.cause);
    }
    throw err;
  }
  const elapsed = Date.now() - t0;
  console.log(`[orchestrator] callProcess ← ${resp.status} (${elapsed}ms)`);
  if (!resp.ok) throw new Error(`Mapping service error: ${resp.status}`);
  const data = (await resp.json()) as {
    fhir_bundle?: { entry?: FhirBundleEntry[] };
    token_usage?: LLMCallUsage[];
  };
  const fhir = data.fhir_bundle && typeof data.fhir_bundle === "object"
    ? { entry: data.fhir_bundle.entry ?? [] }
    : { entry: [] };
  return {
    bundle: fhirBundleToClaimBundle(fhir),
    token_usage: data.token_usage ?? [],
  };
}

async function callValidation(bundle: ClaimBundle): Promise<ValidationOutput> {
  const url = `${config.validationServiceUrl}/validate`;
  console.log(`[orchestrator] callValidation → POST ${url}`);
  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bundle),
    });
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(
      `[orchestrator] callValidation FAILED after ${elapsed}ms — ${err instanceof Error ? err.message : err}`,
    );
    if (err instanceof Error && err.cause) {
      console.error(`[orchestrator] callValidation cause:`, err.cause);
    }
    throw err;
  }
  const elapsed = Date.now() - t0;
  console.log(
    `[orchestrator] callValidation ← ${resp.status} (${elapsed}ms)`,
  );
  if (!resp.ok) {
    const bodyText = await resp.text();
    let detail = bodyText;
    try {
      const json = JSON.parse(bodyText) as { detail?: string };
      if (json.detail) detail = json.detail;
    } catch {
      // use raw body
    }
    // Log status only; do not log response body (may contain claim/PHI)
    console.error(
      `[orchestrator] Validation service error ${resp.status}`,
    );
    throw new Error(`Validation service error: ${resp.status} — ${detail}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const vrParsed = ClinicalValidationResultSchema.safeParse(
    data.validation_result,
  );
  const ccParsed = ClinicalContextSchema.safeParse(data.clinical_context);
  return {
    validation_result: vrParsed.success
      ? vrParsed.data
      : ClinicalValidationResultSchema.parse({}),
    clinical_context: ccParsed.success
      ? ccParsed.data
      : ClinicalContextSchema.parse(DEFAULT_CLINICAL_CONTEXT_INPUT),
    token_usage: (data.token_usage as LLMCallUsage[] | undefined) ?? [],
  };
}

interface ScoringCallResult {
  scores: Record<string, PayerScoreBreakdown>;
  token_usage: LLMCallUsage[];
}

/** Call scoring service for a given set of payers (used by main pipeline and by payer-comparison endpoint). */
export async function callScoring(
  bundle: ClaimBundle,
  validation: ClinicalValidationResult,
  clinicalContext: ClinicalContext,
  payers: string[],
): Promise<ScoringCallResult> {
  if (payers.length === 0) {
    console.log("[orchestrator] callScoring — no payers, skipping");
    return { scores: {}, token_usage: [] };
  }
  const url = `${config.scoringServiceUrl}/score`;
  console.log(
    `[orchestrator] callScoring → POST ${url} (payers=[${payers.join(",")}])`,
  );
  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_bundle: bundle,
        validation_result: validation,
        clinical_context: clinicalContext,
        payers,
      }),
    });
  } catch (err) {
    const elapsed = Date.now() - t0;
    console.error(
      `[orchestrator] callScoring FAILED after ${elapsed}ms — ${err instanceof Error ? err.message : err}`,
    );
    if (err instanceof Error && err.cause) {
      console.error(`[orchestrator] callScoring cause:`, err.cause);
    }
    throw err;
  }
  const elapsed = Date.now() - t0;
  console.log(`[orchestrator] callScoring ← ${resp.status} (${elapsed}ms)`);
  if (!resp.ok) throw new Error(`Scoring service error: ${resp.status}`);
  const data = (await resp.json()) as {
    payer_scores: Record<string, unknown>;
    token_usage?: LLMCallUsage[];
  };
  const scores: Record<string, PayerScoreBreakdown> = {};
  for (const [key, val] of Object.entries(data.payer_scores ?? {})) {
    scores[key] = PayerScoreBreakdownSchema.parse(val);
  }
  return { scores, token_usage: data.token_usage ?? [] };
}
