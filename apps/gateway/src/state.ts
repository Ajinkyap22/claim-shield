import { v4 as uuidv4 } from "uuid";
import type {
  PipelineStatus,
  PipelineStageDetail,
  PipelineResult,
} from "@compliance-shield/shared";
import { PipelineStage } from "@compliance-shield/shared";

const STAGE_ORDER = [
  PipelineStage.EXTRACTING,
  PipelineStage.MAPPING,
  PipelineStage.BUILDING_BUNDLE,
  PipelineStage.VALIDATING,
  PipelineStage.SCORING,
] as const;

// In-memory stores
const pipelineStatuses = new Map<string, PipelineStatus>();
const pipelineResults = new Map<string, PipelineResult>();

export function createPipeline(): string {
  const id = uuidv4().replace(/-/g, "").slice(0, 12);

  const stages: PipelineStageDetail[] = STAGE_ORDER.map((stage) => ({
    stage,
    status: "pending" as const,
    message: "",
    data: null,
  }));

  pipelineStatuses.set(id, {
    pipeline_id: id,
    current_stage: PipelineStage.QUEUED,
    stages,
    progress_pct: 0,
    error: null,
  });

  return id;
}

export function advanceStage(
  pipelineId: string,
  stage: string,
  message = ""
): void {
  const status = pipelineStatuses.get(pipelineId);
  if (!status) return;

  status.current_stage = stage;
  const stageDetail = status.stages.find((s) => s.stage === stage);
  if (stageDetail) {
    stageDetail.status = "in_progress";
    stageDetail.message = message;
  }

  const completed = status.stages.filter(
    (s) => s.status === "completed"
  ).length;
  status.progress_pct = (completed / STAGE_ORDER.length) * 100;
}

export function completeStage(
  pipelineId: string,
  stage: string,
  message = "",
  data: unknown = null
): void {
  const status = pipelineStatuses.get(pipelineId);
  if (!status) return;

  const stageDetail = status.stages.find((s) => s.stage === stage);
  if (stageDetail) {
    stageDetail.status = "completed";
    stageDetail.message = message;
    stageDetail.data = data;
  }

  const completed = status.stages.filter(
    (s) => s.status === "completed"
  ).length;
  status.progress_pct = (completed / STAGE_ORDER.length) * 100;
}

export function failPipeline(pipelineId: string, error: string): void {
  const status = pipelineStatuses.get(pipelineId);
  if (!status) return;

  status.current_stage = PipelineStage.FAILED;
  status.error = error;
}

export function finishPipeline(
  pipelineId: string,
  result: PipelineResult
): void {
  const status = pipelineStatuses.get(pipelineId);
  if (!status) return;

  status.current_stage = PipelineStage.COMPLETED;
  status.progress_pct = 100;
  pipelineResults.set(pipelineId, result);
}

export function getStatus(pipelineId: string): PipelineStatus | undefined {
  return pipelineStatuses.get(pipelineId);
}

export function getResult(pipelineId: string): PipelineResult | undefined {
  return pipelineResults.get(pipelineId);
}
