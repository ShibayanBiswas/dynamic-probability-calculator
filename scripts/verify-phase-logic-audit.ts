/**
 * Strict phase-by-phase audit: Working!F, schedule end, payoff XIRR tenor,
 * and full payoff scenario table generation for Blank / Phase 1 / Phase 2 / 10Y.
 *
 * Usage: npx tsx scripts/verify-phase-logic-audit.ts
 */
import { differenceInCalendarDays } from "date-fns";

import {
  getPhasePayoffTenorDays,
  getPhaseScheduleEndDate,
  getProductAllotmentDate,
  getProductFinalObservationDate,
  getProductMaturityDate,
  getProductPoedDate,
  getProductRolloverScheduleDate,
  getProductTradeOpeningDate,
  getRolloverPhaseKind,
  getWorkingAllotmentDate,
  resolveWorkingMaturityDate,
  type RolloverPhaseKind,
} from "../lib/product-dates";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import {
  buildPayoffScenarioTable,
  PAYOFF_SCENARIO_OFFSETS,
  payoffInputsFromDesk,
  resolvePayoffScenarioTenorDays,
} from "../lib/workbook/payoff-scenarios";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { resolveLiveIndexLevel, getIndexEntryLevel } from "../lib/product-utils";
import { formatDeskDate } from "../lib/market-data";
import { loadSeedProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";

function assert(cond: boolean, msg: string, fails: string[]) {
  if (!cond) fails.push(msg);
}

function expectedTenorEnd(product: Parameters<typeof getRolloverPhaseKind>[0]): Date | undefined {
  return getPhaseScheduleEndDate(product);
}

function main() {
  warnIfWorkbookDriftsFromSeed();
  const asOf = new Date();
  const all = filterValidMasterProducts(loadSeedProducts(), asOf);
  const withFormula = all.filter((p) => p.formulaText?.trim());
  const ongoing = filterProductsByLifecycle(withFormula, "ongoing", asOf);
  const expired = filterProductsByLifecycle(withFormula, "expired", asOf);

  const fails: string[] = [];
  const byKind: Record<RolloverPhaseKind, number> = {
    blank: 0,
    phase1: 0,
    phase2: 0,
    tenYear: 0,
  };

  let workingOk = 0;
  let scheduleOk = 0;
  let tenorOk = 0;
  let workingHOk = 0;
  let scenarioOk = 0;
  let ongoingMarkOk = 0;
  let expiredMarkOk = 0;

  const nifty = lookupBundledNiftyOnOrBefore(asOf) ?? 0;
  const sensex = lookupBundledSensexOnOrBefore(asOf) ?? 0;

  for (const p of all) {
    const kind = getRolloverPhaseKind(p);
    byKind[kind] += 1;

    const trade = getProductTradeOpeningDate(p);
    const allotment = getProductAllotmentDate(p);
    const working = getWorkingAllotmentDate(p, asOf);
    const scheduleEnd = getPhaseScheduleEndDate(p);
    const phaseTenor = getPhasePayoffTenorDays(p);
    const payoffTenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: false });
    const tenorEnd = expectedTenorEnd(p);

    // Working!F
    if (kind === "phase2") {
      if (trade && working?.getTime() === trade.getTime()) workingOk += 1;
      else assert(false, `Working!F P2 ${p.isin}`, fails);
    } else {
      const expect = allotment ?? trade;
      if (!expect || working?.getTime() === expect.getTime()) workingOk += 1;
      else assert(false, `Working!F ${kind} ${p.isin}`, fails);
    }

    // Schedule end (lifecycle / ladder)
    const expectSchedule =
      kind === "phase1"
        ? (() => {
            const poed = getProductPoedDate(p);
            const lastObs = getProductFinalObservationDate(p);
            if (poed && (!lastObs || poed.getTime() >= lastObs.getTime())) return poed;
            return getProductMaturityDate(p);
          })()
        : kind === "tenYear"
          ? getProductRolloverScheduleDate(p) ?? getProductMaturityDate(p)
          : getProductMaturityDate(p);
    if (expectSchedule && scheduleEnd?.getTime() === expectSchedule.getTime()) scheduleOk += 1;
    else if (!expectSchedule) scheduleOk += 1;
    else assert(false, `schedule ${kind} ${p.isin}`, fails);

    // Live Working!H must equal phase schedule end (Product IRR + V growth tenure)
    const workingH = resolveWorkingMaturityDate(p, asOf);
    if (scheduleEnd && workingH.getTime() === scheduleEnd.getTime()) workingHOk += 1;
    else if (!scheduleEnd) workingHOk += 1;
    else assert(false, `Working!H ${kind} ${p.isin}`, fails);

    // Payoff XIRR tenor = Working!F → phase schedule end
    const tenorStart = working;
    if (tenorStart && tenorEnd) {
      const expectDays = differenceInCalendarDays(tenorEnd, tenorStart);
      if (expectDays >= 30) {
        if (phaseTenor != null && Math.abs(phaseTenor - expectDays) <= 2) tenorOk += 1;
        else assert(false, `tenor ${kind} ${p.isin}: got=${phaseTenor} expect=${expectDays}`, fails);
        if (Math.abs(payoffTenor - expectDays) <= 2) {
          /* ok — counted via phaseTenor */
        } else assert(false, `payoffTenor ${kind} ${p.isin}: got=${payoffTenor} expect=${expectDays}`, fails);
      } else {
        tenorOk += 1;
      }
    } else {
      tenorOk += 1;
    }
  }

  const expiredIds = new Set(expired.map((p) => p.rowId));

  // Payoff scenario tables — every formula product, 18 rows, finite XIRR
  for (const p of withFormula) {
    const isExpired = expiredIds.has(p.rowId);
    const inputs = payoffInputsFromDesk(p, { asOf, expired: isExpired, debentures: 1 });
    const rows = buildPayoffScenarioTable(p, inputs);
    const ok =
      rows.length === PAYOFF_SCENARIO_OFFSETS.length &&
      rows.every(
        (r) =>
          Number.isFinite(r.finalFixing) &&
          Number.isFinite(r.maturityValue) &&
          Number.isFinite(r.irr) &&
          Number.isFinite(r.returnOnInvestment),
      );
    if (ok) scenarioOk += 1;
    else assert(false, `scenarios ${p.isin}`, fails);
  }

  // Ongoing marks @ today
  for (const p of ongoing) {
    const level = resolveLiveIndexLevel(p, { niftyLevel: nifty, sensexLevel: sensex }) || getIndexEntryLevel(p);
    const v = computeValuation(p, {
      valuationDate: formatDeskDate(asOf),
      currentLevel: level,
      debentures: 1,
    });
    if (
      Number.isFinite(v.productValue) &&
      Number.isFinite(v.absReturn) &&
      Number.isFinite(v.productIrr) &&
      Number.isFinite(v.formulaReturn)
    ) {
      ongoingMarkOk += 1;
    } else assert(false, `ongoing mark ${p.isin}`, fails);
  }

  // Expired marks @ final obs (entry level proxy when no hist)
  for (const p of expired) {
    const lastObs = getProductFinalObservationDate(p);
    if (!lastObs) {
      expiredMarkOk += 1;
      continue;
    }
    const level = getIndexEntryLevel(p);
    const v = computeValuation(p, {
      valuationDate: formatDeskDate(lastObs),
      currentLevel: level,
      debentures: 1,
    });
    if (
      Number.isFinite(v.productValue) &&
      Number.isFinite(v.absReturn) &&
      Number.isFinite(v.productIrr)
    ) {
      expiredMarkOk += 1;
    } else assert(false, `expired mark ${p.isin}`, fails);
  }

  console.log("=== PHASE LOGIC + PAYOFF + VALUATION AUDIT ===");
  console.log("As of:", formatDeskDate(asOf));
  console.log("Counts:", { total: all.length, withFormula: withFormula.length, ongoing: ongoing.length, expired: expired.length, ...byKind });
  console.log(`Working!F: ${workingOk}/${all.length}`);
  console.log(`Schedule end: ${scheduleOk}/${all.length}`);
  console.log(`Working!H (= phase end): ${workingHOk}/${all.length}`);
  console.log(`Payoff XIRR tenor (Allotment→phase end): ${tenorOk}/${all.length}`);
  console.log(`Payoff scenario tables: ${scenarioOk}/${withFormula.length} (×${PAYOFF_SCENARIO_OFFSETS.length} rows)`);
  console.log(`Ongoing marks: ${ongoingMarkOk}/${ongoing.length}`);
  console.log(`Expired marks @ last obs: ${expiredMarkOk}/${expired.length}`);
  if (fails.length) {
    console.log("FAILS:", fails.slice(0, 25));
    console.log(`=== FAIL (${fails.length} issues) ===`);
    process.exitCode = 1;
    return;
  }
  console.log("=== PASS ===");
}

main();
