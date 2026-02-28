export const config = {
  port: parseInt(process.env.PORT || "8000"),
  extractFileServiceUrl:
    process.env.EXTRACT_FILE_SERVICE_URL || "http://localhost:8080",
  policyServiceUrl: process.env.POLICY_SERVICE_URL || "http://localhost:8005",
  mappingServiceUrl: process.env.MAPPING_SERVICE_URL || "http://localhost:8002",
  validationServiceUrl:
    process.env.VALIDATION_SERVICE_URL || "http://localhost:8003",
  scoringServiceUrl:
    process.env.SCORING_SERVICE_URL || "http://localhost:8004",
  policyServiceUrl:
    process.env.POLICY_SERVICE_URL || "http://localhost:8005",
};
