/**
 * Full-book: every formula product's enhanced payoff table includes
 * Initial Level (Z=0) and Target Level (when master has a distinct target).
 */
import { getIndexEntryLevel, getTargetLevel } from "../lib/product-utils";
import { filterValidMasterProducts } from "../lib/product-lifecycle";
import {
  buildEnhancedPayoffScenarioTable,
  getTargetLevelPerformance,
} from "../lib/workbook/payoff-pivots";
import { payoffInputsFromDesk } from "../lib/workbook/payoff-scenarios";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";

const asOf = new Date();
const products = filterValidMasterProducts(loadCanonicalProducts(asOf), asOf).filter((p) =>
  Boolean(p.formulaText?.trim()),
);

let missingInitial = 0;
let missingTarget = 0;
let withDistinctTarget = 0;
let targetEqualsInitial = 0;
let noTargetOnMaster = 0;
const fails: string[] = [];

for (const product of products) {
  const entry = getIndexEntryLevel(product);
  const target = getTargetLevel(product);
  const rows = buildEnhancedPayoffScenarioTable(product, payoffInputsFromDesk(product, { asOf }));

  const initialRow = rows.find((r) => r.isInitialLevel || Math.abs(r.performance) < 1e-9);
  if (!initialRow) {
    missingInitial += 1;
    if (fails.length < 20) fails.push(`${product.isin}: missing Initial Level row`);
    continue;
  }
  if (entry > 0 && Math.abs(initialRow.finalFixing - entry) > 0.51) {
    missingInitial += 1;
    if (fails.length < 20) {
      fails.push(
        `${product.isin}: Initial row fixing ${initialRow.finalFixing} != entry ${entry}`,
      );
    }
  }

  const targetPerf = getTargetLevelPerformance(product);
  if (targetPerf == null) {
    if (target != null && target > 0 && entry > 0 && Math.abs(target - entry) < 1e-6) {
      targetEqualsInitial += 1;
    } else {
      noTargetOnMaster += 1;
    }
    continue;
  }

  withDistinctTarget += 1;
  const targetRow = rows.find(
    (r) =>
      r.isTargetLevel ||
      Math.abs(r.performance - targetPerf) < 0.0005 ||
      (target != null && Math.abs(r.finalFixing - target) < 0.51),
  );
  if (!targetRow) {
    missingTarget += 1;
    if (fails.length < 20) {
      fails.push(
        `${product.isin}: missing Target Level row (entry=${entry} target=${target} z=${(targetPerf * 100).toFixed(2)}%)`,
      );
    }
  }
}

console.log("=== Payoff Initial / Target scenario coverage ===");
console.log({
  formulaProducts: products.length,
  missingInitial,
  withDistinctTarget,
  missingTarget,
  targetEqualsInitial,
  noTargetOnMaster,
});

if (missingInitial > 0 || missingTarget > 0 || fails.length > 0) {
  console.error("FAIL");
  for (const f of fails) console.error(" -", f);
  process.exit(1);
}

console.log("PASS: Initial Level on all; Target Level on all products with a distinct master target");
