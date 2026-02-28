import {
  PipelineStage,
  ExtractionResultSchema,
  ICD10MappingSchema,
  ClaimBundleSchema,
  ClinicalValidationResultSchema,
  ClinicalContextSchema,
  PayerScoreBreakdownSchema,
} from "@compliance-shield/shared";
import type {
  ExtractionResult,
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

interface PipelineInput {
  pipelineId: string;
  fileBuffer?: Buffer;
  fileContentType?: string;
  fileName?: string;
  text?: string;
  payers: string[];
}

interface ValidationOutput {
  validation_result: ClinicalValidationResult;
  clinical_context: ClinicalContext;
}

export async function runPipeline(input: PipelineInput): Promise<void> {
  const { pipelineId, payers } = input;
  const start = Date.now();

  try {
    // Stage 1: Extraction
    advanceStage(pipelineId, PipelineStage.EXTRACTING, "Extracting clinical data...");
    const extraction = await callExtraction(input);
    completeStage(
      pipelineId,
      PipelineStage.EXTRACTING,
      `Extracted ${extraction.raw_text.length} chars from ${extraction.source_type}`,
      extraction
    );

    // Stage 2: ICD-10 / CPT Mapping
    advanceStage(pipelineId, PipelineStage.MAPPING, "Mapping to ICD-10 / CPT codes...");
    const mappings = await callMappingCodes(extraction.raw_text);
    completeStage(
      pipelineId,
      PipelineStage.MAPPING,
      `Found ${mappings.length} code mappings`,
      mappings
    );

    // Stage 3: Build FHIR Bundle
    advanceStage(pipelineId, PipelineStage.BUILDING_BUNDLE, "Building FHIR record...");
    const bundle = await callBuildBundle(extraction.raw_text, mappings);
    completeStage(
      pipelineId,
      PipelineStage.BUILDING_BUNDLE,
      "FHIR-like claim bundle ready",
      bundle
    );

    // Stage 4: Clinical Validation + Fact Extraction
    advanceStage(pipelineId, PipelineStage.VALIDATING, "Validating clinical documentation...");
    const { validation_result, clinical_context } = await callValidation(bundle);
    completeStage(
      pipelineId,
      PipelineStage.VALIDATING,
      `Validation: ${validation_result.overall_status}`,
      { validation_result, clinical_context }
    );

    // Stage 5: Payer Denial Scoring
    advanceStage(pipelineId, PipelineStage.SCORING, "Scoring against payer policies...");
    const payerScores = await callScoring(
      bundle,
      validation_result,
      clinical_context,
      payers
    );
    completeStage(
      pipelineId,
      PipelineStage.SCORING,
      "Denial scores computed for all payers",
      payerScores
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

async function callExtraction(input: PipelineInput): Promise<ExtractionResult> {
  const url = `${config.extractionServiceUrl}/extract`;

  let resp: Response;
  if (input.fileBuffer && input.fileContentType) {
    const form = new FormData();
    const blob = new Blob([input.fileBuffer], { type: input.fileContentType });
    form.append("file", blob, input.fileName || "upload");
    resp = await fetch(url, { method: "POST", body: form });
  } else if (input.text) {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.text }),
    });
  } else {
    throw new Error("Either file or text must be provided");
  }

  if (!resp.ok) throw new Error(`Extraction service error: ${resp.status}`);
  return ExtractionResultSchema.parse(await resp.json());
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
  mappings: ICD10Mapping[]
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

async function callValidation(
  bundle: ClaimBundle
): Promise<ValidationOutput> {
  const url = `${config.validationServiceUrl}/validate`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
  if (!resp.ok) throw new Error(`Validation service error: ${resp.status}`);

  const data = (await resp.json()) as Record<string, unknown>;
  return {
    validation_result: ClinicalValidationResultSchema.parse(data.validation_result),
    clinical_context: ClinicalContextSchema.parse(data.clinical_context),
  };
}

async function callScoring(
  bundle: ClaimBundle,
  validation: ClinicalValidationResult,
  clinicalContext: ClinicalContext,
  payers: string[]
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
