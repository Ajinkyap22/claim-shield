/**
 * Compliance check API client.
 * When backend is ready, set NEXT_PUBLIC_API_URL and ensure the endpoint returns ComplianceCheckResponse.
 */

import type {
  ComplianceCheckPayload,
  ComplianceCheckResponse,
  PollStatusResponse,
} from "@/types/compliance";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

function buildFormData(payload: ComplianceCheckPayload): FormData {
  const fd = new FormData();
  fd.append("clinicalNote", payload.clinicalNote);
  payload.audioFiles.forEach((f) => fd.append("audio", f));
  payload.policyFiles.forEach((f) => fd.append("policy", f));
  payload.documentationFiles.forEach((f) => fd.append("documentation", f));
  return fd;
}

/**
 * Single source of truth for mock compliance data when the backend is unavailable.
 * Used by the API fallback and by UI components for fallback display. Remove when API is wired.
 */
export const MOCK_COMPLIANCE_RESPONSE: ComplianceCheckResponse = {
  score: 74,
  scoreExplanation:
    "Prior auth undocumented and laterality modifiers missing (Policy § 4.2.1, § 3.1)",
  claimSummary: {
    patient: "Jane D., DOB 04/15/1972",
    dos: "02/20/2026",
    provider: "Dr. Sarah Chen, MD",
    npi: "1234567890",
    facility: "Metropolitan Orthopedic Surgical Center",
    payer: "BlueCross BlueShield",
    diagnoses: [
      {
        code: "M17.11",
        desc: "Primary osteoarthritis, right knee",
        type: "Primary",
      },
      { code: "M25.361", desc: "Stiffness of right knee", type: "Secondary" },
      {
        code: "Z96.651",
        desc: "Presence of right artificial knee joint",
        type: "History",
      },
    ],
    procedures: [
      {
        code: "CPT 27447",
        desc: "Total knee arthroplasty",
        modifiers: ["-RT (missing)"],
      },
      {
        code: "CPT 29877",
        desc: "Knee arthroscopy w/ chondroplasty",
        modifiers: ["-RT (missing)"],
      },
    ],
  },
  recommendations: [
    {
      id: 1,
      priority: "Critical",
      title: "Obtain prior authorization for CPT 27447",
      detail:
        "Contact BlueCross BlueShield prior auth line. Reference the claim documentation dated 02/20/2026. Attach PA approval number to claim form box 23 before submission.",
      citation: "Policy § 4.2.1",
      citationFull:
        "Coverage & Authorization Criteria, Section 4.2.1: Elective Surgical Procedures",
      action: "Obtain auth number",
    },
    {
      id: 2,
      priority: "Critical",
      title: "Append modifier -RT to CPT 27447 and CPT 29877",
      detail:
        "Both procedure codes require the laterality modifier -RT (right side). Update claim form line items before submission. Verify with the billing system's modifier validation.",
      citation: "Policy § 3.1",
      citationFull:
        "Coding Requirements, Section 3.1: Laterality and Side Designators",
      action: "Update modifiers",
    },
    {
      id: 3,
      priority: "Required",
      title: "Extend conservative treatment documentation to ≥12 weeks",
      detail:
        "Documentation shows 8 weeks of PT; policy requires 12 consecutive weeks. Supplement record with prior PT notes or schedule additional 4 weeks before proceeding.",
      citation: "Policy § 7.2",
      citationFull:
        "Medical Necessity Criteria, Section 7.2: Conservative Treatment Threshold",
      action: "Add to record",
    },
    {
      id: 4,
      priority: "Required",
      title: "Attach signed medical necessity letter",
      detail:
        "A letter from Dr. Sarah Chen, MD, must accompany the claim. Include diagnosis, failed conservative treatments, surgical plan, and expected functional outcome.",
      citation: "Policy § 5.1",
      citationFull:
        "Claims Submission Guidelines, Section 5.1: Supporting Documentation",
      action: "Draft letter",
    },
    {
      id: 5,
      priority: "Advisory",
      title: "Resolve ICD-10 conflict: M17.11 vs Z96.651",
      detail:
        "M17.11 (primary OA, right knee) co-billed with Z96.651 (presence of right artificial knee joint) may trigger an edit. Confirm surgical history and clarify in the notes if the patient has a prior partial replacement.",
      citation: "Policy § 8.3.2",
      citationFull:
        "Coding Integrity, Section 8.3.2: Diagnosis Code Conflict Review",
      action: "Confirm history",
    },
  ],
  validationIssues: [
    {
      type: "error",
      code: "CPT 27447",
      title: "Missing laterality modifier",
      detail:
        "Modifier -RT or -LT required. Claim will auto-reject at clearinghouse.",
    },
    {
      type: "error",
      code: "CPT 29877",
      title: "Missing laterality modifier",
      detail:
        "Modifier -RT or -LT required. May trigger duplicate service edit.",
    },
    {
      type: "warn",
      code: "ICD-10 Pair",
      title: "Potential code conflict: M17.11 + Z96.651",
      detail:
        "OA of native right knee co-submitted with history of right knee replacement. May indicate coding or documentation inconsistency.",
    },
    {
      type: "warn",
      code: "POS Code",
      title: "Place of Service not specified",
      detail:
        "Facility type (inpatient/outpatient/ASC) affects rate schedule. Verify POS code 21, 22, or 24.",
    },
    {
      type: "info",
      code: "NPI",
      title: "Facility NPI not included",
      detail:
        "Facility NPI (Group NPI) should be added to box 32a. Individual provider NPI present.",
    },
  ],
  meta: { analyzedInMs: 0, policyName: "Demo (API unavailable)" },
};

function getMockComplianceResponse(): ComplianceCheckResponse {
  return MOCK_COMPLIANCE_RESPONSE;
}

/** Minimum delay (ms) when returning mock so the loading state is visible. Remove when API is wired.
 *  Keep LoadingState PROGRESS_BAR_DURATION_SEC in sync (e.g. this value / 1000, or slightly less). */
const MOCK_RESPONSE_DELAY_MS = 9000;

/** True when the failure likely means the API is not deployed (demo fallback). Real API errors (400, 500) should throw. */
function isLikelyApiUnavailable(res: Response): boolean {
  return res.status === 404;
}

/**
 * Runs the compliance check against the backend.
 * POSTs FormData to /api/v1/claim-check; returns parsed ComplianceCheckResponse.
 *
 * - 2xx: returns response immediately (no delay). Same once real API is integrated.
 * - 404 or network error: API assumed unavailable; after a short delay returns mock for demo. Remove delay when API is wired.
 * - Other 4xx/5xx: throws so the UI shows the error. Real API validation/server errors are shown, not mock.
 */
export async function runComplianceCheck(
  payload: ComplianceCheckPayload,
): Promise<ComplianceCheckResponse> {
  const fd = buildFormData(payload);
  const url = `${API_BASE}/api/v1/claim-check`;

  try {
    const res = await fetch(url, { method: "POST", body: fd });

    if (res.ok) {
      const data = (await res.json()) as ComplianceCheckResponse;
      return data;
    }

    if (isLikelyApiUnavailable(res)) {
      await new Promise((r) => setTimeout(r, MOCK_RESPONSE_DELAY_MS));
      return getMockComplianceResponse();
    }

    const text = await res.text();
    throw new Error(
      `Compliance check failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith("Compliance check failed:")
    ) {
      throw err;
    }
    await new Promise((r) => setTimeout(r, MOCK_RESPONSE_DELAY_MS));
    return getMockComplianceResponse();
  }
}

/**
 * Poll the compliance check status endpoint.
 * Used when the backend returns a jobId from the initial POST; frontend polls until status is complete or failed.
 * GET /api/v1/claim-check/status?jobId=...
 */
export async function pollCheckStatus(
  jobId: string,
): Promise<PollStatusResponse> {
  const url = `${API_BASE}/api/v1/claim-check/status?jobId=${encodeURIComponent(jobId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Status check failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}`,
    );
  }
  return res.json() as Promise<PollStatusResponse>;
}
