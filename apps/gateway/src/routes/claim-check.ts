import { Router, type Request, type Response } from "express";
import multer from "multer";
import { createPipeline, getStatus, getResult } from "../state.js";
import { runPipeline, type PipelineFilePart } from "../orchestrator.js";
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

    const hasFiles =
      audioFiles.length > 0 ||
      policyFiles.length > 0 ||
      documentationFiles.length > 0;
    if (!clinicalNote && !hasFiles) {
      res.status(422).json({
        detail:
          "Provide clinicalNote or at least one file (audio, policy, or documentation).",
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
      payers: DEFAULT_PAYERS,
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

  const pollStatus: PollStatusResponse = {
    status:
      status.current_stage === PipelineStage.COMPLETED
        ? "complete"
        : status.current_stage === PipelineStage.FAILED
          ? "failed"
          : "pending",
    step: status.current_stage,
    stepLabel: status.current_stage,
    stepDescription:
      status.stages.find((s) => s.stage === status.current_stage)?.message ??
      "",
    error: status.error ?? undefined,
  };

  if (status.current_stage === PipelineStage.COMPLETED) {
    const result = getResult(jobId);
    if (result) {
      pollStatus.result = mapPipelineResultToComplianceCheckResponse(result);
    }
  }

  res.json(pollStatus);
});

// GET /api/v1/claim-check/payer-comparison?jobId=...
router.get("/payer-comparison", (req: Request, res: Response) => {
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

  const comparison = mapPipelineResultToPayerComparison(result);
  res.json(comparison);
});

export default router;
