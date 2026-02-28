import {
  PipelineStage,
  ICD10MappingSchema,
  ClaimBundleSchema,
  ClinicalValidationResultSchema,
  ClinicalContextSchema,
  PayerScoreBreakdownSchema,
} from "@compliance-shield/shared";
import type {
  ICD10Mapping,
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
  const { pipelineId, payers } = input;
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

    // Stage 2: ICD-10 / CPT Mapping
    advanceStage(
      pipelineId,
      PipelineStage.MAPPING,
      "Mapping to ICD-10 / CPT codes...",
    );
    const mappings = await callMappingCodes(rawText);
    completeStage(
      pipelineId,
      PipelineStage.MAPPING,
      `Found ${mappings.length} code mappings`,
      mappings,
    );

    // Stage 3: Build FHIR Bundle
    advanceStage(
      pipelineId,
      PipelineStage.BUILDING_BUNDLE,
      "Building FHIR record...",
    );
    const bundle = await callBuildBundle(rawText, mappings);
    completeStage(
      pipelineId,
      PipelineStage.BUILDING_BUNDLE,
      "FHIR-like claim bundle ready",
      bundle,
    );

    // Stage 4: Clinical Validation + Fact Extraction
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

    // Stage 5: Payer Denial Scoring
    advanceStage(
      pipelineId,
      PipelineStage.SCORING,
      "Scoring against payer policies...",
    );
    const payerScores = await callScoring(
      bundle,
      validation_result,
      clinical_context,
      payers,
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

async function callMappingCodes(rawText: string): Promise<ICD10Mapping[]> {
  const url = `${config.mappingServiceUrl}/map-codes`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_text: rawText }),
  });
  if (!resp.ok) throw new Error(`Mapping service error: ${resp.status}`);
  const data = (await resp.json()) as { mappings: unknown[] };
  return data.mappings.map((m) => ICD10MappingSchema.parse(m));
}

async function callBuildBundle(
  rawText: string,
  mappings: ICD10Mapping[],
): Promise<ClaimBundle> {
  const url = `${config.mappingServiceUrl}/build-bundle`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_text: rawText, mappings }),
  });
  if (!resp.ok) throw new Error(`Bundle build error: ${resp.status}`);
  return ClaimBundleSchema.parse(await resp.json());
}

async function callValidation(bundle: ClaimBundle): Promise<ValidationOutput> {
  const url = `${config.validationServiceUrl}/validate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
  if (!resp.ok) throw new Error(`Validation service error: ${resp.status}`);

  const data = (await resp.json()) as Record<string, unknown>;
  return {
    validation_result: ClinicalValidationResultSchema.parse(
      data.validation_result,
    ),
    clinical_context: ClinicalContextSchema.parse(data.clinical_context),
  };
}

async function callScoring(
  bundle: ClaimBundle,
  validation: ClinicalValidationResult,
  clinicalContext: ClinicalContext,
  payers: string[],
): Promise<Record<string, PayerScoreBreakdown>> {
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
  for (const [key, val] of Object.entries(data.payer_scores)) {
    scores[key] = PayerScoreBreakdownSchema.parse(val);
  }
  return scores;
}
