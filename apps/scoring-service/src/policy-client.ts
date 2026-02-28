import type { PolicyCriterion } from "@compliance-shield/shared";
import { config } from "./config.js";

export interface ScoredCriterion extends PolicyCriterion {
  similarity_score: number;
}

export interface PolicySearchResponse {
  criteria: ScoredCriterion[];
  total_results: number;
}

/**
 * Calls the policy-service to retrieve relevant policy criteria via similarity search.
 */
export async function searchPolicyCriteria(
  queryText: string,
  procedureCategory: string,
  payerId: string,
  topK: number = 10
): Promise<ScoredCriterion[]> {
  const url = `${config.policyServiceUrl}/policies/search`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query_text: queryText,
      procedure_category: procedureCategory,
      payer_id: payerId,
      top_k: topK,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Policy service search failed (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as PolicySearchResponse;
  return data.criteria;
}
