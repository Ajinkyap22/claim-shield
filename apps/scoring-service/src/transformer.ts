import type { PayerScoreBreakdown, ClinicalValidationResult } from "@compliance-shield/shared";
import type {
  ComplianceCheckResponse,
  Recommendation,
  ValidationIssue,
  PayerComparisonItem,
} from "./types.js";

/**
 * Converts internal PayerScoreBreakdown results + validation into the
 * ComplianceCheckResponse shape expected by the frontend.
 */
export function toComplianceCheckResponse(
  payerScores: Record<string, PayerScoreBreakdown>,
  validation: ClinicalValidationResult,
  elapsedMs: number
): ComplianceCheckResponse {
  const entries = Object.values(payerScores);

  // Aggregate score: weighted average denial_probability across payers, scaled to 0–100
  const score =
    entries.length > 0
      ? Math.round(
          (entries.reduce((sum, p) => sum + p.denial_probability, 0) /
            entries.length) *
            100
        )
      : 50;

  // Build explanation from per-payer summaries
  const scoreExplanation =
    entries.map((p) => `${p.payer_name}: ${p.summary}`).join("; ") ||
    "No payer scores available.";

  // Flatten per-payer recommendations into structured objects with citations
  const recommendations: Recommendation[] = [];
  for (const payer of entries) {
    for (const rule of payer.rules_evaluated) {
      if (!rule.passed) {
        recommendations.push({
          id: rule.rule_id,
          priority: rule.weight >= 0.2 ? "high" : rule.weight >= 0.1 ? "medium" : "low",
          title: rule.description,
          detail: rule.reasoning,
          citation: `${payer.payer_name} policy – ${rule.category}`,
          action: payer.recommendations.find((r) =>
            r.toLowerCase().includes(rule.category.toLowerCase())
          ),
        });
      }
    }
  }

  // Map validation checks to validationIssues
  const validationIssues: ValidationIssue[] = [];

  const checkEntries = [
    { name: "medical_necessity", result: validation.medical_necessity },
    { name: "step_therapy", result: validation.step_therapy },
    { name: "documentation", result: validation.documentation },
  ] as const;

  for (const { name, result } of checkEntries) {
    if (result.status !== "pass") {
      validationIssues.push({
        type: result.status === "fail" ? "error" : "warn",
        code: name,
        title: name.replace(/_/g, " "),
        detail: result.findings,
      });
    }
  }

  // Build payer comparison table
  const payerComparison: PayerComparisonItem[] = entries.map((p) => ({
    payerName: p.payer_name,
    score: Math.round(p.denial_probability * 100),
    statusLabel: p.risk_level === "low" ? "Likely OK" : p.risk_level === "high" ? "Review needed" : "Moderate risk",
    note: p.summary,
  }));

  return {
    score,
    scoreExplanation,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
    validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
    payerComparison: payerComparison.length > 0 ? payerComparison : undefined,
    meta: { analyzedInMs: elapsedMs },
  };
}
