/**
 * Audit Analytics Lab (ScienceLab) chart numbers vs canonical master-seed book.
 * Usage: npx tsx scripts/verify-analytics-plots.ts [ongoing|expired|obs-due-3m]
 */
import {
  getCouponDistribution,
  getIssuerExposure,
  getLifecycleChartData,
  getMaturityLadder,
  getMaturityLadderMode,
  getProtectionMix,
  getTenorDistribution,
  getUnderlyingExposure,
} from "../lib/analytics";
import {
  filterProductsByLifecycle,
  getProductLifecycleStatus,
  LIFECYCLE_FILTERS,
  type LifecycleFilter,
} from "../lib/product-lifecycle";
import { classifyProtection, getCouponPercent } from "../lib/product-utils";
import { formatCrores, formatNumber, formatPercent } from "../lib/utils";
import {
  loadCanonicalProducts,
  loadSeedProducts,
  warnIfWorkbookDriftsFromSeed,
} from "./lib/load-canonical-dataset";

function crores(n: number) {
  return formatCrores(n);
}

function auditFilter(filter: LifecycleFilter, asOf: Date) {
  const all = loadSeedProducts();
  const master = loadCanonicalProducts(asOf);
  const pool = filterProductsByLifecycle(master, filter, asOf);

  const aum = pool.reduce((s, p) => s + (p.tradeAmount ?? 0), 0);
  const coupons = pool.map((p) => getCouponPercent(p)).filter((x): x is number => x !== undefined);
  const avgCoupon = coupons.length ? coupons.reduce((a, b) => a + b, 0) / coupons.length : 0;

  const lifecycle = getLifecycleChartData(pool, asOf);
  const couponDist = getCouponDistribution(pool);
  const protection = getProtectionMix(pool);
  const underlyings = getUnderlyingExposure(pool);
  const issuers = getIssuerExposure(pool);
  const tenor = getTenorDistribution(pool, asOf);

  const statusBreakdown = new Map<string, { count: number; notional: number }>();
  for (const p of pool) {
    const st = getProductLifecycleStatus(p, asOf);
    const cur = statusBreakdown.get(st) ?? { count: 0, notional: 0 };
    cur.count += 1;
    cur.notional += p.tradeAmount ?? 0;
    statusBreakdown.set(st, cur);
  }

  const couponSum = couponDist.reduce((s, b) => s + b.value, 0);
  const protectionSum = protection.reduce((s, b) => s + b.value, 0);
  const tenorSum = tenor.reduce((s, b) => s + b.notional, 0);
  const underlyingSum = getUnderlyingExposure(pool).reduce((s, b) => s + b.value, 0);
  const issuerSum = getIssuerExposure(pool).reduce((s, b) => s + b.value, 0);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`ANALYTICS LAB AUDIT · ${filter.toUpperCase()} · as of ${asOf.toLocaleString("en-IN")}`);
  console.log(`${"=".repeat(60)}`);

  console.log(`\n--- Pool (valid Primary master only) ---`);
  console.log(`  Products:     ${formatNumber(pool.length)}`);
  console.log(`  AUM:          ${crores(aum)}  (raw ₹${aum.toLocaleString("en-IN")})`);
  console.log(`  Avg coupon:   ${formatPercent(avgCoupon)}  (n=${coupons.length})`);
  console.log(`  Excluded:     ${formatNumber(all.length - master.length)} invalid/unknown rows`);

  console.log(`\n--- 1. LIFECYCLE UNIVERSE (pie legend) ---`);
  for (const entry of lifecycle.filter((e) => e.count > 0)) {
    console.log(`  ${entry.label}: ${formatNumber(entry.count)} · ${crores(entry.notional)}`);
  }
  console.log(`  Status within tab:`);
  for (const [st, v] of statusBreakdown) {
    console.log(`    ${st}: ${formatNumber(v.count)} · ${crores(v.notional)}`);
  }

  console.log(`\n--- 2. COUPON DISTRIBUTION (AUM-weighted notional by bucket) ---`);
  for (const row of couponDist) {
    const pct = aum > 0 ? ((row.value / aum) * 100).toFixed(1) : "0";
    console.log(`  ${row.bucket.padEnd(12)} ${crores(row.value).padStart(14)}  (${pct}% of tab AUM)`);
  }
  console.log(`  Bucket sum:   ${crores(couponSum)}  match AUM: ${Math.abs(couponSum - aum) < 1 ? "YES" : "NO Δ" + crores(couponSum - aum)}`);

  console.log(`\n--- 3. PRINCIPAL PROTECTION MIX ---`);
  for (const row of protection) {
    const pct = aum > 0 ? ((row.value / aum) * 100).toFixed(1) : "0";
    console.log(`  ${row.name.padEnd(22)} ${crores(row.value).padStart(14)}  (${pct}%)`);
  }
  const protectedCount = pool.filter((p) => classifyProtection(p.principalProtection) === "protected").length;
  const exposedCount = pool.filter((p) => classifyProtection(p.principalProtection) === "exposed").length;
  console.log(`  Counts: protected=${protectedCount}, exposed=${exposedCount}, unclassified=${pool.length - protectedCount - exposedCount}`);
  console.log(`  Mix sum:      ${crores(protectionSum)}  match AUM: ${Math.abs(protectionSum - aum) < 1 ? "YES" : "NO"}`);

  console.log(`\n--- 4. UNDERLYING EXPOSURE · TOP 2 + OTHER ---`);
  for (const row of underlyings) {
    const pct = aum > 0 ? ((row.value / aum) * 100).toFixed(1) : "0";
    console.log(`  ${(row.underlying ?? "Other").padEnd(20)} ${crores(row.value).padStart(14)}  (${pct}%)`);
  }
  console.log(`  Chart bars:   ${formatNumber(underlyings.length)} (expect ≤3: top 2 + Other) · sum ${crores(underlyingSum)}  match AUM: ${Math.abs(underlyingSum - aum) < 1 ? "YES" : "NO Δ" + crores(underlyingSum - aum)}`);
  if (underlyings.length > 3) {
    console.log(`  WARN: more than 3 bars — top-N rollup may be misconfigured`);
  }

  console.log(`\n--- 5. ISSUER EXPOSURE · ALL ISSUERS ---`);
  for (const row of issuers) {
    const pct = aum > 0 ? ((row.value / aum) * 100).toFixed(1) : "0";
    console.log(`  ${(row.issuerFull ?? row.issuer ?? "Other").padEnd(20)} ${crores(row.value).padStart(14)}  (${pct}%)`);
  }
  console.log(`  Chart bars:   ${formatNumber(issuers.length)} · sum ${crores(issuerSum)}  match AUM: ${Math.abs(issuerSum - aum) < 1 ? "YES" : "NO Δ" + crores(issuerSum - aum)}`);

  console.log(`\n--- 6. TENOR PROFILE (remaining / phase tenure · same end as ladder) ---`);
  for (const row of tenor.filter((t) => t.notional > 0)) {
    console.log(`  ${row.bucket.padEnd(10)} ${crores(row.notional).padStart(14)}`);
  }
  console.log(`  Tenor sum:    ${crores(tenorSum)}  match AUM: ${Math.abs(tenorSum - aum) < 1 ? "YES" : "NO Δ" + crores(tenorSum - aum)}`);

  const ladder = getMaturityLadder(pool, asOf);
  const ladderMode = getMaturityLadderMode(pool, asOf);
  const ladderNotional = ladder.reduce((s, r) => s + r.notional, 0);
  console.log(`\n--- 7. MATURITY LADDER (${ladderMode}) · phase schedule end ---`);
  for (const row of ladder) {
    console.log(`  ${row.bucket.padEnd(10)} ${crores(row.notional).padStart(14)}`);
  }
  if (pool.length > 0 && ladder.length === 0) {
    console.log(`  FAIL: empty ladder for ${pool.length} products`);
    process.exitCode = 1;
  } else {
    console.log(`  Buckets: ${ladder.length} · notional ${crores(ladderNotional)}`);
  }

  // Live tabs: same phase-schedule-end SSOT as maturity ladder → same contributing notional
  if (ladderMode === "remaining" && pool.length > 0) {
    const tenorHas = tenor.some((t) => t.notional > 0);
    if (!tenorHas) {
      console.log(`  FAIL: empty tenor profile for live book`);
      process.exitCode = 1;
    }
    if (Math.abs(tenorSum - ladderNotional) >= 1) {
      console.log(
        `  FAIL: tenor notional ${crores(tenorSum)} ≠ ladder ${crores(ladderNotional)} (same phase end required)`,
      );
      process.exitCode = 1;
    } else {
      console.log(`  Tenor ↔ Ladder notional parity: YES`);
    }
  }

  return { pool: pool.length, aum, lifecycle, couponDist, protection, underlyings, tenor, ladder };
}

const filterArg = process.argv[2] as LifecycleFilter | undefined;
const filters =
  filterArg && LIFECYCLE_FILTERS.includes(filterArg) ? [filterArg] : [...LIFECYCLE_FILTERS];

console.log("Loading master products…");
warnIfWorkbookDriftsFromSeed();
const asOf = new Date();

for (const f of filters) {
  auditFilter(f, asOf);
}

if (filters.includes("ongoing") || filterArg === "ongoing") {
  console.log(`\n${"=".repeat(60)}`);
  console.log("USER UI CROSS-CHECK (Ongoing tab)");
  console.log(`${"=".repeat(60)}`);
  const master = loadCanonicalProducts(asOf);
  const pool = filterProductsByLifecycle(master, "ongoing", asOf);
  const aum = pool.reduce((s, p) => s + (p.tradeAmount ?? 0), 0);
  const lifecycle = getLifecycleChartData(pool, asOf);
  const ongoingSlice = lifecycle.find((e) => e.status === "ongoing");
  console.log(`\n  UI reported:  Ongoing · 2263 · ₹24,838.36 Cr`);
  console.log(`  Engine now:   Ongoing · ${formatNumber(ongoingSlice?.count ?? 0)} · ${crores(ongoingSlice?.notional ?? 0)}`);
  console.log(`  Tab pool:     ${formatNumber(pool.length)} products · ${crores(aum)}`);
  const countOk = ongoingSlice?.count === 2263 || ongoingSlice?.count === pool.length;
  void countOk;
  console.log(`  Note: Pie shows status "ongoing" count (${ongoingSlice?.count}), tab pool (${pool.length}) includes perpetual if any.`);
}
