import { computeObservationScheduleMetrics } from "@/lib/portfolio-observation-metrics";
import { getProbabilityEntryLevel, getTargetLevel } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";

/**
 * Parse desk Target Underlying input as a fraction (0.36 for 36%).
 * Values are treated as percent points (36 or 36.0 → 0.36), matching Excel display.
 */
export function parseTargetUnderlyingPercentInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/%/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

/** Format a Target Underlying fraction for the input box (e.g. 0.36 → "36.0"). */
export function formatTargetUnderlyingPercentInput(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return "";
  return (fraction * 100).toFixed(1);
}

/** Absolute hurdle as performance vs Initial Entry: `hurdle / Entry − 1`. */
export function underlyingPercentFromEntry(
  entry: number | null | undefined,
  hurdle: number | null | undefined,
): number | null {
  if (entry == null || !(entry > 0) || hurdle == null || !Number.isFinite(hurdle)) return null;
  return hurdle / entry - 1;
}

/**
 * Invert Effective Target → Target Level:
 * ET = (N × T − Σpassed) / R  ⇒  T = (ET × R + Σpassed) / N
 */
export function targetLevelFromDesiredEffectiveTarget(args: {
  total: number;
  remaining: number;
  sumPassed: number;
  desiredEffectiveTarget: number;
}): number | null {
  const { total, remaining, sumPassed, desiredEffectiveTarget } = args;
  if (!(total > 0) || !(remaining > 0)) return null;
  if (!Number.isFinite(desiredEffectiveTarget) || !Number.isFinite(sumPassed)) return null;
  const level = (desiredEffectiveTarget * remaining + sumPassed) / total;
  return Number.isFinite(level) && level > 0 ? level : null;
}

/**
 * Working Target Level from an editable Target Underlying %, else master Target Level.
 * Target Level = Entry × (1 + Target Underlying).
 */
export function workingTargetLevel(
  product: ProductRecord,
  targetUnderlyingFraction: number | null | undefined,
): number | null {
  const entry = getProbabilityEntryLevel(product);
  if (
    targetUnderlyingFraction != null &&
    Number.isFinite(targetUnderlyingFraction) &&
    entry != null &&
    entry > 0
  ) {
    const level = entry * (1 + targetUnderlyingFraction);
    return Number.isFinite(level) && level > 0 ? level : null;
  }
  const master = getTargetLevel(product);
  return master != null && master > 0 ? master : null;
}

export type ProbabilityTargetSurface = "summary" | "initial" | "current";

/**
 * Current Prob with ≥1 settled fixing: Target Underlying means
 * Effective Target ÷ Entry − 1 (not master Target ÷ Entry − 1).
 * Edits back-solve the absolute Target Level so ET matches Entry×(1+pct).
 *
 * Initial / Summary / zero-passed Current: classic Target ÷ Entry − 1.
 */
export function workingTargetLevelForSurface(
  product: ProductRecord,
  targetUnderlyingFraction: number | null | undefined,
  checkingDate: Date,
  surface: ProbabilityTargetSurface,
): number | null {
  if (surface !== "current") {
    return workingTargetLevel(product, targetUnderlyingFraction);
  }

  const entry = getProbabilityEntryLevel(product);
  if (
    targetUnderlyingFraction == null ||
    !Number.isFinite(targetUnderlyingFraction) ||
    entry == null ||
    !(entry > 0)
  ) {
    return workingTargetLevel(product, targetUnderlyingFraction);
  }

  const metrics = computeObservationScheduleMetrics(product, checkingDate);
  if (metrics.passed < 1 || metrics.remaining <= 0 || metrics.sumPassed == null) {
    return workingTargetLevel(product, targetUnderlyingFraction);
  }

  const desiredEt = entry * (1 + targetUnderlyingFraction);
  const solved = targetLevelFromDesiredEffectiveTarget({
    total: metrics.total,
    remaining: metrics.remaining,
    sumPassed: metrics.sumPassed,
    desiredEffectiveTarget: desiredEt,
  });
  return solved ?? workingTargetLevel(product, targetUnderlyingFraction);
}

/**
 * Default Target Underlying fraction for the desk input / KPI seed.
 * Current + settled fixings → Effective Target ÷ Entry − 1; else master Target ÷ Entry − 1.
 */
export function defaultTargetUnderlyingFraction(
  product: ProductRecord,
  checkingDate: Date,
  surface: ProbabilityTargetSurface,
): number | null {
  const master = (() => {
    const entry = getProbabilityEntryLevel(product);
    const target = getTargetLevel(product);
    if (entry == null || !(entry > 0) || target == null || !Number.isFinite(target)) return null;
    return target / entry - 1;
  })();

  if (surface !== "current") return master;

  const entry = getProbabilityEntryLevel(product);
  const metrics = computeObservationScheduleMetrics(product, checkingDate);
  if (
    metrics.passed >= 1 &&
    metrics.effectiveTarget != null &&
    Number.isFinite(metrics.effectiveTarget) &&
    entry != null &&
    entry > 0
  ) {
    return underlyingPercentFromEntry(entry, metrics.effectiveTarget);
  }
  return master;
}
