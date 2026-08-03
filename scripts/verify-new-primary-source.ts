/**
 * Ensures the desk product book always comes from NEW PRIMARY (merge or tab).
 * Usage: npx tsx scripts/verify-new-primary-source.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CANONICAL_MANIFEST } from "../lib/canonical-manifest";
import { datasetHasNewPrimaryProvenance, deskBookBlockingError } from "../lib/desk-book-validation";
import { DESK_PRODUCT_SOURCE_SHEET } from "../lib/master-source";
import { parseWorkbookBuffer } from "../lib/workbook/parser";
import { loadCanonicalProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

const WORKBOOK = join(process.cwd(), "New Product Master_.xlsx");

warnIfWorkbookDriftsFromSeed();
const seedProducts = loadCanonicalProducts(new Date());
const expected = CANONICAL_MANIFEST.deskCanonicalProducts;

console.log(`Desk canonical (seed): ${seedProducts.length} products (manifest ${expected})`);

if (seedProducts.length !== expected) {
  console.error(`Seed product count ${seedProducts.length} !== manifest ${expected} — run: npm run bake`);
  process.exit(1);
}

if (!existsSync(WORKBOOK)) {
  console.warn("Workbook not on disk — seed/manifest check only.");
  console.log("\nNEW PRIMARY source check OK (seed only).");
  process.exit(0);
}

const file = readFileSync(WORKBOOK);
const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
const parsed = parseWorkbookBuffer(buf, "New Product Master_.xlsx");

const blocking = deskBookBlockingError(parsed);
if (blocking) {
  console.error(blocking);
  process.exit(1);
}

if (parsed.products.length !== expected) {
  console.error(
    `Parser from xlsx: ${parsed.products.length} products ≠ manifest ${expected}. Rebuild NEW PRIMARY: npm run bake`,
  );
  process.exit(1);
}

if (!datasetHasNewPrimaryProvenance(parsed)) {
  console.error(`Parser did not report ${DESK_PRODUCT_SOURCE_SHEET} pipeline as product source.`);
  process.exit(1);
}

const mergeInfo = parsed.validationIssues.find((issue) => issue.message.includes("Primary + Rollover merge"));
const sourceLabel = mergeInfo ? "Primary + Rollover merge (NEW PRIMARY pipeline)" : `${DESK_PRODUCT_SOURCE_SHEET} tab`;

console.log(`Parser from xlsx: ${parsed.products.length} desk products via ${sourceLabel}`);
console.log(`Explorer NEW PRIMARY rows (manifest): ${CANONICAL_MANIFEST.merge.totalRows}`);
console.log("\nNEW PRIMARY source check OK.");
