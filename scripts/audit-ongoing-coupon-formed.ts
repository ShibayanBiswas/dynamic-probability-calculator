/**
 * Audit Coupon Formed vs Maturity Coupon for live lifecycle tabs at desk index levels.
 *
 * Usage: npx tsx scripts/audit-ongoing-coupon-formed.ts [DD-MM-YYYY]
 */
import { formatDeskDate } from "../lib/market-data";
import { resolveIndexLevelsAtDate } from "../lib/market-index-at-date";
import { filterProductsByLifecycle, type LifecycleFilter } from "../lib/product-lifecycle";
import {
  getCouponPercent,
  getIndexEntryLevel,
  inferDebentureCount,
  isSensexLinked,
  resolveLiveIndexLevel,
} from "../lib/product-utils";
import { tryEvaluatePayoffFormula } from "../lib/workbook/formula-engine";
import { computeValuation } from "../lib/workbook/valuation-engine";
import {
  isLastObservationPassed,
  qualifiesForFullCoupon,
  qualifiesForProjectedFullCoupon,
} from "../lib/workbook/valuation-performance";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

const DESK_DATE_ARG = process.argv[2];
const LIVE_TABS: LifecycleFilter[] = [
  "ongoing",
  "obs-due-3m",
  "obs-due-2m",
  "obs-due-1m",
  "expiring-3m",
  "expiring-1m",
];

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function parseDeskDateArg(raw?: string): Date {
  if (!raw) return new Date();
  const [d, m, y] = raw.split("-").map(Number);
  return new Date(y!, m! - 1, d);
}

type SameReason = "projected-full-coupon" | "realised-full-coupon" | "formula-at-headline";

async function auditPool(
  filter: LifecycleFilter,
  asOf: Date,
  deskDate: string,
  levels: { niftyLevel?: number; sensexLevel?: number },
) {
  const pool = filterProductsByLifecycle(loadSeedProducts(), filter, asOf);
  let same = 0;
  let diff = 0;
  let fcZero = 0;
  const sameReasons: Record<SameReason, number> = {
    "projected-full-coupon": 0,
    "realised-full-coupon": 0,
    "formula-at-headline": 0,
  };
  const diffSamples: string[] = [];

  for (const p of pool) {
    const entry = getIndexEntryLevel(p);
    const sensex = isSensexLinked(p);
    const current = resolveLiveIndexLevel(p, levels) ?? 0;
    const maturity = getCouponPercent(p);
    const v = computeValuation(p, {
      valuationDate: deskDate,
      currentLevel: current,
      debentures: inferDebentureCount(p),
    });
    const fc = v.formulaReturn;

    if (fc === 0 || fc == null) fcZero += 1;
    if (maturity == null) continue;

    if (Math.abs(fc - maturity) < 0.0001) {
      same += 1;
      const isReal =
        isLastObservationPassed(p, asOf) && qualifiesForFullCoupon(p, asOf, sensex);
      const isProj = qualifiesForProjectedFullCoupon(p, asOf, entry, current, sensex);
      if (isReal) sameReasons["realised-full-coupon"] += 1;
      else if (isProj) sameReasons["projected-full-coupon"] += 1;
      else sameReasons["formula-at-headline"] += 1;
    } else {
      diff += 1;
      if (diffSamples.length < 6) {
        const formulaEval = tryEvaluatePayoffFormula(p.formulaText?.trim() || "Z", v.z);
        diffSamples.push(
          `${p.isin ?? "—"} · mat ${pct(maturity)} · fc ${pct(fc)} · formula@${pct(v.z)}=${formulaEval.ok ? pct(formulaEval.value) : "err"}`,
        );
      }
    }
  }

  console.log(`\n=== ${filter.toUpperCase()} · ${pool.length} products ===`);
  console.log(`  Coupon Formed = Maturity Coupon: ${same}`);
  console.log(
    `    projected barrier ${sameReasons["projected-full-coupon"]} · realised barrier ${sameReasons["realised-full-coupon"]} · formula at headline ${sameReasons["formula-at-headline"]}`,
  );
  console.log(`  Coupon Formed ≠ Maturity Coupon: ${diff}`);
  console.log(`  Coupon Formed zero: ${fcZero}`);
  if (diffSamples.length) {
    console.log("  Diff samples:");
    for (const line of diffSamples) console.log(`    ${line}`);
  }
}

async function main() {
  const asOf = parseDeskDateArg(DESK_DATE_ARG);
  const deskDate = formatDeskDate(asOf);
  const levels = await resolveIndexLevelsAtDate(deskDate);

  console.log("=== Ongoing coupon formed audit ===");
  console.log(`Desk date: ${deskDate}`);
  console.log(
    `Index · Nifty ${levels?.niftyLevel ?? "—"} · Sensex ${levels?.sensexLevel ?? "—"} · ${levels?.source ?? "—"}`,
  );

  for (const tab of LIVE_TABS) {
    await auditPool(tab, asOf, deskDate, {
      niftyLevel: levels?.niftyLevel,
      sensexLevel: levels?.sensexLevel,
    });
  }

  const target = loadSeedProducts().find((p) => p.isin === "INE093J074Z3");
  if (target) {
    const sensex = isSensexLinked(target);
    const entry = getIndexEntryLevel(target);
    const current =
      resolveLiveIndexLevel(target, {
        niftyLevel: levels?.niftyLevel,
        sensexLevel: levels?.sensexLevel,
      }) ?? 0;
    const v = computeValuation(target, {
      valuationDate: deskDate,
      currentLevel: current,
      debentures: inferDebentureCount(target),
    });
    const mat = getCouponPercent(target);
    console.log("\n=== INE093J074Z3 · Nifty Magnifier - 173 ===");
    console.log(`  Entry ${entry} · Live Nifty ${current} · Target ${target.targetLevel}`);
    console.log(`  Maturity coupon ${mat != null ? pct(mat) : "—"} · Coupon formed ${pct(v.formulaReturn)}`);
    console.log(`  Abs return ${pct(v.absReturn)} · Product IRR ${pct(v.productIrr)} · Value ₹${v.productValue}`);
    console.log(
      `  Projected full-coupon barrier: ${qualifiesForProjectedFullCoupon(target, asOf, entry, current, sensex)}`,
    );
  }

  console.log("\n=== NOTE ===");
  console.log(
    "Coupon Formed equals Maturity Coupon when the projected or realised full-coupon barrier fires, or when the payoff formula on extrapolated performance already equals the headline coupon.",
  );
}

void main();
