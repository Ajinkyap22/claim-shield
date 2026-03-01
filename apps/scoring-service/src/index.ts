import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  ClaimBundleSchema,
  ClinicalValidationResultSchema,
  ClinicalContextSchema,
  DEFAULT_CLINICAL_CONTEXT_INPUT,
} from "@compliance-shield/shared";
import type {
  ClaimBundle,
  ClinicalValidationResult,
  ClinicalContext,
  PayerScoreBreakdown,
} from "@compliance-shield/shared";
import { config } from "./config.js";
import { scoreAllPayers } from "./evaluator.js";
import type { ScoreRequest } from "./types.js";

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
  const start = Date.now();
  try {
    const { claim_bundle, validation_result, clinical_context, payers } =
      req.body as ScoreRequest;

    if (!claim_bundle || !validation_result || !clinical_context || !Array.isArray(payers)) {
      res.status(422).json({ detail: "Missing required fields: claim_bundle, validation_result, clinical_context, payers" });
      return;
    }

    const bundle = ClaimBundleSchema.parse(claim_bundle) as ClaimBundle;
    const validationParsed = ClinicalValidationResultSchema.safeParse(validation_result);
    const contextParsed = ClinicalContextSchema.safeParse(clinical_context);
    const validation = (validationParsed.success ? validationParsed.data : ClinicalValidationResultSchema.parse({})) as ClinicalValidationResult;
    const context = (contextParsed.success ? contextParsed.data : ClinicalContextSchema.parse(DEFAULT_CLINICAL_CONTEXT_INPUT)) as ClinicalContext;

    const { payer_scores, token_usage } = await scoreAllPayers(payers, context, bundle, validation);

    // Return payer_scores so the gateway can build PipelineResult and map to ComplianceCheckResponse
    res.json({ payer_scores, token_usage });
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