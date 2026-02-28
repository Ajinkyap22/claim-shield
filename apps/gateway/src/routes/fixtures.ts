import { Router } from "express";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "../../fixtures/sample_claims");

interface FixtureSummary {
  id: string;
  name: string;
  description: string;
}

const FIXTURE_REGISTRY: FixtureSummary[] = [
  {
    id: "mri_lumbar_approve",
    name: "MRI Lumbar Spine — Likely Approval",
    description:
      "Patient with documented radiculopathy, 6 weeks PT, positive SLR. Should pass most payers.",
  },
  {
    id: "mri_lumbar_deny",
    name: "MRI Lumbar Spine — Likely Denial",
    description:
      "Patient with low back pain, minimal conservative treatment, no neurological findings.",
  },
];

// GET /api/fixtures
router.get("/", (_req, res) => {
  res.json(FIXTURE_REGISTRY);
});

// GET /api/fixtures/:id
router.get("/:fixtureId", (req, res) => {
  const filePath = resolve(FIXTURES_DIR, `${req.params.fixtureId}.json`);
  if (!existsSync(filePath)) {
    res
      .status(404)
      .json({ detail: `Fixture '${req.params.fixtureId}' not found.` });
    return;
  }
  const data = JSON.parse(readFileSync(filePath, "utf-8"));
  res.json({ id: req.params.fixtureId, ...data });
});

export default router;
