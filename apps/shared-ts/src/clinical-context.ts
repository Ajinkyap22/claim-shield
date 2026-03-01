import { z } from "zod";

/** Accepts boolean or null/undefined from LLM and coerces to boolean. */
const booleanOrNull = z
  .union([z.boolean(), z.null(), z.undefined()])
  .transform((v) => v === true);

/** Accepts string or null/undefined from LLM and coerces to string (default when missing or null). */
function stringOrNull(defaultVal: string) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => (typeof s === "string" && s.trim() ? s : defaultVal));
}

// -- Sub-fact schemas --

export const SLRResultSchema = z.object({
  // positive: z.boolean().nullable().default(false),
  positive: booleanOrNull,
  side: z.enum(["left", "right", "bilateral"]).nullable().default(null),
  angle_degrees: z.number().nullable().default(null),
});

export const MotorExamResultSchema = z.object({
  // deficit_present: z.boolean().nullable().default(false),
  deficit_present: booleanOrNull,
  muscle_groups_tested: z.array(z.string()).default([]),
  weakest_grade: z.string().nullable().default(null),
  laterality: z
    .enum(["left", "right", "bilateral"])
    .nullable()
    .default(null),
});

export const SensoryExamResultSchema = z.object({
  // deficit_present: z.boolean().nullable().default(false),
  // dermatomal_mapping: z.boolean().default(false),
  deficit_present: booleanOrNull,
  dermatomal_mapping: booleanOrNull.default(false),
  affected_dermatomes: z.array(z.string()).default([]),
});

export const ReflexExamResultSchema = z.object({
  // abnormal: z.boolean().nullable().default(false),
  abnormal: booleanOrNull,
  reflexes_tested: z.array(z.string()).default([]),
  findings: z.array(z.string()).default([]),
});

// -- Fact group schemas --

export const ConservativeTreatmentFactsSchema = z.object({
  physical_therapy_completed: booleanOrNull.default(false),
  physical_therapy_weeks: z.number().nullable().default(null),
  physical_therapy_sessions: z.number().nullable().default(null),
  nsaid_trial: booleanOrNull.default(false),
  nsaid_duration_weeks: z.number().nullable().default(null),
  muscle_relaxant_trial: booleanOrNull.default(false),
  analgesic_trial: booleanOrNull.default(false),
  activity_modification: booleanOrNull.default(false),
  total_conservative_weeks: z.number().nullable().default(null),
  treatments_tried: z.array(z.string()).default([]),
});

export const NeurologicalExamFactsSchema = z.object({
  straight_leg_raise: SLRResultSchema.nullable().default(null),
  motor_exam: MotorExamResultSchema.nullable().default(null),
  sensory_exam: SensoryExamResultSchema.nullable().default(null),
  reflex_exam: ReflexExamResultSchema.nullable().default(null),
  nerve_root_level: z.string().nullable().default(null),
  exam_completeness: z
    .union([
      z.enum(["full", "partial", "absent"]),
      z.null(),
      z.undefined(),
    ])
    .transform((v) => (v === "full" || v === "partial" ? v : "absent")),
});

export const ImagingHistoryFactsSchema = z.object({
  prior_xray: booleanOrNull.default(false),
  prior_xray_findings: z.string().nullable().default(null),
  prior_mri: booleanOrNull.default(false),
  prior_ct: booleanOrNull.default(false),
  prior_imaging_modalities: z.array(z.string()).default([]),
});

export const ClinicalIndicatorFactsSchema = z.object({
  spinal_stenosis: booleanOrNull.default(false),
  cauda_equina_syndrome: booleanOrNull.default(false),
  progressive_neurological_deficit: booleanOrNull.default(false),
  severe_pain_requiring_hospitalization: booleanOrNull.default(false),
  suspected_infection: booleanOrNull.default(false),
  suspected_malignancy: booleanOrNull.default(false),
  suspected_fracture: booleanOrNull.default(false),
  post_surgical_evaluation: booleanOrNull.default(false),
  myelopathy: booleanOrNull.default(false),
  spondylolisthesis: booleanOrNull.default(false),

  radiculopathy: booleanOrNull.default(false),
  symptom_duration_weeks: z.number().nullable().default(null),
  pain_severity: z
    .union([
      z.enum(["mild", "moderate", "severe"]),
      z.null(),
      z.undefined(),
    ])
    .transform((v) => (v === "mild" || v === "moderate" || v === "severe" ? v : null)),
  functional_limitation: booleanOrNull.default(false),

  red_flags_present: z
    .union([
      z.array(z.string()),
      z.boolean().transform((b) => (b ? [] : [])),
    ])
    .default([]),
});

export const DocumentationQualityFactsSchema = z.object({
  has_physical_exam: booleanOrNull.default(false),
  has_history_of_present_illness: booleanOrNull.default(false),
  has_treatment_history: booleanOrNull.default(false),
  has_functional_assessment: booleanOrNull.default(false),
  has_prior_imaging_results: booleanOrNull.default(false),
  missing_elements: z.array(z.string()).default([]),
});

// -- Top-level ClinicalContext --

export const ClinicalContextSchema = z.object({
  procedure_category: stringOrNull("other"),
  body_region: stringOrNull("other"),

  conservative_treatment: ConservativeTreatmentFactsSchema,
  neurological_exam: NeurologicalExamFactsSchema,
  imaging_history: ImagingHistoryFactsSchema,
  clinical_indicators: ClinicalIndicatorFactsSchema,
  documentation_quality: DocumentationQualityFactsSchema,
});

/** Minimal object that parses to a valid ClinicalContext. Use this to merge with LLM output so missing/undefined keys are never passed to the schema. */
export const DEFAULT_CLINICAL_CONTEXT_INPUT: Record<string, unknown> = {
  procedure_category: "other",
  body_region: "other",
  conservative_treatment: {},
  neurological_exam: {},
  imaging_history: {},
  clinical_indicators: {},
  documentation_quality: {},
};

// -- Inferred types --

export type SLRResult = z.infer<typeof SLRResultSchema>;
export type MotorExamResult = z.infer<typeof MotorExamResultSchema>;
export type SensoryExamResult = z.infer<typeof SensoryExamResultSchema>;
export type ReflexExamResult = z.infer<typeof ReflexExamResultSchema>;

export type ConservativeTreatmentFacts = z.infer<
  typeof ConservativeTreatmentFactsSchema
>;
export type NeurologicalExamFacts = z.infer<
  typeof NeurologicalExamFactsSchema
>;
export type ImagingHistoryFacts = z.infer<typeof ImagingHistoryFactsSchema>;
export type ClinicalIndicatorFacts = z.infer<
  typeof ClinicalIndicatorFactsSchema
>;
export type DocumentationQualityFacts = z.infer<
  typeof DocumentationQualityFactsSchema
>;
export type ClinicalContext = z.infer<typeof ClinicalContextSchema>;
