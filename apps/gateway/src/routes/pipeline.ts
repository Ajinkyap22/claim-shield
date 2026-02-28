import { Router } from "express";
import multer from "multer";
import { createPipeline, getStatus, getResult } from "../state.js";
import { runPipeline } from "../orchestrator.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/pipeline/run — Start a new pipeline
router.post("/run", upload.single("file"), async (req, res) => {
  const file = req.file;
  const text = req.body?.text as string | undefined;
  const payersRaw = (req.body?.payers as string) || "uhc,aetna,cigna";

  if (!file && !text) {
    res.status(422).json({ detail: "Either 'file' or 'text' must be provided." });
    return;
  }

  const pipelineId = createPipeline();
  const payers = payersRaw.split(",").map((p: string) => p.trim()).filter(Boolean);

  // Fire and forget
  runPipeline({
    pipelineId,
    fileBuffer: file?.buffer,
    fileContentType: file?.mimetype,
    fileName: file?.originalname,
    text: text || undefined,
    payers,
  });

  const status = getStatus(pipelineId);
  res.json(status);
});

// GET /api/pipeline/:id — Poll progress
router.get("/:pipelineId", (req, res) => {
  const status = getStatus(req.params.pipelineId);
  if (!status) {
    res.status(404).json({ detail: `Pipeline '${req.params.pipelineId}' not found.` });
    return;
  }
  res.json(status);
});

// GET /api/pipeline/:id/result — Get final result
router.get("/:pipelineId/result", (req, res) => {
  const result = getResult(req.params.pipelineId);
  if (result) {
    res.json(result);
    return;
  }

  const status = getStatus(req.params.pipelineId);
  if (!status) {
    res.status(404).json({ detail: `Pipeline '${req.params.pipelineId}' not found.` });
    return;
  }
  res.status(404).json({
    detail: `Pipeline '${req.params.pipelineId}' has not completed yet. Current stage: ${status.current_stage}`,
  });
});

export default router;
