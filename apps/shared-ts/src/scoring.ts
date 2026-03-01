import { z } from "zod";
import { ClaimBundleSchema } from "./fhir.js";
import { ClinicalValidationResultSchema } from "./validation.js";
import { ClinicalContextSchema } from "./clinical-context.js";
import { ServiceTokenUsageSchema } from "./token-usage.js";

export const RuleResultSchema = z.object({
  rule_id: z.string(),
  description: z.string(),
  category: z.string(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  weight: z.number().min(0).max(1),
  reasoning: z.string(),
  evidence: z.array(z.string()).default([]),
  /** Policy section reference (e.g. "§ 4.2.1") when rule_id maps to a criterion; set by scoring service. */
  section_reference: z.string().optional(),
});

export const PayerScoreBreakdownSchema = z.object({
  payer_id: z.string(),
  payer_name: z.string(),
  denial_probability: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .catch(0.5),
  risk_level: z
    .enum(["low", "medium", "high"])
    .default("medium")
    .catch("medium"),
  rules_evaluated: z.array(RuleResultSchema).default([]),
  recommendations: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

export const ScoreRequestSchema = z.object({
  claim_bundle: ClaimBundleSchema,
  validation_result: ClinicalValidationResultSchema,
  clinical_context: ClinicalContextSchema,
  payers: z.array(z.string()),
});

export const PipelineResultSchema = z.object({
  claim_bundle: ClaimBundleSchema,
  validation_result: ClinicalValidationResultSchema,
  clinical_context: ClinicalContextSchema,
  payer_scores: z.record(PayerScoreBreakdownSchema),
  processing_time_seconds: z.number(),
  token_usage: z.array(ServiceTokenUsageSchema).optional(),
});

export type RuleResult = z.infer<typeof RuleResultSchema>;
export type PayerScoreBreakdown = z.infer<typeof PayerScoreBreakdownSchema>;
export type ScoreRequest = z.infer<typeof ScoreRequestSchema>;
export type PipelineResult = z.infer<typeof PipelineResultSchema>;
