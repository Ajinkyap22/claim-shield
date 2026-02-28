import type { ClaimBundle, ClinicalContext, ClinicalValidationResult } from "@compliance-shield/shared";

// ── Request Types ──

/** Body for POST /score */
export interface ScoreRequest {
  claim_bundle: ClaimBundle;
  validation_result: ClinicalValidationResult;
  clinical_context: ClinicalContext;
  payers: string[];
}

// ── Response Types ──

export interface Recommendation {
  id?: string | number;
  priority?: string;
  title: string;
  detail?: string;
  citation: string;
  citationFull?: string;
  action?: string;
}

export interface ValidationIssue {
  type: "error" | "warn" | "info";
  code?: string;
  title: string;
  detail?: string;
}

export interface PayerComparisonItem {
  payerName: string;
  /** 0–100 denial risk for this payer. */
  score?: number;
  /** Display label when score is not used, e.g. "Likely OK" | "Review needed". */
  statusLabel?: string;
  /** Short note, e.g. "Stricter prior auth rules". */
  note?: string;
}

export interface ComplianceCheckResponse {
  /** Denial risk 0–100. */
  score: number;
  /** Short explanation for the score. */
  scoreExplanation: string;
  /** Claim summary / FHIR-like extracted data. */
  claimSummary?: Record<string, unknown>;
  /** Clinician agent summary. */
  clinicianView?: string;
  /** Payer agent summary. */
  payerView?: string;
  /** Policy-cited recommendations. */
  recommendations?: Recommendation[];
  /** Validation / medical check issues. */
  validationIssues?: ValidationIssue[];
  /** Analysis metadata. */
  meta?: { analyzedInMs?: number; policyName?: string };
  /** How the same claim would fare vs major US payers. */
  payerComparison?: PayerComparisonItem[];
}
