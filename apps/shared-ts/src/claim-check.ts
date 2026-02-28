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

/** One finding in the Clinician (Agent A) list view. */
export interface ClinicianFinding {
  category: string;
  text: string;
  status: "documented" | "gap";
}

/** One policy point in the Payer (Agent B) list view. */
export interface PayerPolicyPoint {
  citation: string;
  title: string;
  text: string;
  severity: "fail" | "warn";
}

export interface ComplianceCheckResponse {
  score: number;
  scoreExplanation: string;
  claimSummary?: Record<string, unknown>;
  clinicianView?: string;
  payerView?: string;
  /** List of findings for Two-Agent Clinician view (list format). */
  clinicianFindings?: ClinicianFinding[];
  /** List of policy points for Two-Agent Payer view (list format). */
  payerPolicyPoints?: PayerPolicyPoint[];
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
  /** 0–100, from pipeline stage progress. Use for progress bar when present. */
  progressPercent?: number;
  result?: ComplianceCheckResponse;
  error?: string;
}
