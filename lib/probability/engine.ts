import { differenceInCalendarDays, startOfDay } from "date-fns";

import { isObservationFixingSettled } from "@/lib/observation-settlement";
import {
  getProductObservationDates,
  getProductObservationSlotDates,
  getWorkingAllotmentDate,
} from "@/lib/product-dates";
import { getProbabilityEntryLevel, getTargetLevel, isSensexLinked } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { toLocalDateKey } from "@/lib/workbook/dates";

export type UnderlyingKind = "nifty" | "sensex";

export type IndexBar = {
  date: string;
  time: number;
  nifty: number;
  sensex: number;
};

export type ObservationSchedule = {
  index: number;
  /** Date object in-process; may be an ISO string after JSON transport until hydrated. */
  date: Date | string | null;
  daysFromBase: number;
};

export type PathRow = {
  pathStartDate: string;
  underlyingClosingLevel: number;
  adjustedStartLevel: number | null;
  observationDates: (string | null)[];
  observationLevels: (number | null)[];
  averageObservationLevel: number | null;
  underlyingPerformance: number | null;
  pathIncluded: boolean;
};

export type ProbabilityRunResult = {
  mode: "initial" | "current";
  underlying: UnderlyingKind;
  /**
   * Full Average 1–7 schedule for the Observation Schedule card / exports.
   * Current keeps passed slots (including non-positive day offsets) here.
   */
  schedule: ObservationSchedule[];
  /**
   * Slots used by the Historical Path Backtest columns and probability math.
   * Current: remaining only (`daysFromBase > 0`). Initial: same as `schedule`.
   */
  pathSchedule: ObservationSchedule[];
  includedCount: number;
  successCount: number;
  probability: number | null;
  threshold: number | null;
  /** Absolute hurdle level used for Current when remaining obs only — Effective Target. */
  effectiveTargetLevel?: number | null;
  lastIndexDate: string | null;
  paths: PathRow[];
};

export function resolveUnderlyingKind(product: ProductRecord): UnderlyingKind | null {
  if (isSensexLinked(product)) return "sensex";
  const label = (product.underlying ?? "").trim().toLowerCase();
  if (!label || label.includes("nifty")) return "nifty";
  if (label.includes("sensex")) return "sensex";
  return null;
}

export function closeAt(bar: IndexBar, underlying: UnderlyingKind): number {
  return underlying === "sensex" ? bar.sensex : bar.nifty;
}

/** Excel CEILING.MATH(close * factor, 100). */
export function ceilingStartLevel(close: number, underlying: UnderlyingKind): number {
  const factor = underlying === "sensex" ? 1.006 : 1.01;
  return Math.ceil((close * factor) / 100) * 100;
}

export function buildObservationSchedule(
  product: ProductRecord,
  baseDate: Date,
): ObservationSchedule[] {
  const slots = getProductObservationSlotDates(product);
  const base = startOfDay(baseDate);
  return slots.map((date, index) => {
    if (!date) {
      return { index: index + 1, date: null, daysFromBase: 0 };
    }
    return {
      index: index + 1,
      date,
      daysFromBase: differenceInCalendarDays(startOfDay(date), base),
    };
  });
}

/**
 * Current Probability path schedule — only remaining observations with a positive
 * day count from the checking date. Used by the Historical Path Backtest and
 * probability math; the Observation Schedule card still shows the full schedule.
 */
export function buildCurrentRemainingSchedule(
  product: ProductRecord,
  checkingDate: Date,
): ObservationSchedule[] {
  return buildObservationSchedule(product, checkingDate).filter(
    (slot) => slot.date != null && slot.daysFromBase > 0,
  );
}

/**
 * Effective Target for remaining forward observations, using path-series closes
 * for settled past fixings when available.
 *
 * Same formula as lifecycle {@link computeObservationScheduleMetrics}:
 * ET = (Total × Target − Σ passed levels) / Remaining
 * where passed = settlement-settled obs (15:30 IST same-day rule).
 *
 * Path tables still drop non-positive day offsets; the hurdle uses this ET so
 * avg(remaining path slots) ≥ ET ⇔ full-schedule average ≥ Target.
 */
export function computeCurrentEffectiveTargetLevel(args: {
  product: ProductRecord;
  checkingDate: Date;
  series: IndexBar[];
  underlying: UnderlyingKind;
  targetLevel: number;
}): number | null {
  const { product, checkingDate, series, underlying, targetLevel } = args;
  if (!(targetLevel > 0)) return null;

  const schedule = getProductObservationDates(product);
  const total = schedule.length;
  if (total <= 0) return null;

  const passedDates = schedule.filter((d) => isObservationFixingSettled(d, checkingDate));
  const remaining = total - passedDates.length;
  if (remaining <= 0) return null;

  // No fixings settled yet → Effective Target collapses to master Target.
  if (passedDates.length === 0) return targetLevel;

  let sumPassed = 0;
  for (const d of passedDates) {
    const bar = lookupPriorBar(series, barTimeFromDateKey(toLocalDateKey(d)));
    if (!bar) return null;
    const lvl = closeAt(bar, underlying);
    if (!(lvl > 0)) return null;
    sumPassed += lvl;
  }

  return (total * targetLevel - sumPassed) / remaining;
}

/** Binary search: last bar with time <= targetTime. */
export function lookupPriorBar(series: IndexBar[], targetTime: number): IndexBar | null {
  if (series.length === 0) return null;
  let lo = 0;
  let hi = series.length - 1;
  if (targetTime < series[0]!.time) return null;
  if (targetTime >= series[hi]!.time) return series[hi]!;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = series[mid]!.time;
    if (t === targetTime) return series[mid]!;
    if (t < targetTime) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi >= 0 ? series[hi]! : null;
}

/** Calendar-stable date key arithmetic — matches Excel date + days. */
function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toLocalDateKey(dt);
}

function barTimeFromDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, 12, 0, 0);
}

export function buildIndexSeries(
  rows: Array<{ date: string; nifty: number; sensex: number }>,
): IndexBar[] {
  return rows.map((row) => ({
    date: row.date,
    time: barTimeFromDateKey(row.date),
    nifty: row.nifty,
    sensex: row.sensex,
  }));
}

export type RunProbabilityArgs = {
  product: ProductRecord;
  mode: "initial" | "current";
  valuationDate: Date;
  series: IndexBar[];
  niftyLevel?: number;
  sensexLevel?: number;
  includePaths?: boolean;
};

export function runProbabilityBacktest(args: RunProbabilityArgs): ProbabilityRunResult {
  const { product, mode, valuationDate, series, includePaths = true } = args;
  const underlying = resolveUnderlyingKind(product) ?? "nifty";
  const phaseStart = getWorkingAllotmentDate(product, valuationDate);
  const entry = getProbabilityEntryLevel(product);
  const target = getTargetLevel(product);

  const baseDate = mode === "initial" ? (phaseStart ?? valuationDate) : valuationDate;

  // Observation Schedule card: always the full Average 1–7 schedule from the mode base.
  // Path backtest + probability: Current drops passed / non-positive day offsets only.
  const schedule = buildObservationSchedule(product, baseDate);
  const pathSchedule =
    mode === "current"
      ? schedule.filter((slot) => slot.date != null && slot.daysFromBase > 0)
      : schedule;
  const presentSlotCount = pathSchedule.filter((slot) => slot.date != null).length;

  const lastBar = series.length > 0 ? series[series.length - 1]! : null;
  const lastIndexDate = lastBar?.date ?? null;
  const lastIndexTime = lastBar?.time ?? 0;

  // Initial frontier = Actual Start (Allotment or Trade by phase) — NSP Initial Prob D16 rule,
  // phase-aware via getWorkingAllotmentDate. Last Yes path’s last obs lands on that date.
  const initialFrontierTime = phaseStart
    ? barTimeFromDateKey(toLocalDateKey(phaseStart))
    : lastIndexTime;

  let effectiveTargetLevel: number | null = null;
  let threshold: number | null = null;
  if (mode === "initial") {
    if (entry != null && entry > 0 && target != null && Number.isFinite(target)) {
      threshold = target / entry - 1;
    }
  } else if (target != null && Number.isFinite(target) && presentSlotCount > 0) {
    const explicitLevel = underlying === "sensex" ? args.sensexLevel : args.niftyLevel;
    let todayLevel =
      explicitLevel != null && Number.isFinite(explicitLevel) && explicitLevel > 0
        ? explicitLevel
        : undefined;
    if (todayLevel == null) {
      const valBar = lookupPriorBar(series, barTimeFromDateKey(toLocalDateKey(valuationDate)));
      if (valBar) todayLevel = closeAt(valBar, underlying);
    }

    effectiveTargetLevel = computeCurrentEffectiveTargetLevel({
      product,
      checkingDate: valuationDate,
      series,
      underlying,
      targetLevel: target,
    });
    const hurdleLevel = effectiveTargetLevel ?? target;

    if (todayLevel != null && todayLevel > 0 && hurdleLevel != null && hurdleLevel > 0) {
      threshold = hurdleLevel / todayLevel - 1;
    }
  }

  const thresholdReady = threshold != null && Number.isFinite(threshold);
  const paths: PathRow[] = [];
  let includedCount = 0;
  let successCount = 0;
  let stillEligible = true;

  // Frontier clock: Initial → Actual Start; Current → latest series bar (today / prev session).
  const frontierTime = mode === "initial" ? initialFrontierTime : lastIndexTime;

  for (let i = 0; i < series.length; i++) {
    const startBar = series[i]!;
    const close = closeAt(startBar, underlying);
    const adjusted = mode === "initial" ? ceilingStartLevel(close, underlying) : null;

    const observationDates: (string | null)[] = [];
    const observationLevels: (number | null)[] = [];
    let maxObsTime = -Infinity;
    let maxProjectedDateKey: string | null = null;
    let levelSum = 0;
    let levelCount = 0;

    for (const slot of pathSchedule) {
      if (!slot.date) {
        observationDates.push(null);
        observationLevels.push(null);
        continue;
      }

      const projectedKey = addDaysToDateKey(startBar.date, slot.daysFromBase);
      const obsTime = barTimeFromDateKey(projectedKey);
      if (obsTime > maxObsTime) maxObsTime = obsTime;
      if (!maxProjectedDateKey || projectedKey > maxProjectedDateKey) {
        maxProjectedDateKey = projectedKey;
      }

      const obsBar = lookupPriorBar(series, obsTime);
      if (obsBar) {
        // Initial: show Excel-style projected calendar dates so the last path’s
        // final observation lands on Actual Start. Current: show trading session used.
        observationDates.push(mode === "initial" ? projectedKey : obsBar.date);
        const lvl = closeAt(obsBar, underlying);
        observationLevels.push(lvl);
        levelSum += lvl;
        levelCount += 1;
      } else {
        observationDates.push(projectedKey);
        observationLevels.push(null);
      }
    }

    const fullCoverage = presentSlotCount > 0 && levelCount === presentSlotCount;
    const avg = fullCoverage ? levelSum / levelCount : null;
    let performance: number | null = null;
    if (avg != null) {
      if (mode === "initial") {
        if (adjusted != null && adjusted > 0) performance = avg / adjusted - 1;
      } else if (close > 0) {
        performance = avg / close - 1;
      }
    }

    // Initial: NSP Path Taken — Actual Start >= MAX(projected obs dates).
    // Current: series last bar >= MAX(projected obs times).
    const initialFrontierKey = phaseStart ? toLocalDateKey(phaseStart) : null;
    let pathIncluded = false;
    if (!stillEligible || presentSlotCount === 0 || maxObsTime === -Infinity) {
      pathIncluded = false;
      if (stillEligible && (presentSlotCount === 0 || maxObsTime === -Infinity)) {
        stillEligible = false;
      } else if (stillEligible && mode === "initial" && initialFrontierKey && maxProjectedDateKey) {
        if (initialFrontierKey < maxProjectedDateKey) stillEligible = false;
      } else if (stillEligible && mode === "current" && frontierTime < maxObsTime) {
        stillEligible = false;
      }
    } else if (mode === "initial") {
      if (initialFrontierKey && maxProjectedDateKey && initialFrontierKey >= maxProjectedDateKey && fullCoverage) {
        pathIncluded = true;
      } else if (initialFrontierKey && maxProjectedDateKey && initialFrontierKey < maxProjectedDateKey) {
        pathIncluded = false;
        stillEligible = false;
      } else {
        pathIncluded = false;
      }
    } else if (frontierTime >= maxObsTime && fullCoverage) {
      pathIncluded = true;
    } else if (frontierTime < maxObsTime) {
      pathIncluded = false;
      stillEligible = false;
    } else {
      pathIncluded = false;
    }

    if (pathIncluded) {
      includedCount += 1;
      if (thresholdReady && performance != null && performance >= threshold!) {
        successCount += 1;
      }
    }

    if (includePaths) {
      if (!stillEligible && !pathIncluded) {
        break;
      }
      paths.push({
        pathStartDate: startBar.date,
        underlyingClosingLevel: close,
        adjustedStartLevel: adjusted,
        observationDates,
        observationLevels,
        averageObservationLevel: avg,
        underlyingPerformance: performance,
        pathIncluded,
      });
    } else if (!stillEligible) {
      break;
    }
  }

  return {
    mode,
    underlying,
    schedule,
    pathSchedule,
    includedCount,
    successCount,
    probability:
      includedCount > 0 && thresholdReady ? successCount / includedCount : null,
    threshold,
    effectiveTargetLevel: mode === "current" ? effectiveTargetLevel : null,
    lastIndexDate,
    paths: includePaths ? paths : [],
  };
}

/** Days left to last observation from checking date — Probability sheet. */
export function daysLeftToLastObservation(product: ProductRecord, checkingDate: Date): number {
  const slots = getProductObservationSlotDates(product).filter((d): d is Date => !!d);
  if (slots.length === 0) return 0;
  const last = slots.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
  return Math.max(0, differenceInCalendarDays(startOfDay(last), startOfDay(checkingDate)));
}

/**
 * Target Underlying — Excel “Target %”.
 * Required underlying performance vs initial entry: `Target Level / Entry − 1`.
 */
export function targetUnderlying(product: ProductRecord): number | null {
  const entry = getProbabilityEntryLevel(product);
  const target = getTargetLevel(product);
  if (entry == null || entry <= 0 || target == null || !Number.isFinite(target)) return null;
  return target / entry - 1;
}

/** @deprecated Use {@link targetUnderlying} — same formula. */
export function targetPercent(product: ProductRecord): number | null {
  return targetUnderlying(product);
}

/**
 * Required Underlying — Excel “% Required” using master Target vs today’s mark.
 * When Current paths use Effective Target, prefer {@link requiredUnderlyingFromHurdleLevel}.
 */
export function requiredUnderlying(
  product: ProductRecord,
  niftyLevel: number | undefined,
  sensexLevel: number | undefined,
): number | null {
  const target = getTargetLevel(product);
  if (target == null || !Number.isFinite(target)) return null;
  return requiredUnderlyingFromHurdleLevel(product, target, niftyLevel, sensexLevel);
}

/** % Required from an absolute hurdle level (Target or Effective Target) vs today mark. */
export function requiredUnderlyingFromHurdleLevel(
  product: ProductRecord,
  hurdleLevel: number,
  niftyLevel: number | undefined,
  sensexLevel: number | undefined,
): number | null {
  if (!(hurdleLevel > 0) || !Number.isFinite(hurdleLevel)) return null;
  const underlying = resolveUnderlyingKind(product) ?? "nifty";
  const level = underlying === "sensex" ? sensexLevel : niftyLevel;
  if (level == null || level <= 0 || !Number.isFinite(level)) return null;
  return hurdleLevel / level - 1;
}

/** @deprecated Use {@link requiredUnderlying} — same formula. */
export function requiredPercent(
  product: ProductRecord,
  niftyLevel: number | undefined,
  sensexLevel: number | undefined,
): number | null {
  return requiredUnderlying(product, niftyLevel, sensexLevel);
}
