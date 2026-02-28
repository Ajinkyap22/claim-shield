import { z } from "zod";

export const ICD10MappingSchema = z.object({
  condition_text: z.string(),
  icd10_code: z.string(),
  icd10_description: z.string(),
  confidence: z.number().min(0).max(1),
  cpt_codes: z.array(z.string()).default([]),
});

export type ICD10Mapping = z.infer<typeof ICD10MappingSchema>;
