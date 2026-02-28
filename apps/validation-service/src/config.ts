export const config = {
  port: parseInt(process.env.PORT || "8003"),
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
};
