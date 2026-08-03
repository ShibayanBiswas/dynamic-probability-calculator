import type { ProductRecord } from "@/lib/types";
import { getProductFinalObservationDate, getProductObservationDates, getWorkingAllotmentDate } from "@/lib/product-dates";
import { getTargetLevel, getCouponPercent } from "@/lib/product-utils";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import { resolveCustomUnderlyingLevel } from "@/lib/custom-underlying-history";
import { getUnderlyingKind } from "@/lib/underlying-benchmark";
import { toExcelSerial } from "@/lib/workbook/dates";
import indexHistory from "@/lib/data/valuation-index-history.json";
import { lookupIndexLevelOnOrBefore, type IndexHistoryEntry } from "@/lib/workbook/index-history";
import { tryEvaluatePayoffFormula } from "@/lib/workbook/formula-engine";
import { xirrEntryToCurrent } from "@/lib/workbook/valuation-serial";

const HISTORY = new Map<number, number>(
  indexHistory.entries.map((row) => [row.dateSerial, row.level]),
);

// Pre-sorted for on-or-before lookup (Working!N VLOOKUP semantics).
const SORTED_HISTORY: IndexHistoryEntry[] = [...indexHistory.entries].sort(
  (a, b) => a.dateSerial - b.dateSerial,
);

/**
 * Desk observation anchor for Working!I / last-obs done checks — **last** scheduled fixing.
 * (No-obs expected-Nifty path separately extrapolates to the **second-last** fixing.)
 */
export function resolveWorkingObservationDate(product: ProductRecord, _valuationDate: Date): Date | undefined {
  void _valuationDate;
  const schedule = getProductObservationDates(product).sort((a, b) => a.getTime() - b.getTime());
  if (schedule.length === 0) return undefined;
  return schedule[schedule.length - 1];
}

/** Second-last scheduled observation (falls back to last when the book has only one). */
export function resolveSecondLastObservationDate(product: ProductRecord): Date | undefined {
  const schedule = getProductObservationDates(product).sort((a, b) => a.getTime() - b.getTime());
  if (schedule.length === 0) return undefined;
  if (schedule.length === 1) return schedule[0];
  return schedule[schedule.length - 2];
}

function lookupHistoricalIndexLevel(
  product: ProductRecord,
  observationDate: Date,
): number | undefined {
  const kind = getUnderlyingKind(product);
  if (kind === "sensex") return lookupBundledSensexOnOrBefore(observationDate);
  if (kind === "custom") return resolveCustomUnderlyingLevel(product, observationDate);
  const serial = toExcelSerial(observationDate);
  return HISTORY.get(serial) ?? lookupIndexLevelOnOrBefore(SORTED_HISTORY, serial);
}

/**
 * Working!N — expected underlying at the last observation (Excel desk-row / Mode B replay).
 * Live desk marks use {@link resolveValuationExpectedLevel} (obs-average path).
 */
export function computeExpectedUnderlyingLevel(
  entryLevel: number,
  currentLevel: number,
  allotmentDate: Date,
  valuationDate: Date,
  observationDate: Date | undefined,
  serialDesk?: { allotment?: number; valuation?: number; observation?: number },
  productOrSensex: ProductRecord | boolean = false,
): number | "NA" | undefined {
  if (!observationDate || entryLevel <= 0 || currentLevel <= 0) return undefined;

  const F = serialDesk?.allotment ?? toExcelSerial(allotmentDate);
  const B1 = serialDesk?.valuation ?? toExcelSerial(valuationDate);
  const I = serialDesk?.observation ?? toExcelSerial(observationDate);

  if (I - B1 >= 0) {
    if (currentLevel < entryLevel) return "NA";
    const xirr = xirrEntryToCurrent(entryLevel, currentLevel, B1 - F);
    return entryLevel * Math.pow(1 + xirr, (I - F) / 365);
  }

  // Product-aware history when available; boolean kept for Mode B Excel-row callers.
  if (typeof productOrSensex === "object" && productOrSensex) {
    return lookupHistoricalIndexLevel(productOrSensex, observationDate);
  }
  const sensexLinked = Boolean(productOrSensex);
  if (sensexLinked) return lookupBundledSensexOnOrBefore(observationDate);
  const serial = toExcelSerial(observationDate);
  return HISTORY.get(serial) ?? lookupIndexLevelOnOrBefore(SORTED_HISTORY, serial);
}

/**
 * Desk valuation underlying path (ongoing + expired) — Rollover Phase Working!F start:
 *
 * | Obs state | Path |
 * |-----------|------|
 * | None passed yet | Annualise entry→spot from Working!F→val date; extrapolate to last obs |
 * | Some passed | Average realised fixings; annualise entry→avg through average passed obs date; extrapolate to last obs |
 * | All passed / past last obs | Average of all fixings (coupon / IRR lock base) |
 *
 * Specs still show Excel dates; calculation tenure uses phase start/end separately.
 */
export function resolveValuationExpectedLevel(
  product: ProductRecord,
  entryLevel: number,
  currentLevel: number,
  allotmentDate: Date,
  valuationDate: Date,
  sensexLinked: boolean,
): number | "NA" | undefined {
  void sensexLinked;
  if (entryLevel <= 0 || currentLevel <= 0) return undefined;

  const schedule = getProductObservationDates(product).sort((a, b) => a.getTime() - b.getTime());
  const lastObs =
    schedule.length > 0 ? schedule[schedule.length - 1] : getProductFinalObservationDate(product);
  if (!lastObs) return undefined;

  const F = toExcelSerial(allotmentDate);
  const B1 = toExcelSerial(valuationDate);
  const I = toExcelSerial(lastObs);
  const passed = schedule.filter((d) => d.getTime() <= valuationDate.getTime());
  const custom = getUnderlyingKind(product) === "custom";

  // —— No observation yet (Logic II): spot IRR → extrapolate to **second-last** obs ——
  if (passed.length === 0) {
    const anchor =
      schedule.length >= 2 ? schedule[schedule.length - 2]! : lastObs;
    const anchorSerial = toExcelSerial(anchor);
    if (anchorSerial - B1 < 0) {
      return lookupHistoricalIndexLevel(product, anchor);
    }
    if (currentLevel < entryLevel) return "NA";
    const daysLive = Math.max(0, B1 - F);
    if (daysLive <= 0) return currentLevel;
    const xirr = xirrEntryToCurrent(entryLevel, currentLevel, daysLive);
    return entryLevel * Math.pow(1 + xirr, (anchorSerial - F) / 365);
  }

  // —— ≥1 observation done (Logic I): average of realised fixings = expected Nifty ——
  const levels: number[] = [];
  for (const date of passed) {
    const level = lookupHistoricalIndexLevel(product, date);
    if (level == null || !(level > 0)) {
      // Custom underlyings: never fall back to Nifty Working!N — fail closed.
      if (custom) return undefined;
      // Incomplete index history — fall back to classic single-path Working!N
      return computeExpectedUnderlyingLevel(
        entryLevel,
        currentLevel,
        allotmentDate,
        valuationDate,
        lastObs,
        { allotment: F, valuation: B1, observation: I },
        product,
      );
    }
    levels.push(level);
  }
  return levels.reduce((sum, level) => sum + level, 0) / levels.length;
}

/** Working!O — underlying performance fed into the payoff formula. */
export function computeUnderlyingPerformance(
  entryLevel: number,
  currentLevel: number,
  expectedLevel: number | "NA" | undefined,
): number {
  if (entryLevel <= 0) return 0;
  if (expectedLevel === "NA" || expectedLevel == null || !Number.isFinite(expectedLevel)) {
    return currentLevel / entryLevel - 1;
  }
  return expectedLevel / entryLevel - 1;
}

/** True when the final scheduled observation date is on or before the valuation date. */
export function isLastObservationPassed(product: ProductRecord, valuationDate: Date): boolean {
  const schedule = getProductObservationDates(product).sort((a, b) => a.getTime() - b.getTime());
  const lastObs = schedule.length > 0 ? schedule[schedule.length - 1] : getProductFinalObservationDate(product);
  if (!lastObs) return false;
  return valuationDate.getTime() >= lastObs.getTime();
}

/** True when every scheduled observation is on/before the valuation date. */
export function allObservationsPassed(product: ProductRecord, valuationDate: Date): boolean {
  const schedule = getProductObservationDates(product);
  if (schedule.length === 0) return false;
  const valMs = valuationDate.getTime();
  return schedule.every((date) => date.getTime() <= valMs);
}

function observationLevelsForAverage(
  product: ProductRecord,
  valuationDate: Date,
  _sensexLinked: boolean,
): number[] | undefined {
  void _sensexLinked;
  const schedule = getProductObservationDates(product).filter((date) => date.getTime() <= valuationDate.getTime());
  if (schedule.length === 0) return undefined;

  const levels: number[] = [];
  for (const date of schedule) {
    const level = lookupHistoricalIndexLevel(product, date);
    if (level == null || !(level > 0)) return undefined;
    levels.push(level);
  }
  return levels;
}

/**
 * Full coupon forms when the **last** observation has passed and the average realised
 * index level at all elapsed fixings clears the target barrier (Working sheet barrier).
 */
export function qualifiesForFullCoupon(product: ProductRecord, valuationDate: Date, sensexLinked: boolean): boolean {
  if (!isLastObservationPassed(product, valuationDate)) return false;
  const target = getTargetLevel(product);
  if (target == null || !(target > 0)) return false;

  const levels = observationLevelsForAverage(product, valuationDate, sensexLinked);
  if (!levels?.length) return false;
  const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  return average > target;
}

/** Headline coupon return (decimal) when the full-coupon barrier is met. */
export function resolveFullCouponReturn(product: ProductRecord): number | undefined {
  const coupon = getCouponPercent(product);
  return coupon != null && Number.isFinite(coupon) ? coupon : undefined;
}

/**
 * Coupon Formed **S** — same payoff formula the scenario table uses at Working!O / Z.
 *
 * Barrier (avg / projected target) only supplies the master headline when the formula
 * cannot evaluate. Never replace a valid formula result with CC1 — that doubles coupon
 * on upside-decay / CC2 products (e.g. Range Bound Magnifier at +59% → 30%, not 60%).
 */
export function resolveCouponFormedReturn(
  product: ProductRecord,
  performance: number,
  formulaText: string,
  barrierMet: boolean,
): number {
  const evaluated = tryEvaluatePayoffFormula(formulaText, performance);
  if (evaluated.ok) return evaluated.value;
  if (barrierMet) return resolveFullCouponReturn(product) ?? 0;
  return 0;
}

/**
 * Before the final observation: extrapolated index at the last fixing clears the
 * target barrier or the payoff formula's flat-coupon band — apply headline coupon now.
 */
export function qualifiesForProjectedFullCoupon(
  product: ProductRecord,
  valuationDate: Date,
  entryLevel: number,
  currentLevel: number,
  sensexLinked: boolean,
): boolean {
  if (isLastObservationPassed(product, valuationDate)) return false;
  if (entryLevel <= 0 || currentLevel <= 0) return false;

  const headline = resolveFullCouponReturn(product);
  if (headline == null) return false;

  const observationDate = resolveWorkingObservationDate(product, valuationDate);
  if (!observationDate) return false;

  const allotmentDate = getWorkingAllotmentDate(product, valuationDate) ?? valuationDate;
  const expected = resolveValuationExpectedLevel(
    product,
    entryLevel,
    currentLevel,
    allotmentDate,
    valuationDate,
    sensexLinked,
  );
  if (expected === "NA" || expected == null || !Number.isFinite(expected)) return false;

  const target = getTargetLevel(product);
  if (target != null && target > 0 && expected >= target) return true;

  const projectedZ = expected / entryLevel - 1;
  const formula = product.formulaText?.trim() || "Z";
  const evaluated = tryEvaluatePayoffFormula(formula, projectedZ);
  return evaluated.ok && evaluated.value + 1e-9 >= headline;
}

/** Realised (post last obs) or projected (extrapolation) full coupon. */
export function qualifiesForAnyFullCoupon(
  product: ProductRecord,
  valuationDate: Date,
  entryLevel: number,
  currentLevel: number,
  sensexLinked: boolean,
): boolean {
  return (
    qualifiesForFullCoupon(product, valuationDate, sensexLinked) ||
    qualifiesForProjectedFullCoupon(product, valuationDate, entryLevel, currentLevel, sensexLinked)
  );
}
