import { differenceInCalendarDays } from "date-fns";

import { isCleanProduct } from "@/lib/product-data-guards";
import {
  getPhasePayoffTenorDays,
  getProductExpirationDate,
  getProductFinalObservationDate,
  getWorkingAllotmentDate,
} from "@/lib/product-dates";
import type { LifecycleFilter } from "@/lib/product-lifecycle";
import type { ProductRecord } from "@/lib/types";

/**
 * Days lived on the desk as-of — from phase Working!F
 * (Allotment for Blank / Phase 1 / 10Y; Trade for Phase 2).
 */
export function productTenureDays(product: ProductRecord, asOf: Date): number {
  const start = getWorkingAllotmentDate(product, asOf);
  if (!start) return 0;
  return Math.max(0, differenceInCalendarDays(asOf, start));
}

/** Contractual phase payoff tenor — used as tie-break for default product pick. */
export function productPhaseTenorDays(product: ProductRecord): number {
  return getPhasePayoffTenorDays(product) ?? product.tenorDays ?? 0;
}

function pickLongestTenure(pool: ProductRecord[], asOf: Date): ProductRecord | undefined {
  if (!pool.length) return undefined;
  const ranked = [...pool].sort((a, b) => {
    const tenureDelta = productTenureDays(b, asOf) - productTenureDays(a, asOf);
    if (tenureDelta !== 0) return tenureDelta;
    // Max phase tenor (Blank A→Mat, P1 A→POED, P2 Trade→Mat, 10Y A→Rollover) when elapsed ties.
    return productPhaseTenorDays(b) - productPhaseTenorDays(a);
  });
  return ranked.find(isCleanProduct) ?? ranked[0];
}

function pickMostRecentlyExpired(pool: ProductRecord[]): ProductRecord | undefined {
  if (!pool.length) return undefined;
  const ranked = [...pool].sort((a, b) => {
    const aExpiry =
      getProductExpirationDate(a)?.getTime() ??
      getProductFinalObservationDate(a)?.getTime() ??
      0;
    const bExpiry =
      getProductExpirationDate(b)?.getTime() ??
      getProductFinalObservationDate(b)?.getTime() ??
      0;
    return bExpiry - aExpiry;
  });
  return ranked.find(isCleanProduct) ?? ranked[0];
}

/**
 * Default product per lifecycle tab — longest live tenure or most recently expired.
 * Prefers rows with formula + description so the desk loads without data-quality prompts.
 */
export function pickDefaultLifecycleProduct(
  pool: ProductRecord[],
  filter: LifecycleFilter,
  asOf: Date,
): ProductRecord | undefined {
  if (!pool.length) return undefined;
  if (filter === "expired") return pickMostRecentlyExpired(pool);
  return pickLongestTenure(pool, asOf);
}
