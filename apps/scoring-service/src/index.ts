import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  ClaimBundleSchema,
  ClinicalValidationResultSchema,
  ClinicalContextSchema,
} from "@compliance-shield/shared";
import type {
  ClaimBundle,
  ClinicalValidationResult,
  ClinicalContext,
} from "@compliance-shield/shared";
import { config } from "./config.js";
import { scoreAllPayers } from "./evaluator.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "scoring-service",
    engine: "rag-policy-evaluation",
    policy_service: config.policyServiceUrl,
  });
});

app.post("/score", async (req, res) => {
  try {
    const { claim_bundle, validation_result, clinical_context, payers } = req.body;

    if (!claim_bundle || !validation_result || !clinical_context || !Array.isArray(payers)) {
      res.status(422).json({ detail: "Missing required fields: claim_bundle, validation_result, clinical_context, payers" });
      return;
    }

    const bundle = ClaimBundleSchema.parse(claim_bundle) as ClaimBundle;
    const validation = ClinicalValidationResultSchema.parse(validation_result) as ClinicalValidationResult;
    const context = ClinicalContextSchema.parse(clinical_context) as ClinicalContext;

    const payer_scores = await scoreAllPayers(payers, context, bundle, validation);

    res.json({ payer_scores });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Scoring error:", message);
    res.status(500).json({ detail: message });
  }
});

app.listen(config.port, () => {
  console.log(`Scoring service running on http://localhost:${config.port}`);
  console.log(`Engine: RAG-based policy evaluation via OpenRouter`);
  console.log(`Policy service: ${config.policyServiceUrl}`);
});
