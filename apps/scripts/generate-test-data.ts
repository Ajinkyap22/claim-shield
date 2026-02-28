#!/usr/bin/env npx tsx
/**
 * Generates and prints ClaimBundle test fixtures for the validation service.
 *
 * Usage:
 *   npx tsx generate-test-data.ts            # print to stdout
 *   npx tsx generate-test-data.ts --save     # also write to generated-test-data.json
 */

import { writeFileSync } from "node:fs";
import { APPROVE_CLAIM_BUNDLE, DENY_CLAIM_BUNDLE } from "./sample-claims.js";

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";

const scenarios = [
  {
    name: "Likely Approval — John Smith",
    description:
      "Radiculopathy, 6 weeks PT, positive SLR, motor deficits, prior X-ray",
    bundle: APPROVE_CLAIM_BUNDLE,
  },
  {
    name: "Likely Denial — Maria Garcia",
    description:
      "Mild back pain, 2 weeks symptoms, no PT, normal neuro exam, no prior imaging",
    bundle: DENY_CLAIM_BUNDLE,
  },
];

console.log(
  `${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}`
);
console.log(
  `${BOLD}║   Compliance Shield — Validation Test Data Generator    ║${RESET}`
);
console.log(
  `${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}`
);
console.log();

for (const scenario of scenarios) {
  const color = scenario.name.includes("Approval") ? GREEN : RED;
  console.log(`${BOLD}━━━ ${color}${scenario.name}${RESET} ${BOLD}━━━${RESET}`);
  console.log(`${DIM}${scenario.description}${RESET}\n`);
  console.log(
    `  Patient:    ${scenario.bundle.patient.name} (${scenario.bundle.patient.gender}, DOB: ${scenario.bundle.patient.dob})`
  );
  console.log(
    `  Payer:      ${scenario.bundle.patient.payer_id} (${scenario.bundle.patient.member_id})`
  );
  console.log(
    `  Diagnoses:  ${scenario.bundle.conditions.map((c) => `${c.code} – ${c.display}`).join(", ")}`
  );
  console.log(
    `  Procedure:  ${scenario.bundle.procedures[0]?.code} – ${scenario.bundle.procedures[0]?.display}`
  );
  console.log(
    `  Symptoms:   ${scenario.bundle.supporting_info.symptom_duration_weeks} weeks`
  );
  console.log();
  console.log(`${DIM}ClaimBundle JSON:${RESET}`);
  console.log(JSON.stringify(scenario.bundle, null, 2));
  console.log();
}

if (process.argv.includes("--save")) {
  const output = {
    generated_at: new Date().toISOString(),
    scenarios: scenarios.map((s) => ({
      name: s.name,
      description: s.description,
      claim_bundle: s.bundle,
    })),
  };
  const path = "generated-test-data.json";
  writeFileSync(path, JSON.stringify(output, null, 2));
  console.log(`${GREEN}Saved to ${path}${RESET}`);
}
