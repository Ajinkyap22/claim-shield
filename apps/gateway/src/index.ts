import express from "express";
import cors from "cors";
import { config } from "./config.js";
import pipelineRouter from "./routes/pipeline.js";
import fixturesRouter from "./routes/fixtures.js";
import healthRouter from "./routes/health.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", healthRouter);
app.use("/api/pipeline", pipelineRouter);
app.use("/api/fixtures", fixturesRouter);

app.listen(config.port, () => {
  console.log(`Gateway running on http://localhost:${config.port}`);
});
