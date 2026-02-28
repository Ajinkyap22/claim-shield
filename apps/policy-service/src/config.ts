export const config = {
  port: parseInt(process.env.PORT || "8005"),
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5",
  pineconeApiKey: process.env.PINECONE_API_KEY || "",
  pineconeIndexName: process.env.PINECONE_INDEX_NAME_POLICIES || "claim-shield-policies",
  chunkBatchSize: parseInt(process.env.CHUNK_BATCH_SIZE || "4"),
};
