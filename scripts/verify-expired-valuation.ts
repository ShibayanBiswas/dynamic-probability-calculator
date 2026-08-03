/**
 * Verify expired-product valuation: historical index + Working sheet parity.
 * Usage: npx tsx scripts/verify-expired-valuation.ts [ISIN] [DD-MM-YYYY]
 */
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { differenceInCalendarDays } from "date-fns";
import { getProductFinalObservationDate, getProductMaturityDate, getProductExpirationDate, getProductObservationDates } from "../lib/product-dates";
import { resolveValuationLevel } from "../lib/product-utils";
import { formatPercent } from "../lib/utils";
import { parseExcelishDate } from "../lib/workbook/dates";
import { computeExpiredAbsReturnAtDesk, computeExpiredBookMarks } from "../lib/expired-book-marks";
import { getExpiredMarkDeskDate, resolveHistoricalIndexLevel } from "../lib/expired-mark";
import { resolveIndexLevelsAtDate } from "../lib/market-index-at-date";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { resolveWorkingObservationDate } from "../lib/workbook/valuation-performance";
import { loadSeedProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

const SAMPLE_ISIN = process.argv[2] ?? "INE804I07AW1";
const SAMPLE_DATE = process.argv[3] ?? "28-11-2013";

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

async function main() {
  const asOf = new Date();
  warnIfWorkbookDriftsFromSeed(asOf);
  const products = filterValidMasterProducts(loadSeedProducts(), asOf);
  const expired = filterProductsByLifecycle(products, "expired", asOf);

  console.log(`Expired book: ${expired.length} products\n`);

  const target = expired.find((p) => p.isin === SAMPLE_ISIN) ?? expired[0];
  if (!target) {
    console.error("No expired products in master pool.");
    process.exit(1);
  }

  const deskDate = SAMPLE_DATE;
  const valDate = parseExcelishDate(deskDate);
  if (!valDate) {
    console.error("Invalid desk date");
    process.exit(1);
  }

  console.log(`=== Sample: ${target.isin} · ${target.name?.slice(0, 48)} ===`);
  console.log(`Valuation / observation desk date: ${deskDate}`);
  console.log(`Scheduled obs dates: ${getProductObservationDates(target).map(fmt).join(", ") || "(none)"}`);
  console.log(
    `Working!I (last scheduled obs): ${
      resolveWorkingObservationDate(target, valDate) ? fmt(resolveWorkingObservationDate(target, valDate)!) : "—"
    }`,
  );
  console.log(`Last obs desk default: ${getExpiredMarkDeskDate(target) ?? "—"}\n`);

  const levels = await resolveIndexLevelsAtDate(deskDate);
  console.log("Index at date:", {
    nifty: levels?.niftyLevel ?? null,
    sensex: levels?.sensexLevel ?? null,
    source: levels?.source ?? "missing",
  });

  const currentLevel = resolveValuationLevel(target, {
    niftyLevel: levels?.niftyLevel ?? undefined,
    sensexLevel: levels?.sensexLevel ?? undefined,
  });
  console.log("Resolved valuation level:", currentLevel);

  const valuation = computeValuation(target, {
    valuationDate: deskDate,
    currentLevel,
    debentures: 100,
  });

  console.log("\n--- Valuation outputs (Working parity) ---");
  console.log(`  Price / Debenture (V):     ${valuation.productValue}`);
  console.log(`  Absolute Return (X/U−1):   ${formatPercent(valuation.absReturn, 2)}`);
  console.log(`  Coupon Formed (formula):   ${formatPercent(valuation.formulaReturn, 2)}`);
  console.log(`  Product IRR (Y):         ${formatPercent(valuation.productIrr, 2)}`);
  console.log(`  Underlying perf (Z):     ${formatPercent(valuation.z, 2)}`);
  console.log(`  Total Amount:            ${valuation.totalAmount}`);

  const absReturn = computeExpiredAbsReturnAtDesk(target, deskDate, levels);
  console.log(`\nExpired mark absReturn cross-check: ${absReturn != null ? formatPercent(absReturn, 2) : "—"}`);

  console.log("\n=== Post last-obs → phase end (Logic Working!V path) ===");
  // After last obs: coupon locks; at phase end both obs+end are done → U·(1+S).
  // Between last obs and phase end: discount U·(1+S) @ 11% (not post-obs Y compounding).
  let lockChecks = 0;
  let lockPass = 0;
  for (const product of expired) {
    const finalObs = getProductFinalObservationDate(product);
    const phaseEnd = getProductExpirationDate(product) ?? getProductMaturityDate(product);
    if (!finalObs || !phaseEnd || !product.formulaText?.trim()) continue;
    const gapDays = differenceInCalendarDays(phaseEnd, finalObs);
    if (gapDays < 1) continue;

    const obsLevel = resolveHistoricalIndexLevel(product, finalObs);
    const endLevel = resolveHistoricalIndexLevel(product, phaseEnd);
    if (obsLevel == null || !(obsLevel > 0)) continue;

    const atObs = computeValuation(product, {
      valuationDate: fmt(finalObs),
      currentLevel: obsLevel,
      debentures: 1,
    });
    const atEnd = computeValuation(product, {
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
    else if (lockChecks - lockPass <= 5) {
      console.warn(
        `  mismatch ${product.isin}: S_obs=${S} S_end=${atEnd.formulaReturn} V_end=${atEnd.productValue} expect=${expectedEnd} gap=${gapDays}d`,
      );
    }
  }
  console.log(`Post-last-obs Logic lock → phase end U·(1+S): ${lockPass}/${lockChecks} PASS`);
  if (lockChecks > 0 && lockPass < lockChecks) {
    const rate = lockPass / lockChecks;
    if (rate < 0.995) {
      console.warn(`\nWARN: Post-last-obs Logic lock parity ${(rate * 100).toFixed(2)}% — below 99.5% threshold.`);
      process.exit(1);
    }
    console.log(`  (${lockChecks - lockPass} edge-case outlier — review if needed)`);
  }

  console.log("\n=== Batch expired book (first 50) ===");
  const batch = await computeExpiredBookMarks(expired.slice(0, 50), async (desk) => {
    const row = await resolveIndexLevelsAtDate(desk);
    return row ? { niftyLevel: row.niftyLevel, sensexLevel: row.sensexLevel } : null;
  });
  let weightSum = 0;
  let valueSum = 0;
  for (const mark of batch.values()) {
    weightSum += mark.notional;
    valueSum += mark.absReturn * mark.notional;
  }
  console.log(`Marked ${batch.size} / 50 sampled · AUM-weighted abs return: ${weightSum > 0 ? formatPercent(valueSum / weightSum, 2) : "—"}`);

  if (!levels?.niftyLevel && !levels?.sensexLevel) {
    const { lookupBundledNiftyOnOrBefore } = await import("../lib/bundled-index-history");
    const { lookupBundledSensexOnOrBefore } = await import("../lib/bundled-sensex-history");
    const parsed = parseExcelishDate(deskDate);
    const bundledNifty = parsed ? lookupBundledNiftyOnOrBefore(parsed) : undefined;
    const bundledSensex = parsed ? lookupBundledSensexOnOrBefore(parsed) : undefined;
    if (!bundledNifty && !bundledSensex) {
      console.warn("\nWARN: No index levels resolved — run npm run backfill:index-history");
      process.exit(1);
    }
  }

  if (!(valuation.productValue > 0)) {
    console.warn("\nWARN: Product value is zero — formula or index path may be broken.");
    process.exit(1);
  }

  console.log("\nExpired valuation checks OK.");
}

void main();
