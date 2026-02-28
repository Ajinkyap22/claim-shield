import { z } from "zod";

export const PipelineStage = {
  QUEUED: "queued",
  EXTRACTING: "extracting",
  POLICY_INGEST: "policy_ingest",
  MAPPING: "mapping",
  BUILDING_BUNDLE: "building_bundle",
  VALIDATING: "validating",
  SCORING: "scoring",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type PipelineStageType =
  (typeof PipelineStage)[keyof typeof PipelineStage];

export const PipelineStageDetailSchema = z.object({
  stage: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "failed"]),
  message: z.string().default(""),
  data: z.unknown().nullable().default(null),
});

export const PipelineStatusSchema = z.object({
  pipeline_id: z.string(),
  current_stage: z.string(),
  stages: z.array(PipelineStageDetailSchema),
  progress_pct: z.number(),
  error: z.string().nullable().default(null),
});

export type PipelineStageDetail = z.infer<typeof PipelineStageDetailSchema>;
export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
