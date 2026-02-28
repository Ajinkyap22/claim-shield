import "dotenv/config";
import express from "express";
import cors from "cors";
import { ClaimBundleSchema } from "@compliance-shield/shared";
import { config } from "./config.js";
import { runClinicalValidation } from "./agents/clinical-validation.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "validation-service" });
});

app.post("/validate", async (req, res) => {
  try {
    const bundle = ClaimBundleSchema.parse(req.body);
    const output = await runClinicalValidation(bundle);
    res.json(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ detail: message });
  }
});

app.listen(config.port, () => {
  console.log(
    `Validation service running on http://localhost:${config.port}`
  );
});
