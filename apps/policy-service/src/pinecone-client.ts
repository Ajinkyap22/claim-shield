import { Pinecone } from "@pinecone-database/pinecone";
import type { PolicyCriterion } from "@compliance-shield/shared";
import { config } from "./config.js";
import { embedTexts, embedQuery, buildEmbeddingText } from "./embedder.js";

let pinecone: Pinecone | null = null;

function getClient(): Pinecone {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: config.pineconeApiKey });
  }
  return pinecone;
}

function getIndex() {
  return getClient().index(config.pineconeIndexName);
}

export interface ScoredCriterion extends PolicyCriterion {
  similarity_score: number;
}

/**
 * Upserts policy criteria as vectors into Pinecone.
 */
export async function upsertCriteria(criteria: PolicyCriterion[]): Promise<void> {
  if (criteria.length === 0) return;

  const texts = criteria.map((c) => buildEmbeddingText(c.requirement, c.raw_text));
  const embeddings = await embedTexts(texts);

  const index = getIndex();
  const UPSERT_BATCH = 100;

  for (let i = 0; i < criteria.length; i += UPSERT_BATCH) {
    const batch = criteria.slice(i, i + UPSERT_BATCH);
    const vectors = batch.map((c, j) => ({
      id: c.criterion_id,
      values: embeddings[i + j],
      metadata: {
        payer_id: c.payer_id,
        payer_name: c.payer_name,
        policy_id: c.policy_id,
        policy_name: c.policy_name,
        procedure_categories: c.procedure_categories,
        body_regions: c.body_regions,
        category: c.category,
        requirement: c.requirement,
        requirement_type: c.requirement_type,
        conditions: c.conditions,
        exceptions: c.exceptions,
        evidence_requirements: c.evidence_requirements,
        raw_text: c.raw_text.slice(0, 2000),
        section_reference: c.section_reference,
        criterion_id: c.criterion_id,
      },
    }));
    await index.upsert(vectors);
  }
}

/**
 * Searches for policy criteria relevant to a query.
 */
export async function searchCriteria(
  queryText: string,
  procedureCategory: string,
  payerId?: string,
  topK: number = 10
): Promise<ScoredCriterion[]> {
  const queryEmbedding = await embedQuery(queryText);
  const index = getIndex();

  const filter: Record<string, unknown> = {
    procedure_categories: { $in: [procedureCategory] },
  };
  if (payerId) {
    filter.payer_id = { $eq: payerId };
  }

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
    filter,
  });

  return (results.matches || []).map((match) => {
    const m = match.metadata as Record<string, unknown>;
    return {
      criterion_id: m.criterion_id as string,
      payer_id: m.payer_id as string,
      payer_name: m.payer_name as string,
      policy_id: m.policy_id as string,
      policy_name: m.policy_name as string,
      procedure_categories: m.procedure_categories as string[],
      body_regions: m.body_regions as string[],
      category: m.category as string,
      requirement: m.requirement as string,
      requirement_type: m.requirement_type as "mandatory" | "recommended" | "conditional",
      conditions: m.conditions as string[],
      exceptions: m.exceptions as string[],
      evidence_requirements: m.evidence_requirements as string[],
      raw_text: m.raw_text as string,
      section_reference: m.section_reference as string,
      similarity_score: match.score ?? 0,
    };
  });
}

/**
 * Deletes all vectors associated with a given policy_id.
 */
export async function deletePolicyVectors(policyId: string): Promise<void> {
  const index = getIndex();
  await index.deleteMany({ policy_id: { $eq: policyId } });
}

/**
 * Lists distinct policies stored in Pinecone by querying metadata.
 * Since Pinecone doesn't support aggregation, we maintain a local registry.
 */
export async function listPolicies(): Promise<
  { policy_id: string; payer_id: string; payer_name: string; policy_name: string }[]
> {
  return [...policyRegistry.values()];
}

// In-memory registry for policy metadata (populated during ingestion, lost on restart)
const policyRegistry = new Map<
  string,
  { policy_id: string; payer_id: string; payer_name: string; policy_name: string; criteria_count: number; ingested_at: string }
>();

export function registerPolicy(
  policyId: string,
  payerId: string,
  payerName: string,
  policyName: string,
  criteriaCount: number
): void {
  policyRegistry.set(policyId, {
    policy_id: policyId,
    payer_id: payerId,
    payer_name: payerName,
    policy_name: policyName,
    criteria_count: criteriaCount,
    ingested_at: new Date().toISOString(),
  });
}

export function unregisterPolicy(policyId: string): void {
  policyRegistry.delete(policyId);
}

export function getPolicyRegistry() {
  return [...policyRegistry.values()];
}
