/**
 * Extracts structured clinical facts from a ClaimBundle using an LLM.
 *
 * Transforms free-text clinical documentation into machine-readable
 * ClinicalContext that the deterministic scoring engine can evaluate.
 */

import OpenAI from "openai";
import type { ClaimBundle, ClinicalContext } from "@compliance-shield/shared";
import {
  ClinicalContextSchema,
  DEFAULT_CLINICAL_CONTEXT_INPUT,
} from "@compliance-shield/shared";
import { config } from "../config.js";

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

function bundleSummary(bundle: ClaimBundle): string {
  const lines: string[] = [
    `Patient: ${bundle.patient.name}, DOB: ${bundle.patient.dob}, Gender: ${bundle.patient.gender}`,
    "",
    "Diagnoses:",
  ];
  for (const c of bundle.conditions) {
    lines.push(
      `  - ${c.code} — ${c.display} (status: ${c.clinical_status}, severity: ${c.severity ?? "unknown"})`
    );
  }
  lines.push("\nProcedures Requested:");
  for (const p of bundle.procedures) {
    lines.push(
      `  - CPT ${p.code} — ${p.display} (body site: ${p.body_site ?? "unspecified"})`
    );
  }
  lines.push("\nSupporting Clinical Information:");
  const info = bundle.supporting_info;
  if (info.conservative_treatment)
    lines.push(`  Conservative Treatment: ${info.conservative_treatment}`);
  if (info.physical_exam_findings)
    lines.push(`  Physical Exam: ${info.physical_exam_findings}`);
  if (info.symptom_duration_weeks != null)
    lines.push(`  Symptom Duration: ${info.symptom_duration_weeks} weeks`);
  if (info.prior_imaging) lines.push(`  Prior Imaging: ${info.prior_imaging}`);
  if (info.lab_results)
    lines.push(`  Lab Results: ${JSON.stringify(info.lab_results)}`);
  if (info.lifestyle_modifications)
    lines.push(`  Lifestyle Modifications: ${info.lifestyle_modifications}`);
  if (info.prior_medications?.length)
    lines.push(`  Prior Medications: ${info.prior_medications.join(", ")}`);

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are a clinical data extraction system. Your job is to read a structured claim bundle and extract precise, machine-readable clinical facts.

IMPORTANT: Respond with ONLY raw JSON (no markdown, no code fences, no explanation). The JSON must conform to the ClinicalContext schema with these top-level fields:
procedure_category, body_region, conservative_treatment, neurological_exam, imaging_history, clinical_indicators, documentation_quality.

Rules:
- Extract ONLY facts that are explicitly documented. Do NOT infer or assume.
- For numeric values (weeks, sessions, degrees), extract the exact number stated.
- If a value is not documented, return null for nullable fields or false for booleans.
- procedure_category should be one of: "mri_spine", "ct_spine", "mri_brain", "mri_knee", "physical_therapy", "other"
- body_region should be one of: "lumbar", "cervical", "thoracic", "lumbosacral", "knee", "brain", "other"
- For treatments_tried, use normalized names: "physical_therapy", "nsaids", "muscle_relaxants", "analgesics", "activity_modification", "home_exercise", "epidural_injection", "chiropractic"
- For muscle_groups_tested, use standard abbreviations: "EHL", "tibialis_anterior", "gastrocnemius", "quadriceps", "hamstrings", "hip_flexors"
- For affected_dermatomes, use nerve root labels: "L3", "L4", "L5", "S1", "S2", etc.
- For reflexes_tested, use: "achilles", "patellar", "plantar"
- Red flags include: "cauda_equina", "progressive_weakness", "bowel_bladder_dysfunction", "saddle_anesthesia", "fever", "weight_loss", "cancer_history", "iv_drug_use"
- missing_elements should list documentation gaps: "neurological_exam", "straight_leg_raise", "motor_exam", "sensory_exam", "reflex_exam", "treatment_history", "prior_imaging", "functional_assessment"

Be precise and conservative. Only mark something as present if the documentation clearly states it.
Return ONLY raw JSON.`;

export async function extractClinicalContext(
  bundle: ClaimBundle
): Promise<ClinicalContext> {
  const summary = bundleSummary(bundle);

  const response = await openai.chat.completions.create({
    model: config.openrouterModel,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extract structured clinical facts from this claim:\n\n${summary}`,
      },
    ],
  });

  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFences(response.choices[0].message.content!));
  } catch {
    return getDefaultClinicalContext();
  }

  if (!raw || typeof raw !== "object") {
    return getDefaultClinicalContext();
  }

  const rawObj = raw as Record<string, unknown>;

  // Guard: LLM sometimes returns clinical_indicators.red_flags_present as boolean
  if (rawObj.clinical_indicators && typeof rawObj.clinical_indicators === "object") {
    const ci = rawObj.clinical_indicators as Record<string, unknown>;
    if (typeof ci.red_flags_present === "boolean") {
      ci.red_flags_present = [];
    }
  }

  // Merge with default so we never pass undefined for any key (Zod then always gets a full object)
  const toParse: Record<string, unknown> = { ...DEFAULT_CLINICAL_CONTEXT_INPUT };
  for (const key of Object.keys(DEFAULT_CLINICAL_CONTEXT_INPUT)) {
    const v = rawObj[key];
    if (v !== undefined && v !== null) {
      if (key === "procedure_category" || key === "body_region") {
        toParse[key] = typeof v === "string" ? v : DEFAULT_CLINICAL_CONTEXT_INPUT[key];
      } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        toParse[key] = v;
      }
    }
  }

  try {
    return ClinicalContextSchema.parse(toParse);
  } catch {
    return getDefaultClinicalContext();
  }
}

function getDefaultClinicalContext(): ClinicalContext {
  return ClinicalContextSchema.parse(DEFAULT_CLINICAL_CONTEXT_INPUT);
}
