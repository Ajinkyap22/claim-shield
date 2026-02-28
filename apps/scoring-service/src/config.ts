export const config = {
  port: parseInt(process.env.PORT || "8004"),
  policyServiceUrl: process.env.POLICY_SERVICE_URL || "http://localhost:8005",
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
};
