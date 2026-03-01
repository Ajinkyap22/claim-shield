import { z } from "zod";

const statusEnum = z.enum(["pass", "pass_with_findings", "fail"]);
const safeStatus = z
  .union([statusEnum, z.null(), z.undefined()])
  .transform((v): "pass" | "pass_with_findings" | "fail" =>
    statusEnum.safeParse(v).success ? (v as "pass" | "pass_with_findings" | "fail") : "pass"
  );

export const CheckResultSchema = z.object({
  status: safeStatus,
  confidence: z
    .union([z.number(), z.null(), z.undefined()])
    .transform((n) => (typeof n === "number" && n >= 0 && n <= 1 ? n : 0.5)),
  findings: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => (typeof s === "string" ? s : "")),
  evidence: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((a) => (Array.isArray(a) ? a : [])),
  recommendations: z
    .union([z.array(z.string()), z.null(), z.undefined()])
    .transform((a) => (Array.isArray(a) ? a : [])),
});

const safeOverallStatus = z
  .union([statusEnum, z.null(), z.undefined()])
  .transform((v): "pass" | "pass_with_findings" | "fail" =>
    statusEnum.safeParse(v).success ? (v as "pass" | "pass_with_findings" | "fail") : "pass"
  );

const defaultCheckResult = CheckResultSchema.parse({});

export const ClinicalValidationResultSchema = z.object({
  overall_status: safeOverallStatus,
  medical_necessity: CheckResultSchema.default(defaultCheckResult),
  step_therapy: CheckResultSchema.default(defaultCheckResult),
  documentation: CheckResultSchema.default(defaultCheckResult),
});

export type CheckResult = z.infer<typeof CheckResultSchema>;
export type ClinicalValidationResult = z.infer<
  typeof ClinicalValidationResultSchema
>;
