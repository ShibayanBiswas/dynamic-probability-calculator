/**
 * Verify desk Logic sheet (Jun-26) valuation extensions:
 * - ≥1 obs: average of done fixings locks expected Nifty
 * - No obs: spot IRR extrapolates to second-last obs
 * - Realised full coupon only on/after last obs
 * - After last obs: Working!V discount @ 11% (or U·(1+S) if phase end done)
 *
 * Usage: npx tsx scripts/verify-full-coupon-logic.ts
 */
import {
  getProductExpirationDate,
  getProductFinalObservationDate,
  getProductMaturityDate,
  getProductObservationDates,
  getWorkingAllotmentDate,
} from "../lib/product-dates";
import { filterValidMasterProducts } from "../lib/product-lifecycle";
import { getIndexEntryLevel, isSensexLinked } from "../lib/product-utils";
import { resolveHistoricalIndexLevel } from "../lib/expired-mark";
import { parseExcelishDate, toExcelSerial } from "../lib/workbook/dates";
import { getPayoffTenorDays } from "../lib/workbook/payoff-scenarios";
import {
  isLastObservationPassed,
  qualifiesForFullCoupon,
  qualifiesForProjectedFullCoupon,
  resolveValuationExpectedLevel,
  resolveWorkingObservationDate,
} from "../lib/workbook/valuation-performance";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { computeWorkingFinalValuation } from "../lib/workbook/valuation-serial";
import { loadSeedProducts } from "./lib/load-canonical-dataset";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

function main() {
  const asOf = new Date();
  const products = filterValidMasterProducts(loadSeedProducts(), asOf).filter((p) => p.formulaText?.trim());

  let extrapOk = 0;
  let extrapChecked = 0;
  let fcBeforeLastObs = 0;
  let fcAtOrAfterLast = 0;
  let fcMarked = 0;
  let fcMarkedBad = 0;
  let discountPathOk = 0;
  let discountPathBad = 0;
  let projectedFcSamples = 0;
  let secondLastOk = 0;
  let secondLastChecked = 0;

  for (const p of products) {
    const lastObs = getProductFinalObservationDate(p);
    if (!lastObs) continue;
    const sensex = isSensexLinked(p);
    const obsAnchor = resolveWorkingObservationDate(p, asOf);
    const schedule = getProductObservationDates(p).sort((a, b) => a.getTime() - b.getTime());

    const beforeLast = new Date(lastObs.getTime() - 86400000);
    const valBefore = parseExcelishDate(fmt(beforeLast));
    if (valBefore && obsAnchor && valBefore.getTime() < obsAnchor.getTime()) {
      extrapChecked += 1;
      if (qualifiesForFullCoupon(p, valBefore, sensex)) {
        fcBeforeLastObs += 1;
      } else {
        extrapOk += 1;
      }
    }

    // No-obs path uses second-last when ≥2 slots exist
    const allot = getWorkingAllotmentDate(p, asOf);
    const entry = getIndexEntryLevel(p);
    if (allot && entry > 0 && schedule.length >= 2) {
      const early = new Date(schedule[0]!.getTime() - 86400000 * 30);
      if (early.getTime() < schedule[0]!.getTime()) {
        const spot = lookupBundledNiftyOnOrBefore(early) ?? entry * 1.05;
        if (spot > entry) {
          secondLastChecked += 1;
          const expected = resolveValuationExpectedLevel(p, entry, spot, allot, early, sensex);
          const second = schedule[schedule.length - 2]!;
          const F = toExcelSerial(allot);
          const B1 = toExcelSerial(early);
          const I2 = toExcelSerial(second);
          const xirr = Math.pow(spot / entry, 365 / Math.max(1, B1 - F)) - 1;
          const want = entry * Math.pow(1 + xirr, (I2 - F) / 365);
          if (typeof expected === "number" && Math.abs(expected - want) < 0.05) secondLastOk += 1;
        }
      }
    }

    if (!isLastObservationPassed(p, asOf)) {
      const e = getIndexEntryLevel(p);
      const valDate = parseExcelishDate("12-07-2026") ?? asOf;
      if (e > 0 && qualifiesForProjectedFullCoupon(p, valDate, e, e * 1.12, sensex)) {
        projectedFcSamples += 1;
      }
    }

    const lvlLast = resolveHistoricalIndexLevel(p, lastObs);
    if (lvlLast == null || !(lvlLast > 0)) continue;

    if (isLastObservationPassed(p, lastObs) && qualifiesForFullCoupon(p, lastObs, sensex)) {
      fcAtOrAfterLast += 1;
      const v = computeValuation(p, {
        valuationDate: fmt(lastObs),
        currentLevel: lvlLast,
        debentures: 100,
      });
      if (v.productValue > 0 && Number.isFinite(v.formulaReturn)) fcMarked += 1;
      else fcMarkedBad += 1;
    }

    // After last obs + phase end still ahead → discount path equals Working!V
    const growthAnchor = getProductExpirationDate(p) ?? getProductMaturityDate(p);
    if (growthAnchor && growthAnchor.getTime() > lastObs.getTime()) {
      const after = new Date(Math.min(lastObs.getTime() + 14 * 86400000, growthAnchor.getTime() - 86400000));
      if (after.getTime() > lastObs.getTime()) {
        const lvlAfter = resolveHistoricalIndexLevel(p, after) ?? lvlLast;
        const vAfter = computeValuation(p, {
          valuationDate: fmt(after),
          currentLevel: lvlAfter,
          debentures: 1,
        });
        const allotDate = getWorkingAllotmentDate(p, after);
        if (allotDate && vAfter.clientInvestment > 0) {
          const replay = computeWorkingFinalValuation(vAfter.clientInvestment, vAfter.formulaReturn, {
            allotment: toExcelSerial(allotDate),
            valuation: toExcelSerial(after),
            maturity: toExcelSerial(growthAnchor),
            observation: toExcelSerial(lastObs),
          });
          discountPathOk += 1;
          if (Math.abs(Math.round(Math.max(replay, vAfter.clientInvestment)) - vAfter.productValue) > 1) {
            discountPathBad += 1;
          }
        }
      }
    }
  }

  const nwfl = products.find((p) => p.isin === "INE918K07QD1");
  let nwflOk = !nwfl;
  if (nwfl) {
    const tenor = getPayoffTenorDays(nwfl);
    const valDate = parseExcelishDate("12-07-2026")!;
    const entry = getIndexEntryLevel(nwfl);
    const proj = qualifiesForProjectedFullCoupon(nwfl, valDate, entry, entry * 1.08, false);
    const v = computeValuation(nwfl, {
      valuationDate: "12-07-2026",
      currentLevel: entry * 1.08,
      debentures: 100,
    });
    nwflOk = tenor === 1278 && proj && v.formulaReturn > 0.5;
  }

  console.log("=== Full coupon & Logic-sheet valuation verify ===");
  console.log(`Products checked: ${products.length}`);
  console.log(`Pre-last-obs (realised FC never early): ${extrapOk}/${extrapChecked}`);
  console.log(`Realised full coupon false-positive before last obs: ${fcBeforeLastObs} (expect 0)`);
  console.log(`No-obs → second-last extrap: ${secondLastOk}/${secondLastChecked}`);
  console.log(`Projected FC candidates (ongoing, +12% spot): ${projectedFcSamples}`);
  console.log(`Full coupon at last obs (barrier met): ${fcAtOrAfterLast}`);
  console.log(`Marked at last obs with FC: ${fcMarked} bad: ${fcMarkedBad}`);
  console.log(`Post-last-obs Working!V discount path: ${discountPathOk - discountPathBad}/${discountPathOk} OK`);
  console.log(`NWFL spot check (tenor 1278 + projected FC): ${nwflOk ? "OK" : "FAIL"}`);

  const pass =
    fcBeforeLastObs === 0 &&
    fcMarkedBad === 0 &&
    extrapOk === extrapChecked &&
    discountPathBad === 0 &&
    (secondLastChecked === 0 || secondLastOk === secondLastChecked) &&
    nwflOk;

  console.log(`\n=== ${pass ? "PASS" : "FAIL"} ===`);
  process.exit(pass ? 0 : 1);
}

main();
