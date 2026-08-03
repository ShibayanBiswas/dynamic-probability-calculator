/**
 * Full-book metric integrity: value, abs return, IRR, coupon formed.
 * Validates internal math + classifies desk logic path per product.
 *
 * Usage: npx tsx scripts/verify-all-product-metrics.ts [DD-MM-YYYY]
 */
import { differenceInCalendarDays } from "date-fns";

import { hasProductIndexSource } from "../lib/desk-index-guards";
import { resolveHistoricalIndexLevel } from "../lib/expired-mark";
import { formatDeskDate } from "../lib/market-data";
import { resolveIndexLevelsAtDate } from "../lib/market-index-at-date";
import { getPhasePayoffTenorDays, getProductExpirationDate, getProductFinalObservationDate } from "../lib/product-dates";
import {
  filterProductsByLifecycle,
  filterValidMasterProducts,
  isValuationApplicableAt,
} from "../lib/product-lifecycle";
import { inferDebentureCount, isSensexLinked, resolveLiveIndexLevel } from "../lib/product-utils";
import { parseExcelishDate } from "../lib/workbook/dates";
import { computeValuation } from "../lib/workbook/valuation-engine";
import {
  isLastObservationPassed,
  qualifiesForFullCoupon,
  qualifiesForProjectedFullCoupon,
} from "../lib/workbook/valuation-performance";
import { irrFromReturn } from "../lib/workbook/irr";
import { loadSeedProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

const DESK_DATE_ARG = process.argv[2];
const TOL = 0.02;

type LogicPath =
  | "extrapolation"
  | "projected-full-coupon"
  | "realised-full-coupon"
  | "post-obs-growth"
  | "spot-below-entry"
  | "no-formula";

type MetricIssue = {
  isin: string;
  name: string;
  pool: string;
  code: string;
  detail: string;
};

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

function classifyPath(
  pool: string,
  product: Parameters<typeof computeValuation>[0],
  valDate: Date,
  entry: number,
  currentLevel: number,
): LogicPath {
  if (!product.formulaText?.trim()) return "no-formula";
  const sensex = isSensexLinked(product);
  const finalObs = getProductFinalObservationDate(product);
  if (currentLevel < entry && !isLastObservationPassed(product, valDate)) return "spot-below-entry";
  if (finalObs && valDate.getTime() > finalObs.getTime()) return "post-obs-growth";
  if (isLastObservationPassed(product, valDate) && qualifiesForFullCoupon(product, valDate, sensex)) {
    return "realised-full-coupon";
  }
  if (qualifiesForProjectedFullCoupon(product, valDate, entry, currentLevel, sensex)) {
    return "projected-full-coupon";
  }
  void pool;
  return "extrapolation";
}

function checkMetrics(
  product: Parameters<typeof computeValuation>[0],
  pool: string,
  v: ReturnType<typeof computeValuation>,
  issues: MetricIssue[],
) {
  const u = v.clientInvestment;
  if (!(u > 0)) return;

  const expectedAbs = v.productValue / u - 1;
  if (Math.abs(v.absReturn - expectedAbs) > TOL / 100) {
    issues.push({
      isin: product.isin ?? "—",
      name: product.name?.slice(0, 40) ?? "—",
      pool,
      code: "ABS_MISMATCH",
      detail: `abs ${v.absReturn.toFixed(4)} vs value/u-1 ${expectedAbs.toFixed(4)}`,
    });
  }

  const phaseTenor = getPhasePayoffTenorDays(product) ?? v.elapsedDays;
  const expectedIrr = irrFromReturn(v.formulaReturn, phaseTenor);
  if (Math.abs(v.productIrr - expectedIrr) > TOL / 100) {
    issues.push({
      isin: product.isin ?? "—",
      name: product.name?.slice(0, 40) ?? "—",
      pool,
      code: "IRR_MISMATCH",
      detail: `irr ${v.productIrr.toFixed(4)} vs expected ${expectedIrr.toFixed(4)}`,
    });
  }

  if (!Number.isFinite(v.formulaReturn)) {
    issues.push({
      isin: product.isin ?? "—",
      name: product.name?.slice(0, 40) ?? "—",
      pool,
      code: "COUPON_NAN",
      detail: "formulaReturn not finite",
    });
  }

  if (!(v.productValue > 0)) {
    issues.push({
      isin: product.isin ?? "—",
      name: product.name?.slice(0, 40) ?? "—",
      pool,
      code: "ZERO_VALUE",
      detail: "productValue <= 0",
    });
  }
}

async function main() {
  const asOf = DESK_DATE_ARG ? (parseExcelishDate(DESK_DATE_ARG) ?? new Date()) : new Date();
  warnIfWorkbookDriftsFromSeed(asOf);
  const deskDate = formatDeskDate(asOf);
  const products = filterValidMasterProducts(loadSeedProducts(), asOf);
  const withFormula = products.filter((p) => p.formulaText?.trim());

  const pools = {
    ongoing: filterProductsByLifecycle(withFormula, "ongoing", asOf).filter((p) =>
      isValuationApplicableAt(p, deskDate),
    ),
    expired: filterProductsByLifecycle(withFormula, "expired", asOf),
    expiring: filterProductsByLifecycle(withFormula, "expiring-3m", asOf).filter((p) =>
      isValuationApplicableAt(p, deskDate),
    ),
    obsDue: filterProductsByLifecycle(withFormula, "obs-due-3m", asOf).filter((p) =>
      isValuationApplicableAt(p, deskDate),
    ),
  };

  const levels = await resolveIndexLevelsAtDate(deskDate);
  const niftyLevel = levels?.niftyLevel;
  const sensexLevel = levels?.sensexLevel;

  const issues: MetricIssue[] = [];
  const pathCounts: Record<LogicPath, number> = {
    extrapolation: 0,
    "projected-full-coupon": 0,
    "realised-full-coupon": 0,
    "post-obs-growth": 0,
    "spot-below-entry": 0,
    "no-formula": 0,
  };

  let totalMarked = 0;
  let totalChecked = 0;
  let totalNoIndex = 0;
  let couponNonZero = 0;
  let absNonZero = 0;
  let irrNonZero = 0;
  let couponGtAbs = 0;
  let absGtCoupon = 0;

  for (const [poolName, poolProducts] of Object.entries(pools)) {
    for (const p of poolProducts) {
      totalChecked += 1;
      let currentLevel: number | undefined;
      let valDateStr = deskDate;

      if (poolName === "expired") {
        const fo = getProductFinalObservationDate(p);
        if (!fo) continue;
        valDateStr = fmt(fo);
        currentLevel = resolveHistoricalIndexLevel(p, fo);
      } else {
        if (!hasProductIndexSource(p, niftyLevel, sensexLevel)) {
          totalNoIndex += 1;
          continue;
        }
        currentLevel = resolveLiveIndexLevel(p, { niftyLevel, sensexLevel });
      }

      if (currentLevel == null || !(currentLevel > 0)) {
        totalNoIndex += 1;
        continue;
      }

      const valDate = parseExcelishDate(valDateStr) ?? asOf;
      const v = computeValuation(p, {
        valuationDate: valDateStr,
        currentLevel,
        debentures: inferDebentureCount(p),
      });

      checkMetrics(p, poolName, v, issues);

      const path = classifyPath(poolName, p, valDate, v.indexEntryLevel, currentLevel);
      pathCounts[path] += 1;

      if (v.productValue > 0 && Number.isFinite(v.absReturn) && Number.isFinite(v.productIrr)) {
        totalMarked += 1;
        if (Math.abs(v.formulaReturn) > 1e-6) couponNonZero += 1;
        if (Math.abs(v.absReturn) > 1e-6) absNonZero += 1;
        if (Math.abs(v.productIrr) > 1e-6) irrNonZero += 1;
        if (v.formulaReturn > v.absReturn + 0.001) couponGtAbs += 1;
        if (v.absReturn > v.formulaReturn + 0.001) absGtCoupon += 1;
      }
    }
  }

  // Post-last-obs Logic lock → phase end U·(1+S) (not Working!Y compounding)
  let lockChecks = 0;
  let lockPass = 0;
  for (const p of pools.expired) {
    const fo = getProductFinalObservationDate(p);
    const anchor = getProductExpirationDate(p) ?? fo;
    if (!fo || !anchor || !p.formulaText?.trim()) continue;
    const gap = differenceInCalendarDays(anchor, fo);
    if (gap < 1) continue;
    const obsLvl = resolveHistoricalIndexLevel(p, fo);
    if (obsLvl == null || !(obsLvl > 0)) continue;
    const atObs = computeValuation(p, { valuationDate: fmt(fo), currentLevel: obsLvl, debentures: 1 });
    const atAnchor = computeValuation(p, {
      valuationDate: fmt(anchor),
      currentLevel: resolveHistoricalIndexLevel(p, anchor) ?? obsLvl,
      debentures: 1,
    });
    if (!(atObs.productValue > 0)) continue;
    lockChecks += 1;
    const U = atObs.clientInvestment;
    const S = atObs.formulaReturn;
    const expectedEnd = Math.round(Math.max(U, U * (1 + S)));
    const couponLocked = Math.abs(atAnchor.formulaReturn - S) < 1e-9;
    const valueOk = Math.abs(atAnchor.productValue - expectedEnd) <= 2;
    if (couponLocked && valueOk) lockPass += 1;
  }

  console.log("=== ALL-PRODUCT METRICS VERIFY ===");
  console.log(`Desk date: ${deskDate}`);
  console.log(`Index: Nifty ${niftyLevel ?? "—"} · Sensex ${sensexLevel ?? "—"} (${levels?.source ?? "—"})`);
  console.log(`\nPools checked: ${totalChecked} (with formula)`);
  console.log(`  ongoing: ${pools.ongoing.length} · expired: ${pools.expired.length} · expiring: ${pools.expiring.length} · obs-due: ${pools.obsDue.length}`);
  console.log(`\nMarked (finite value + abs + IRR): ${totalMarked}`);
  console.log(`No index / level: ${totalNoIndex}`);
  console.log(`Metric issues: ${issues.length}`);
  console.log(`\n--- Metric distribution ---`);
  console.log(`  Coupon Formed > 0: ${couponNonZero}`);
  console.log(`  Absolute Return > 0: ${absNonZero}`);
  console.log(`  Product IRR > 0: ${irrNonZero}`);
  console.log(`  Coupon > Abs Return (expected while obs ahead): ${couponGtAbs}`);
  console.log(`  Abs Return > Coupon Formed (post-obs / discount path): ${absGtCoupon}`);
  console.log(`\n--- Logic path (ongoing + live tabs @ ${deskDate}) ---`);
  for (const [path, count] of Object.entries(pathCounts)) {
    console.log(`  ${path}: ${count}`);
  }
  console.log(`\n--- Post-last-obs Logic lock (expired) ---`);
  console.log(`  ${lockPass}/${lockChecks} → phase end U·(1+S) within ±₹2`);

  if (issues.length) {
    console.log(`\n--- Issues (first 15) ---`);
    for (const issue of issues.slice(0, 15)) {
      console.log(`  [${issue.code}] ${issue.isin} · ${issue.pool} · ${issue.detail}`);
    }
  }

  const pass = issues.length === 0 && totalMarked === totalChecked - totalNoIndex;
  console.log(`\n=== ${pass ? "PASS" : "REVIEW"} ===`);
  process.exit(pass ? 0 : 1);
}

void main();
