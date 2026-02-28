import {
  PipelineStage,
  ClaimBundleSchema,
  ClinicalValidationResultSchema,
  ClinicalContextSchema,
  PayerScoreBreakdownSchema,
} from "@compliance-shield/shared";
import type {
  ClaimBundle,
  ClinicalValidationResult,
  ClinicalContext,
  PayerScoreBreakdown,
  PipelineResult,
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
}

interface ValidationOutput {
  validation_result: ClinicalValidationResult;
  clinical_context: ClinicalContext;
}

export async function runPipeline(input: PipelineInput): Promise<void> {
  const { pipelineId } = input;
  const start = Date.now();

  try {
    // Stage 1: Extraction via extract-file service
    advanceStage(
      pipelineId,
      PipelineStage.EXTRACTING,
      "Extracting clinical data...",
    );
    const extracted = await callExtractFile(input);
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

    let policyIngestResults: Awaited<ReturnType<typeof callPolicyIngest>>;
    let bundle: ClaimBundle;

    if (hasPolicyFiles) {
      [policyIngestResults, bundle] = await Promise.all([
        callPolicyIngest(extracted.policyFiles ?? []),
        callProcess(rawText),
      ]);
      if (policyIngestResults.length === 0) {
        failPipeline(
          pipelineId,
          "Policy ingest produced no results; cannot proceed to mapping.",
        );
        return;
      }
    } else {
      policyIngestResults = [];
      bundle = await callProcess(rawText);
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
    const { validation_result, clinical_context } =
      await callValidation(bundle);
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
    const payerScores = await callScoring(
      bundle,
      validation_result,
      clinical_context,
      payersForScoring,
    );
    completeStage(
      pipelineId,
      PipelineStage.SCORING,
      "Denial scores computed for all payers",
      payerScores,
    );

    const elapsed = (Date.now() - start) / 1000;
    const result: PipelineResult = {
      claim_bundle: bundle,
      validation_result,
      clinical_context,
      payer_scores: payerScores,
      processing_time_seconds: Math.round(elapsed * 100) / 100,
    };
    finishPipeline(pipelineId, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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

/** Timeout for policy ingest (large PDFs can take several minutes due to many LLM calls). */
const POLICY_INGEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Send extracted policy text to the policy service via multipart/form-data; returns one result per document ingested. */
async function callPolicyIngest(
  policyFiles: ExtractedFile[],
): Promise<PolicyIngestResult[]> {
  if (policyFiles.length === 0) return [];

  const results: PolicyIngestResult[] = [];
  for (const f of policyFiles) {
    if (!f.text?.trim() || f.error) continue;
    const url = `${config.policyServiceUrl}/policies/ingest`;
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
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(
          "Policy ingest timed out (10 min). Large PDFs take many LLM calls; try a smaller document or try again.",
        );
      }
      throw err;
    }
    clearTimeout(timeoutId);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Policy service ingest failed (${resp.status}): ${text}`);
    }
    const data = (await resp.json()) as PolicyIngestResult;
    results.push(data);
  }
  return results;
}

async function callExtractFile(
  input: PipelineInput,
): Promise<ExtractedResponse> {
  const url = `${config.extractFileServiceUrl}/api/extract`;
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

  const hasFiles =
    (input.audioFiles?.length ?? 0) > 0 ||
    (input.policyFiles?.length ?? 0) > 0 ||
    (input.documentationFiles?.length ?? 0) > 0;
  if (!input.clinicalNote?.trim() && !hasFiles) {
    throw new Error(
      "Either clinicalNote or at least one file must be provided",
    );
  }

  const resp = await fetch(url, { method: "POST", body: form });
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

/** Call mapping service /process; returns ClaimBundle (converted from FHIR bundle). */
async function callProcess(rawText: string): Promise<ClaimBundle> {
  const url = `${config.mappingServiceUrl}/process`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: rawText }),
  });
  if (!resp.ok) throw new Error(`Mapping service error: ${resp.status}`);
  const data = (await resp.json()) as {
    fhir_bundle?: { entry?: FhirBundleEntry[] };
  };
  const fhir = data.fhir_bundle && typeof data.fhir_bundle === "object"
    ? { entry: data.fhir_bundle.entry ?? [] }
    : { entry: [] };
  return fhirBundleToClaimBundle(fhir);
}

async function callValidation(bundle: ClaimBundle): Promise<ValidationOutput> {
  const url = `${config.validationServiceUrl}/validate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
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
  return {
    validation_result: ClinicalValidationResultSchema.parse(
      data.validation_result,
    ),
    clinical_context: ClinicalContextSchema.parse(data.clinical_context),
  };
}

/** Call scoring service for a given set of payers (used by main pipeline and by payer-comparison endpoint). */
export async function callScoring(
  bundle: ClaimBundle,
  validation: ClinicalValidationResult,
  clinicalContext: ClinicalContext,
  payers: string[],
): Promise<Record<string, PayerScoreBreakdown>> {
  if (payers.length === 0) return {};
  const url = `${config.scoringServiceUrl}/score`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claim_bundle: bundle,
      validation_result: validation,
      clinical_context: clinicalContext,
      payers,
    }),
  });
  if (!resp.ok) throw new Error(`Scoring service error: ${resp.status}`);
  const data = (await resp.json()) as {
    payer_scores: Record<string, unknown>;
  };
  const scores: Record<string, PayerScoreBreakdown> = {};
  for (const [key, val] of Object.entries(data.payer_scores ?? {})) {
    scores[key] = PayerScoreBreakdownSchema.parse(val);
  }
  return scores;
}
