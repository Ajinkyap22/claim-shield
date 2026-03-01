import { Router, type Request, type Response } from "express";
import multer from "multer";
import { createPipeline, getStatus, getResult, deletePipeline } from "../state.js";
import {
  runPipeline,
  callScoring,
  type PipelineFilePart,
} from "../orchestrator.js";
import type { PollStatusResponse } from "@compliance-shield/shared";
import { PipelineStage } from "@compliance-shield/shared";
import {
  mapPipelineResultToComplianceCheckResponse,
  mapPipelineResultToPayerComparison,
} from "../mappers/claim-check-response.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const DEFAULT_PAYERS = ["uhc", "aetna"];

function toFilePart(f: Express.Multer.File): PipelineFilePart {
  return {
    buffer: f.buffer,
    mimetype: f.mimetype,
    originalname: f.originalname,
  };
}

// POST /api/v1/claim-check — start pipeline (mount at /api/v1/claim-check so this is POST /)
router.post(
  "/",
  upload.fields([
    { name: "audio", maxCount: 10 },
    { name: "policy", maxCount: 10 },
    { name: "documentation", maxCount: 10 },
  ]),
  async (req: Request, res: Response) => {
    const clinicalNote = (req.body?.clinicalNote as string)?.trim() ?? "";
    const audioFiles =
      (req.files as Record<string, Express.Multer.File[]>)?.audio ?? [];
    const policyFiles =
      (req.files as Record<string, Express.Multer.File[]>)?.policy ?? [];
    const documentationFiles =
      (req.files as Record<string, Express.Multer.File[]>)?.documentation ?? [];

    const hasClinicalInput =
      clinicalNote.length > 0 ||
      audioFiles.length > 0 ||
      documentationFiles.length > 0;
    const hasPolicy = policyFiles.length > 0;
    if (!hasClinicalInput) {
      res.status(422).json({
        detail:
          "Provide at least one of: clinical note text, audio, or documentation.",
      });
      return;
    }
    if (!hasPolicy) {
      res.status(422).json({
        detail: "Upload at least one policy PDF to run the check.",
      });
      return;
    }

    const pipelineId = createPipeline();
    runPipeline({
      pipelineId,
      clinicalNote,
      audioFiles: audioFiles.map(toFilePart),
      policyFiles: policyFiles.map(toFilePart),
      documentationFiles: documentationFiles.map(toFilePart),
      payers: [], // Main flow scores against uploaded policy only; DEFAULT_PAYERS used only for payer-comparison
    });

    res.status(201).json({ jobId: pipelineId });
  },
);

// GET /api/v1/claim-check/status?jobId=...
router.get("/status", (req: Request, res: Response) => {
  const jobId = req.query.jobId as string;
  if (!jobId?.trim()) {
    res.status(400).json({ detail: "Missing jobId query parameter." });
    return;
  }

  const status = getStatus(jobId);
  if (!status) {
    res.status(404).json({ detail: `Pipeline '${jobId}' not found.` });
    return;
  }

  const policyIngestInProgress = status.stages.find(
    (s) => s.stage === PipelineStage.POLICY_INGEST,
  )?.status === "in_progress";
  const mappingInProgress = status.stages.find(
    (s) => s.stage === PipelineStage.MAPPING,
  )?.status === "in_progress";
  const bothPolicyAndMapping =
    policyIngestInProgress && mappingInProgress;

  const defaultStepDescription =
    status.stages.find((s) => s.stage === status.current_stage)?.message ?? "";

  const pollStatus: PollStatusResponse = {
    status:
      status.current_stage === PipelineStage.COMPLETED
        ? "complete"
        : status.current_stage === PipelineStage.FAILED
          ? "failed"
          : "pending",
    step: status.current_stage,
    stepLabel: bothPolicyAndMapping
      ? "Ingesting policy and mapping to codes…"
      : status.current_stage,
    stepDescription: bothPolicyAndMapping
      ? "Ingesting policy and mapping to codes…"
      : defaultStepDescription,
    progressPercent: status.progress_pct,
    error: status.error ?? undefined,
  };

  if (status.current_stage === PipelineStage.COMPLETED) {
    const result = getResult(jobId);
    if (result) {
      pollStatus.result = mapPipelineResultToComplianceCheckResponse(result);
      // HIPAA: remove ePHI from memory after client receives result (result TTL)
      deletePipeline(jobId);
    }
  }

  res.json(pollStatus);
});

// GET /api/v1/claim-check/payer-comparison?jobId=...
// Runs scoring against DEFAULT_PAYERS (top payers) on demand; does not use uploaded policy.
router.get("/payer-comparison", async (req: Request, res: Response) => {
  const jobId = req.query.jobId as string;
  if (!jobId?.trim()) {
    res.status(400).json({ detail: "Missing jobId query parameter." });
    return;
  }

  const result = getResult(jobId);
  if (!result) {
    const status = getStatus(jobId);
    if (!status) {
      res.status(404).json({ detail: `Pipeline '${jobId}' not found.` });
      return;
    }
    res.status(404).json({
      detail: `Pipeline '${jobId}' has not completed yet. Current stage: ${status.current_stage}`,
    });
    return;
  }

  try {
    const { scores: comparisonScores } = await callScoring(
      result.claim_bundle,
      result.validation_result,
      result.clinical_context,
      DEFAULT_PAYERS,
    );
    const comparisonResult = {
      ...result,
      payer_scores: comparisonScores,
    };
    const comparison = mapPipelineResultToPayerComparison(comparisonResult);
    res.json(comparison);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ detail: message });
  }
});

export default router;
