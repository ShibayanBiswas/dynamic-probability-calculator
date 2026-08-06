/**
 * Thorough Effective Target audit.
 *
 * Formula:
 *   ET = (TotalObs × TargetLevel − Σ levels at settled passed obs) / RemainingObs
 *
 * Usage: npx tsx scripts/verify-effective-target.ts
 */
import { addDays } from "date-fns";

import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { resolveCustomUnderlyingLevel } from "../lib/custom-underlying-history";
import { isObservationFixingSettled } from "../lib/observation-settlement";
import {
  computeObservationScheduleMetrics,
  formatEffectiveTargetCell,
} from "../lib/portfolio-observation-metrics";
import {
  getProductObservationDates,
  getRolloverPhaseKind,
  type RolloverPhaseKind,
} from "../lib/product-dates";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { getTargetLevel } from "../lib/product-utils";
import { getUnderlyingKind } from "../lib/underlying-benchmark";
import { loadSeedProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";
import type { ProductRecord } from "../lib/types";

function levelAt(product: ProductRecord, date: Date): number | undefined {
  const kind = getUnderlyingKind(product);
  if (kind === "sensex") return lookupBundledSensexOnOrBefore(date);
  if (kind === "custom") return resolveCustomUnderlyingLevel(product, date);
  return lookupBundledNiftyOnOrBefore(date);
}

function handCompute(product: ProductRecord, asOf: Date) {
  const schedule = getProductObservationDates(product);
  const total = schedule.length;
  const passedDates = schedule.filter((d) => isObservationFixingSettled(d, asOf));
  const passed = passedDates.length;
  const remaining = Math.max(0, total - passed);
  const target = getTargetLevel(product);
  if (target == null || !(target > 0) || remaining <= 0 || total <= 0 || passed < 1) {
    return { total, passed, remaining, effectiveTarget: null as number | null, sumPassed: 0, target };
  }
  let sumPassed = 0;
  for (const d of passedDates) {
    const lvl = levelAt(product, d);
    if (lvl == null || !(lvl > 0)) {
      return { total, passed, remaining, effectiveTarget: null as number | null, sumPassed, target };
    }
    sumPassed += lvl;
  }
  return {
    total,
    passed,
    remaining,
    effectiveTarget: (total * target - sumPassed) / remaining,
    sumPassed,
    target,
  };
}

function almostEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

function main() {
  warnIfWorkbookDriftsFromSeed();
  const asOf = new Date();
  const all = filterValidMasterProducts(loadSeedProducts(), asOf);
  const ongoing = filterProductsByLifecycle(all, "ongoing", asOf);
  const expired = filterProductsByLifecycle(all, "expired", asOf);

  let checked = 0;
  let computable = 0;
  let nullOk = 0;
  let identityOk = 0;
  let parityOk = 0;
  let formatOk = 0;
  const fails: string[] = [];
  const byKind: Record<RolloverPhaseKind, { n: number; computable: number }> = {
    blank: { n: 0, computable: 0 },
    phase1: { n: 0, computable: 0 },
    phase2: { n: 0, computable: 0 },
    tenYear: { n: 0, computable: 0 },
  };
  const samples: Array<Record<string, unknown>> = [];

  for (const p of ongoing) {
    const kind = getRolloverPhaseKind(p);
    byKind[kind].n += 1;
    checked += 1;

    const api = computeObservationScheduleMetrics(p, asOf);
    const hand = handCompute(p, asOf);

    // Counts must match
    if (api.total !== hand.total || api.passed !== hand.passed || api.remaining !== hand.remaining) {
      fails.push(`counts ${p.isin}: api=${api.total}/${api.passed}/${api.remaining} hand=${hand.total}/${hand.passed}/${hand.remaining}`);
      continue;
    }

    const apiNull = api.effectiveTarget == null;
    const handNull = hand.effectiveTarget == null;
    if (apiNull !== handNull) {
      fails.push(`nullMismatch ${p.isin}: api=${api.effectiveTarget} hand=${hand.effectiveTarget}`);
      continue;
    }

    if (apiNull) {
      nullOk += 1;
      parityOk += 1;
      if (formatEffectiveTargetCell(null) !== "—") fails.push(`format null ${p.isin}`);
      else formatOk += 1;
      continue;
    }

    computable += 1;
    byKind[kind].computable += 1;
    if (!almostEqual(api.effectiveTarget!, hand.effectiveTarget!)) {
      fails.push(`etMismatch ${p.isin}: api=${api.effectiveTarget} hand=${hand.effectiveTarget}`);
      continue;
    }
    parityOk += 1;

    // Algebraic identity: sumPassed + remaining*ET = total*target
    const lhs = hand.sumPassed + hand.remaining * hand.effectiveTarget!;
    const rhs = hand.total * hand.target!;
    if (!almostEqual(lhs, rhs, 1e-4)) {
      fails.push(`identity ${p.isin}: ${lhs} vs ${rhs}`);
    } else {
      identityOk += 1;
    }

    if (formatEffectiveTargetCell(api.effectiveTarget) === "—") {
      fails.push(`format computable ${p.isin}`);
    } else {
      formatOk += 1;
    }

    if (samples.length < 8 && hand.passed > 0 && hand.remaining > 0) {
      samples.push({
        isin: p.isin,
        kind,
        total: hand.total,
        passed: hand.passed,
        remaining: hand.remaining,
        target: hand.target,
        sumPassed: Math.round(hand.sumPassed * 100) / 100,
        ET: Math.round(hand.effectiveTarget! * 100) / 100,
        check: Math.round(lhs * 100) / 100,
        expect: Math.round(rhs * 100) / 100,
      });
    }
  }

  // Edge: product with all obs remaining → ET blank (Primary SP parity)
  const allRemaining = ongoing.find((p) => {
    const m = computeObservationScheduleMetrics(p, asOf);
    const t = getTargetLevel(p);
    return m.total > 0 && m.passed === 0 && m.remaining === m.total && t != null && t > 0 && getUnderlyingKind(p) !== "custom";
  });
  if (allRemaining) {
    const m = computeObservationScheduleMetrics(allRemaining, asOf);
    if (m.effectiveTarget != null) {
      fails.push(`allRemaining ET should be null for ${allRemaining.isin}: ${m.effectiveTarget}`);
    } else {
      samples.push({
        edge: "allRemaining→ET=null",
        isin: allRemaining.isin,
        ET: m.effectiveTarget,
        target: getTargetLevel(allRemaining),
        passed: m.passed,
      });
    }
  }

  // Edge: as-of far past first obs → more passed; far future → all remaining
  const withObs = ongoing.find((p) => getProductObservationDates(p).length >= 2 && getTargetLevel(p));
  if (withObs) {
    const dates = getProductObservationDates(withObs).sort((a, b) => a.getTime() - b.getTime());
    const early = addDays(dates[0]!, -30);
    const late = addDays(dates[dates.length - 1]!, 30);
    const mEarly = computeObservationScheduleMetrics(withObs, early);
    const mLate = computeObservationScheduleMetrics(withObs, late);
    if (mEarly.passed !== 0) fails.push(`early asOf should have 0 passed ${withObs.isin}`);
    if (mEarly.effectiveTarget != null) fails.push(`early asOf ET should be null ${withObs.isin}`);
    if (mLate.remaining !== 0) fails.push(`late asOf should have 0 remaining ${withObs.isin}`);
    if (mLate.effectiveTarget != null) fails.push(`late asOf ET should be null ${withObs.isin}`);
    samples.push({
      edge: "asOf sweep",
      isin: withObs.isin,
      earlyPassed: mEarly.passed,
      earlyET: mEarly.effectiveTarget,
      latePassed: mLate.passed,
      lateRemaining: mLate.remaining,
      lateET: mLate.effectiveTarget,
    });
  }

  // Expired products: metrics still compute, but portfolio live export hides ET — just ensure no crash
  let expiredOk = 0;
  for (const p of expired.slice(0, 200)) {
    const m = computeObservationScheduleMetrics(p, asOf);
    if (m.total >= 0 && m.passed >= 0 && m.remaining >= 0) expiredOk += 1;
  }

  console.log("=== EFFECTIVE TARGET VERIFY ===");
  console.log("As of:", asOf.toLocaleDateString("en-GB"));
  console.log({
    ongoingChecked: checked,
    computable,
    nullOk,
    parityOk: `${parityOk}/${checked}`,
    identityOk: `${identityOk}/${computable}`,
    formatOk,
    expiredSmoke: `${expiredOk}/${Math.min(200, expired.length)}`,
    byKind,
  });
  console.log("\nSamples:");
  for (const s of samples) console.log(s);

  if (fails.length) {
    console.log("\nFAILS:");
    for (const f of fails.slice(0, 25)) console.log(" -", f);
    console.log(`=== FAIL (${fails.length}) ===`);
    process.exit(1);
  }

  if (parityOk !== checked || identityOk !== computable) {
    console.log("=== FAIL (counts) ===");
    process.exit(1);
  }

  console.log("\n=== PASS ===");
  console.log("Effective Target = (Total×Target − Σpassed) / Remaining when passed≥1; else — — verified full ongoing book.");
}

main();
