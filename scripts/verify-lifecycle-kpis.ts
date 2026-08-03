/**
 * Validates lifecycle KPI tiles (AUM, Avg Coupon, Listed, Protected) per bucket.
 * Usage: npx tsx scripts/verify-lifecycle-kpis.ts [ongoing|expired|obs-due-3m]
 */
import { filterProductsByLifecycle, LIFECYCLE_FILTERS, type LifecycleFilter } from "../lib/product-lifecycle";
import { getCouponPercent, classifyProtection } from "../lib/product-utils";
import type { ProductRecord } from "../lib/types";
import { formatCrores, formatNumber, formatPercent } from "../lib/utils";
import { loadCanonicalProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

function computeKpis(pool: ProductRecord[]) {
  const aum = pool.reduce((s, p) => s + (p.tradeAmount ?? 0), 0);
  const coupons = pool.map((p) => getCouponPercent(p)).filter((x): x is number => x !== undefined);
  const avgCoupon = coupons.length ? coupons.reduce((a, b) => a + b, 0) / coupons.length : 0;
  const listedCount = pool.filter((p) => p.listing?.toLowerCase() === "listed").length;
  const protectedCount = pool.filter((p) => classifyProtection(p.principalProtection) === "protected").length;
  return {
    count: pool.length,
    aum,
    aumDisplay: formatCrores(aum),
    avgCoupon,
    avgCouponDisplay: formatPercent(avgCoupon),
    listedShare: pool.length ? listedCount / pool.length : 0,
    listedDisplay: formatPercent(pool.length ? listedCount / pool.length : 0),
    protectedShare: pool.length ? protectedCount / pool.length : 0,
    protectedDisplay: formatPercent(pool.length ? protectedCount / pool.length : 0),
    listedCount,
    protectedCount,
    withCoupon: coupons.length,
    withoutCoupon: pool.length - coupons.length,
  };
}

const filterArg = process.argv[2] as LifecycleFilter | undefined;
const filters = filterArg && LIFECYCLE_FILTERS.includes(filterArg) ? [filterArg] : [...LIFECYCLE_FILTERS];

const asOf = new Date();

console.log("Loading products…");
warnIfWorkbookDriftsFromSeed();
const master = loadCanonicalProducts(asOf);
console.log(`As of: ${asOf.toLocaleString("en-IN")}\n`);

for (const filter of filters) {
  const pool = filterProductsByLifecycle(master, filter, asOf);
  const k = computeKpis(pool);
  console.log(`=== ${filter.toUpperCase()} ===`);
  console.log(`  Products:    ${formatNumber(k.count)}`);
  console.log(`  AUM:         ${k.aumDisplay}  (raw ₹${k.aum.toLocaleString("en-IN")})`);
  console.log(`  Avg Coupon:  ${k.avgCouponDisplay}  (decimal ${k.avgCoupon.toFixed(4)}, n=${k.withCoupon} with coupon, ${k.withoutCoupon} missing)`);
  console.log(`  Listed:      ${k.listedDisplay}  (${k.listedCount} of ${k.count})`);
  console.log(`  Protected:   ${k.protectedDisplay}  (${k.protectedCount} of ${k.count})`);
  console.log("");
}
