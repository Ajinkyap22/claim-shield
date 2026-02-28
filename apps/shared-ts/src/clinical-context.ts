import { z } from "zod";

// -- Sub-fact schemas --

export const SLRResultSchema = z.object({
  positive: z.boolean(),
  side: z.enum(["left", "right", "bilateral"]).nullable().default(null),
  angle_degrees: z.number().nullable().default(null),
});

export const MotorExamResultSchema = z.object({
  deficit_present: z.boolean(),
  muscle_groups_tested: z.array(z.string()).default([]),
  weakest_grade: z.string().nullable().default(null),
  laterality: z
    .enum(["left", "right", "bilateral"])
    .nullable()
    .default(null),
});

export const SensoryExamResultSchema = z.object({
  deficit_present: z.boolean(),
  dermatomal_mapping: z.boolean().default(false),
  affected_dermatomes: z.array(z.string()).default([]),
});

export const ReflexExamResultSchema = z.object({
  abnormal: z.boolean(),
  reflexes_tested: z.array(z.string()).default([]),
  findings: z.array(z.string()).default([]),
});

// -- Fact group schemas --

export const ConservativeTreatmentFactsSchema = z.object({
  physical_therapy_completed: z.boolean().default(false),
  physical_therapy_weeks: z.number().nullable().default(null),
  physical_therapy_sessions: z.number().nullable().default(null),
  nsaid_trial: z.boolean().default(false),
  nsaid_duration_weeks: z.number().nullable().default(null),
  muscle_relaxant_trial: z.boolean().default(false),
  analgesic_trial: z.boolean().default(false),
  activity_modification: z.boolean().default(false),
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
    .enum(["full", "partial", "absent"])
    .default("absent"),
});

export const ImagingHistoryFactsSchema = z.object({
  prior_xray: z.boolean().default(false),
  prior_xray_findings: z.string().nullable().default(null),
  prior_mri: z.boolean().default(false),
  prior_ct: z.boolean().default(false),
  prior_imaging_modalities: z.array(z.string()).default([]),
});

export const ClinicalIndicatorFactsSchema = z.object({
  spinal_stenosis: z.boolean().default(false),
  cauda_equina_syndrome: z.boolean().default(false),
  progressive_neurological_deficit: z.boolean().default(false),
  severe_pain_requiring_hospitalization: z.boolean().default(false),
  suspected_infection: z.boolean().default(false),
  suspected_malignancy: z.boolean().default(false),
  suspected_fracture: z.boolean().default(false),
  post_surgical_evaluation: z.boolean().default(false),
  myelopathy: z.boolean().default(false),
  spondylolisthesis: z.boolean().default(false),

  radiculopathy: z.boolean().default(false),
  symptom_duration_weeks: z.number().nullable().default(null),
  pain_severity: z
    .enum(["mild", "moderate", "severe"])
    .nullable()
    .default(null),
  functional_limitation: z.boolean().default(false),

  red_flags_present: z
    .union([
      z.array(z.string()),
      z.boolean().transform((b) => (b ? [] : [])),
    ])
    .default([]),
});

export const DocumentationQualityFactsSchema = z.object({
  has_physical_exam: z.boolean().default(false),
  has_history_of_present_illness: z.boolean().default(false),
  has_treatment_history: z.boolean().default(false),
  has_functional_assessment: z.boolean().default(false),
  has_prior_imaging_results: z.boolean().default(false),
  missing_elements: z.array(z.string()).default([]),
});

// -- Top-level ClinicalContext --

export const ClinicalContextSchema = z.object({
  procedure_category: z.string().default("other"),
  body_region: z.string().default("other"),

  conservative_treatment: ConservativeTreatmentFactsSchema,
  neurological_exam: NeurologicalExamFactsSchema,
  imaging_history: ImagingHistoryFactsSchema,
  clinical_indicators: ClinicalIndicatorFactsSchema,
  documentation_quality: DocumentationQualityFactsSchema,
});

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
