import type { ProductRecord } from "@/lib/types";
import {
  filterProductsByLifecycle,
  getDaysToNextObservation,
  getProductLifecycleStatus,
  isLiveObservationBookProduct,
  isValidMasterProduct,
  LIFECYCLE_FILTERS,
  type LifecycleFilter,
  type LifecycleStatus,
} from "@/lib/product-lifecycle";
import { classifyProtection, getCouponPercent } from "@/lib/product-utils";

export type LifecycleBuckets = Record<LifecycleStatus, ProductRecord[]>;

export type LifecycleIndex = {
  validProducts: ProductRecord[];
  buckets: LifecycleBuckets;
  filterCounts: Record<LifecycleFilter, number>;
  filterNotional: Record<LifecycleFilter, number>;
  headline: PortfolioHeadlineSnapshot;
};

export type PortfolioHeadlineSnapshot = {
  /** NEW PRIMARY tab Trade Amount total — desk Live Notional headline. */
  liveNotional: number;
  /** Sum of trade amounts for desk-canonical valid products (deduped NEW PRIMARY). */
  deskBookNotional: number;
  totalProducts: number;
  averageCoupon: number;
  listedShare: number;
  protectedShare: number;
  maturingSoon: number;
  expiring1m: number;
  obsDue3m: number;
  obsDue2m: number;
  obsDue1m: number;
  activeCount: number;
  activeNotional: number;
  ongoingCount: number;
  expiredCount: number;
  perpetualCount: number;
  unknownCount: number;
  tabCounts: Record<LifecycleFilter, number>;
  ongoingNotional: number;
  expiredNotional: number;
};

function emptyBuckets(): LifecycleBuckets {
  return {
    ongoing: [],
    expired: [],
    perpetual: [],
    "expiring-1m": [],
    "expiring-3m": [],
    unknown: [],
    upcoming: [],
  };
}


function bucketNotional(bucket: ProductRecord[]) {
  return bucket.reduce((sum, product) => sum + (product.tradeAmount ?? 0), 0);
}

/** One pass over the master book — lifecycle status, valid rows, and headline KPIs. */
export function buildLifecycleIndex(
  products: ProductRecord[],
  asOf = new Date(),
  options?: { newPrimaryTabNotional?: number },
): LifecycleIndex {
  const buckets = emptyBuckets();
  const validProducts: ProductRecord[] = [];

  let liveNotional = 0;
  let listed = 0;
  let protectedCount = 0;
  let couponSum = 0;
  let couponCount = 0;

  for (const product of products) {
    const status = getProductLifecycleStatus(product, asOf);
    if (!isValidMasterProduct(product, asOf)) continue;
    // Probability desk forgets expired products entirely.
    if (status === "expired") continue;
    // And forgets products whose last observation fixing has already settled.
    if (!isLiveObservationBookProduct(product, asOf)) continue;

    validProducts.push(product);
    buckets[status].push(product);

    const notional = product.tradeAmount ?? 0;
    liveNotional += notional;

    if (product.listing?.toLowerCase() === "listed") listed += 1;
    if (classifyProtection(product.principalProtection) === "protected") protectedCount += 1;

    const coupon = getCouponPercent(product);
    if (coupon != null) {
      couponSum += coupon;
      couponCount += 1;
    }
  }

  const filterCounts = {
    ongoing:
      buckets.ongoing.length +
      buckets.perpetual.length +
      buckets["expiring-1m"].length +
      buckets["expiring-3m"].length,
    expired: buckets.expired.length,
    "expiring-1m": buckets["expiring-1m"].length,
    "expiring-3m": buckets["expiring-1m"].length + buckets["expiring-3m"].length,
    "obs-due-1m": 0,
    "obs-due-2m": 0,
    "obs-due-3m": 0,
  } as Record<LifecycleFilter, number>;

  const filterNotional = {
    ongoing:
      bucketNotional(buckets.ongoing) +
      bucketNotional(buckets.perpetual) +
      bucketNotional(buckets["expiring-1m"]) +
      bucketNotional(buckets["expiring-3m"]),
    expired: bucketNotional(buckets.expired),
    "expiring-1m": bucketNotional(buckets["expiring-1m"]),
    "expiring-3m": bucketNotional(buckets["expiring-1m"]) + bucketNotional(buckets["expiring-3m"]),
    "obs-due-1m": 0,
    "obs-due-2m": 0,
    "obs-due-3m": 0,
  } as Record<LifecycleFilter, number>;

  // One pass for Observation Due tabs (instead of 6 full-book filters).
  const liveForObs = [
    ...buckets.ongoing,
    ...buckets.perpetual,
    ...buckets["expiring-1m"],
    ...buckets["expiring-3m"],
  ];
  for (const product of liveForObs) {
    const days = getDaysToNextObservation(product, asOf);
    if (days == null || days < 0) continue;
    const notional = product.tradeAmount ?? 0;
    if (days <= 30) {
      filterCounts["obs-due-1m"] += 1;
      filterNotional["obs-due-1m"] += notional;
    }
    if (days <= 60) {
      filterCounts["obs-due-2m"] += 1;
      filterNotional["obs-due-2m"] += notional;
    }
    if (days <= 90) {
      filterCounts["obs-due-3m"] += 1;
      filterNotional["obs-due-3m"] += notional;
    }
  }

  // Keep filter key order stable for callers that iterate LIFECYCLE_FILTERS.
  for (const filter of LIFECYCLE_FILTERS) {
    filterCounts[filter] = filterCounts[filter] ?? 0;
    filterNotional[filter] = filterNotional[filter] ?? 0;
  }

  const ongoingCount = filterCounts.ongoing;
  const maturingSoon = filterCounts["expiring-3m"];
  const expiring1m = filterCounts["expiring-1m"];
  const obsDue3m = filterCounts["obs-due-3m"];
  const obsDue2m = filterCounts["obs-due-2m"];
  const obsDue1m = filterCounts["obs-due-1m"];

  const headline: PortfolioHeadlineSnapshot = {
    liveNotional: resolveHeadlineLiveNotional(liveNotional, options?.newPrimaryTabNotional),
    deskBookNotional: liveNotional,
    totalProducts: validProducts.length,
    averageCoupon: couponCount > 0 ? couponSum / couponCount : 0,
    listedShare: validProducts.length > 0 ? listed / validProducts.length : 0,
    protectedShare: validProducts.length > 0 ? protectedCount / validProducts.length : 0,
    maturingSoon,
    expiring1m,
    obsDue3m,
    obsDue2m,
    obsDue1m,
    activeCount: ongoingCount + maturingSoon,
    activeNotional: filterNotional.ongoing + filterNotional["expiring-3m"],
    ongoingCount,
    expiredCount: filterCounts.expired,
    perpetualCount: buckets.perpetual.length,
    unknownCount: buckets.unknown.length,
    tabCounts: filterCounts,
    ongoingNotional: bucketNotional(buckets.ongoing),
    expiredNotional: bucketNotional(buckets.expired),
  };

  return { validProducts, buckets, filterCounts, filterNotional, headline };
}

/** Headline Live Notional — NEW PRIMARY tab Trade Amount when parsed, else desk-canonical AUM. */
function resolveHeadlineLiveNotional(deskBookNotional: number, newPrimaryTabNotional?: number): number {
  if (newPrimaryTabNotional != null && newPrimaryTabNotional > 0) return newPrimaryTabNotional;
  return deskBookNotional > 0 ? deskBookNotional : 0;
}

export function productsForLifecycleFilter(
  index: LifecycleIndex,
  filter: LifecycleFilter,
  asOf = new Date(),
): ProductRecord[] {
  return filterProductsByLifecycle(index.validProducts, filter, asOf);
}
