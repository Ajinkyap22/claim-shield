import type {
  ClaimBundle,
  ClinicalContext,
  ClinicalValidationResult,
  PayerScoreBreakdown,
} from "@compliance-shield/shared";
import { PayerScoreBreakdownSchema } from "@compliance-shield/shared";
import { searchPolicyCriteria } from "./policy-client.js";
import { completeChat } from "./openrouter-client.js";

const SYSTEM_PROMPT = `You are a healthcare insurance policy analyst. Your job is to evaluate whether a medical claim meets the payer's policy criteria and estimate the denial probability.

You are given:
1. The claim's clinical context (structured facts extracted from clinical documentation)
2. The claim bundle (patient info, diagnoses, procedures, supporting information)
3. The clinical validation result (medical necessity, step therapy, documentation checks)
4. A set of relevant policy criteria retrieved from the payer's coverage policies

For each policy criterion provided, evaluate whether the claim satisfies it. Then produce an overall denial probability.

Rules:
- Evaluate EACH criterion independently and produce a rule_id, description, category, passed (boolean), score (0.0 to 1.0 where 1.0 = fully met), weight (importance 0.0 to 1.0), reasoning, and evidence.
- rule_id should be the criterion_id from the input.
- score: 1.0 means the criterion is fully satisfied, 0.0 means completely unmet. Use intermediate values for partial compliance.
- weight: how important this criterion is for the denial decision. Core requirements like medical necessity and step therapy should be 0.2-0.3. Documentation should be 0.15-0.2. Coding specificity should be 0.05-0.1.
- denial_probability: the overall likelihood the payer would deny this claim, from 0.0 (certain approval) to 1.0 (certain denial). This should reflect the weighted evaluation of all criteria.
- risk_level: "low" if denial_probability < 0.35, "medium" if < 0.65, "high" if >= 0.65.
- recommendations: actionable steps to improve the claim, only for criteria that were not fully met.
- summary: a 1-2 sentence overview of the evaluation.
- Be specific in reasoning and evidence. Reference actual clinical facts from the context.
- If no policy criteria are provided for a payer, return a denial_probability of 0.5 with a note that no specific policies were found.

Respond with ONLY a raw JSON object matching the PayerScoreBreakdown schema exactly. No markdown, no code fences, no explanation — just valid JSON.`;


const PAYER_NAMES: Record<string, string> = {
  user: "Your uploaded policy",
  uhc: "UnitedHealthcare",
  aetna: "Aetna",
  cigna: "Cigna",
  bcbs: "Blue Cross Blue Shield",
  humana: "Humana",
};

function buildQueryText(context: ClinicalContext, bundle: ClaimBundle): string {
  const parts: string[] = [
    `Procedure: ${context.procedure_category} (${context.body_region})`,
  ];

  const diag = bundle.conditions.map((c) => `${c.code} ${c.display}`).join(", ");
  if (diag) parts.push(`Diagnoses: ${diag}`);

  const proc = bundle.procedures.map((p) => `${p.code} ${p.display}`).join(", ");
  if (proc) parts.push(`Procedures: ${proc}`);

  if (context.clinical_indicators.radiculopathy) parts.push("radiculopathy present");
  if (context.conservative_treatment.total_conservative_weeks != null) {
    parts.push(
      `${context.conservative_treatment.total_conservative_weeks} weeks conservative treatment`
    );
  }
  if (context.neurological_exam.exam_completeness !== "absent") {
    parts.push(`neurological exam: ${context.neurological_exam.exam_completeness}`);
  }

  return parts.join(". ");
}

/**
 * Scores a claim against a single payer using the RAG pipeline:
 * 1. Build a query from clinical context
 * 2. Retrieve relevant policy criteria from the policy service
 * 3. Send criteria + clinical facts to the LLM via OpenRouter
 * 4. Parse structured output into PayerScoreBreakdown
 */
export async function scoreForPayer(
  payerId: string,
  context: ClinicalContext,
  bundle: ClaimBundle,
  validation: ClinicalValidationResult
): Promise<PayerScoreBreakdown> {
  const queryText = buildQueryText(context, bundle);

  const criteria = await searchPolicyCriteria(
    queryText,
    context.procedure_category,
    payerId,
    15
  );

  const payerName = PAYER_NAMES[payerId] ?? payerId;

  if (criteria.length === 0) {
    return {
      payer_id: payerId,
      payer_name: payerName,
      denial_probability: 0.5,
      risk_level: "medium",
      rules_evaluated: [],
      recommendations: [
        `No specific policy criteria found for ${payerName}. Upload the payer's coverage policy to get accurate scoring.`,
      ],
      summary: `No policy criteria available for ${payerName}. Unable to provide specific denial assessment.`,
    };
  }

  const userMessage = JSON.stringify(
    {
      payer_id: payerId,
      payer_name: payerName,
      clinical_context: context,
      claim_bundle: {
        patient: bundle.patient,
        conditions: bundle.conditions,
        procedures: bundle.procedures,
        medications: bundle.medications,
        claim: bundle.claim,
        supporting_info: bundle.supporting_info,
      },
      validation_result: validation,
      policy_criteria: criteria.map((c) => ({
        criterion_id: c.criterion_id,
        category: c.category,
        requirement: c.requirement,
        requirement_type: c.requirement_type,
        conditions: c.conditions,
        exceptions: c.exceptions,
        evidence_requirements: c.evidence_requirements,
        section_reference: c.section_reference,
      })),
    },
    null,
    2
  );

  const rawResponse = await completeChat({
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    temperature: 0,
    responseFormat: { type: "json_object" },
  });

  const parsed = JSON.parse(rawResponse);
  // Do not log LLM response content: may contain claim/clinical details (PHI)

  // Normalize: LLM sometimes uses alternative field names
  if (!parsed.rules_evaluated) {
    parsed.rules_evaluated =
      parsed.rules || parsed.criteria_evaluations || parsed.evaluations || [];
  }
  if (!parsed.payer_id) parsed.payer_id = payerId;
  if (!parsed.payer_name) parsed.payer_name = payerName;

  // Normalize individual rule fields: LLM sometimes returns evidence as a string
  for (const rule of parsed.rules_evaluated) {
    if (typeof rule.evidence === "string") {
      rule.evidence = rule.evidence ? [rule.evidence] : [];
    }
  }

  return PayerScoreBreakdownSchema.parse(parsed);
}

/**
 * Scores a claim against multiple payers in parallel.
 */
export async function scoreAllPayers(
  payers: string[],
  context: ClinicalContext,
  bundle: ClaimBundle,
  validation: ClinicalValidationResult
): Promise<Record<string, PayerScoreBreakdown>> {
  const entries = await Promise.all(
    payers.map(async (payerId) => {
      const score = await scoreForPayer(payerId, context, bundle, validation);
      return [payerId, score] as const;
    })
  );

  return Object.fromEntries(entries);
}
