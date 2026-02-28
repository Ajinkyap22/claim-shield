import { useMutation } from "@tanstack/react-query";
import { runComplianceCheck, type RunComplianceCheckResult } from "@/api/compliance";
import type { ComplianceCheckPayload } from "@/types/compliance";
import type { PollStatusResponse } from "@/types/compliance";

export interface UseComplianceCheckMutationOptions {
  onStatus?: (status: PollStatusResponse) => void;
}

/**
 * Runs the compliance check: POST → jobId → poll until complete.
 * onStatus is called with each poll response so the UI can show step label/description.
 */
export function useComplianceCheckMutation(
  options?: UseComplianceCheckMutationOptions,
) {
  return useMutation<RunComplianceCheckResult, Error, ComplianceCheckPayload>({
    mutationFn: (payload: ComplianceCheckPayload) =>
      runComplianceCheck(payload, { onStatus: options?.onStatus }),
  });
}
