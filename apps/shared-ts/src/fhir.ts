import { z } from "zod";

export const PatientSchema = z.object({
  name: z.string(),
  dob: z.string(), // ISO date string
  gender: z.enum(["male", "female", "other"]).default("male"),
  member_id: z.string().nullable().default(null),
  payer_id: z.string().nullable().default(null),
});

export const ConditionSchema = z.object({
  code: z.string(), // ICD-10
  display: z.string(),
  clinical_status: z
    .enum(["active", "resolved", "inactive"])
    .default("active"),
  onset_date: z.string().nullable().default(null),
  severity: z.enum(["mild", "moderate", "severe"]).nullable().default(null),
});

export const ProcedureSchema = z.object({
  code: z.string(), // CPT
  display: z.string(),
  status: z.enum(["proposed", "completed", "in-progress"]).default("proposed"),
  date: z.string().nullable().default(null),
  body_site: z.string().nullable().default(null),
});

export const MedicationSchema = z.object({
  code: z.string(),
  display: z.string(),
  dosage: z.string().nullable().default(null),
  frequency: z.string().nullable().default(null),
  duration_weeks: z.number().nullable().default(null),
});

export const SupportingInfoSchema = z.object({
  conservative_treatment: z.string().nullable().default(null),
  physical_exam_findings: z.string().nullable().default(null),
  symptom_duration_weeks: z.number().nullable().default(null),
  prior_imaging: z.string().nullable().default(null),
  lab_results: z.record(z.string()).nullable().default(null),
  lifestyle_modifications: z.string().nullable().default(null),
  prior_medications: z.array(z.string()).nullable().default(null),
});

export const ClaimSchema = z.object({
  claim_type: z.enum(["professional", "pharmacy"]).default("professional"),
  priority: z.enum(["normal", "urgent"]).default("normal"),
  diagnosis_codes: z.array(z.string()),
  procedure_codes: z.array(z.string()).default([]),
  medication_codes: z.array(z.string()).default([]),
  provider_npi: z.string().nullable().default(null),
  facility_type: z.string().nullable().default(null),
  service_date: z.string().nullable().default(null),
});

export const ClaimBundleSchema = z.object({
  patient: PatientSchema,
  conditions: z.array(ConditionSchema),
  procedures: z.array(ProcedureSchema).default([]),
  medications: z.array(MedicationSchema).default([]),
  claim: ClaimSchema,
  supporting_info: SupportingInfoSchema.default({}),
});

export type Patient = z.infer<typeof PatientSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type Procedure = z.infer<typeof ProcedureSchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type SupportingInfo = z.infer<typeof SupportingInfoSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ClaimBundle = z.infer<typeof ClaimBundleSchema>;
