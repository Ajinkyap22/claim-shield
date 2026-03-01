import express from "express";
import cors from "cors";
import { config } from "./config.js";
import claimCheckRouter from "./routes/claim-check.js";
import fixturesRouter from "./routes/fixtures.js";
import healthRouter from "./routes/health.js";
import policiesRouter from "./routes/policies.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug: log every incoming request (no body/PHI — only method, path, query keys)
app.use((req, _res, next) => {
  const queryKeys = Object.keys(req.query);
  console.log(
    `[gateway] --> ${req.method} ${req.path}` +
      (queryKeys.length ? ` query=[${queryKeys.join(",")}]` : "") +
      ` content-type=${req.headers["content-type"] ?? "none"}`,
  );
  next();
});

app.use("/api", healthRouter);
app.use("/api/v1/claim-check", claimCheckRouter);
app.use("/api/fixtures", fixturesRouter);
app.use("/api/policies", policiesRouter);

app.listen(config.port, () => {
  console.log(`Gateway running on http://localhost:${config.port}`);
  console.log("[gateway] Configured service URLs:");
  console.log(`  extract-file : ${config.extractFileServiceUrl}`);
  console.log(`  mapping      : ${config.mappingServiceUrl}`);
  console.log(`  validation   : ${config.validationServiceUrl}`);
  console.log(`  scoring      : ${config.scoringServiceUrl}`);
  console.log(`  policy       : ${config.policyServiceUrl}`);
});
