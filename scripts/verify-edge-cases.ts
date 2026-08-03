/**
 * Scan desk-canonical products (NEW PRIMARY seed) for missing fields / NaN — edge-case report.
 * Usage: npm run verify:edge-cases
 * Writes: docs/edge-case-audit.md
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { filterProductsByLifecycle } from "../lib/product-lifecycle";
import { assessProductData } from "../lib/product-data-guards";
import { parseExcelishDate } from "../lib/workbook/dates";
import { loadCanonicalProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = join(ROOT, "docs", "edge-case-audit.md");
const AS_OF = parseExcelishDate("31-May-26") ?? new Date(2026, 4, 31);

function main() {
  warnIfWorkbookDriftsFromSeed(AS_OF);
  const valid = loadCanonicalProducts(AS_OF);
  const ongoing = filterProductsByLifecycle(valid, "ongoing", AS_OF);
  const expired = filterProductsByLifecycle(valid, "expired", AS_OF);

  let noFormula = 0;
  let noEntry = 0;
  let noObs = 0;
  let noDesc = 0;
  let canValue = 0;

  const samples: string[] = [];

  for (const product of valid) {
    const a = assessProductData(product);
    if (a.missingFormula) noFormula += 1;
    if (a.missingEntryLevel) noEntry += 1;
    if (a.missingObsSchedule) noObs += 1;
    if (a.missingDescription) noDesc += 1;
    if (a.canValue) canValue += 1;
    if (a.blockers.length && samples.length < 15) {
      samples.push(`| ${product.isin ?? "—"} | ${product.name.replace(/\|/g, " ")} | ${a.blockers.join("; ")} |`);
    }
  }

  const lines = [
    "# Master edge-case audit",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Valid desk products (NEW PRIMARY) | ${valid.length} |`,
    `| Ongoing | ${ongoing.length} |`,
    `| Expired | ${expired.length} |`,
    `| Can value / payoff | ${canValue} |`,
    `| Missing formula | ${noFormula} |`,
    `| Missing entry level | ${noEntry} |`,
    `| Missing obs schedule | ${noObs} |`,
    `| Missing description | ${noDesc} |`,
    "",
    "## Sample blockers",
    "",
    "| ISIN | Product | Blocker |",
    "| --- | --- | --- |",
    ...samples,
    "",
    "## App handling",
    "",
    "- Missing formula or entry → output blocker + desk popup; selection resets to tab default",
    "- Missing obs schedule → warning popup on output reveal; index from Yahoo/Mongo",
    "- Missing maturity → warning popup on output reveal; engine uses expiry / final obs / tenor fallback",
    "- Invalid debenture count → desk popup; count resets to product default (engine floors to ≥ 1)",
    "- NaN cells → null in DB, **—** in UI",
    "",
  ];

  writeFileSync(REPORT, lines.join("\n"), "utf8");
  console.log(`Valid: ${valid.length} · Can value: ${canValue} · Missing formula: ${noFormula}`);
  console.log(`Report: ${REPORT}`);
}

main();
