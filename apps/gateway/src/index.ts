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

app.use("/api", healthRouter);
app.use("/api/v1/claim-check", claimCheckRouter);
app.use("/api/fixtures", fixturesRouter);
app.use("/api/policies", policiesRouter);

app.listen(config.port, () => {
  console.log(`Gateway running on http://localhost:${config.port}`);
});
