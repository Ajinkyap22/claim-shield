import type { PipelineResult } from "@compliance-shield/shared";
import type {
  ComplianceCheckResponse,
  PayerComparisonItem,
  ClaimCheckRecommendation,
  ClaimCheckValidationIssue,
} from "@compliance-shield/shared";

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
  const scoreExplanation = firstPayer?.summary ?? "No payer scores available.";

  const claimSummary = buildClaimSummary(result.claim_bundle);
  const clinicianView = buildClinicianView(result.clinical_context);
  const payerView = firstPayer?.summary ?? "";

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
      note: p.summary || undefined,
    };
  });

  return {
    score,
    scoreExplanation,
    claimSummary,
    clinicianView,
    payerView,
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

function buildRecommendations(
  result: PipelineResult,
  firstPayerId: string | undefined
): ClaimCheckRecommendation[] {
  const recs: ClaimCheckRecommendation[] = [];
  let id = 1;

  const add = (
    title: string,
    detail: string | undefined,
    citation: string,
    priority?: string
  ) => {
    recs.push({ id: id++, title, detail, citation, priority });
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
        add(rule.description, rule.reasoning, rule.rule_id, "Advisory");
      }
    }
  }

  return recs;
}

function buildValidationIssues(
  vr: PipelineResult["validation_result"]
): ClaimCheckValidationIssue[] {
  const issues: ClaimCheckValidationIssue[] = [];
  const add = (
    category: string,
    findings: string,
    status: "pass" | "pass_with_findings" | "fail"
  ) => {
    const type: "error" | "warn" | "info" =
      status === "fail" ? "error" : status === "pass_with_findings" ? "warn" : "info";
    if (findings?.trim()) {
      issues.push({ type, code: category, title: category, detail: findings });
    }
  };
  add("medical_necessity", vr.medical_necessity.findings, vr.medical_necessity.status);
  add("step_therapy", vr.step_therapy.findings, vr.step_therapy.status);
  add("documentation", vr.documentation.findings, vr.documentation.status);
  return issues;
}

export function mapPipelineResultToPayerComparison(
  result: PipelineResult
): PayerComparisonItem[] {
  return mapPipelineResultToComplianceCheckResponse(result).payerComparison ?? [];
}
