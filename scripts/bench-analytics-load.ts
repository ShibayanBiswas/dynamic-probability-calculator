/**
 * Benchmark Lifecycle Category Analytics + ScienceLab aggregations.
 * Usage: npx tsx scripts/bench-analytics-load.ts
 */
import { performance } from "perf_hooks";

import {
  getCouponDistribution,
  getIssuerExposure,
  getLifecycleCategoryStats,
  getLifecycleChartData,
  getProtectionMix,
  getTenorDistribution,
  getUnderlyingExposure,
} from "../lib/analytics";
import { getLifecycleCategoryStatsServer } from "../lib/analytics-server";
import {
  computeExpiredBookMarks,
  groupExpiredProductsByMarkDate,
} from "../lib/expired-book-marks";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { parseExcelishDate } from "../lib/workbook/dates";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

async function main() {
  const asOf = new Date();
  const valid = filterValidMasterProducts(loadSeedProducts(), asOf);
  const ongoing = filterProductsByLifecycle(valid, "ongoing", asOf);
  const expired = filterProductsByLifecycle(valid, "expired", asOf);

  let t0 = performance.now();
  getLifecycleCategoryStats(ongoing, { niftyLevel: 25000, sensexLevel: 80000 }, asOf);
  console.log(`ongoing client stats: ${Math.round(performance.now() - t0)}ms · n=${ongoing.length}`);

  console.log(
    `expired desks: ${groupExpiredProductsByMarkDate(expired).size} · products=${expired.length}`,
  );

  t0 = performance.now();
  const marks = await computeExpiredBookMarks(expired, async (desk) => {
    const d = parseExcelishDate(desk)!;
    return {
      niftyLevel: lookupBundledNiftyOnOrBefore(d) ?? null,
      sensexLevel: lookupBundledSensexOnOrBefore(d) ?? null,
    };
  });
  console.log(
    `expired marks (bundled only): ${Math.round(performance.now() - t0)}ms · marked=${marks.size}`,
  );

  t0 = performance.now();
  await getLifecycleCategoryStatsServer(valid, "expired", asOf, {
    niftyLevel: 25000,
    sensexLevel: 80000,
  });
  console.log(`expired server stats (cold): ${Math.round(performance.now() - t0)}ms`);

  t0 = performance.now();
  await getLifecycleCategoryStatsServer(valid, "expired", asOf, {
    niftyLevel: 25000,
    sensexLevel: 80000,
  });
  console.log(`expired server stats (warm): ${Math.round(performance.now() - t0)}ms`);

  t0 = performance.now();
  await getLifecycleCategoryStatsServer(valid, "ongoing", asOf, {
    niftyLevel: 25000,
    sensexLevel: 80000,
  });
  console.log(`ongoing server stats (cold): ${Math.round(performance.now() - t0)}ms`);

  t0 = performance.now();
  await getLifecycleCategoryStatsServer(valid, "ongoing", asOf, {
    niftyLevel: 25000,
    sensexLevel: 80000,
  });
  console.log(`ongoing server stats (warm): ${Math.round(performance.now() - t0)}ms`);

  t0 = performance.now();
  getLifecycleChartData(expired, asOf, "light");
  getCouponDistribution(expired);
  getProtectionMix(expired, "light");
  getUnderlyingExposure(expired);
  getIssuerExposure(expired);
  getTenorDistribution(expired, asOf);
  console.log(`ScienceLab expired aggregates: ${Math.round(performance.now() - t0)}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
