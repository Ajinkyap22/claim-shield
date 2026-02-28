import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import {
  PolicySearchRequestSchema,
  IngestRequestMetadataSchema,
} from "@compliance-shield/shared";
import { z } from "zod";
import { config } from "./config.js";
import { parsePdf, chunkText } from "./pdf-parser.js";
import { extractCriteriaFromChunks } from "./policy-extractor.js";
import {
  upsertCriteria,
  searchCriteria,
  deletePolicyVectors,
  registerPolicy,
  unregisterPolicy,
  getPolicyRegistry,
} from "./pinecone-client.js";
import { timestamp } from "./logger.js";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "policy-service" });
});

app.post("/policies/ingest", upload.single("file"), async (req, res) => {
  try {
    // Parse metadata from multiple possible formats:
    // 1. JSON string in "metadata" field (multipart form)
    // 2. Individual form fields (payer_id, payer_name, policy_name)
    // 3. JSON body fields directly
    let metaRaw: unknown;

    if (typeof req.body.metadata === "string") {
      try {
        metaRaw = JSON.parse(req.body.metadata);
      } catch {
        res.status(400).json({
          detail: "The 'metadata' field must be valid JSON",
          expected_format: { payer_id: "string", payer_name: "string", policy_name: "string", source_url: "string (optional)" },
        });
        return;
      }
    } else if (req.body.payer_id || req.body.payer_name || req.body.policy_name) {
      metaRaw = {
        payer_id: req.body.payer_id,
        payer_name: req.body.payer_name,
        policy_name: req.body.policy_name,
        source_url: req.body.source_url,
      };
    } else {
      metaRaw = req.body;
    }

    const parseResult = IngestRequestMetadataSchema.safeParse(metaRaw);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map(i => `${i.path.join(".")}: ${i.message}`);
      res.status(422).json({
        detail: "Missing or invalid metadata fields",
        required_fields: ["payer_id", "payer_name", "policy_name"],
        optional_fields: ["source_url"],
        validation_errors: errors,
        hint: "Send metadata as a JSON string in the 'metadata' field, or as individual form fields (payer_id, payer_name, policy_name)",
      });
      return;
    }

    const metadata = parseResult.data;
    const policyId = uuidv4();

    let rawText: string;

    if (req.file) {
      rawText = await parsePdf(req.file.buffer);
    } else if (req.body.text) {
      rawText = req.body.text as string;
    } else {
      res.status(400).json({ detail: "Provide a PDF file or 'text' field" });
      return;
    }

    const chunks = chunkText(rawText);

    if (chunks.length === 0) {
      res.status(422).json({ detail: "No extractable content found in document" });
      return;
    }

    const criteria = await extractCriteriaFromChunks(chunks, metadata, policyId);

    await upsertCriteria(criteria);

    registerPolicy(
      policyId,
      metadata.payer_id,
      metadata.payer_name,
      metadata.policy_name,
      criteria.length
    );

    res.json({
      policy_id: policyId,
      payer_id: metadata.payer_id,
      payer_name: metadata.payer_name,
      policy_name: metadata.policy_name,
      criteria_count: criteria.length,
      chunks_processed: chunks.length,
      criteria,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${timestamp()}] Ingest error:`, message);
    res.status(500).json({ detail: message });
  }
});

app.get("/policies", (_req, res) => {
  const policies = getPolicyRegistry();
  res.json({ policies });
});

app.delete("/policies/:policyId", async (req, res) => {
  try {
    const { policyId } = req.params;
    await deletePolicyVectors(policyId);
    unregisterPolicy(policyId);
    res.json({ deleted: true, policy_id: policyId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${timestamp()}] Delete error:`, message);
    res.status(500).json({ detail: message });
  }
});

app.post("/policies/search", async (req, res) => {
  try {
    const parsed = PolicySearchRequestSchema.parse(req.body);

    const results = await searchCriteria(
      parsed.query_text,
      parsed.procedure_category,
      parsed.payer_id,
      parsed.top_k
    );

    res.json({
      criteria: results,
      total_results: results.length,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(422).json({ detail: "Invalid request", issues: err.issues });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${timestamp()}] Search error:`, message);
    res.status(500).json({ detail: message });
  }
});

app.listen(config.port, () => {
  console.log(`[${timestamp()}] Policy service running on http://localhost:${config.port}`);
});
