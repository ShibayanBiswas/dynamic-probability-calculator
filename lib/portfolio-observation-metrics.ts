/**
 * Live lifecycle portfolio extras — underlying levels at Observation 1–7,
 * schedule counts, and Effective Target for remaining fixings.
 */
import { lookupBundledNiftyOnOrBefore } from "@/lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import { resolveCustomUnderlyingLevel } from "@/lib/custom-underlying-history";
import { isObservationFixingSettled } from "@/lib/observation-settlement";
import {
  getProductObservationDates,
  getProductObservationSlotDates,
} from "@/lib/product-dates";
import { getTargetLevel } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { getUnderlyingKind } from "@/lib/underlying-benchmark";
import { formatNumber } from "@/lib/utils";
import { MAX_PORTFOLIO_OBS_COLUMNS } from "@/lib/portfolio-observation-columns";

export const PORTFOLIO_OBS_LEVEL_COLUMN_LABELS = Array.from(
  { length: MAX_PORTFOLIO_OBS_COLUMNS },
  (_, index) => `Observation Level ${index + 1}`,
);

export const PORTFOLIO_TOTAL_OBS_COLUMN_LABEL = "Total Observation Dates";
export const PORTFOLIO_PASSED_OBS_COLUMN_LABEL = "Observation Dates Passed";
export const PORTFOLIO_REMAINING_OBS_COLUMN_LABEL = "Observation Dates Remaining";
export const PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL = "Effective Target";

export const PORTFOLIO_OBS_COUNT_COLUMN_LABELS = [
  PORTFOLIO_TOTAL_OBS_COLUMN_LABEL,
  PORTFOLIO_PASSED_OBS_COLUMN_LABEL,
  PORTFOLIO_REMAINING_OBS_COLUMN_LABEL,
] as const;

function underlyingLevelAtDate(product: ProductRecord, date: Date): number | undefined {
  const kind = getUnderlyingKind(product);
  if (kind === "sensex") return lookupBundledSensexOnOrBefore(date);
  if (kind === "custom") return resolveCustomUnderlyingLevel(product, date);
  return lookupBundledNiftyOnOrBefore(date);
}

/** Underlying close at each Observation 1–7 slot — "—" when blank, unsettled (0D pre-EOD), future, or no history. */
export function observationLevelCells(product: ProductRecord, asOf: Date): string[] {
  return getProductObservationSlotDates(product).map((date) => {
    if (!date) return "—";
    if (!isObservationFixingSettled(date, asOf)) return "—";
    const level = underlyingLevelAtDate(product, date);
    return level != null && level > 0 ? formatNumber(level) : "—";
  });
}

export type ObservationScheduleMetrics = {
  total: number;
  passed: number;
  remaining: number;
  /** Sum of underlying closes at settled observation dates; null if any passed level is missing. */
  sumPassed: number | null;
  /** Raw Effective Target, or null when not computable. */
  effectiveTarget: number | null;
};

/**
 * Effective Target =
 * ((Total Obs Dates × Target Level) − sum(underlying levels at passed obs)) / Pending Obs
 *
 * Shown only when ≥1 observation fixing has settled (matches Primary SP desk rule).
 * With 0 passed → null ("—"); Target Level is the hurdle until then.
 * Uses unique scheduled observation dates (same schedule as barrier / obs-due logic).
 * Requires Target Level and a historical level for every passed observation.
 * Optional `targetLevel` overrides the master Target Level (desk Target Underlying edits).
 */
export function computeObservationScheduleMetrics(
  product: ProductRecord,
  asOf: Date,
  options?: { targetLevel?: number | null },
): ObservationScheduleMetrics {
  const schedule = getProductObservationDates(product);
  const total = schedule.length;
  // 0D (observation today) stays pending until NSE cash close — then counts as passed.
  const passedDates = schedule.filter((date) => isObservationFixingSettled(date, asOf));
  const passed = passedDates.length;
  const remaining = Math.max(0, total - passed);

  let sumPassed = 0;
  let sumOk = true;
  for (const date of passedDates) {
    const level = underlyingLevelAtDate(product, date);
    if (level == null || !(level > 0)) {
      sumOk = false;
      break;
    }
    sumPassed += level;
  }
  const sumPassedOut: number | null = sumOk ? sumPassed : null;

  const override = options?.targetLevel;
  const target =
    override != null && Number.isFinite(override) && override > 0
      ? override
      : getTargetLevel(product);
  // ET requires at least one settled fixing — 0 passed → "—" (not Target Level).
  if (
    target == null ||
    !(target > 0) ||
    remaining <= 0 ||
    total <= 0 ||
    passed < 1 ||
    sumPassedOut == null
  ) {
    return { total, passed, remaining, sumPassed: sumPassedOut, effectiveTarget: null };
  }

  return {
    total,
    passed,
    remaining,
    sumPassed: sumPassedOut,
    effectiveTarget: (total * target - sumPassedOut) / remaining,
  };
}

export function formatEffectiveTargetCell(value: number | null): string {
  return value != null && Number.isFinite(value) ? formatNumber(value) : "—";
}
