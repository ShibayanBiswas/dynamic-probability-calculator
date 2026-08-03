/**
 * Smoke-test data-quality guard helpers against the canonical book.
 * Usage: npx tsx scripts/verify-data-quality-guards.ts
 */
import { parseExcelishDate } from "../lib/workbook/dates";
import {
  assessProductData,
  getOutputRevealWarningAlerts,
  getProductSelectBlockerAlert,
  isHardBlockedProduct,
} from "../lib/product-data-guards";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";

const AS_OF = parseExcelishDate("31-May-26") ?? new Date(2026, 4, 31);

function main() {
  const products = loadCanonicalProducts(AS_OF);
  let hardBlocked = 0;
  let missingFormula = 0;
  let missingEntry = 0;
  let missingObs = 0;
  let missingMaturity = 0;

  for (const product of products) {
    const assessment = assessProductData(product);
    if (isHardBlockedProduct(product)) hardBlocked += 1;
    if (assessment.missingFormula) missingFormula += 1;
    if (assessment.missingEntryLevel) missingEntry += 1;
    if (assessment.missingObsSchedule) missingObs += 1;
    if (assessment.missingMaturityAnchor) missingMaturity += 1;

    if (assessment.missingFormula) {
      const alert = getProductSelectBlockerAlert(product);
      if (!alert || alert.variant !== "error") {
        throw new Error(`Expected formula blocker alert for ${product.isin ?? product.name}`);
      }
    }
  }

  const sample = products.find((p) => assessProductData(p).canValue);
  if (!sample) throw new Error("No computable sample product");
  const warnings = getOutputRevealWarningAlerts(sample);
  if (!Array.isArray(warnings)) throw new Error("Expected warning alert array");

  console.log("Data-quality guards OK");
  console.log(
    `Book ${products.length} · hard-blocked ${hardBlocked} · formula ${missingFormula} · entry ${missingEntry} · obs ${missingObs} · maturity ${missingMaturity}`,
  );
}

main();
