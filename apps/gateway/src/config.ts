export const config = {
  port: parseInt(process.env.PORT || "8000"),
  extractionServiceUrl:
    process.env.EXTRACTION_SERVICE_URL || "http://localhost:8001",
  mappingServiceUrl: process.env.MAPPING_SERVICE_URL || "http://localhost:8002",
  validationServiceUrl:
    process.env.VALIDATION_SERVICE_URL || "http://localhost:8003",
  scoringServiceUrl:
    process.env.SCORING_SERVICE_URL || "http://localhost:8004",
};
