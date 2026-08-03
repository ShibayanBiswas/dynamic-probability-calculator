import { startOfDay } from "date-fns";

import { isObservationFixingSettled } from "@/lib/observation-settlement";
import { getProductFinalObservationDate } from "@/lib/product-dates";
import type { ProductRecord } from "@/lib/types";
import { parseExcelishDate, type ExcelishDateInput } from "@/lib/workbook/dates";
import type { ObservationSchedule, ProbabilityRunResult } from "@/lib/probability/engine";

/** True when the product's final observation fixing has settled as of `asOf`. */
export function hasPassedFinalObservation(
  product: ProductRecord,
  asOf: Date = new Date(),
): boolean {
  const finalObs = getProductFinalObservationDate(product);
  if (!finalObs) return false;
  return isObservationFixingSettled(finalObs, asOf);
}

/**
 * Probability / required-% checking date: once the final observation has settled,
 * lock metrics to that calendar day (not a later desk/valuation date).
 */
export function getProbabilityCheckingDate(
  product: ProductRecord,
  requested: Date,
): Date {
  const finalObs = getProductFinalObservationDate(product);
  if (finalObs && isObservationFixingSettled(finalObs, requested)) {
    return startOfDay(finalObs);
  }
  return requested;
}

function reviveScheduleDate(value: ExcelishDateInput): Date | null {
  if (value == null || value === "") return null;
  return parseExcelishDate(value) ?? null;
}

/** Revive Date fields after JSON transport from /api/probability/run. */
export function hydrateProbabilityRunResult(
  raw: ProbabilityRunResult | null | undefined,
): ProbabilityRunResult | null {
  if (!raw) return null;
  const schedule: ObservationSchedule[] = (raw.schedule ?? []).map((slot) => ({
    index: slot.index,
    daysFromBase: slot.daysFromBase,
    date: reviveScheduleDate(slot.date as ExcelishDateInput),
  }));
  return { ...raw, schedule };
}
