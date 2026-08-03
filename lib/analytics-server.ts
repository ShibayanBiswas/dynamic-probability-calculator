import { formatDeskDate } from "@/lib/market-data";
import { resolveIndexLevelsAtDate } from "@/lib/market-index-at-date";
import {
  computeExpiredBookMarks,
  summariseAumWeightedAbsReturn,
} from "@/lib/expired-book-marks";
import {
  filterProductsByLifecycle,
  getProductLifecycleStatus,
  type LifecycleFilter,
} from "@/lib/product-lifecycle";
import {
  getCouponPercent,
  getIndexEntryLevelRaw,
  getTargetLevel,
  inferDebentureCount,
  resolveLiveIndexLevel,
} from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { computeValuation } from "@/lib/workbook/valuation-engine";
import {
  categoryStatsCacheKey,
  peekCategoryStatsCache,
  setCategoryStatsCache,
} from "@/lib/category-stats-cache";

import {
  accumulateSpreadProduct,
  buildUnderlyingSpreadSections,
  createSpreadAccumulators,
  summariseStat,
  EMPTY_STAT_SUMMARY,
  type LifecycleCategoryStats,
  type StatSummary,
} from "@/lib/analytics";

/** Fast bulk path — Mongo + bundled history only (no Yahoo) so Analytics Lab stays responsive. */
async function resolveDeskIndexLevelsFast(desk: string) {
  const result = await resolveIndexLevelsAtDate(desk, undefined, { skipYahoo: true });
  return result
    ? { niftyLevel: result.niftyLevel, sensexLevel: result.sensexLevel }
    : null;
}

/** Server-side lifecycle bucket stats with local index lookup for expired marks. */
export async function getLifecycleCategoryStatsServer(
  products: ProductRecord[],
  filter: LifecycleFilter,
  asOf = new Date(),
  liveLevels: { niftyLevel?: number; sensexLevel?: number } = {},
): Promise<LifecycleCategoryStats> {
  const cacheKey = categoryStatsCacheKey(filter, asOf, liveLevels, products.length);
  const cached = peekCategoryStatsCache(cacheKey);
  if (cached) return cached;

  const pool = filterProductsByLifecycle(products, filter, asOf);
  const deskToday = formatDeskDate(asOf);
  const poolIsExpiredBook = filter === "expired";
  const initial: number[] = [];
  const final: number[] = [];
  const full: number[] = [];
  const current: number[] = [];
  const spreads = createSpreadAccumulators();

  for (const product of pool) {
    const entry = getIndexEntryLevelRaw(product);
    if (entry != null) initial.push(entry);

    const target = getTargetLevel(product);
    if (target != null && target > 0) final.push(target);

    const coupon = getCouponPercent(product);
    if (coupon != null) full.push(coupon);
  }

  let currentCoupon: StatSummary = EMPTY_STAT_SUMMARY;
  let spreadsIncludeCurrent = false;

  if (poolIsExpiredBook) {
    const marks = await computeExpiredBookMarks(pool, resolveDeskIndexLevelsFast);

    for (const product of pool) {
      const mark = marks.get(product.rowId);
      if (mark) current.push(mark.absReturn);
      accumulateSpreadProduct(spreads, product, mark?.absReturn);
    }

    currentCoupon = summariseAumWeightedAbsReturn([...marks.values()]);
    spreadsIncludeCurrent = currentCoupon.count > 0;
  } else {
    for (const product of pool) {
      if (!product.formulaText) {
        accumulateSpreadProduct(spreads, product);
        continue;
      }

      const status = getProductLifecycleStatus(product, asOf);
      if (status === "expired") {
        accumulateSpreadProduct(spreads, product);
        continue;
      }

      const valuation = computeValuation(product, {
        valuationDate: deskToday,
        currentLevel: resolveLiveIndexLevel(product, liveLevels),
        debentures: inferDebentureCount(product),
      });
      if (Number.isFinite(valuation.absReturn)) {
        current.push(valuation.absReturn);
        accumulateSpreadProduct(spreads, product, valuation.absReturn);
      } else {
        accumulateSpreadProduct(spreads, product);
      }
    }

    currentCoupon = summariseStat(current);
    spreadsIncludeCurrent = true;
  }

  const listed = pool.filter((p) => p.listing?.toLowerCase() === "listed").length;

  const stats: LifecycleCategoryStats = {
    count: pool.length,
    aum: pool.reduce((s, p) => s + (p.tradeAmount ?? 0), 0),
    averageCoupon: full.length > 0 ? full.reduce((s, c) => s + c, 0) / full.length : 0,
    listedShare: pool.length > 0 ? listed / pool.length : 0,
    initialLevel: summariseStat(initial),
    finalLevel: summariseStat(final),
    fullCoupon: summariseStat(full),
    currentCoupon,
    underlyingSpreads: buildUnderlyingSpreadSections(spreads, !spreadsIncludeCurrent),
  };

  setCategoryStatsCache(cacheKey, stats);
  return stats;
}

export type { StatSummary };
