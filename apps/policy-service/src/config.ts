export const config = {
  port: parseInt(process.env.PORT || "8005"),
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
  pineconeApiKey: process.env.PINECONE_API_KEY || "",
  pineconeIndexName: process.env.PINECONE_INDEX_NAME || "claim-shield-policies",
};
