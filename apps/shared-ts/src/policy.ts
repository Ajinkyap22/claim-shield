import { z } from "zod";

export const PolicyCriterionSchema = z.object({
  criterion_id: z.string(),
  payer_id: z.string(),
  payer_name: z.string(),
  policy_id: z.string(),
  policy_name: z.string(),
  procedure_categories: z.array(z.string()),
  body_regions: z.array(z.string()),
  category: z.string(),
  requirement: z.string(),
  requirement_type: z.enum(["mandatory", "recommended", "conditional"]),
  conditions: z.array(z.string()),
  exceptions: z.array(z.string()),
  evidence_requirements: z.array(z.string()),
  raw_text: z.string(),
  section_reference: z.string(),
});

export const PolicySearchRequestSchema = z.object({
  procedure_category: z.string(),
  query_text: z.string(),
  payer_id: z.string().optional(),
  top_k: z.number().int().min(1).max(50).default(10),
});

export const PolicySearchResultSchema = z.object({
  criteria: z.array(
    PolicyCriterionSchema.extend({
      similarity_score: z.number().min(0).max(1),
    })
  ),
  total_results: z.number(),
});

export const IngestRequestMetadataSchema = z.object({
  payer_id: z.string(),
  payer_name: z.string(),
  policy_name: z.string(),
  source_url: z.string().optional(),
});

export const PolicySummarySchema = z.object({
  policy_id: z.string(),
  payer_id: z.string(),
  payer_name: z.string(),
  policy_name: z.string(),
  criteria_count: z.number(),
  ingested_at: z.string(),
});

export type PolicyCriterion = z.infer<typeof PolicyCriterionSchema>;
export type PolicySearchRequest = z.infer<typeof PolicySearchRequestSchema>;
export type PolicySearchResult = z.infer<typeof PolicySearchResultSchema>;
export type IngestRequestMetadata = z.infer<typeof IngestRequestMetadataSchema>;
export type PolicySummary = z.infer<typeof PolicySummarySchema>;
