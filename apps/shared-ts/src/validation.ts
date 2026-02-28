import { z } from "zod";

export const CheckResultSchema = z.object({
  status: z.enum(["pass", "pass_with_findings", "fail"]),
  confidence: z.number().min(0).max(1),
  findings: z.string(),
  evidence: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

export const ClinicalValidationResultSchema = z.object({
  overall_status: z.enum(["pass", "pass_with_findings", "fail"]),
  medical_necessity: CheckResultSchema,
  step_therapy: CheckResultSchema,
  documentation: CheckResultSchema,
});

export type CheckResult = z.infer<typeof CheckResultSchema>;
export type ClinicalValidationResult = z.infer<
  typeof ClinicalValidationResultSchema
>;
