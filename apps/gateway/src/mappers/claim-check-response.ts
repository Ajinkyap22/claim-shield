import type { PipelineResult } from "@compliance-shield/shared";
import type {
  ComplianceCheckResponse,
  PayerComparisonItem,
  ClaimCheckRecommendation,
  ClaimCheckValidationIssue,
  ClinicianFinding,
  PayerPolicyPoint,
} from "@compliance-shield/shared";

/** Strip internal field paths and technical phrasing from LLM output for provider-facing display. Keeps codes (CPT, ICD-10). */
function sanitizeForDisplay(text: string): string {
  if (!text?.trim()) return text ?? "";
  let out = text
    .replace(/\bclinical_context\.\w+(\.\w+)*\s*=\s*[^\s.]+\s*/gi, " ")
    .replace(/\bvalidation_result\.\w+(\.\w+)*\s*=\s*[^\s.]+\s*/gi, " ")
    .replace(/\bsupporting_info\.\w+\s*/gi, " ")
    .replace(/\s*=\s*(?:false|true|null|'fail'|'pass'|"fail"|"pass")\s*/gi, " ")
    .replace(/\b(?:status|findings|confidence)\s*=\s*[^\s,.]+\s*/gi, " ")
    .replace(/\bwith\s+confidence\s+[\d.]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out || text.trim();
}

export function mapPipelineResultToComplianceCheckResponse(
  result: PipelineResult
): ComplianceCheckResponse {
  const payerIds = Object.keys(result.payer_scores);
  const firstPayerId = payerIds[0];
  const firstPayer = firstPayerId
    ? result.payer_scores[firstPayerId]
    : undefined;

  const score = firstPayer
    ? Math.round(firstPayer.denial_probability * 100)
    : 0;
  const scoreExplanation = sanitizeForDisplay(firstPayer?.summary ?? "No payer scores available.");

  const claimSummary = buildClaimSummary(result.claim_bundle);
  const clinicianView = buildClinicianView(result.clinical_context);
  const payerView = sanitizeForDisplay(firstPayer?.summary ?? "");
  const clinicianFindings = buildClinicianFindings(
    result.clinical_context,
    result.validation_result,
  );
  const payerPolicyPoints = buildPayerPolicyPoints(firstPayer?.rules_evaluated ?? []);

  const recommendations = buildRecommendations(result, firstPayerId);
  const validationIssues = buildValidationIssues(result.validation_result);

  const meta = {
    analyzedInMs: Math.round(result.processing_time_seconds * 1000),
    policyName:
      payerIds.length > 0
        ? payerIds.map((id) => result.payer_scores[id]?.payer_name ?? id).join(", ")
        : "Multi-payer",
  };

  const payerComparison: PayerComparisonItem[] = payerIds.map((id) => {
    const p = result.payer_scores[id];
    return {
      payerName: p.payer_name,
      score: Math.round(p.denial_probability * 100),
      statusLabel:
        p.risk_level === "low"
          ? "Likely OK"
          : p.risk_level === "high"
            ? "Review needed"
            : "Review needed",
      note: p.summary ? sanitizeForDisplay(p.summary) : undefined,
    };
  });

  return {
    score,
    scoreExplanation,
    claimSummary,
    clinicianView,
    payerView,
    clinicianFindings,
    payerPolicyPoints,
    recommendations,
    validationIssues,
    meta,
    payerComparison,
  };
}

function buildClaimSummary(bundle: PipelineResult["claim_bundle"]): Record<string, unknown> {
  const patient = bundle.patient;
  const conditions = bundle.conditions.map((c) => ({
    code: c.code,
    desc: c.display,
    type: "Primary",
  }));
  const procedures = bundle.procedures.map((p) => ({
    code: p.code,
    desc: p.display,
    modifiers: [] as string[],
  }));
  return {
    patient: patient.name && patient.dob ? `${patient.name}, DOB ${patient.dob}` : "",
    dos: bundle.claim.service_date ?? "",
    provider: "",
    npi: patient.member_id ?? bundle.claim.provider_npi ?? "",
    facility: "",
    payer: "",
    diagnoses: conditions,
    procedures,
  };
}

function buildClinicianView(context: PipelineResult["clinical_context"]): string {
  const parts: string[] = [];
  if (context.procedure_category) parts.push(`Procedure: ${context.procedure_category}`);
  if (context.body_region) parts.push(`Region: ${context.body_region}`);
  const ct = context.conservative_treatment;
  if (ct?.physical_therapy_completed || ct?.total_conservative_weeks != null) {
    parts.push(
      `Conservative treatment: ${ct.total_conservative_weeks ?? "?"} weeks`
    );
  }
  return parts.length > 0 ? parts.join(". ") : "Clinical context extracted.";
}

function buildClinicianFindings(
  context: PipelineResult["clinical_context"],
  vr: PipelineResult["validation_result"],
): ClinicianFinding[] {
  const findings: ClinicianFinding[] = [];
  const isGap = (status: string | null | undefined): boolean =>
    status === "fail" || status === "pass_with_findings";

  // Procedure / Region
  const procText =
    context.procedure_category && context.procedure_category !== "other"
      ? `${context.procedure_category} (${context.body_region ?? "region not specified"})`
      : context.body_region
        ? `Body region: ${context.body_region}`
        : "Procedure/region not specified.";
  findings.push({
    category: "Procedure / Region",
    text: procText,
    status: context.procedure_category && context.body_region ? "documented" : "gap",
  });

  // Conservative treatment
  const ct = context.conservative_treatment;
  const ctParts: string[] = [];
  if (ct.physical_therapy_completed && ct.total_conservative_weeks != null) {
    ctParts.push(`${ct.total_conservative_weeks} weeks PT`);
  }
  if (ct.nsaid_trial) ctParts.push("NSAID trial");
  if (ct.muscle_relaxant_trial) ctParts.push("muscle relaxant trial");
  if (ct.activity_modification) ctParts.push("activity modification");
  if (ct.treatments_tried?.length) ctParts.push(ct.treatments_tried.join(", "));
  const ctText =
    ctParts.length > 0
      ? ctParts.join(". ")
      : "No conservative treatment documented.";
  findings.push({
    category: "Conservative Treatment",
    text: ctText,
    status: isGap(vr.step_therapy?.status) ? "gap" : ctParts.length > 0 ? "documented" : "gap",
  });

  // Neurological exam
  const ne = context.neurological_exam;
  const neText =
    ne.exam_completeness === "full"
      ? "Full neurological exam documented (SLR, motor, sensory, reflex)."
      : ne.exam_completeness === "partial"
        ? "Partial neurological exam documented."
        : "Neurological exam not documented or absent.";
  findings.push({
    category: "Neurological Exam",
    text: neText,
    status: ne.exam_completeness !== "absent" ? "documented" : "gap",
  });

  // Imaging history
  const ih = context.imaging_history;
  const ihParts: string[] = [];
  if (ih.prior_mri) ihParts.push("prior MRI");
  if (ih.prior_xray) ihParts.push("prior X-ray");
  if (ih.prior_ct) ihParts.push("prior CT");
  if (ih.prior_imaging_modalities?.length) ihParts.push(ih.prior_imaging_modalities.join(", "));
  const ihText =
    ihParts.length > 0 ? ihParts.join("; ") : "No prior imaging documented.";
  findings.push({
    category: "Imaging",
    text: ihText,
    status: ihParts.length > 0 ? "documented" : "gap",
  });

  // Medical necessity (from validation)
  findings.push({
    category: "Medical Necessity",
    text: sanitizeForDisplay(vr.medical_necessity?.findings ?? "Medical necessity not assessed."),
    status: isGap(vr.medical_necessity?.status) ? "gap" : "documented",
  });

  // Step therapy (from validation)
  findings.push({
    category: "Step Therapy",
    text: sanitizeForDisplay(vr.step_therapy?.findings ?? "Step therapy requirements not assessed."),
    status: isGap(vr.step_therapy?.status) ? "gap" : "documented",
  });

  // Documentation (from validation + missing_elements)
  const dq = context.documentation_quality;
  const missingStr =
    dq.missing_elements?.length > 0
      ? ` Missing: ${dq.missing_elements.join(", ")}.`
      : "";
  findings.push({
    category: "Documentation",
    text: sanitizeForDisplay((vr.documentation?.findings ?? "Documentation not assessed.") + missingStr),
    status: isGap(vr.documentation?.status) || (dq.missing_elements?.length ?? 0) > 0 ? "gap" : "documented",
  });

  return findings;
}

/** Normalize for deduplication: lowercase, trim, collapse whitespace. */
function normForDedupe(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildPayerPolicyPoints(
  rules: Array<{ rule_id: string; description: string; reasoning: string; evidence?: string[]; passed: boolean; section_reference?: string }>,
): PayerPolicyPoint[] {
  const points: PayerPolicyPoint[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const citation = rule.section_reference ?? rule.rule_id;
    const title = sanitizeForDisplay(rule.description);
    const key = normForDedupe(citation) + "|" + normForDedupe(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const rawText = rule.reasoning + (rule.evidence?.length ? ` ${rule.evidence.join(" ")}` : "");
    points.push({
      citation,
      title,
      text: sanitizeForDisplay(rawText),
      severity: rule.passed ? "warn" : "fail",
    });
  }
  return points;
}

function buildRecommendations(
  result: PipelineResult,
  firstPayerId: string | undefined
): ClaimCheckRecommendation[] {
  const recs: ClaimCheckRecommendation[] = [];
  let id = 1;
  const seenKeys = new Set<string>();

  const add = (
    title: string,
    detail: string | undefined,
    citation: string,
    priority?: string
  ) => {
    const key = normForDedupe(title) + "|" + normForDedupe(citation);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    recs.push({
      id: id++,
      title: sanitizeForDisplay(title),
      detail: detail ? sanitizeForDisplay(detail) : undefined,
      citation,
      priority,
    });
  };

  const vr = result.validation_result;
  if (vr.medical_necessity.recommendations?.length) {
    for (const r of vr.medical_necessity.recommendations) {
      add(r, vr.medical_necessity.findings, "Policy (medical necessity)", "Critical");
    }
  }
  if (vr.step_therapy.recommendations?.length) {
    for (const r of vr.step_therapy.recommendations) {
      add(r, vr.step_therapy.findings, "Policy (step therapy)", "Required");
    }
  }
  if (vr.documentation.recommendations?.length) {
    for (const r of vr.documentation.recommendations) {
      add(r, vr.documentation.findings, "Policy (documentation)", "Required");
    }
  }

  if (firstPayerId) {
    const p = result.payer_scores[firstPayerId];
    for (const r of p.recommendations ?? []) {
      add(r, undefined, `Policy (${p.payer_name})`, "Advisory");
    }
    for (const rule of p.rules_evaluated ?? []) {
      if (!rule.passed && rule.reasoning) {
        const citation = rule.section_reference ?? rule.rule_id;
        add(rule.description, rule.reasoning, citation, "Advisory");
      }
    }
  }

  return recs;
}

const VALID_STATUS = ["pass", "pass_with_findings", "fail"] as const;
type ValidStatus = (typeof VALID_STATUS)[number];

function normalizeStatus(s: string | null | undefined): ValidStatus {
  if (s === "fail" || s === "pass_with_findings" || s === "pass") return s;
  return "pass";
}

function buildValidationIssues(
  vr: PipelineResult["validation_result"]
): ClaimCheckValidationIssue[] {
  const issues: ClaimCheckValidationIssue[] = [];
  const add = (
    category: string,
    findings: string | null | undefined,
    status: string | null | undefined
  ) => {
    const s = normalizeStatus(status);
    const type: "error" | "warn" | "info" =
      s === "fail" ? "error" : s === "pass_with_findings" ? "warn" : "info";
    const detail = (findings ?? "")?.trim() ? sanitizeForDisplay(findings ?? "") : "";
    if (detail) {
      issues.push({ type, code: category, title: category, detail });
    }
  };
  add("medical_necessity", vr.medical_necessity?.findings, vr.medical_necessity?.status);
  add("step_therapy", vr.step_therapy?.findings, vr.step_therapy?.status);
  add("documentation", vr.documentation?.findings, vr.documentation?.status);
  return issues;
}

export function mapPipelineResultToPayerComparison(
  result: PipelineResult
): PayerComparisonItem[] {
  return mapPipelineResultToComplianceCheckResponse(result).payerComparison ?? [];
}
