/**
 * Full-book verify: payoff scenario XIRR tenor + IRR chain for ALL ongoing + expired products.
 * Usage: npx tsx scripts/verify-payoff-xirr-tenor.ts
 */
import { differenceInCalendarDays } from "date-fns";

import {
  getAllotmentToLastObservationDays,
  getPhasePayoffTenorDays,
  getProductExpirationDate,
  getProductFinalObservationDate,
  getRolloverTenorDays,
  getWorkingAllotmentDate,
  isTenYearRolloverProduct,
} from "../lib/product-dates";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { parseNumericField, rawField } from "../lib/product-utils";
import {
  buildPayoffScenarioTable,
  payoffInputsFromDesk,
  resolvePayoffScenarioTenorDays,
} from "../lib/workbook/payoff-scenarios";
import { irrFromReturn } from "../lib/workbook/irr";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

/** Independent mirror of resolvePayoffScenarioTenorDays — catches resolver drift. */
function expectedPayoffTenorDays(
  product: Parameters<typeof resolvePayoffScenarioTenorDays>[0],
  context: { asOf?: Date; expired?: boolean } = {},
): number {
  const asOf = context.asOf ?? new Date();

  const phaseTenor = getPhasePayoffTenorDays(product);
  if (phaseTenor != null && phaseTenor >= 30) return phaseTenor;

  const fromMaster =
    parseNumericField(rawField(product, "Payoff Tenor(Days)", "Payoff Tenor (Days)", "Payoff Tenor")) ??
    undefined;
  if (fromMaster && fromMaster >= 30) return fromMaster;

  const start = getWorkingAllotmentDate(product, asOf);
  const end = getProductExpirationDate(product) ?? getProductFinalObservationDate(product);
  if (start && end) {
    const span = differenceInCalendarDays(end, start);
    if (span >= 30) return span;
  }

  if (product.tenorDays && product.tenorDays >= 30) return product.tenorDays;

  return getAllotmentToLastObservationDays(product, asOf);
}

function main() {
  const asOf = new Date();
  const products = filterValidMasterProducts(loadSeedProducts(), asOf).filter((p) => p.formulaText?.trim());
  const ongoing = filterProductsByLifecycle(products, "ongoing", asOf);
  const expired = filterProductsByLifecycle(products, "expired", asOf);

  let ongoingTenorOk = 0;
  let ongoingTenorTotal = 0;
  let ongoing10YOk = 0;
  let ongoing10YTotal = 0;
  let expiredElapsedOk = 0;
  let expiredElapsedTotal = 0;
  let expiredNotFullTenorOk = 0;
  let expiredNotFullTenorTotal = 0;
  let ongoingRolloverNotMaturityOk = 0;
  let ongoingRolloverNotMaturityTotal = 0;
  let irrChainOk = 0;
  let irrChainTotal = 0;
  const fails: string[] = [];

  for (const p of ongoing) {
    ongoingTenorTotal += 1;
    const tenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: false });
    const expected = expectedPayoffTenorDays(p, { asOf, expired: false });

    if (Math.abs(tenor - expected) <= 2) ongoingTenorOk += 1;
    else if (fails.length < 5) fails.push(`ongoing ${p.isin}: tenor=${tenor} expected=${expected}`);

    if (isTenYearRolloverProduct(p)) {
      ongoing10YTotal += 1;
      const rollover = getRolloverTenorDays(p);
      if (rollover != null && Math.abs(tenor - rollover) <= 2) ongoing10YOk += 1;
      else if (fails.length < 8) fails.push(`ongoing 10Y ${p.isin}: tenor=${tenor} rollover=${rollover}`);

      if (p.tenorDays && p.tenorDays > tenor + 100) {
        ongoingRolloverNotMaturityTotal += 1;
        if (tenor < p.tenorDays - 100) ongoingRolloverNotMaturityOk += 1;
        else if (fails.length < 10) {
          fails.push(`10Y still on full maturity ${p.isin}: tenor=${tenor} product.tenorDays=${p.tenorDays}`);
        }
      }
    }
  }

  for (const p of expired) {
    expiredElapsedTotal += 1;
    const tenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: true });
    const expected = expectedPayoffTenorDays(p, { asOf, expired: true });
    const phase = getPhasePayoffTenorDays(p);

    if (phase != null && Math.abs(tenor - phase) <= 2 && Math.abs(tenor - expected) <= 2) {
      expiredElapsedOk += 1;
    } else if (fails.length < 12) {
      fails.push(`expired ${p.isin}: tenor=${tenor} phase=${phase} expected=${expected}`);
    }

    if (p.tenorDays && phase != null && Math.abs(p.tenorDays - phase) > 30) {
      expiredNotFullTenorTotal += 1;
      if (Math.abs(tenor - phase) <= 2 && Math.abs(tenor - p.tenorDays) > 30) {
        expiredNotFullTenorOk += 1;
      } else if (fails.length < 15) {
        fails.push(`expired bug ${p.isin}: tenor=${tenor} phase=${phase} product.tenorDays=${p.tenorDays}`);
      }
    }
  }

  for (const p of [...ongoing, ...expired]) {
    const expiredFlag = expired.some((e) => e.rowId === p.rowId);
    const inputs = payoffInputsFromDesk(p, { expired: expiredFlag, asOf });
    const tenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: expiredFlag });
    const rows = buildPayoffScenarioTable(p, inputs);

    for (const row of rows) {
      irrChainTotal += 1;
      const recomputed = irrFromReturn(row.maturityValue, tenor);
      if (Math.abs(recomputed - row.irr) < 1e-9) {
        irrChainOk += 1;
      } else if (fails.length < 20) {
        fails.push(`irr ${p.isin} perf=${row.performance}: table=${row.irr} vs ${recomputed}`);
      }
    }
  }

  const nwfl = products.find((p) => p.isin === "INE918K07QD1");
  let nwflOk = true;
  let nwflIrr = 0;
  let nwflTenor = 0;
  if (nwfl) {
    nwflTenor = resolvePayoffScenarioTenorDays(nwfl, { asOf, expired: false });
    const rows = buildPayoffScenarioTable(
      nwfl,
      payoffInputsFromDesk(nwfl, { valuationDate: "12-07-2026", expired: false }),
    );
    const fc = rows.find((r) => r.maturityValue > 0.5);
    nwflIrr = fc?.irr ?? 0;
    nwflOk = Boolean(fc && fc.irr > 0.12 && fc.irr < 0.16 && nwflTenor < 2000);
    if (nwflTenor > 2000 && fails.length < 22) fails.push(`NWFL tenor still maturity-scale: ${nwflTenor}`);
  }

  console.log("=== Payoff XIRR full-book verify ===");
  console.log(`Book: ${ongoing.length} ongoing · ${expired.length} expired · ${products.length} with formulas`);
  console.log(`\n--- Tenor resolution ---`);
  console.log(`Ongoing tenor (all ${ongoingTenorTotal}): ${ongoingTenorOk}/${ongoingTenorTotal}`);
  console.log(`Ongoing 10 Years phase → rollover C/P: ${ongoing10YOk}/${ongoing10YTotal}`);
  console.log(`Expired → phase tenure (Working!F→schedule end): ${expiredElapsedOk}/${expiredElapsedTotal}`);
  console.log(`\n--- Anti-regression (old bug patterns) ---`);
  console.log(`10Y not using full maturity tenor: ${ongoingRolloverNotMaturityOk}/${ongoingRolloverNotMaturityTotal}`);
  console.log(`Expired not using product.tenorDays when phase differs: ${expiredNotFullTenorOk}/${expiredNotFullTenorTotal}`);
  console.log(`\n--- IRR chain (every scenario row, full book) ---`);
  console.log(`Rows verified: ${irrChainOk}/${irrChainTotal}`);
  console.log(`\n--- NWFL reference (INE918K07QD1) ---`);
  console.log(`Full-coupon XIRR: ${(nwflIrr * 100).toFixed(2)}% · tenor ${nwflTenor} days · ${nwflOk ? "OK" : "FAIL"}`);

  if (fails.length) console.log(`\nSamples (${fails.length}): ${fails.join("; ")}`);

  const pass =
    ongoingTenorOk === ongoingTenorTotal &&
    ongoing10YOk === ongoing10YTotal &&
    expiredElapsedOk === expiredElapsedTotal &&
    ongoingRolloverNotMaturityOk === ongoingRolloverNotMaturityTotal &&
    expiredNotFullTenorOk === expiredNotFullTenorTotal &&
    irrChainOk === irrChainTotal &&
    nwflOk;

  console.log(`\n=== ${pass ? "PASS" : "FAIL"} ===`);
  process.exit(pass ? 0 : 1);
}

main();
