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
  const targetUrl = `${config.policyServiceUrl}/policies/ingest`;
  console.log(
    `[policies] proxy ingest → POST ${targetUrl} (hasFile=${!!req.file}, hasText=${!!req.body?.text})`,
  );
  const t0 = Date.now();
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

    const resp = await fetch(targetUrl, {
      method: "POST",
      body: form,
    });
    const elapsed = Date.now() - t0;
    console.log(`[policies] proxy ingest ← ${resp.status} (${elapsed}ms)`);

    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    const elapsed = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[policies] proxy ingest FAILED after ${elapsed}ms — ${message}`,
    );
    if (err instanceof Error && err.cause) {
      console.error(`[policies] proxy ingest cause:`, err.cause);
    }
    res.status(502).json({ detail: `Policy service error: ${message}` });
  }
});

// POST /api/policies/search — Proxy policy search
router.post("/search", async (req, res) => {
  const targetUrl = `${config.policyServiceUrl}/policies/search`;
  console.log(`[policies] proxy search → POST ${targetUrl}`);
  const t0 = Date.now();
  try {
    const resp = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const elapsed = Date.now() - t0;
    console.log(`[policies] proxy search ← ${resp.status} (${elapsed}ms)`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    const elapsed = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[policies] proxy search FAILED after ${elapsed}ms — ${message}`);
    if (err instanceof Error && err.cause) {
      console.error(`[policies] proxy search cause:`, err.cause);
    }
    res.status(502).json({ detail: `Policy service error: ${message}` });
  }
});

// GET /api/policies — List ingested policies
router.get("/", async (_req, res) => {
  const targetUrl = `${config.policyServiceUrl}/policies`;
  console.log(`[policies] proxy list → GET ${targetUrl}`);
  const t0 = Date.now();
  try {
    const resp = await fetch(targetUrl);
    const elapsed = Date.now() - t0;
    console.log(`[policies] proxy list ← ${resp.status} (${elapsed}ms)`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    const elapsed = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[policies] proxy list FAILED after ${elapsed}ms — ${message}`);
    if (err instanceof Error && err.cause) {
      console.error(`[policies] proxy list cause:`, err.cause);
    }
    res.status(502).json({ detail: `Policy service error: ${message}` });
  }
});

// DELETE /api/policies/:policyId — Delete a policy
router.delete("/:policyId", async (req, res) => {
  const targetUrl = `${config.policyServiceUrl}/policies/${req.params.policyId}`;
  console.log(`[policies] proxy delete → DELETE ${targetUrl}`);
  const t0 = Date.now();
  try {
    const resp = await fetch(targetUrl, { method: "DELETE" });
    const elapsed = Date.now() - t0;
    console.log(`[policies] proxy delete ← ${resp.status} (${elapsed}ms)`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    const elapsed = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[policies] proxy delete FAILED after ${elapsed}ms — ${message}`);
    if (err instanceof Error && err.cause) {
      console.error(`[policies] proxy delete cause:`, err.cause);
    }
    res.status(502).json({ detail: `Policy service error: ${message}` });
  }
});

export default router;
