/**
 * Verify valuation pipeline steps A→E match computeValuation() for:
 * - Ongoing @ today + historical desk dates
 * - Expired @ each observation date + expiration anchor
 *
 * Usage: npx tsx scripts/verify-valuation-pipeline.ts
 */
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import {
  getPhasePayoffTenorDays,
  getProductObservationDates,
  getWorkingAllotmentDate,
  resolveWorkingMaturityDate,
} from "../lib/product-dates";
import { getExpiredValuationUpperBound } from "../lib/expired-valuation-dates";
import { filterProductsByLifecycle, filterValidMasterProducts, isValuationApplicableAt } from "../lib/product-lifecycle";
import { getDebenturePrice, getIndexEntryLevel, inferDebentureCount, isSensexLinked, resolveLiveIndexLevel } from "../lib/product-utils";
import { resolveHistoricalIndexLevel } from "../lib/expired-mark";
import { formatDeskDate } from "../lib/market-data";
import { resolveIndexLevelsAtDate } from "../lib/market-index-at-date";
import { parseExcelishDate, toExcelSerial } from "../lib/workbook/dates";
import { computeValuation } from "../lib/workbook/valuation-engine";
import {
  computeUnderlyingPerformance,
  qualifiesForAnyFullCoupon,
  resolveCouponFormedReturn,
  resolveValuationExpectedLevel,
  resolveWorkingObservationDate,
} from "../lib/workbook/valuation-performance";
import {
  computeWorkingFinalValuation,
  xirrEntryToCurrent,
  type WorkingSerialDates,
} from "../lib/workbook/valuation-serial";
import { irrFromReturn } from "../lib/workbook/irr";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

type ReplayResult = {
  stepA_level: number;
  stepB_underlyingIrr: number;
  stepB_expectedN: number | "NA" | undefined;
  stepB_Z: number;
  stepD_couponS: number;
  stepE_value: number;
  absReturn: number;
  productIrr: number;
};

function replayPipeline(
  product: Parameters<typeof computeValuation>[0],
  deskDate: string,
  currentLevel: number,
): ReplayResult | null {
  const valDate = parseExcelishDate(deskDate);
  if (!valDate) return null;

  const entry = getIndexEntryLevel(product);
  const U = getDebenturePrice(product);
  const allotment = getWorkingAllotmentDate(product, valDate) ?? valDate;
  const obsDate = resolveWorkingObservationDate(product, valDate);
  const sensex = isSensexLinked(product);

  const F = toExcelSerial(allotment);
  const B1 = toExcelSerial(valDate);
  const serialDesk = { allotment: F, valuation: B1, observation: obsDate ? toExcelSerial(obsDate) : undefined };

  const expectedN = resolveValuationExpectedLevel(
    product,
    entry,
    currentLevel,
    allotment,
    valDate,
    sensex,
  );
  const Z = computeUnderlyingPerformance(entry, currentLevel, expectedN);

  const daysAllotToVal = Math.max(1, B1 - F);
  const stepB_irr = xirrEntryToCurrent(entry, currentLevel, daysAllotToVal);

  const barrierMet = qualifiesForAnyFullCoupon(product, valDate, entry, currentLevel, sensex);
  const S = resolveCouponFormedReturn(product, Z, product.formulaText ?? "Z", barrierMet);

  const maturity = resolveWorkingMaturityDate(product, valDate);
  const serials: WorkingSerialDates = {
    allotment: F,
    valuation: B1,
    maturity: toExcelSerial(maturity),
    observation: obsDate ? toExcelSerial(obsDate) : undefined,
  };

  // Live path = Working!V / Logic sheet only (no post-obs Y override).
  const value = computeWorkingFinalValuation(U, S, serials);

  const X = Math.round(Math.max(value, U));
  const absReturn = U > 0 ? X / U - 1 : 0;
  const phaseTenor =
    getPhasePayoffTenorDays(product) ?? Math.max(0, serials.maturity - serials.allotment);
  const productIrr = irrFromReturn(S, phaseTenor);

  return {
    stepA_level: currentLevel,
    stepB_underlyingIrr: stepB_irr,
    stepB_expectedN: expectedN,
    stepB_Z: Z,
    stepD_couponS: S,
    stepE_value: X,
    absReturn,
    productIrr,
  };
}

async function indexOnDate(product: Parameters<typeof computeValuation>[0], deskDate: string) {
  const levels = await resolveIndexLevelsAtDate(deskDate);
  const nifty = levels?.niftyLevel;
  const sensex = levels?.sensexLevel;
  const live = resolveLiveIndexLevel(product, { niftyLevel: nifty, sensexLevel: sensex });
  if (live > 0) return live;
  const d = parseExcelishDate(deskDate);
  if (!d) return null;
  if (isSensexLinked(product)) return lookupBundledSensexOnOrBefore(d) ?? null;
  return lookupBundledNiftyOnOrBefore(d) ?? null;
}

async function main() {
  const asOf = new Date();
  const deskToday = formatDeskDate(asOf);
  const products = filterValidMasterProducts(loadSeedProducts(), asOf).filter((p) => p.formulaText?.trim());
  const ongoing = filterProductsByLifecycle(products, "ongoing", asOf).filter((p) =>
    isValuationApplicableAt(p, deskToday),
  );
  const expired = filterProductsByLifecycle(products, "expired", asOf);

  let ongoingChecks = 0;
  let ongoingPass = 0;
  let ongoingHistoricalChecks = 0;
  let ongoingHistoricalPass = 0;
  let expiredObsChecks = 0;
  let expiredObsPass = 0;
  let expiredAnchorChecks = 0;
  let expiredAnchorPass = 0;
  const fails: string[] = [];

  const historicalDates = ["31-05-2026", "31-03-2026", "31-12-2025"];

  for (const p of ongoing) {
    const lvl = await indexOnDate(p, deskToday);
    if (lvl == null || !(lvl > 0)) continue;
    ongoingChecks += 1;
    const engine = computeValuation(p, {
      valuationDate: deskToday,
      currentLevel: lvl,
      debentures: inferDebentureCount(p),
    });
    const replay = replayPipeline(p, deskToday, lvl);
    if (
      replay &&
      Math.abs(engine.productValue - replay.stepE_value) <= 1 &&
      Math.abs(engine.absReturn - replay.absReturn) < 0.001 &&
      Math.abs(engine.formulaReturn - replay.stepD_couponS) < 0.001 &&
      Math.abs(engine.z - replay.stepB_Z) < 0.001
    ) {
      ongoingPass += 1;
    } else if (fails.length < 5) {
      fails.push(`ongoing today ${p.isin}`);
    }

    for (const hist of historicalDates) {
      const histDate = parseExcelishDate(hist);
      const allot = getWorkingAllotmentDate(p, histDate ?? asOf);
      if (!histDate || !allot || histDate < allot) continue;
      if (!isValuationApplicableAt(p, hist)) continue;
      const hLvl = await indexOnDate(p, hist);
      if (hLvl == null || !(hLvl > 0)) continue;
      ongoingHistoricalChecks += 1;
      const eng = computeValuation(p, { valuationDate: hist, currentLevel: hLvl, debentures: 100 });
      const rep = replayPipeline(p, hist, hLvl);
      if (
        rep &&
        Math.abs(eng.productValue - rep.stepE_value) <= 1 &&
        Math.abs(eng.formulaReturn - rep.stepD_couponS) < 0.001 &&
        Math.abs(eng.z - rep.stepB_Z) < 0.001
      ) {
        ongoingHistoricalPass += 1;
      } else if (fails.length < 10) {
        fails.push(`ongoing hist ${hist} ${p.isin}`);
      }
    }
  }

  for (const p of expired) {
    const obsDates = getProductObservationDates(p);
    const anchor = getExpiredValuationUpperBound(p);
    const datesToTest = [...obsDates];
    if (anchor && !obsDates.some((d) => d.getTime() === anchor.getTime())) {
      datesToTest.push(anchor);
    }

    for (const obs of datesToTest) {
      const desk = fmt(obs);
      const lvl = resolveHistoricalIndexLevel(p, obs);
      if (lvl == null || !(lvl > 0)) continue;
      expiredObsChecks += 1;
      const eng = computeValuation(p, { valuationDate: desk, currentLevel: lvl, debentures: 100 });
      const rep = replayPipeline(p, desk, lvl);
      if (
        rep &&
        Math.abs(eng.productValue - rep.stepE_value) <= 1 &&
        Math.abs(eng.formulaReturn - rep.stepD_couponS) < 0.001 &&
        Math.abs(eng.z - rep.stepB_Z) < 0.001
      ) {
        expiredObsPass += 1;
      } else if (fails.length < 15) {
        fails.push(`expired obs ${desk} ${p.isin}`);
      }
    }

    if (anchor) {
      const desk = fmt(anchor);
      const lvl = resolveHistoricalIndexLevel(p, anchor);
      if (lvl != null && lvl > 0) {
        expiredAnchorChecks += 1;
        const eng = computeValuation(p, { valuationDate: desk, currentLevel: lvl, debentures: 100 });
        const rep = replayPipeline(p, desk, lvl);
        if (
          rep &&
          Math.abs(eng.productValue - rep.stepE_value) <= 1 &&
          Math.abs(eng.formulaReturn - rep.stepD_couponS) < 0.001
        ) {
          expiredAnchorPass += 1;
        } else if (fails.length < 18) {
          fails.push(`expired anchor ${desk} ${p.isin}`);
        }
      }
    }
  }

  console.log("=== VALUATION PIPELINE VERIFY (Steps A→E) ===");
  console.log(`\n--- ONGOING @ today (${deskToday}) ---`);
  console.log(`  Step A–E parity: ${ongoingPass}/${ongoingChecks}`);
  console.log(`\n--- ONGOING @ historical dates ---`);
  console.log(`  Step A–E parity: ${ongoingHistoricalPass}/${ongoingHistoricalChecks}`);
  console.log(`\n--- EXPIRED @ each observation date ---`);
  console.log(`  Step A–E parity: ${expiredObsPass}/${expiredObsChecks}`);
  console.log(`\n--- EXPIRED @ expiration / maturity anchor ---`);
  console.log(`  Step A–E parity: ${expiredAnchorPass}/${expiredAnchorChecks}`);

  if (fails.length) console.log(`\nSamples: ${fails.join("; ")}`);

  const pass =
    ongoingPass === ongoingChecks &&
    ongoingHistoricalPass === ongoingHistoricalChecks &&
    expiredObsPass === expiredObsChecks &&
    expiredAnchorPass === expiredAnchorChecks;

  console.log(`\n=== ${pass ? "PASS" : "FAIL"} ===`);
  process.exit(pass ? 0 : 1);
}

void main();
