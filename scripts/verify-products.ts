/** Verify desk canonical product counts (NEW PRIMARY → seed) match manifest. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DESK_PRODUCT_SOURCE_SHEET } from "../lib/master-source";
import { EXPECTED_PRODUCT_COUNTS } from "../lib/workbook/expected-counts";
import { parseWorkbookBuffer } from "../lib/workbook/parser";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKBOOK = join(ROOT, "New Product Master_.xlsx");

const file = readFileSync(WORKBOOK);
const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
const dataset = parseWorkbookBuffer(arrayBuffer, "New Product Master_.xlsx");

const report = Object.entries(EXPECTED_PRODUCT_COUNTS).map(([category, expected]) => {
  const pool = dataset.products.filter((p) => p.category === category);
  const formulas = pool.filter((p) => p.formulaText).length;
  return {
    category,
    parsed: pool.length,
    expected: expected.products,
    formulas,
    expectedFormulas: expected.formulas,
    match: pool.length === expected.products && formulas === expected.formulas,
  };
});

const failed = report.filter((r) => !r.match);
if (failed.length) {
  console.error("VERIFICATION FAILED");
  console.error(JSON.stringify(failed, null, 2));
  process.exit(1);
}

console.log(`VERIFICATION OK — desk book from ${DESK_PRODUCT_SOURCE_SHEET} matches manifest`);
console.log(JSON.stringify(report, null, 2));
console.log(`Total indexed: ${dataset.products.length}`);
