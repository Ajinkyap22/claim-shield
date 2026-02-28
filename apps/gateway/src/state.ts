import { v4 as uuidv4 } from "uuid";
import type {
  PipelineStatus,
  PipelineStageDetail,
  PipelineResult,
} from "@compliance-shield/shared";
import { PipelineStage } from "@compliance-shield/shared";

const STAGE_ORDER = [
  PipelineStage.EXTRACTING,
  PipelineStage.POLICY_INGEST,
  PipelineStage.MAPPING,
  PipelineStage.BUILDING_BUNDLE,
  PipelineStage.VALIDATING,
  PipelineStage.SCORING,
] as const;

// In-memory stores
const pipelineStatuses = new Map<string, PipelineStatus>();
const pipelineResults = new Map<string, PipelineResult>();

/** When a pipeline reached completed/failed (for TTL cleanup). */
const pipelineFinishedAt = new Map<string, number>();

/** TTL in ms after which completed/failed pipeline data is removed (HIPAA: minimize ePHI retention). */
const RESULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
  message = "",
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
    (s) => s.status === "completed",
  ).length;
  status.progress_pct = (completed / STAGE_ORDER.length) * 100;
}

export function completeStage(
  pipelineId: string,
  stage: string,
  message = "",
  data: unknown = null,
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
    (s) => s.status === "completed",
  ).length;
  status.progress_pct = (completed / STAGE_ORDER.length) * 100;
}

export function failPipeline(pipelineId: string, error: string): void {
  const status = pipelineStatuses.get(pipelineId);
  if (!status) return;

  status.current_stage = PipelineStage.FAILED;
  status.error = error;
  recordFailedAt(pipelineId);
}

export function finishPipeline(
  pipelineId: string,
  result: PipelineResult,
): void {
  const status = pipelineStatuses.get(pipelineId);
  if (!status) return;

  status.current_stage = PipelineStage.COMPLETED;
  status.progress_pct = 100;
  pipelineResults.set(pipelineId, result);
  pipelineFinishedAt.set(pipelineId, Date.now());
}

function recordFailedAt(pipelineId: string): void {
  pipelineFinishedAt.set(pipelineId, Date.now());
}

function isExpired(pipelineId: string): boolean {
  const at = pipelineFinishedAt.get(pipelineId);
  if (at == null) return false;
  return Date.now() - at > RESULT_TTL_MS;
}

function expireIfNeeded(pipelineId: string): void {
  if (isExpired(pipelineId)) {
    deletePipeline(pipelineId);
    pipelineFinishedAt.delete(pipelineId);
  }
}

export function getStatus(pipelineId: string): PipelineStatus | undefined {
  expireIfNeeded(pipelineId);
  return pipelineStatuses.get(pipelineId);
}

export function getResult(pipelineId: string): PipelineResult | undefined {
  expireIfNeeded(pipelineId);
  return pipelineResults.get(pipelineId);
}

/** Remove pipeline result (ePHI) from memory. Call after client has fetched the result (HIPAA: minimize retention). */
export function deleteResult(pipelineId: string): void {
  pipelineResults.delete(pipelineId);
}

/** Remove pipeline status and result. Call after client has fetched result to avoid retaining ePHI. */
export function deletePipeline(pipelineId: string): void {
  pipelineResults.delete(pipelineId);
  pipelineStatuses.delete(pipelineId);
}
