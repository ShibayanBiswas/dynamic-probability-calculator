/**
 * Full-book valuation verify for ongoing + expired pools.
 * Usage: npx tsx scripts/verify-lifecycle-valuation-full.ts [DD-MM-YYYY]
 */
import { differenceInCalendarDays } from "date-fns";

import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { hasProductIndexSource } from "../lib/desk-index-guards";
import { computeExpiredBookMarks } from "../lib/expired-book-marks";
import { resolveHistoricalIndexLevel } from "../lib/expired-mark";
import { formatDeskDate } from "../lib/market-data";
import { resolveIndexLevelsAtDate } from "../lib/market-index-at-date";
import {
  getProductExpirationDate,
  getProductFinalObservationDate,
  getProductMaturityDate,
} from "../lib/product-dates";
import {
  filterProductsByLifecycle,
  filterValidMasterProducts,
  isValuationApplicableAt,
} from "../lib/product-lifecycle";
import { inferDebentureCount, resolveLiveIndexLevel } from "../lib/product-utils";
import { formatPercent } from "../lib/utils";
import { parseExcelishDate } from "../lib/workbook/dates";
import { computeActiveValuationSnapshots } from "../lib/workbook/portfolio-valuation-batch";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { loadSeedProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

const DESK_DATE_ARG = process.argv[2];

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

function isMarkedValuation(v: ReturnType<typeof computeValuation>): boolean {
  return (
    v.productValue > 0 &&
    Number.isFinite(v.absReturn) &&
    Number.isFinite(v.productIrr) &&
    Number.isFinite(v.formulaReturn)
  );
}

async function main() {
  const asOf = DESK_DATE_ARG ? (parseExcelishDate(DESK_DATE_ARG) ?? new Date()) : new Date();
  warnIfWorkbookDriftsFromSeed(asOf);
  const deskDate = formatDeskDate(asOf);
  const products = filterValidMasterProducts(loadSeedProducts(), asOf);
  const ongoing = filterProductsByLifecycle(products, "ongoing", asOf).filter(
    (p) => p.formulaText?.trim() && isValuationApplicableAt(p, deskDate),
  );
  const expired = filterProductsByLifecycle(products, "expired", asOf).filter((p) =>
    p.formulaText?.trim(),
  );

  console.log("=== FULL BOOK LIFECYCLE VALUATION VERIFY ===");
  console.log(`As of: ${deskDate}`);
  console.log(`Ongoing pool: ${ongoing.length} | Expired pool: ${expired.length}\n`);

  const levels = await resolveIndexLevelsAtDate(deskDate);
  const niftyLevel = levels?.niftyLevel;
  const sensexLevel = levels?.sensexLevel;
  console.log("--- ONGOING ---");
  console.log("Index:", {
    nifty: niftyLevel ?? null,
    sensex: sensexLevel ?? null,
    source: levels?.source ?? "missing",
  });

  let ongoingOk = 0;
  let ongoingNoIndex = 0;
  let ongoingBad = 0;
  const ongoingFailSamples: string[] = [];

  for (const p of ongoing) {
    if (!hasProductIndexSource(p, niftyLevel, sensexLevel)) {
      ongoingNoIndex += 1;
      continue;
    }
    const level = resolveLiveIndexLevel(p, { niftyLevel, sensexLevel });
    const v = computeValuation(p, {
      valuationDate: deskDate,
      currentLevel: level,
      debentures: inferDebentureCount(p),
    });
    if (isMarkedValuation(v)) ongoingOk += 1;
    else {
      ongoingBad += 1;
      if (ongoingFailSamples.length < 10) {
        ongoingFailSamples.push(`${p.isin} · ${p.name?.slice(0, 40) ?? ""}`);
      }
    }
  }

  const ongoingSnaps = computeActiveValuationSnapshots(ongoing, {
    valuationDate: deskDate,
    niftyLevel,
    sensexLevel,
  });
  let batchMarked = 0;
  let ongoingWeightSum = 0;
  let ongoingAbsSum = 0;
  for (let i = 0; i < ongoingSnaps.length; i += 1) {
    const snap = ongoingSnaps[i]!;
    const p = ongoing[i]!;
    if (snap.value != null && snap.value > 0 && snap.absReturn != null && snap.productIrr != null) {
      batchMarked += 1;
      const w = p.tradeAmount ?? 0;
      ongoingWeightSum += w;
      ongoingAbsSum += snap.absReturn * w;
    }
  }

  console.log(`Marked (finite value/abs/irr/coupon): ${ongoingOk} / ${ongoing.length}`);
  console.log(`Batch snapshots marked: ${batchMarked} / ${ongoing.length}`);
  console.log(`No index source: ${ongoingNoIndex}`);
  console.log(`Invalid metrics: ${ongoingBad}`);
  if (ongoingFailSamples.length) console.log("Sample fails:", ongoingFailSamples);
  console.log(
    `AUM-weighted abs return: ${
      ongoingWeightSum > 0 ? formatPercent(ongoingAbsSum / ongoingWeightSum, 2) : "—"
    }`,
  );

  console.log("\n--- EXPIRED (last observation mark) ---");
  let expiredOk = 0;
  let expiredNoLevel = 0;
  let expiredBad = 0;
  const expiredFailSamples: string[] = [];

  for (const p of expired) {
    const fo = getProductFinalObservationDate(p);
    if (!fo) {
      expiredBad += 1;
      continue;
    }
    const lvl = resolveHistoricalIndexLevel(p, fo);
    if (lvl == null || !(lvl > 0)) {
      expiredNoLevel += 1;
      continue;
    }
    const v = computeValuation(p, {
      valuationDate: fmt(fo),
      currentLevel: lvl,
      debentures: inferDebentureCount(p),
    });
    if (isMarkedValuation(v)) expiredOk += 1;
    else {
      expiredBad += 1;
      if (expiredFailSamples.length < 10) {
        expiredFailSamples.push(`${p.isin} · ${p.name?.slice(0, 40) ?? ""}`);
      }
    }
  }

  const expiredMarks = await computeExpiredBookMarks(expired, async (desk) => {
    const d = parseExcelishDate(desk);
    if (!d) return null;
    return {
      niftyLevel: lookupBundledNiftyOnOrBefore(d),
      sensexLevel: lookupBundledSensexOnOrBefore(d),
    };
  });

  let expiredWeightSum = 0;
  let expiredAbsSum = 0;
  for (const mark of expiredMarks.values()) {
    expiredWeightSum += mark.notional;
    expiredAbsSum += mark.absReturn * mark.notional;
  }

  console.log(`Marked at final obs: ${expiredOk} / ${expired.length}`);
  console.log(`Expired book marks map: ${expiredMarks.size} / ${expired.length}`);
  console.log(`No bundled index at final obs: ${expiredNoLevel}`);
  console.log(`Invalid metrics: ${expiredBad}`);
  if (expiredFailSamples.length) console.log("Sample fails:", expiredFailSamples);
  console.log(
    `AUM-weighted abs return: ${
      expiredWeightSum > 0 ? formatPercent(expiredAbsSum / expiredWeightSum, 2) : "—"
    }`,
  );

  console.log("\n--- EXPIRED (post-last-obs Logic lock → phase end) ---");
  // After last obs: coupon locks; at phase end both obs+end are done → U·(1+S).
  // Between last obs and phase end: Working!V discounts U·(1+S) @ 11% (not Y compounding).
  let lockChecks = 0;
  let lockPass = 0;
  const lockFails: string[] = [];

  for (const p of expired) {
    const finalObs = getProductFinalObservationDate(p);
    const phaseEnd = getProductExpirationDate(p) ?? getProductMaturityDate(p);
    if (!finalObs || !phaseEnd || !p.formulaText?.trim()) continue;
    const gapDays = differenceInCalendarDays(phaseEnd, finalObs);
    if (gapDays < 1) continue;

    const obsLevel = resolveHistoricalIndexLevel(p, finalObs);
    const endLevel = resolveHistoricalIndexLevel(p, phaseEnd);
    if (obsLevel == null || !(obsLevel > 0)) continue;

    const atObs = computeValuation(p, {
      valuationDate: fmt(finalObs),
      currentLevel: obsLevel,
      debentures: 1,
    });
    const atEnd = computeValuation(p, {
      valuationDate: fmt(phaseEnd),
      currentLevel: endLevel != null && endLevel > 0 ? endLevel : obsLevel,
      debentures: 1,
    });
    if (!(atObs.productValue > 0)) continue;

    lockChecks += 1;
    const U = atObs.clientInvestment;
    const S = atObs.formulaReturn;
    const expectedEnd = Math.round(Math.max(U, U * (1 + S)));
    const couponLocked = Math.abs(atEnd.formulaReturn - S) < 1e-9;
    const valueOk = Math.abs(atEnd.productValue - expectedEnd) <= 2;
    if (couponLocked && valueOk) lockPass += 1;
    else if (lockFails.length < 10) {
      lockFails.push(
        `${p.isin}: S_obs=${S} S_end=${atEnd.formulaReturn} V_end=${atEnd.productValue} expect=${expectedEnd} gap=${gapDays}d`,
      );
    }
  }

  console.log(`Post-last-obs Logic lock → phase end U·(1+S): ${lockPass}/${lockChecks} PASS`);
  if (lockFails.length) console.log("Lock mismatches:", lockFails);

  const ongoingPass =
    ongoingBad === 0 && ongoingOk === ongoing.length - ongoingNoIndex && batchMarked === ongoingOk;
  const expiredPass =
    expiredBad === 0 && expiredOk === expired.length - expiredNoLevel && expiredMarks.size === expiredOk;
  const lockPassOk = lockChecks === 0 || lockPass >= lockChecks * 0.995;
  const pass = ongoingPass && expiredPass && lockPassOk;

  console.log(`\n=== RESULT: ${pass ? "PASS" : "REVIEW NEEDED"} ===`);
  if (!pass) {
    if (!ongoingPass) console.log("  Ongoing: FAIL");
    if (!expiredPass) console.log("  Expired marks: FAIL");
    if (!lockPassOk) console.log("  Post-last-obs Logic lock: FAIL");
    process.exit(1);
  }
}

void main();
