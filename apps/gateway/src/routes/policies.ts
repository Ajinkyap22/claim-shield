import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// POST /api/policies/ingest — Proxy policy ingestion to policy-service
router.post("/ingest", upload.single("file"), async (req, res) => {
  try {
    const form = new FormData();

    if (req.file) {
      const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype });
      form.append("file", blob, req.file.originalname);
    }

    // Forward metadata: either as a JSON string or collected from individual fields
    if (req.body.metadata) {
      form.append("metadata", req.body.metadata);
    } else {
      const metadata = JSON.stringify({
        payer_id: req.body.payer_id,
        payer_name: req.body.payer_name,
        policy_name: req.body.policy_name,
        source_url: req.body.source_url,
      });
      form.append("metadata", metadata);
    }

    if (req.body.text) {
      form.append("text", req.body.text);
    }

    const resp = await fetch(`${config.policyServiceUrl}/policies/ingest`, {
      method: "POST",
      body: form,
    });

    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ detail: `Policy service error: ${message}` });
  }
});

// POST /api/policies/search — Proxy policy search
router.post("/search", async (req, res) => {
  try {
    const resp = await fetch(`${config.policyServiceUrl}/policies/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ detail: `Policy service error: ${message}` });
  }
});

// GET /api/policies — List ingested policies
router.get("/", async (_req, res) => {
  try {
    const resp = await fetch(`${config.policyServiceUrl}/policies`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ detail: `Policy service error: ${message}` });
  }
});

// DELETE /api/policies/:policyId — Delete a policy
router.delete("/:policyId", async (req, res) => {
  try {
    const resp = await fetch(
      `${config.policyServiceUrl}/policies/${req.params.policyId}`,
      { method: "DELETE" }
    );
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(502).json({ detail: `Policy service error: ${message}` });
  }
});

export default router;
