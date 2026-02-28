/**
 * Clinical validation agent — 3 parallel OpenAI calls via Promise.all.
 *
 * Checks:
 * 1. Medical necessity — does the diagnosis justify the procedure?
 * 2. Step therapy — was required prior treatment attempted?
 * 3. Documentation completeness — are all required findings present?
 */

import OpenAI from "openai";
import type {
  ClaimBundle,
  CheckResult,
  ClinicalValidationResult,
  ClinicalContext,
} from "@compliance-shield/shared";
import {
  CheckResultSchema,
  ClinicalValidationResultSchema,
} from "@compliance-shield/shared";
import { config } from "../config.js";
import { extractClinicalContext } from "./fact-extractor.js";

const openai = new OpenAI({
  apiKey: config.openrouterApiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://compliance-shield.dev",
    "X-Title": "Compliance Shield",
  },
});

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fencePattern = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = trimmed.match(fencePattern);
  return match ? match[1].trim() : trimmed;
}

function normalizeConfidence(confidence: unknown): number {
  let value: number;

  if (typeof confidence === "number") {
    value = confidence;
  } else if (typeof confidence === "string") {
    value = Number(confidence.replace("%", "").trim());
  } else {
    value = 0.5;
  }

  if (!Number.isFinite(value)) return 0.5;
  if (value > 1 && value <= 100) value /= 100;

  return Math.max(0, Math.min(1, value));
}

function normalizeCheckResult(raw: unknown): CheckResult {
  const candidate =
    raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  candidate.confidence = normalizeConfidence(candidate.confidence);
  return CheckResultSchema.parse(candidate) as CheckResult;
}

function bundleSummary(bundle: ClaimBundle): string {
  const lines: string[] = [
    `Patient: ${bundle.patient.name}, DOB: ${bundle.patient.dob}`,
    "",
    "Diagnoses:",
  ];
  for (const c of bundle.conditions) {
    lines.push(`  - ${c.code} — ${c.display}`);
  }
  lines.push("\nProcedures Requested:");
  for (const p of bundle.procedures) {
    lines.push(`  - CPT ${p.code} — ${p.display}`);
  }
  lines.push("\nSupporting Clinical Information:");
  const info = bundle.supporting_info;
  if (info.conservative_treatment)
    lines.push(`  Conservative Treatment: ${info.conservative_treatment}`);
  if (info.physical_exam_findings)
    lines.push(`  Physical Exam: ${info.physical_exam_findings}`);
  if (info.symptom_duration_weeks)
    lines.push(`  Symptom Duration: ${info.symptom_duration_weeks} weeks`);
  if (info.prior_imaging) lines.push(`  Prior Imaging: ${info.prior_imaging}`);
  if (info.lab_results)
    lines.push(`  Lab Results: ${JSON.stringify(info.lab_results)}`);
  if (info.prior_medications)
    lines.push(`  Prior Medications: ${info.prior_medications.join(", ")}`);

  return lines.join("\n");
}

async function llmCheck(
  systemPrompt: string,
  bundle: ClaimBundle
): Promise<CheckResult> {
  const fullPrompt = systemPrompt + `\n\nIMPORTANT: Respond with ONLY raw JSON (no markdown, no code fences). Use this exact schema:
{"status": "pass"|"pass_with_findings"|"fail", "confidence": number, "findings": "string", "evidence": ["string"], "recommendations": ["string"]}`;

  const summary = bundleSummary(bundle);
  const response = await openai.chat.completions.create({
    model: config.openrouterModel,
    temperature: 0,
    messages: [
      { role: "system", content: fullPrompt },
      { role: "user", content: `Evaluate this claim:\n\n${summary}` },
    ],
  });
  const raw = JSON.parse(stripCodeFences(response.choices[0].message.content!));
  return normalizeCheckResult(raw);
}

async function checkMedicalNecessity(
  bundle: ClaimBundle
): Promise<CheckResult> {
  return llmCheck(
    `You are a clinical reviewer assessing medical necessity for insurance prior authorization.

Evaluate whether the patient's diagnoses justify the requested procedure.
For MRI lumbar spine (CPT 72148), medical necessity is supported by:
- Radiculopathy or neurological deficit
- Red flags: cauda equina syndrome, progressive neurological deficit, suspected tumor/infection
- Persistent pain not responding to conservative treatment

Medical necessity is NOT supported by:
- Non-specific low back pain without neurological findings
- Acute pain without red flags (< 4 weeks)
- No documented functional limitation

Return your assessment as structured JSON.`,
    bundle
  );
}

async function checkStepTherapy(bundle: ClaimBundle): Promise<CheckResult> {
  return llmCheck(
    `You are a clinical reviewer assessing step therapy compliance for insurance prior authorization.

Evaluate whether the patient has attempted appropriate conservative treatment before the requested procedure.
For MRI lumbar spine, standard step therapy requirements include:
- Physical therapy: typically 4-6 weeks minimum
- Analgesic medications: NSAIDs, muscle relaxants, or similar
- Activity modification
- Home exercise program

Exceptions that bypass step therapy:
- Suspected cauda equina syndrome
- Progressive neurological deficit
- Red flag symptoms (fever, weight loss, history of cancer)

Assess duration, type, and adequacy of conservative treatment documented.
Return your assessment as structured JSON.`,
    bundle
  );
}

async function checkDocumentation(bundle: ClaimBundle): Promise<CheckResult> {
  return llmCheck(
    `You are a clinical reviewer assessing documentation completeness for insurance prior authorization.

Evaluate whether the clinical documentation includes all required elements.
For MRI lumbar spine prior authorization, required documentation:
- Physical examination findings (especially neurological exam)
- Straight leg raise test result
- Motor strength assessment
- Sensory examination
- Reflex testing
- Duration and nature of symptoms
- Prior treatment details with dates and outcomes
- Prior imaging results (if any)

Helpful but not always required:
- Provider specialty
- Functional limitations
- Pain scale rating

Flag any missing documentation that could lead to denial.
Return your assessment as structured JSON.`,
    bundle
  );
}

export interface ValidationOutput {
  validation_result: ClinicalValidationResult;
  clinical_context: ClinicalContext;
}

export async function runClinicalValidation(
  bundle: ClaimBundle
): Promise<ValidationOutput> {
  // Run all 3 checks + fact extraction in parallel (4 LLM calls)
  const [medicalNecessity, stepTherapy, documentation, clinicalContext] =
    await Promise.all([
      checkMedicalNecessity(bundle),
      checkStepTherapy(bundle),
      checkDocumentation(bundle),
      extractClinicalContext(bundle),
    ]);

  const statuses = [
    medicalNecessity.status,
    stepTherapy.status,
    documentation.status,
  ];
  let overallStatus: "pass" | "pass_with_findings" | "fail";
  if (statuses.includes("fail")) {
    overallStatus = "fail";
  } else if (statuses.includes("pass_with_findings")) {
    overallStatus = "pass_with_findings";
  } else {
    overallStatus = "pass";
  }

  const validationResult = ClinicalValidationResultSchema.parse({
    overall_status: overallStatus,
    medical_necessity: medicalNecessity,
    step_therapy: stepTherapy,
    documentation,
  }) as ClinicalValidationResult;

  return {
    validation_result: validationResult,
    clinical_context: clinicalContext,
  };
}
