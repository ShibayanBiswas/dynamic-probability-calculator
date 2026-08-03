/**
 * Runs the desk regression battery (no bake / no network mongo).
 * Usage: npm run verify:desk
 */
import { spawnSync } from "node:child_process";

const STEPS: Array<{ name: string; cmd: string }> = [
  { name: "new-primary-source", cmd: "npm run verify:new-primary-source" },
  { name: "headline", cmd: "npm run verify:headline" },
  { name: "kpis", cmd: "npm run verify:kpis" },
  { name: "calc", cmd: "npm run verify:calc" },
  { name: "ongoing", cmd: "npm run verify:ongoing" },
  { name: "expired", cmd: "npm run verify:expired" },
  { name: "valuation", cmd: "npm run verify:valuation" },
  { name: "explorer", cmd: "npm run verify:explorer" },
  { name: "exports", cmd: "npm run verify:exports" },
  { name: "obs-due", cmd: "npx tsx scripts/verify-observation-due-filters.ts" },
  { name: "edge-cases", cmd: "npm run verify:edge-cases" },
  { name: "full", cmd: "npm run verify:full" },
];

function main() {
  const failures: string[] = [];

  for (const step of STEPS) {
    process.stdout.write(`\n▶ ${step.name}…\n`);
    const result = spawnSync(step.cmd, {
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      failures.push(step.name);
    }
  }

  console.log("\n=== verify-desk summary ===");
  if (failures.length) {
    console.error(`FAILED steps: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log(`PASSED all ${STEPS.length} steps`);
}

main();
