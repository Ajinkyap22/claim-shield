import { z } from "zod";

export const LLMCallUsageSchema = z.object({
  model: z.string(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

export const ServiceTokenUsageSchema = z.object({
  service: z.string(),
  calls: z.array(LLMCallUsageSchema),
});

export type LLMCallUsage = z.infer<typeof LLMCallUsageSchema>;
export type ServiceTokenUsage = z.infer<typeof ServiceTokenUsageSchema>;
