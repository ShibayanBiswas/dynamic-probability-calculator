/**
 * Proves valuation/payoff are driven by master row data (formula text), not hardcoded products.
 * Run: npx tsx scripts/verify-dynamic-master.ts
 */
import { computeValuation } from "../lib/workbook/valuation-engine";
import { evaluatePayoffFormula } from "../lib/workbook/formula-engine";
import { buildEnhancedPayoffScenarioTable } from "../lib/workbook/payoff-pivots";
import type { ProductRecord } from "../lib/types";

/** Synthetic row — simulates a newly added master line with a custom formula. */
function syntheticProduct(formulaText: string): ProductRecord {
  return {
    category: "Primary",
    rowId: "dynamic-test-1",
    name: "Dynamic Test Product",
    isin: "DYNAMIC0001",
    series: "TEST/01",
    issuer: "Test Issuer",
    underlying: "Nifty",
    tradeAmount: 10_000_000,
    pricePerDebenture: 100_000,
    couponPercent: 0.5,
    formulaText,
    productExplanation: "Synthetic row for dynamic-master verification.",
    raw: {
      "Actual Entry Level": "10000",
      "Allotment Date": "01-01-2024",
      "Last Observation Date": "01-01-2027",
      "Trade Amount": "10000000",
    },
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

const formula = "IF(Z>=10%,25%,MAX(-100%,Z*2))";
const product = syntheticProduct(formula);

const atZ = evaluatePayoffFormula(formula, 0.15);
assert(Math.abs(atZ - 0.25) < 1e-6, `formula at Z=15% expected 25%, got ${atZ}`);

const valuation = computeValuation(product, {
  valuationDate: "31-05-2026",
  currentLevel: 11_500,
  debentures: 100,
});

assert(valuation.productValue > 0, "valuation productValue should be positive");
assert(Number.isFinite(valuation.formulaReturn), "formulaReturn should be finite");
assert(Number.isFinite(valuation.productIrr), "productIRR should be finite");

const scenarios = buildEnhancedPayoffScenarioTable(
  product,
  { debentures: 100, pricePerDebenture: 100_000, remainingTenorDays: 365 },
  0.15,
);
assert(scenarios.length > 0, "payoff scenario table should build");

console.log("PASS — dynamic master pipeline");
console.log(`  Formula: ${formula}`);
console.log(`  Payoff @ Z=15%: ${(atZ * 100).toFixed(1)}%`);
console.log(`  Valuation mark: ₹${Math.round(valuation.productValue).toLocaleString("en-IN")}`);
console.log(`  Scenarios: ${scenarios.length} rows`);
