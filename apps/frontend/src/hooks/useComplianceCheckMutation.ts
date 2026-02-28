import { useMutation } from "@tanstack/react-query";
import { runComplianceCheck } from "@/api/compliance";
import type {
  ComplianceCheckPayload,
  ComplianceCheckResponse,
} from "@/types/compliance";

/**
 * Runs the compliance check. When the backend supports async pipeline,
 * runComplianceCheck can return { jobId }; then poll pollCheckStatus(jobId)
 * and expose step/stepLabel/stepDescription to drive LoadingState.
 */
export function useComplianceCheckMutation() {
  return useMutation<
    ComplianceCheckResponse,
    Error,
    ComplianceCheckPayload
  >({
    mutationFn: (payload: ComplianceCheckPayload) => runComplianceCheck(payload),
  });
}
