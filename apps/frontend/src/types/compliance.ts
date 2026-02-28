/**
 * Payload for the compliance check request.
 * Use this shape when integrating with the backend.
 *
 * Example FormData integration:
 *   const fd = new FormData();
 *   fd.append("clinicalNote", payload.clinicalNote);
 *   payload.audioFiles.forEach((f) => fd.append("audio", f));  // backend runs Whisper on these
 *   payload.policyFiles.forEach((f) => fd.append("policy", f));
 *   payload.documentationFiles.forEach((f) => fd.append("documentation", f));
 *   await fetch("/api/v1/claim-check", { method: "POST", body: fd });
 */
export interface ComplianceCheckPayload {
  /** Clinical note text (from textarea). If audio is sent, backend transcribes via Whisper and merges. */
  clinicalNote: string;
  /** Optional audio file(s) from record or upload. Backend runs Whisper to produce transcript. */
  audioFiles: File[];
  /** Policy PDFs uploaded by the user. Send as multipart "policy" or "policy[]". */
  policyFiles: File [];
  /** Optional documentation files (PDF, DOC, images). Send as multipart "documentation" or "documentation[]". */
  documentationFiles: File[];
}

/**
 * Response from the compliance check API.
 * When the backend contract changes, update this type and the components that consume it.
 * Components can accept optional overrides (e.g. score?, scoreExplanation?) or the full result.
 */
export interface ComplianceCheckResponse {
  /** Denial risk 0–100. */
  score: number;
  /** Short explanation for the score (e.g. "Prior auth and laterality missing; Policy 4.2.1, 3.1"). */
  scoreExplanation: string;
  /** Optional: claim summary / FHIR-like extracted data. */
  claimSummary?: Record<string, unknown>;
  /** Optional: clinician agent summary. */
  clinicianView?: string;
  /** Optional: payer agent summary. */
  payerView?: string;
  /** Policy-cited recommendations. */
  recommendations?: Array<{
    id?: string | number;
    priority?: string;
    title: string;
    detail?: string;
    citation: string;
    citationFull?: string;
    action?: string;
  }>;
  /** Validation / medical check issues (e.g. invalid ICD-10). */
  validationIssues?: Array<{
    type: "error" | "warn" | "info";
    code?: string;
    title: string;
    detail?: string;
  }>;
  /** Optional: analysis duration or policy name for display. */
  meta?: { analyzedInMs?: number; policyName?: string };
  /** Optional: how the same claim would fare vs major US payers (informational). */
  payerComparison?: PayerComparisonItem[];
}

/**
 * One row for the "How your claim stands vs top US payers" block.
 * Risk/readiness can be a score band or a label (e.g. "Likely OK" / "Review needed").
 */
export interface PayerComparisonItem {
  payerName: string;
  /** 0–100 denial risk for this payer (optional; if absent use statusLabel). */
  score?: number;
  /** Display label when score is not used, e.g. "Likely OK" | "Review needed". */
  statusLabel?: string;
  /** Optional short note (e.g. "Stricter prior auth rules"). */
  note?: string;
}

/**
 * When the backend supports async pipeline, the initial POST may return a job ID
 * instead of the full result. Frontend then polls the status endpoint until complete.
 */
export interface ClaimCheckJobStart {
  jobId: string;
}

/**
 * Response from the polling status endpoint (e.g. GET /api/v1/claim-check/status?jobId=...).
 * Used to drive step-based loading UI when the backend supports it.
 */
export interface PollStatusResponse {
  status: "pending" | "complete" | "failed";
  /** Pipeline step id (e.g. extracting, policy_ingest, mapping, validating, scoring). */
  step?: string;
  stepLabel?: string;
  stepDescription?: string;
  /** 0–100 from pipeline; use for progress bar when present. */
  progressPercent?: number;
  result?: ComplianceCheckResponse;
  error?: string;
}

/** Step definition for loading UI when driven by polling. */
export interface LoadingStep {
  id: string;
  label: string;
  description?: string;
}
