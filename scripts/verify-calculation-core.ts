/**
 * Core calculation unit checks — serial math, IRR, formula engine, valuation smoke.
 * Usage: npm run verify:calc
 */
import { computeValuation } from "../lib/workbook/valuation-engine";
import { evaluatePayoffFormula, tryEvaluatePayoffFormula } from "../lib/workbook/formula-engine";
import {
  computeWorkingFinalValuation,
  workingColumnT,
  workingColumnY,
  xirrEntryToCurrent,
} from "../lib/workbook/valuation-serial";
import { computeUnderlyingPerformance } from "../lib/workbook/valuation-performance";
import { irrFromReturn, annualizedIrr } from "../lib/workbook/irr";
import { getCouponPercent, parseCouponString } from "../lib/product-utils";
import type { ProductRecord } from "../lib/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

function approx(actual: number, expected: number, tol: number, label: string) {
  assert(Math.abs(actual - expected) <= tol, `${label}: expected ${expected}, got ${actual}`);
}

// ── Serial / IRR primitives ────────────────────────────────────────────────
approx(xirrEntryToCurrent(10_000, 11_000, 365), 0.1, 1e-9, "xirrEntryToCurrent 10% over 1Y");
approx(workingColumnT(0.5, 730), Math.pow(1.5, 365 / 730) - 1, 1e-9, "workingColumnT");
approx(workingColumnY(110_000, 100_000, 365), Math.pow(1.1, 365 / 365) - 1, 1e-9, "workingColumnY");

const postObsVal = computeWorkingFinalValuation(100_000, 0.2, {
  allotment: 45_000,
  valuation: 46_000,
  maturity: 47_000,
  observation: 46_100,
});
assert(postObsVal > 100_000, "post-observation branch compounds with T");

const preObsVal = computeWorkingFinalValuation(100_000, 0.2, {
  allotment: 45_000,
  valuation: 46_000,
  maturity: 47_000,
  observation: 45_900,
});
assert(preObsVal > 0 && Number.isFinite(preObsVal), "pre-observation discount branch is finite");

approx(computeUnderlyingPerformance(10_000, 10_500, 10_200), 0.02, 1e-9, "underlying performance from expected level");
approx(computeUnderlyingPerformance(10_000, 10_500, "NA"), 0.05, 1e-9, "NA path uses current/entry");

// ── Formula engine ─────────────────────────────────────────────────────────
const magnifier = "IF(Z>=21%,(Z-21%)*2133.33%+100%,100%)";
approx(evaluatePayoffFormula(magnifier, 0.25), (0.25 - 0.21) * 21.3333 + 1, 1e-4, "Magnifier @ 25%");
approx(evaluatePayoffFormula(magnifier, 0.1), 1, 1e-9, "Magnifier floor @ 10%");

const andFormula = "IF(AND(Z>=0%,Z<=10%),50%,0%)";
const andProbe = tryEvaluatePayoffFormula(andFormula, 0.05);
assert(andProbe.ok, `AND formula compile: ${andProbe.ok ? "" : andProbe.error}`);
if (andProbe.ok) approx(andProbe.value, 0.5, 1e-9, "AND formula @ 5%");

approx(irrFromReturn(0.25, 365), Math.pow(1.25, 365 / 365) - 1, 1e-9, "irrFromReturn 1Y");
assert(annualizedIrr(1.25, 10) === 0, "annualizedIrr rejects tenor < 30 days");

// Dual-coupon master strings — CC1 is headline; never parse the "1" inside "CC1".
approx(parseCouponString("CC1: 60%, CC2: 30%") ?? -1, 0.6, 1e-12, "parseCouponString CC1:60%");
approx(parseCouponString("49.0%") ?? -1, 0.49, 1e-12, "parseCouponString 49%");
approx(parseCouponString("150% PR") ?? -1, 1.5, 1e-12, "parseCouponString 150% PR");
assert(parseCouponString("N/A") === undefined, "parseCouponString N/A");
approx(
  getCouponPercent({
    category: "Primary",
    rowId: "cc1-parse",
    name: "CC1 parse",
    couponPercent: 0.01, // baked poison from old CC1 digit grab
    raw: { "Coupon (%)": "CC1: 60%, CC2: 30%" },
  } as ProductRecord) ?? -1,
  0.6,
  1e-12,
  "getCouponPercent prefers CC1 raw over bad typed 1%",
);

// ── End-to-end valuation smoke ─────────────────────────────────────────────
const product: ProductRecord = {
  category: "Primary",
  rowId: "calc-core-1",
  name: "Calc Core Test",
  isin: "CALCCORE01",
  underlying: "Nifty",
  tradeAmount: 10_000_000,
  pricePerDebenture: 100_000,
  formulaText: "IF(Z>=10%,25%,MAX(-100%,Z*2))",
  productExplanation: "Synthetic",
  raw: {
    "Actual Entry Level": "10000",
    "Allotment Date": "01-01-2024",
    "Last Observation Date": "01-01-2027",
  },
};

const val = computeValuation(product, {
  valuationDate: "08-07-2026",
  currentLevel: 11_500,
  debentures: 100,
});
assert(val.productValue >= val.clientInvestment, "valuation floors at client investment");
assert(val.totalAmount === val.productValue * 100, "total amount = per-unit × debentures");
assert(Number.isFinite(val.productIrr), "product IRR is finite");

console.log("PASS — core calculation suite");
console.log(`  Magnifier payoff @ 25%: ${(evaluatePayoffFormula(magnifier, 0.25) * 100).toFixed(2)}%`);
console.log(`  Valuation mark: ₹${val.productValue.toLocaleString("en-IN")}`);
console.log(`  Product IRR: ${(val.productIrr * 100).toFixed(2)}%`);
