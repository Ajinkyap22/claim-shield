import { config } from "./config.js";

const BATCH_SIZE = 96;
const EMBEDDING_MODEL = "intfloat/multilingual-e5-large";
const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
}

async function callOpenRouterEmbeddings(texts: string[]): Promise<number[][]> {
  const resp = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter embeddings failed (${resp.status}): ${text}`);
  }

  const json = (await resp.json()) as EmbeddingResponse;
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Embeds an array of texts using OpenRouter's embeddings API.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await callOpenRouterEmbeddings(batch);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

/**
 * Embeds a single query text for similarity search.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const embeddings = await callOpenRouterEmbeddings([text]);
  return embeddings[0];
}

/**
 * Builds the text that gets embedded for a policy criterion.
 * Combines the requirement with the raw source text for richer semantic signal.
 */
export function buildEmbeddingText(requirement: string, rawText: string): string {
  const truncatedRaw = rawText.length > 1500 ? rawText.slice(0, 1500) : rawText;
  return `${requirement}\n\n${truncatedRaw}`;
}
