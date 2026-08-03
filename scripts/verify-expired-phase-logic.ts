/**
 * Thorough expired-book logic audit by Rollover Phase:
 * Blank / Phase 1 / Phase 2 / 10 Years.
 *
 * Checks:
 * 1) Phase start/end tenure (Allotment→Maturity, Allotment→POED, Trade→Maturity, Allotment→Rollover)
 * 2) Historical index at each observation date and at phase end (never live-only)
 * 3) Valuation pipeline at every obs date + phase-end anchor
 * 4) Payoff XIRR tenor = phase tenure
 * 5) Sensex products never valued on Nifty history
 *
 * Usage: npx tsx scripts/verify-expired-phase-logic.ts
 */
import { differenceInCalendarDays } from "date-fns";

import {
  formatProductCalendarDate,
  getPhasePayoffTenorDays,
  getPhaseScheduleEndDate,
  getProductAllotmentDate,
  getProductFinalObservationDate,
  getProductMaturityDate,
  getProductObservationDates,
  getPhase1SchedulePoedDate,
  getProductRolloverScheduleDate,
  getProductTradeOpeningDate,
  getRolloverPhaseKind,
  getWorkingAllotmentDate,
  resolveWorkingMaturityDate,
  type RolloverPhaseKind,
} from "../lib/product-dates";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { getIndexEntryLevel, isSensexLinked } from "../lib/product-utils";
import { resolveHistoricalIndexLevel } from "../lib/expired-mark";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { resolvePayoffScenarioTenorDays } from "../lib/workbook/payoff-scenarios";
import { loadSeedProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

function fmt(d: Date | undefined) {
  return formatProductCalendarDate(d) ?? "—";
}

function sameDay(a: Date | undefined, b: Date | undefined) {
  return !!a && !!b && a.getTime() === b.getTime();
}

function phaseTenureOk(product: Parameters<typeof getRolloverPhaseKind>[0]): boolean {
  const kind = getRolloverPhaseKind(product);
  const F = getWorkingAllotmentDate(product);
  const H = getPhaseScheduleEndDate(product);
  const allot = getProductAllotmentDate(product);
  const trade = getProductTradeOpeningDate(product);
  const mat = getProductMaturityDate(product);
  const roll = getProductRolloverScheduleDate(product);
  if (!F || !H) return false;
  switch (kind) {
    case "blank": {
      // Blank: Allotment→Maturity; Trade only when Allotment blank (same as Working!F).
      const start = allot ?? trade;
      return !!start && !!mat && sameDay(F, start) && sameDay(H, mat);
    }
    case "phase1": {
      // Phase 1: Allotment→POED; invalid/early POED falls back to Maturity.
      const start = allot ?? trade;
      const end = getPhase1SchedulePoedDate(product) ?? mat;
      return !!start && !!end && sameDay(F, start) && sameDay(H, end);
    }
    case "phase2":
      return !!trade && !!mat && sameDay(F, trade) && sameDay(H, mat);
    case "tenYear": {
      const start = allot ?? trade;
      const end = roll ?? mat;
      return !!start && !!end && sameDay(F, start) && sameDay(H, end);
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function desk(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

function main() {
  warnIfWorkbookDriftsFromSeed();
  const asOf = new Date();
  const all = filterValidMasterProducts(loadSeedProducts(), asOf);
  const expired = filterProductsByLifecycle(all, "expired", asOf).filter((p) => p.formulaText?.trim());

  const byKind: Record<RolloverPhaseKind, typeof expired> = {
    blank: [],
    phase1: [],
    phase2: [],
    tenYear: [],
  };
  for (const p of expired) byKind[getRolloverPhaseKind(p)].push(p);

  const fails: string[] = [];
  const stats = {
    products: expired.length,
    tenureOk: 0,
    payoffTenorOk: 0,
    workingHOk: 0,
    obsMarksOk: 0,
    obsMarksTotal: 0,
    phaseEndMarksOk: 0,
    phaseEndMarksTotal: 0,
    histIndexOk: 0,
    histIndexTotal: 0,
    sensexGuardOk: 0,
    sensexGuardTotal: 0,
    samples: [] as Array<Record<string, unknown>>,
  };

  for (const kind of Object.keys(byKind) as RolloverPhaseKind[]) {
    const bucket = byKind[kind];
    let sampleTaken = false;

    for (const p of bucket) {
      if (phaseTenureOk(p)) stats.tenureOk += 1;
      else fails.push(`tenure ${kind} ${p.isin} F=${fmt(getWorkingAllotmentDate(p))} H=${fmt(getPhaseScheduleEndDate(p))}`);

      const phaseTenor = getPhasePayoffTenorDays(p);
      const payoffTenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: true });
      if (phaseTenor != null && payoffTenor === phaseTenor) stats.payoffTenorOk += 1;
      else if (phaseTenor != null) fails.push(`payoffTenor ${kind} ${p.isin} phase=${phaseTenor} payoff=${payoffTenor}`);

      const H = getPhaseScheduleEndDate(p);
      const workingH = resolveWorkingMaturityDate(p, asOf);
      if (H && sameDay(H, workingH)) stats.workingHOk += 1;
      else fails.push(`WorkingH ${kind} ${p.isin}`);

      const schedule = getProductObservationDates(p).sort((a, b) => a.getTime() - b.getTime());
      const sensex = isSensexLinked(p);

      for (const obs of schedule) {
        stats.histIndexTotal += 1;
        const level = resolveHistoricalIndexLevel(p, obs);
        if (level != null && level > 0) {
          stats.histIndexOk += 1;
          stats.obsMarksTotal += 1;
          const v = computeValuation(p, {
            valuationDate: desk(obs),
            currentLevel: level,
            debentures: 1,
          });
          if (v.productValue > 0 && Number.isFinite(v.formulaReturn)) stats.obsMarksOk += 1;
          else fails.push(`obsMark ${kind} ${p.isin} @ ${desk(obs)}`);

          if (sensex) {
            stats.sensexGuardTotal += 1;
            const nifty = lookupBundledNiftyOnOrBefore(obs);
            // Sensex mark must not equal the Nifty close on that date (guard against wrong series).
            if (nifty == null || Math.abs(level - nifty) > 1) stats.sensexGuardOk += 1;
            else fails.push(`sensexGuard ${p.isin} @ ${desk(obs)} used nifty=${nifty}`);
          }
        } else {
          // Custom underlyings may lack history — count but do not hard-fail the whole book.
          fails.push(`histIndex missing ${kind} ${p.isin} @ ${desk(obs)}`);
        }
      }

      if (H) {
        stats.phaseEndMarksTotal += 1;
        const level = resolveHistoricalIndexLevel(p, H) ?? (sensex
          ? lookupBundledSensexOnOrBefore(H)
          : lookupBundledNiftyOnOrBefore(H));
        if (level != null && level > 0) {
          const v = computeValuation(p, {
            valuationDate: desk(H),
            currentLevel: level,
            debentures: 1,
          });
          if (v.productValue > 0 && Number.isFinite(v.formulaReturn)) stats.phaseEndMarksOk += 1;
          else fails.push(`phaseEndMark ${kind} ${p.isin} @ ${desk(H)}`);
        } else {
          fails.push(`phaseEndLevel missing ${kind} ${p.isin} @ ${desk(H)}`);
        }
      }

      if (!sampleTaken && schedule.length > 0 && H) {
        sampleTaken = true;
        const lastObs = schedule[schedule.length - 1]!;
        const lastLevel = resolveHistoricalIndexLevel(p, lastObs);
        const endLevel =
          resolveHistoricalIndexLevel(p, H) ??
          (sensex ? lookupBundledSensexOnOrBefore(H) : lookupBundledNiftyOnOrBefore(H));
        const atLast =
          lastLevel != null
            ? computeValuation(p, { valuationDate: desk(lastObs), currentLevel: lastLevel, debentures: 1 })
            : null;
        const atEnd =
          endLevel != null
            ? computeValuation(p, { valuationDate: desk(H), currentLevel: endLevel, debentures: 1 })
            : null;
        stats.samples.push({
          kind,
          isin: p.isin,
          name: String(p.name ?? "").slice(0, 40),
          F: fmt(getWorkingAllotmentDate(p)),
          H: fmt(H),
          lastObs: fmt(lastObs),
          obsCount: schedule.length,
          entry: getIndexEntryLevel(p),
          lastLevel,
          endLevel,
          V_lastObs: atLast?.productValue,
          S_lastObs: atLast != null ? Number(atLast.formulaReturn.toFixed(4)) : null,
          V_phaseEnd: atEnd?.productValue,
          S_phaseEnd: atEnd != null ? Number(atEnd.formulaReturn.toFixed(4)) : null,
          phaseTenorDays: getPhasePayoffTenorDays(p),
          daysFtoH:
            getWorkingAllotmentDate(p) && H
              ? differenceInCalendarDays(H, getWorkingAllotmentDate(p)!)
              : null,
        });
      }
    }
  }

  // Hard fails: tenure / payoff / Working!H must be perfect.
  // Soft: missing hist index on very old custom rows — allow up to 2% miss if tenure perfect.
  const hardFails = fails.filter(
    (f) =>
      f.startsWith("tenure ") ||
      f.startsWith("payoffTenor ") ||
      f.startsWith("WorkingH ") ||
      f.startsWith("sensexGuard "),
  );
  const histMiss = fails.filter((f) => f.startsWith("histIndex missing") || f.startsWith("phaseEndLevel"));
  const histMissRate = stats.histIndexTotal > 0 ? histMiss.length / stats.histIndexTotal : 0;

  console.log("=== EXPIRED PHASE LOGIC AUDIT ===");
  console.log("As of:", desk(asOf));
  console.log("Counts by phase:", {
    blank: byKind.blank.length,
    phase1: byKind.phase1.length,
    phase2: byKind.phase2.length,
    tenYear: byKind.tenYear.length,
    total: expired.length,
  });
  console.log({
    tenureOk: `${stats.tenureOk}/${expired.length}`,
    payoffTenorOk: `${stats.payoffTenorOk}/${expired.length}`,
    workingHOk: `${stats.workingHOk}/${expired.length}`,
    histIndexOk: `${stats.histIndexOk}/${stats.histIndexTotal}`,
    obsMarksOk: `${stats.obsMarksOk}/${stats.obsMarksTotal}`,
    phaseEndMarksOk: `${stats.phaseEndMarksOk}/${stats.phaseEndMarksTotal}`,
    sensexGuardOk: `${stats.sensexGuardOk}/${stats.sensexGuardTotal}`,
    histMissRate: `${(histMissRate * 100).toFixed(2)}%`,
  });
  console.log("\nPhase samples:");
  for (const s of stats.samples) console.log(s);

  if (hardFails.length) {
    console.log("\nHARD FAILS:");
    for (const f of hardFails.slice(0, 30)) console.log(" -", f);
  }
  if (histMiss.length && histMissRate > 0.02) {
    console.log("\nHIST INDEX MISSES (sample):");
    for (const f of histMiss.slice(0, 20)) console.log(" -", f);
  }

  const pass =
    stats.tenureOk === expired.length &&
    stats.payoffTenorOk === expired.length &&
    stats.workingHOk === expired.length &&
    hardFails.length === 0 &&
    stats.obsMarksOk === stats.obsMarksTotal &&
    stats.phaseEndMarksOk === stats.phaseEndMarksTotal &&
    histMissRate <= 0.02;

  console.log(pass ? "\n=== PASS ===" : "\n=== FAIL ===");
  process.exit(pass ? 0 : 1);
}

main();
