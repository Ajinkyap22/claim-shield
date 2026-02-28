/**
 * Frontend-facing claim-check API response types.
 * Align with apps/frontend/src/types/compliance.ts.
 */

export interface ClaimCheckRecommendation {
  id?: string | number;
  priority?: string;
  title: string;
  detail?: string;
  citation: string;
  citationFull?: string;
  action?: string;
}

export interface ClaimCheckValidationIssue {
  type: "error" | "warn" | "info";
  code?: string;
  title: string;
  detail?: string;
}

export interface ClaimCheckMeta {
  analyzedInMs?: number;
  policyName?: string;
}

export interface PayerComparisonItem {
  payerName: string;
  score?: number;
  statusLabel?: string;
  note?: string;
}

export interface ComplianceCheckResponse {
  score: number;
  scoreExplanation: string;
  claimSummary?: Record<string, unknown>;
  clinicianView?: string;
  payerView?: string;
  recommendations?: ClaimCheckRecommendation[];
  validationIssues?: ClaimCheckValidationIssue[];
  meta?: ClaimCheckMeta;
  payerComparison?: PayerComparisonItem[];
}

export interface PollStatusResponse {
  status: "pending" | "complete" | "failed";
  step?: string;
  stepLabel?: string;
  stepDescription?: string;
  result?: ComplianceCheckResponse;
  error?: string;
}
