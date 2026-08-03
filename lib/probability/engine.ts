import { differenceInCalendarDays, startOfDay } from "date-fns";

import { getWorkingAllotmentDate, getProductObservationSlotDates } from "@/lib/product-dates";
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
  schedule: ObservationSchedule[];
  includedCount: number;
  successCount: number;
  probability: number | null;
  threshold: number | null;
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

function addCalendarDaysMs(startTime: number, days: number): number {
  return startTime + days * 86_400_000;
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
  const schedule = buildObservationSchedule(product, baseDate);
  const presentSlotCount = schedule.filter((slot) => slot.date != null).length;

  const lastBar = series.length > 0 ? series[series.length - 1]! : null;
  const lastIndexDate = lastBar?.date ?? null;
  const lastIndexTime = lastBar?.time ?? 0;

  let threshold: number | null = null;
  if (mode === "initial") {
    if (entry != null && entry > 0 && target != null && Number.isFinite(target)) {
      threshold = target / entry - 1;
    }
  } else if (target != null && Number.isFinite(target)) {
    const explicitLevel =
      underlying === "sensex" ? args.sensexLevel : args.niftyLevel;
    let todayLevel =
      explicitLevel != null && Number.isFinite(explicitLevel) && explicitLevel > 0
        ? explicitLevel
        : undefined;
    if (todayLevel == null) {
      const valBar = lookupPriorBar(series, barTimeFromDateKey(toLocalDateKey(valuationDate)));
      if (valBar) todayLevel = closeAt(valBar, underlying);
    }
    if (todayLevel != null && todayLevel > 0) {
      threshold = target / todayLevel - 1;
    }
  }

  const thresholdReady = threshold != null && Number.isFinite(threshold);
  const paths: PathRow[] = [];
  let includedCount = 0;
  let successCount = 0;
  let stillEligible = true;

  for (let i = 0; i < series.length; i++) {
    const startBar = series[i]!;
    const close = closeAt(startBar, underlying);
    const adjusted = mode === "initial" ? ceilingStartLevel(close, underlying) : null;

    const observationDates: (string | null)[] = [];
    const observationLevels: (number | null)[] = [];
    let maxObsTime = -Infinity;
    let levelSum = 0;
    let levelCount = 0;

    for (const slot of schedule) {
      // Excel: IF(date cell blank → days 0 → skip slot)
      if (!slot.date) {
        observationDates.push(null);
        observationLevels.push(null);
        continue;
      }

      const obsTime = addCalendarDaysMs(startBar.time, slot.daysFromBase);
      if (obsTime > maxObsTime) maxObsTime = obsTime;

      observationDates.push(toLocalDateKey(new Date(obsTime)));
      const obsBar = lookupPriorBar(series, obsTime);
      if (obsBar) {
        const lvl = closeAt(obsBar, underlying);
        observationLevels.push(lvl);
        levelSum += lvl;
        levelCount += 1;
      } else {
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

    let pathIncluded = false;
    if (!stillEligible || presentSlotCount === 0 || maxObsTime === -Infinity) {
      pathIncluded = false;
      if (
        stillEligible &&
        (presentSlotCount === 0 || maxObsTime === -Infinity || lastIndexTime < maxObsTime)
      ) {
        stillEligible = false;
      }
    } else if (lastIndexTime >= maxObsTime && fullCoverage) {
      pathIncluded = true;
    } else if (lastIndexTime < maxObsTime) {
      pathIncluded = false;
      stillEligible = false;
    } else {
      // Frontier reached but this path is missing one or more prior closes — exclude path, keep scanning.
      pathIncluded = false;
    }

    if (pathIncluded) {
      includedCount += 1;
      if (thresholdReady && performance != null && performance >= threshold!) {
        successCount += 1;
      }
    }

    if (includePaths) {
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
    includedCount,
    successCount,
    probability:
      includedCount > 0 && thresholdReady ? successCount / includedCount : null,
    threshold,
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
 * Same hurdle the Initial Probability path engine uses as its success threshold.
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
 * Required Underlying — Excel “% Required”.
 * Remaining underlying move vs today’s mark: `Target Level / todayLevel − 1`.
 * Same hurdle the Current Probability path engine uses as its success threshold.
 */
export function requiredUnderlying(
  product: ProductRecord,
  niftyLevel: number | undefined,
  sensexLevel: number | undefined,
): number | null {
  const target = getTargetLevel(product);
  if (target == null || !Number.isFinite(target)) return null;
  const underlying = resolveUnderlyingKind(product) ?? "nifty";
  const level = underlying === "sensex" ? sensexLevel : niftyLevel;
  if (level == null || level <= 0 || !Number.isFinite(level)) return null;
  return target / level - 1;
}

/** @deprecated Use {@link requiredUnderlying} — same formula. */
export function requiredPercent(
  product: ProductRecord,
  niftyLevel: number | undefined,
  sensexLevel: number | undefined,
): number | null {
  return requiredUnderlying(product, niftyLevel, sensexLevel);
}
