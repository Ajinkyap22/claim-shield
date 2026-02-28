import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import type { PolicyCriterion, IngestRequestMetadata } from "@compliance-shield/shared";
import { PolicyCriterionSchema } from "@compliance-shield/shared";
import { z } from "zod";
import { config } from "./config.js";
import type { TextChunk } from "./pdf-parser.js";

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

const SYSTEM_PROMPT = `You are a healthcare policy analyst. Your job is to read a section of an insurance payer's coverage policy and extract individual, discrete criteria as structured JSON objects.

You MUST respond with ONLY a valid JSON object (no markdown, no code fences, no explanation). The JSON must conform to this schema:
{
  "criteria": [
    {
      "procedure_categories": ["string"],
      "body_regions": ["string"],
      "category": "string",
      "requirement": "string",
      "requirement_type": "mandatory" | "recommended" | "conditional",
      "conditions": ["string"],
      "exceptions": ["string"],
      "evidence_requirements": ["string"]
    }
  ]
}

Rules:
- Each criterion should be ONE specific requirement or rule from the policy.
- Be precise: include specific numbers, durations, codes, and thresholds mentioned in the text.
- Normalize procedure categories to: "mri_spine", "ct_spine", "mri_brain", "mri_knee", "physical_therapy", "surgery_spine", "injection_spine", "other"
- Normalize body regions to: "lumbar", "cervical", "thoracic", "lumbosacral", "knee", "brain", "general", "other"
- Category should be one of: "step_therapy" (prior treatments required), "medical_necessity" (clinical justification), "documentation" (required documentation), "coding" (ICD-10/CPT requirements), "red_flag_bypass" (conditions that bypass normal requirements), "general" (other)
- requirement_type: "mandatory" = must be met, "recommended" = improves approval odds, "conditional" = applies only under certain circumstances
- If a section contains no extractable clinical criteria (e.g. administrative boilerplate, table of contents), return {"criteria": []}.
- Do NOT invent criteria not present in the text.
- IMPORTANT: Return ONLY raw JSON. No markdown formatting, no \`\`\`json blocks.`;

const ExtractedCriteriaSchema = z.object({
  criteria: z.array(
    z.object({
      procedure_categories: z.array(z.string()),
      body_regions: z.array(z.string()),
      category: z.string(),
      requirement: z.string(),
      requirement_type: z.enum(["mandatory", "recommended", "conditional"]),
      conditions: z.array(z.string()),
      exceptions: z.array(z.string()),
      evidence_requirements: z.array(z.string()),
    })
  ),
});

export async function extractCriteriaFromChunks(
  chunks: TextChunk[],
  metadata: IngestRequestMetadata,
  policyId: string
): Promise<PolicyCriterion[]> {
  const allCriteria: PolicyCriterion[] = [];

  for (const chunk of chunks) {
    const extracted = await extractFromChunk(chunk, metadata, policyId);
    allCriteria.push(...extracted);
  }

  return allCriteria;
}

async function extractFromChunk(
  chunk: TextChunk,
  metadata: IngestRequestMetadata,
  policyId: string
): Promise<PolicyCriterion[]> {
  const response = await openai.chat.completions.create({
    model: config.openrouterModel,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Extract policy criteria from this section of "${metadata.policy_name}" by ${metadata.payer_name}:\n\nSection: ${chunk.section_title}\n\n${chunk.text}`,
      },
    ],
  });

  const raw = JSON.parse(stripCodeFences(response.choices[0].message.content!));
  const parsed = ExtractedCriteriaSchema.parse(raw);

  return parsed.criteria.map((c) => {
    const criterion: PolicyCriterion = {
      criterion_id: uuidv4(),
      payer_id: metadata.payer_id,
      payer_name: metadata.payer_name,
      policy_id: policyId,
      policy_name: metadata.policy_name,
      procedure_categories: c.procedure_categories,
      body_regions: c.body_regions,
      category: c.category,
      requirement: c.requirement,
      requirement_type: c.requirement_type,
      conditions: c.conditions,
      exceptions: c.exceptions,
      evidence_requirements: c.evidence_requirements,
      raw_text: chunk.text,
      section_reference: chunk.section_title,
    };
    return PolicyCriterionSchema.parse(criterion);
  });
}
