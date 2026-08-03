/**
 * Full-book audit: Rollover Phase date/tenor desk policy + Details lifecycle metrics.
 * Usage: npx tsx scripts/verify-rollover-phase-tenor.ts
 */
import { differenceInCalendarDays, startOfDay } from "date-fns";

import {
  computeUnderlyingIrrSincePhaseStart,
  getDaysLeftToMaturity,
  getElapsedDaysSinceWorkingAllotment,
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
  phasePerformanceStartLabel,
  type RolloverPhaseKind,
} from "../lib/product-dates";
import { getIndexEntryLevel } from "../lib/product-utils";
import {
  clampValuationDateToPhaseWindow,
  filterProductsByLifecycle,
  filterValidMasterProducts,
  getPhaseValuationDateBounds,
  getValuationDateApplicability,
  isValuationApplicableAt,
} from "../lib/product-lifecycle";
import { buildProductSpecCards, PRODUCT_SPECIFICATION_LABELS } from "../lib/product-specifications";
import { formatDeskDate } from "../lib/market-data";
import { resolvePayoffScenarioTenorDays } from "../lib/workbook/payoff-scenarios";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

function assert(condition: boolean, message: string, fails: string[]) {
  if (!condition) fails.push(message);
}

function expectedPayoffTenor(product: Parameters<typeof getPhasePayoffTenorDays>[0]): number | undefined {
  return getPhasePayoffTenorDays(product);
}

function main() {
  const asOf = new Date();
  const all = loadSeedProducts();
  const valid = filterValidMasterProducts(all, asOf);
  const ongoing = filterProductsByLifecycle(valid, "ongoing", asOf);
  const expired = filterProductsByLifecycle(valid, "expired", asOf);
  const fails: string[] = [];

  // Specs order / length
  for (const p of [ongoing[0], expired[0]].filter(Boolean)) {
    const cards = buildProductSpecCards(p!);
    assert(cards.length === PRODUCT_SPECIFICATION_LABELS.length, `specs length ${cards.length}`, fails);
    for (let i = 0; i < PRODUCT_SPECIFICATION_LABELS.length; i += 1) {
      assert(
        cards[i]?.label === PRODUCT_SPECIFICATION_LABELS[i],
        `specs order ${i}: ${cards[i]?.label} != ${PRODUCT_SPECIFICATION_LABELS[i]}`,
        fails,
      );
    }
  }

  const byKind: Record<RolloverPhaseKind, typeof valid> = {
    blank: [],
    phase1: [],
    phase2: [],
    tenYear: [],
  };
  for (const p of valid) byKind[getRolloverPhaseKind(p)].push(p);

  const counts = {
    blank: byKind.blank.length,
    phase1: byKind.phase1.length,
    phase2: byKind.phase2.length,
    tenYear: byKind.tenYear.length,
  };

  let workingOk = 0;
  let scheduleOk = 0;
  let payoffOk = 0;
  let preLaunchOk = 0;
  let lifecycleCardOk = 0;
  let totalChecked = 0;

  for (const p of valid) {
    totalChecked += 1;
    const kind = getRolloverPhaseKind(p);
    const allot = getProductAllotmentDate(p);
    const trade = getProductTradeOpeningDate(p);
    const mat = getProductMaturityDate(p);
    const poed = getProductPoedDate(p);
    const roll = getProductRolloverScheduleDate(p);
    const working = getWorkingAllotmentDate(p, asOf);
    const scheduleEnd = getPhaseScheduleEndDate(p);
    const payoffTenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: false });
    const expected = expectedPayoffTenor(p);

    // Working!F
    if (kind === "phase2") {
      if (trade && working?.getTime() === trade.getTime()) workingOk += 1;
      else if (fails.length < 40) fails.push(`P2 working ${p.isin}: got ${working} expected trade ${trade}`);
    } else {
      const expectStart = allot ?? trade;
      if (expectStart && working?.getTime() === expectStart.getTime()) workingOk += 1;
      else if (!expectStart) workingOk += 1;
      else if (fails.length < 40) fails.push(`${kind} working ${p.isin}: got ${working} expected ${expectStart}`);
    }

    // Schedule end
    if (kind === "phase1") {
      // POED if valid (>= last obs), else maturity
      const lastObs = getProductFinalObservationDate(p);
      const poedOk = poed && (!lastObs || poed.getTime() >= lastObs.getTime());
      const expectEnd = poedOk ? poed : mat;
      if (expectEnd && scheduleEnd?.getTime() === expectEnd.getTime()) scheduleOk += 1;
      else if (fails.length < 40) fails.push(`P1 schedule ${p.isin}`);
    } else if (kind === "tenYear") {
      const expectEnd = roll ?? mat;
      if (expectEnd && scheduleEnd?.getTime() === expectEnd.getTime()) scheduleOk += 1;
      else if (fails.length < 40) fails.push(`10Y schedule ${p.isin}`);
    } else {
      if (mat && scheduleEnd?.getTime() === mat.getTime()) scheduleOk += 1;
      else if (!mat) scheduleOk += 1;
      else if (fails.length < 40) fails.push(`${kind} schedule ${p.isin}`);
    }

    // Payoff tenor (ongoing resolver — not expired path)
    if (expected != null && Math.abs(payoffTenor - expected) <= 2) payoffOk += 1;
    else if (expected == null && payoffTenor >= 30) payoffOk += 1;
    else if (fails.length < 40) {
      fails.push(`${kind} payoff ${p.isin}: tenor=${payoffTenor} expected=${expected}`);
    }

    // Pre-launch: valuation before Working!F must be blocked; elapsed blank
    if (working) {
      const before = new Date(working.getTime() - 86400000);
      const beforeRaw = formatDeskDate(before);
      const blocked = !isValuationApplicableAt(p, beforeRaw);
      const elapsed = getElapsedDaysSinceWorkingAllotment(p, before);
      if (blocked && elapsed == null) preLaunchOk += 1;
      else if (fails.length < 40) {
        fails.push(`prelaunch ${p.isin}: blocked=${blocked} elapsed=${elapsed}`);
      }

      // At Working!F: applicable + elapsed 0 (same calendar day)
      const launchRaw = formatDeskDate(working);
      if (isValuationApplicableAt(p, launchRaw)) {
        const el = getElapsedDaysSinceWorkingAllotment(p, working);
        const daysLeft = getDaysLeftToMaturity(p, working);
        if (el === 0 && daysLeft != null) lifecycleCardOk += 1;
        else if (fails.length < 40) {
          fails.push(`lifecycle@launch ${p.isin}: el=${el} daysLeft=${daysLeft}`);
        }
      } else {
        // Rare: launch after schedule end
        lifecycleCardOk += 1;
      }
    } else {
      preLaunchOk += 1;
      lifecycleCardOk += 1;
    }
  }

  // Expired payoff tenor = Working!F → phase schedule end (same as ongoing)
  let expiredTenorOk = 0;
  for (const p of expired) {
    const tenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: true });
    const expected = getPhasePayoffTenorDays(p);
    if (expected == null) {
      expiredTenorOk += 1;
      continue;
    }
    if (Math.abs(tenor - expected) <= 2) expiredTenorOk += 1;
    else if (fails.length < 50) fails.push(`expired tenor ${p.isin}: ${tenor} vs ${expected}`);
  }

  // Calendar bounds for every phase kind — min = Working!F, max = min(today, schedule end)
  let boundsOk = 0;
  for (const p of valid) {
    const kind = getRolloverPhaseKind(p);
    const bounds = getPhaseValuationDateBounds(p, asOf);
    const working = getWorkingAllotmentDate(p, asOf);
    const scheduleEnd = getPhaseScheduleEndDate(p);
    if (working && bounds.minDate && bounds.minDate.getTime() === startOfDay(working).getTime()) {
      // ok
    } else if (!working && !bounds.minDate) {
      // ok
    } else {
      if (fails.length < 40) fails.push(`bounds min ${kind} ${p.isin}`);
      continue;
    }
    if (bounds.startFieldLabel !== (kind === "phase2" ? "Trade Date" : "Allotment Date")) {
      if (fails.length < 40) fails.push(`bounds label ${kind} ${p.isin}: ${bounds.startFieldLabel}`);
      continue;
    }
    const before = clampValuationDateToPhaseWindow(p, "01-01-1990", asOf);
    const after = clampValuationDateToPhaseWindow(p, "01-01-2099", asOf);
    if (
      bounds.minDate &&
      before === formatDeskDate(bounds.minDate) &&
      after === formatDeskDate(bounds.maxDate)
    ) {
      boundsOk += 1;
    } else if (!bounds.minDate && after === formatDeskDate(bounds.maxDate)) {
      boundsOk += 1;
    } else if (fails.length < 40) {
      fails.push(`clamp ${kind} ${p.isin}: before=${before} after=${after}`);
    }
    void scheduleEnd;
  }

  // INE093J077U7 — calendar must clamp Allotment (03-09-2019) up to Trade Date
  const deskP2 = valid.find((p) => p.isin === "INE093J077U7");
  if (deskP2) {
    const bounds = getPhaseValuationDateBounds(deskP2);
    assert(Boolean(bounds.minDate), "INE093J077U7 must have phase minDate", fails);
    assert(
      formatDeskDate(bounds.minDate!) === "27-03-2023",
      `INE093J077U7 minDate expected Trade 27-03-2023 got ${formatDeskDate(bounds.minDate!)}`,
      fails,
    );
    const clamped = clampValuationDateToPhaseWindow(deskP2, "03-09-2019");
    assert(clamped === "27-03-2023", `INE093J077U7 clamp expected 27-03-2023 got ${clamped}`, fails);
    assert(
      !getValuationDateApplicability(deskP2, "03-09-2019").ok,
      "raw Allotment date still outside window before clamp",
      fails,
    );
    assert(
      getValuationDateApplicability(deskP2, clamped).ok,
      "clamped Trade Date must be inside window",
      fails,
    );
  }

  // INE093J074Z3 — Phase 2 on Trade Date: elapsed 0, underlying IRR 0 (not ~−100%)
  const magnifier = valid.find((p) => p.isin === "INE093J074Z3");
  if (magnifier) {
    const trade = getProductTradeOpeningDate(magnifier)!;
    const el = getElapsedDaysSinceWorkingAllotment(magnifier, trade);
    const entry = getIndexEntryLevel(magnifier);
    const uIrr = computeUnderlyingIrrSincePhaseStart(entry, entry * 0.9872, el);
    assert(el === 0, `INE093J074Z3 elapsed on Trade expected 0 got ${el}`, fails);
    assert(uIrr === 0, `INE093J074Z3 underlying IRR on Trade expected 0 got ${uIrr}`, fails);
    assert(
      phasePerformanceStartLabel(magnifier) === "Trade Date",
      "INE093J074Z3 start label must be Trade Date",
      fails,
    );
  }

  // Phase2 historical trap — Must NOT use allotment→maturity (~2600) for payoff
  let phase2XirrTrapOk = 0;
  for (const p of byKind.phase2) {
    const allot = getProductAllotmentDate(p);
    const mat = getProductMaturityDate(p);
    const poed = getProductPoedDate(p);
    if (!allot || !mat || !poed) {
      phase2XirrTrapOk += 1;
      continue;
    }
    const bad = differenceInCalendarDays(mat, allot);
    const good = getPhasePayoffTenorDays(p);
    const histAsOf = allot;
    const tenor = resolvePayoffScenarioTenorDays(p, { asOf: histAsOf, expired: false });
    if (good != null && Math.abs(tenor - good) <= 2 && Math.abs(tenor - bad) > 30) phase2XirrTrapOk += 1;
    else if (good != null && Math.abs(good - bad) <= 30) phase2XirrTrapOk += 1; // rare equal spans
    else if (fails.length < 50) fails.push(`P2 trap ${p.isin}: tenor=${tenor} good=${good} bad=${bad}`);
  }

  // Sample historical mid-life checks per kind (up to 25 each)
  let histSampleOk = 0;
  let histSampleTotal = 0;
  for (const kind of Object.keys(byKind) as RolloverPhaseKind[]) {
    for (const p of byKind[kind].slice(0, 25)) {
      const start = getWorkingAllotmentDate(p);
      const end = getPhaseScheduleEndDate(p);
      if (!start || !end || end.getTime() <= start.getTime()) continue;
      const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
      histSampleTotal += 1;
      const midRaw = formatDeskDate(mid);
      const can = isValuationApplicableAt(p, midRaw);
      const el = getElapsedDaysSinceWorkingAllotment(p, mid);
      const left = getDaysLeftToMaturity(p, mid);
      const tenor = resolvePayoffScenarioTenorDays(p, { asOf: mid, expired: false });
      const expected = getPhasePayoffTenorDays(p);
      if (can && el != null && el >= 1 && left != null && expected != null && Math.abs(tenor - expected) <= 2) {
        histSampleOk += 1;
      } else if (!can && el == null) {
        histSampleOk += 1;
      } else if (fails.length < 60) {
        fails.push(`hist ${kind} ${p.isin}: can=${can} el=${el} left=${left} tenor=${tenor} exp=${expected}`);
      }
    }
  }

  console.log("=== Rollover Phase full-book audit ===");
  console.log("Counts:", { valid: valid.length, ongoing: ongoing.length, expired: expired.length, ...counts });
  console.log("Specs labels:", PRODUCT_SPECIFICATION_LABELS.length, PRODUCT_SPECIFICATION_LABELS.slice(-5).join(" · "));
  console.log(`Working!F: ${workingOk}/${totalChecked}`);
  console.log(`Schedule end: ${scheduleOk}/${totalChecked}`);
  console.log(`Payoff tenor (phase): ${payoffOk}/${totalChecked}`);
  console.log(`Pre-launch block: ${preLaunchOk}/${totalChecked}`);
  console.log(`Lifecycle @ launch: ${lifecycleCardOk}/${totalChecked}`);
  console.log(`Expired tenor: ${expiredTenorOk}/${expired.length}`);
  console.log(`Phase2 XIRR trap: ${phase2XirrTrapOk}/${byKind.phase2.length}`);
  console.log(`Calendar bounds + clamp (all phases): ${boundsOk}/${totalChecked}`);
  console.log(`Historical mid-life samples: ${histSampleOk}/${histSampleTotal}`);

  if (fails.length) {
    console.error("\nFAILS (first 30):");
    for (const f of fails.slice(0, 30)) console.error(" -", f);
    console.error(`\nTOTAL FAILS: ${fails.length}`);
    process.exit(1);
  }

  console.log("\n=== PASS ===");
}

main();
