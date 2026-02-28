import { Pinecone } from "@pinecone-database/pinecone";
import { config } from "./config.js";

let pinecone: Pinecone | null = null;

function getClient(): Pinecone {
  if (!pinecone) {
    pinecone = new Pinecone({ apiKey: config.pineconeApiKey });
  }
  return pinecone;
}

const BATCH_SIZE = 96;
const EMBEDDING_MODEL = "multilingual-e5-large";

/**
 * Embeds an array of texts using Pinecone's built-in inference API.
 * No separate OpenAI key needed -- uses the Pinecone API key.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const pc = getClient();
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await pc.inference.embed(EMBEDDING_MODEL, batch, {
      inputType: "passage",
    });
    allEmbeddings.push(...response.map((d) => d.values as number[]));
  }

  return allEmbeddings;
}

/**
 * Embeds a single query text for similarity search.
 * Uses "query" inputType for asymmetric search.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const pc = getClient();
  const response = await pc.inference.embed(EMBEDDING_MODEL, [text], {
    inputType: "query",
  });
  return response[0].values as number[];
}

/**
 * Builds the text that gets embedded for a policy criterion.
 * Combines the requirement with the raw source text for richer semantic signal.
 */
export function buildEmbeddingText(requirement: string, rawText: string): string {
  const truncatedRaw = rawText.length > 1500 ? rawText.slice(0, 1500) : rawText;
  return `${requirement}\n\n${truncatedRaw}`;
}
