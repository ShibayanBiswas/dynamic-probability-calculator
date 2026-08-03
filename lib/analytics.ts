import { differenceInCalendarDays } from "date-fns";

import type { ProductRecord } from "@/lib/types";
import {
  MATURITY_WINDOW_1M_DAYS,
  MATURITY_WINDOW_3M_DAYS,
  filterProductsByLifecycle,
  getLifecycleNotional,
  LIFECYCLE_FILTER_LABELS,
  LIFECYCLE_STATUS_LABELS,
  partitionByLifecycle,
  UI_LIFECYCLE_FILTERS,
  type LifecycleFilter,
  type LifecycleStatus,
} from "@/lib/product-lifecycle";
import { formatIssuerChartLabel, normalizeIssuerKey } from "@/lib/issuer-chart-labels";
import {
  classifyProtection,
  getCouponPercent,
  getIndexEntryLevelRaw,
  getProductUnderlyingLabel,
  getTargetLevel,
  inferDebentureCount,
  resolveLiveIndexLevel,
} from "@/lib/product-utils";
import { getPhasePayoffTenorDays, getProductExpirationDate } from "@/lib/product-dates";
import { getProductLifecycleStatus } from "@/lib/product-lifecycle";
import { computeExpiredMark } from "@/lib/expired-mark";
import { resolveDeskIndexLevels } from "@/lib/desk-index-levels";
import { formatDeskDate } from "@/lib/market-data";
import { computeValuation } from "@/lib/workbook/valuation-engine";

/** Remaining-time windows spanning the full portfolio horizon. */
const MATURITY_WINDOWS: Array<{ label: string; maxDays: number }> = [
  { label: "0-1M", maxDays: MATURITY_WINDOW_1M_DAYS },
  { label: "1-3M", maxDays: MATURITY_WINDOW_3M_DAYS },
  { label: "3-6M", maxDays: 180 },
  { label: "6-12M", maxDays: 365 },
  { label: "1-2Y", maxDays: 730 },
  { label: "2-3Y", maxDays: 1095 },
  { label: "3-5Y", maxDays: 1825 },
  { label: "5Y+", maxDays: Number.POSITIVE_INFINITY },
];

function windowFor(days: number) {
  return MATURITY_WINDOWS.find((w) => days <= w.maxDays)?.label ?? "5Y+";
}

export type MaturityLadderMode = "remaining" | "elapsed";

/** Live tabs bucket time **until** expiry/rollover; expired tab buckets time **since** those dates. */
export function getMaturityLadderMode(products: ProductRecord[], asOf = new Date()): MaturityLadderMode {
  if (products.length === 0) return "remaining";
  const allExpired = products.every((p) => getProductLifecycleStatus(p, asOf) === "expired");
  return allExpired ? "elapsed" : "remaining";
}

export function getMaturityLadderSubtitle(mode: MaturityLadderMode): string {
  return mode === "elapsed"
    ? "Notional by elapsed window — phase schedule end (Maturity / POED / Rollover)"
    : "Notional by remaining window — phase schedule end (Maturity / POED / Rollover)";
}

export function getMaturityLadderAxisTitle(mode: MaturityLadderMode): string {
  return mode === "elapsed" ? "Elapsed Window" : "Remaining Window";
}

/**
 * Maturity ladder — single series by days to/from phase schedule end:
 * Blank / Phase 2 → Maturity · Phase 1 → POED · 10 Years → Rollover C/P.
 */
export function getMaturityLadder(products: ProductRecord[], asOf = new Date()) {
  const mode = getMaturityLadderMode(products, asOf);
  const rows = new Map<string, { bucket: string; notional: number }>(
    MATURITY_WINDOWS.map((w) => [w.label, { bucket: w.label, notional: 0 }]),
  );

  for (const product of products) {
    const weight = product.tradeAmount ?? 0;
    if (weight <= 0) continue;

    const expiration = getProductExpirationDate(product);
    if (!expiration) continue;

    const days = differenceInCalendarDays(expiration, asOf);
    const bucketDays = mode === "elapsed" ? -days : days;
    if (bucketDays >= 0) rows.get(windowFor(bucketDays))!.notional += weight;
  }

  return [...rows.values()].filter((row) => row.notional > 0);
}

const LIFECYCLE_COLORS_LIGHT: Record<LifecycleStatus, string> = {
  ongoing: "#d4b24c",
  expired: "#78716c",
  perpetual: "#b8860b",
  upcoming: "#7a1e2c",
  unknown: "#57534e",
};

const LIFECYCLE_COLORS_DARK: Record<LifecycleStatus, string> = {
  ongoing: "#e8c96a",
  expired: "#8a8278",
  perpetual: "#d4b24c",
  upcoming: "#b8956a",
  unknown: "#78716c",
};

export function getLifecycleChartData(
  products: ProductRecord[],
  asOf = new Date(),
  theme: "light" | "dark" = "light",
) {
  const palette = theme === "dark" ? LIFECYCLE_COLORS_DARK : LIFECYCLE_COLORS_LIGHT;
  return getLifecycleNotional(products, asOf)
    .filter((entry) => entry.status !== "unknown" && entry.count > 0)
    .map((entry) => ({
    ...entry,
    label: LIFECYCLE_STATUS_LABELS[entry.status],
    color: palette[entry.status],
  }));
}

export function getCouponDistribution(products: ProductRecord[]) {
  /** Desk bands — finer splits above 15% where Primary coupons cluster. */
  const bands: Array<{ label: string; min: number; max: number }> = [
    { label: "0-5%", min: 0, max: 5 },
    { label: "5-10%", min: 5, max: 10 },
    { label: "10-15%", min: 10, max: 15 },
    { label: "15-50%", min: 15, max: 50 },
    { label: "50-75%", min: 50, max: 75 },
    { label: "75-90%", min: 75, max: 90 },
    { label: "90-95%", min: 90, max: 95 },
    { label: "95-100%", min: 95, max: 100 },
    { label: "100%+", min: 100, max: Number.POSITIVE_INFINITY },
  ];

  const buckets = new Map<string, number>(bands.map((b) => [b.label, 0]));
  buckets.set("No coupon", 0);

  for (const product of products) {
    const weight = product.tradeAmount ?? 0;
    const coupon = getCouponPercent(product);
    const couponPct = coupon === undefined ? undefined : coupon * 100;
    if (couponPct === undefined || couponPct === 0) {
      buckets.set("No coupon", (buckets.get("No coupon") ?? 0) + weight);
      continue;
    }
    const band = bands.find((b) => couponPct >= b.min && (b.max === Number.POSITIVE_INFINITY ? couponPct >= b.min : couponPct < b.max));
    if (band) {
      buckets.set(band.label, (buckets.get(band.label) ?? 0) + weight);
    }
  }

  return [...buckets.entries()]
    .map(([bucket, value]) => ({ bucket, value }))
    .filter((row) => row.value > 0);
}

export function getProtectionMix(products: ProductRecord[], theme: "light" | "dark" = "light") {
  let protectedNotional = 0;
  let exposedNotional = 0;
  let unknown = 0;

  for (const product of products) {
    const n = product.tradeAmount ?? 0;
    const klass = classifyProtection(product.principalProtection);
    if (klass === "protected") {
      protectedNotional += n;
    } else if (klass === "exposed") {
      exposedNotional += n;
    } else {
      unknown += n;
    }
  }

  const colors =
    theme === "dark"
      ? { protected: "#6ee7a8", exposed: "#e8a04a", unknown: "#78716c" }
      : { protected: "#4ade80", exposed: "#fb7185", unknown: "#64748b" };

  return [
    { name: "Principal Protected", value: protectedNotional, color: colors.protected },
    { name: "Capital at Risk", value: exposedNotional, color: colors.exposed },
    { name: "Unclassified", value: unknown, color: colors.unknown },
  ].filter((e) => e.value > 0);
}

function getNotionalRankedExposure(
  products: ProductRecord[],
  field: "underlying" | "issuer",
  topN = 10,
  rollupOther = true,
): Array<{ label: string; value: number }> {
  const map = new Map<string, { label: string; value: number }>();
  for (const product of products) {
    const raw = (field === "underlying" ? product.underlying : product.issuer)?.trim() || "";
    const label = raw || "Unspecified";
    const key = field === "issuer" ? normalizeIssuerKey(label) : label;
    const current = map.get(key);
    if (current) {
      current.value += product.tradeAmount ?? 0;
      continue;
    }
    map.set(key, { label, value: product.tradeAmount ?? 0 });
  }

  const sorted = [...map.values()].sort((a, b) => b.value - a.value);

  if (topN >= sorted.length) return sorted;

  const top = sorted.slice(0, topN);
  if (!rollupOther) return top;

  const otherValue = sorted.slice(topN).reduce((sum, row) => sum + row.value, 0);
  if (otherValue > 0) {
    top.push({ label: "Other", value: otherValue });
  }
  return top;
}

/** AUM-weighted underlying bars — master names as-is, top 2 plus an Other rollup. */
export function getUnderlyingExposure(products: ProductRecord[], topN = 2) {
  return getNotionalRankedExposure(products, "underlying", topN).map(({ label, value }) => ({
    underlying: label,
    value,
  }));
}

/** AUM-weighted issuer bars — every issuer in the active book, axis-friendly labels. */
export function getIssuerExposure(products: ProductRecord[]) {
  return getNotionalRankedExposure(products, "issuer", Number.MAX_SAFE_INTEGER, false).map(
    ({ label, value }) => {
      const formatted = formatIssuerChartLabel(label);
      return {
        issuer: formatted.short,
        issuerFull: formatted.full,
        value,
      };
    },
  );
}

function tenorBand(days: number): string {
  if (days < 365) return "< 1Y";
  if (days < 730) return "1-2Y";
  if (days < 1095) return "2-3Y";
  if (days < 1825) return "3-5Y";
  return "5Y+";
}

/**
 * Tenor profile — notional by phase schedule end (same anchors as Maturity Ladder):
 * Blank / Phase 2 → Maturity · Phase 1 → POED · 10 Years → Rollover C/P.
 *
 * | Book | Days measured |
 * |------|----------------|
 * | Live (ongoing / obs-due) | Remaining as-of → phase schedule end |
 * | Expired | Full phase tenure (Working!F → schedule end) |
 */
export function getTenorDistribution(products: ProductRecord[], asOf = new Date()) {
  const mode = getMaturityLadderMode(products, asOf);
  const bandOrder = ["< 1Y", "1-2Y", "2-3Y", "3-5Y", "5Y+"] as const;
  const rows = new Map<string, { bucket: string; notional: number }>(
    bandOrder.map((b) => [b, { bucket: b, notional: 0 }]),
  );

  for (const product of products) {
    const weight = product.tradeAmount ?? 0;
    if (weight <= 0) continue;

    let days: number | undefined;
    if (mode === "elapsed") {
      days = getPhasePayoffTenorDays(product);
    } else {
      // Same SSOT as Maturity Ladder: only products with a phase schedule end contribute.
      const end = getProductExpirationDate(product);
      if (!end) continue;
      const remaining = differenceInCalendarDays(end, asOf);
      if (remaining < 0) continue;
      days = remaining;
    }

    if (days != null && days >= 0) rows.get(tenorBand(days))!.notional += weight;
  }

  return [...rows.values()].filter((row) => row.notional > 0);
}

export function getTenorProfileSubtitle(products: ProductRecord[], asOf = new Date()): string {
  const mode = getMaturityLadderMode(products, asOf);
  return mode === "elapsed"
    ? "Notional by full phase tenure — Working!F → schedule end (Maturity / POED / Rollover)"
    : "Notional by remaining window — phase schedule end (Maturity / POED / Rollover)";
}

export function getTenorProfileSeriesName(products: ProductRecord[], asOf = new Date()): string {
  const mode = getMaturityLadderMode(products, asOf);
  return mode === "elapsed" ? "Phase tenure" : "Remaining to phase end";
}

export function getExpiredVsOngoingTable(products: ProductRecord[], asOf = new Date()) {
  const buckets = partitionByLifecycle(products, asOf);
  const statusOrder: LifecycleStatus[] = [
    "ongoing",
    "upcoming",
    "expired",
    "perpetual",
  ];

  return statusOrder
    .map((status) => {
      const pool = buckets[status];
      const coupons = pool.map((p) => getCouponPercent(p)).filter((c): c is number => c !== undefined);
      return {
        status,
        count: pool.length,
        notional: pool.reduce((s, p) => s + (p.tradeAmount ?? 0), 0),
        avgCoupon: coupons.length > 0 ? coupons.reduce((s, c) => s + c, 0) / coupons.length : 0,
      };
    })
    .filter((row) => row.count > 0);
}

/** Desk Lifecycle Intelligence rows — Ongoing + Observation Due 3M / 2M / 1M (always listed). */
export type LiveBookLifecycleTableRow = {
  filter: LifecycleFilter;
  label: string;
  count: number;
  notional: number;
  avgCoupon: number;
  color: string;
};

const LIVE_BOOK_FILTER_COLORS: Record<(typeof UI_LIFECYCLE_FILTERS)[number], string> = {
  ongoing: "#047857",
  "obs-due-3m": "#6d28d9",
  "obs-due-2m": "#7c3aed",
  "obs-due-1m": "#a855f7",
};

export function getLiveBookLifecycleTable(
  products: ProductRecord[],
  asOf = new Date(),
): LiveBookLifecycleTableRow[] {
  return UI_LIFECYCLE_FILTERS.map((filter) => {
    const pool = filterProductsByLifecycle(products, filter, asOf);
    const coupons = pool.map((p) => getCouponPercent(p)).filter((c): c is number => c !== undefined);
    return {
      filter,
      label: LIFECYCLE_FILTER_LABELS[filter],
      count: pool.length,
      notional: pool.reduce((s, p) => s + (p.tradeAmount ?? 0), 0),
      avgCoupon: coupons.length > 0 ? coupons.reduce((s, c) => s + c, 0) / coupons.length : 0,
      color: LIVE_BOOK_FILTER_COLORS[filter],
    };
  });
}

export function getLifecycleTableTotals(products: ProductRecord[], _asOf?: Date) {
  void _asOf;
  const coupons = products.map((p) => getCouponPercent(p)).filter((c): c is number => c !== undefined);
  return {
    count: products.length,
    notional: products.reduce((s, p) => s + (p.tradeAmount ?? 0), 0),
    avgCoupon: coupons.length > 0 ? coupons.reduce((s, c) => s + c, 0) / coupons.length : 0,
  };
}

export type StatSummary = { min: number | null; max: number | null; avg: number | null; count: number };

/** Placeholder when a spread metric does not apply to the active bucket (e.g. portfolio coupon at last obs for Expired). */
export const EMPTY_STAT_SUMMARY: StatSummary = { min: null, max: null, avg: null, count: 0 };

export function summariseStat(values: number[]): StatSummary {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return { min: null, max: null, avg: null, count: 0 };
  return {
    min: Math.min(...clean),
    max: Math.max(...clean),
    avg: clean.reduce((s, v) => s + v, 0) / clean.length,
    count: clean.length,
  };
}

export type UnderlyingSpreadSection = {
  /** Underlying name from master — any value on the NEW PRIMARY desk book. */
  underlying: string;
  count: number;
  notional: number;
  initialLevel: StatSummary;
  finalLevel: StatSummary;
  fullCoupon: StatSummary;
  currentCoupon: StatSummary;
};

export type LifecycleCategoryStats = {
  count: number;
  aum: number;
  averageCoupon: number;
  listedShare: number;
  /** Portfolio-wide blend — prefer underlyingSpreads for level metrics in UI. */
  initialLevel: StatSummary;
  finalLevel: StatSummary;
  fullCoupon: StatSummary;
  currentCoupon: StatSummary;
  /** One row-group per distinct master underlying, sorted by notional. */
  underlyingSpreads: UnderlyingSpreadSection[];
};

export type SpreadAccumulator = {
  count: number;
  notional: number;
  initial: number[];
  final: number[];
  full: number[];
  current: number[];
};

export function emptySpreadAccumulator(): SpreadAccumulator {
  return { count: 0, notional: 0, initial: [], final: [], full: [], current: [] };
}

export function createSpreadAccumulators(): Map<string, SpreadAccumulator> {
  return new Map();
}

export function buildUnderlyingSpreadSections(
  spreads: Map<string, SpreadAccumulator>,
  poolIsExpiredBook: boolean,
): UnderlyingSpreadSection[] {
  return [...spreads.entries()]
    .map(([underlying, acc]) => ({
      underlying,
      count: acc.count,
      notional: acc.notional,
      initialLevel: summariseStat(acc.initial),
      finalLevel: summariseStat(acc.final),
      fullCoupon: summariseStat(acc.full),
      currentCoupon: poolIsExpiredBook ? EMPTY_STAT_SUMMARY : summariseStat(acc.current),
    }))
    .sort((a, b) => b.notional - a.notional || b.count - a.count || a.underlying.localeCompare(b.underlying));
}

export function accumulateSpreadProduct(
  spreads: Map<string, SpreadAccumulator>,
  product: ProductRecord,
  absReturn?: number,
) {
  const label = getProductUnderlyingLabel(product);
  const acc = spreads.get(label) ?? emptySpreadAccumulator();
  acc.count += 1;
  acc.notional += product.tradeAmount ?? 0;

  const entry = getIndexEntryLevelRaw(product);
  const target = getTargetLevel(product);
  const coupon = getCouponPercent(product);
  if (entry != null) acc.initial.push(entry);
  if (target != null && target > 0) acc.final.push(target);
  if (coupon != null) acc.full.push(coupon);
  if (absReturn != null && Number.isFinite(absReturn)) acc.current.push(absReturn);

  spreads.set(label, acc);
}

/**
 * Quick desk statistics for a lifecycle bucket. Underlying initial/final levels
 * come straight from the master; full coupon is the headline participation and
 * current coupon is the live mark-to-market return (Working X/U − 1) for
 * products that are still running.
 */
export function getLifecycleCategoryStats(
  products: ProductRecord[],
  levels: { niftyLevel?: number; sensexLevel?: number },
  asOf = new Date(),
): LifecycleCategoryStats {
  const deskToday = formatDeskDate(asOf);
  const resolvedLevels = resolveDeskIndexLevels(levels, asOf);
  const poolIsExpiredBook =
    products.length > 0 && products.every((p) => getProductLifecycleStatus(p, asOf) === "expired");
  const initial: number[] = [];
  const final: number[] = [];
  const full: number[] = [];
  const current: number[] = [];
  const spreads = createSpreadAccumulators();

  for (const product of products) {
    const entry = getIndexEntryLevelRaw(product);
    if (entry != null) initial.push(entry);

    const target = getTargetLevel(product);
    if (target != null && target > 0) final.push(target);

    const coupon = getCouponPercent(product);
    if (coupon != null) full.push(coupon);

    if (poolIsExpiredBook || !product.formulaText) {
      accumulateSpreadProduct(spreads, product);
      continue;
    }

    const status = getProductLifecycleStatus(product, asOf);
    let absReturn: number | undefined;
    if (status === "expired") {
      const mark = computeExpiredMark(product);
      if (mark && Number.isFinite(mark.absReturn)) absReturn = mark.absReturn;
    } else {
      const valuation = computeValuation(product, {
        valuationDate: deskToday,
        currentLevel: resolveLiveIndexLevel(product, resolvedLevels),
        debentures: inferDebentureCount(product),
      });
      if (Number.isFinite(valuation.absReturn)) absReturn = valuation.absReturn;
    }

    if (absReturn != null) current.push(absReturn);
    accumulateSpreadProduct(spreads, product, absReturn);
  }

  const coupons = full;
  const listed = products.filter((p) => p.listing?.toLowerCase() === "listed").length;

  return {
    count: products.length,
    aum: products.reduce((s, p) => s + (p.tradeAmount ?? 0), 0),
    averageCoupon: coupons.length > 0 ? coupons.reduce((s, c) => s + c, 0) / coupons.length : 0,
    listedShare: products.length > 0 ? listed / products.length : 0,
    initialLevel: summariseStat(initial),
    finalLevel: summariseStat(final),
    fullCoupon: summariseStat(full),
    currentCoupon: poolIsExpiredBook ? EMPTY_STAT_SUMMARY : summariseStat(current),
    underlyingSpreads: buildUnderlyingSpreadSections(spreads, poolIsExpiredBook),
  };
}
