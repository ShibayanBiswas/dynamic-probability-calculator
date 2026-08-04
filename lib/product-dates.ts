import type { ProductRecord } from "@/lib/types";
import { rawField } from "@/lib/product-utils";
import { parseExcelishDate, toExcelSerial } from "@/lib/workbook/dates";
import { differenceInCalendarDays } from "date-fns";

/** Working!F — calendar allotment from master (display only; may differ from trade/opening). */
export function getProductAllotmentDate(product: ProductRecord): Date | undefined {
  const raw = rawField(product, "Allotment Date");
  return raw ? parseExcelishDate(raw) : undefined;
}

/** Trade / opening date — display and tenor fallback when allotment is blank. */
export function getProductTradeOpeningDate(product: ProductRecord): Date | undefined {
  const raw = rawField(product, "Trade Date/Opening date", "Trade Date");
  return raw ? parseExcelishDate(raw) : undefined;
}

/** Desk start date for tenor / ladder — allotment, else trade/opening. */
export function getProductAllotmentAnchorDate(product: ProductRecord): Date | undefined {
  return getProductAllotmentDate(product) ?? getProductTradeOpeningDate(product);
}

/** Explicit rollover schedule date from master — Rollover C/P Date (not last observation). */
export function getProductRolloverScheduleDate(product: ProductRecord): Date | undefined {
  return parseExcelishDate(
    rawField(product, "Rollover C/P Date", "Rollover C/P date", "Rollover CP Date", "Rollover Date"),
  );
}

/** Desk rollover-phase bucket used for all date/tenor calculations. */
export type RolloverPhaseKind = "blank" | "phase1" | "phase2" | "tenYear";

/** True when desk Rollover Phase resolves to Phase 2 (master Phase II). */
export function isPhase2RolloverProduct(product: ProductRecord): boolean {
  return formatProductRolloverPhaseLabel(product) === "Phase 2";
}

/** True when desk Rollover Phase resolves to Phase 1 (master Phase I). */
export function isPhase1RolloverProduct(product: ProductRecord): boolean {
  return formatProductRolloverPhaseLabel(product) === "Phase 1";
}

/** Map master Rollover Phase → calculation kind (blank when phase column is empty). */
export function getRolloverPhaseKind(product: ProductRecord): RolloverPhaseKind {
  const label = formatProductRolloverPhaseLabel(product);
  if (label === "Phase 2") return "phase2";
  if (label === "Phase 1") return "phase1";
  if (label === "10 Years") return "tenYear";
  return "blank";
}

/** Master POED column — Put / phase-end date used by Phase 1 & Phase 2 tenor rules. */
export function getProductPoedDate(product: ProductRecord): Date | undefined {
  return parseExcelishDate(rawField(product, "POED", "POE Date", "Put Option Exercise Date"));
}

/**
 * Phase 1 schedule end — POED acts as maturity and must sit on/after Last Observation.
 * Early-POED data defects return undefined so callers fall back to Maturity.
 */
export function getPhase1SchedulePoedDate(product: ProductRecord): Date | undefined {
  const poed = getProductPoedDate(product);
  if (!poed) return undefined;
  const lastObs = getProductFinalObservationDate(product);
  if (lastObs && poed.getTime() < lastObs.getTime()) return undefined;
  return poed;
}

/**
 * POED when it is a valid tenor end after Allotment (used by helpers that need raw POED).
 * Phase schedule end for Phase 1 still goes through `getPhase1SchedulePoedDate` /
 * `getPhaseScheduleEndDate` (POED must also sit on/after Last Observation).
 */
export function getPhasePoedTenorEndDate(product: ProductRecord): Date | undefined {
  const poed = getProductPoedDate(product);
  if (!poed) return undefined;
  const allotment = getProductAllotmentDate(product);
  if (allotment && poed.getTime() <= allotment.getTime()) return undefined;
  return poed;
}

/**
 * Working!F — valuation / elapsed / underlying-IRR start.
 *
 * Desk policy (Rollover Phase):
 * - **Phase 2** → Trade Date / Opening date
 * - **Blank / Phase 1 / 10 Years** → Allotment Date (Trade only when Allotment blank)
 *
 * Always returns the phase start when present. Callers treat Valuation Date &lt; Working!F
 * as pre-launch (block MTM, blank elapsed) — never rewrite Phase 2 onto Allotment.
 */
export function getWorkingAllotmentDate(product: ProductRecord, valuationDate?: Date): Date | undefined {
  void valuationDate;
  const trade = getProductTradeOpeningDate(product);
  const allotment = getProductAllotmentDate(product);

  if (getRolloverPhaseKind(product) === "phase2" && trade) {
    return trade;
  }

  return allotment ?? trade ?? undefined;
}

/**
 * Schedule / MTM end for the phase (after Last Observation on the path):
 * - Blank / Phase 2 → Maturity Date
 * - Phase 1 → POED (acts as maturity); invalid/missing POED → Maturity
 * - 10 Years → Rollover C/P Date
 */
export function getPhaseScheduleEndDate(product: ProductRecord): Date | undefined {
  const kind = getRolloverPhaseKind(product);
  switch (kind) {
    case "phase1":
      return getPhase1SchedulePoedDate(product) ?? getProductMaturityDate(product);
    case "tenYear":
      return getProductRolloverScheduleDate(product) ?? getProductMaturityDate(product);
    case "blank":
    case "phase2":
      return getProductMaturityDate(product);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Contractual payoff-XIRR / coupon-IRR tenor (days) — same span as valuation
 * phase life (Working!F → schedule end). Independent of Specs Tenor Days.
 *
 * | Phase | Tenor span |
 * |-------|------------|
 * | Blank | Allotment (or Trade) → Maturity |
 * | Phase 1 | Allotment → POED |
 * | Phase 2 | Trade Date → Maturity |
 * | 10 Years | Allotment → Rollover C/P |
 */
export function getPhasePayoffTenorDays(product: ProductRecord): number | undefined {
  const start = getWorkingAllotmentDate(product);
  const end = getPhaseScheduleEndDate(product);
  if (!start || !end) return undefined;
  const days = differenceInCalendarDays(end, start);
  return days >= 30 ? days : undefined;
}

/** Short label for the phase schedule end used in UI copy. */
export type PhaseScheduleEndLabel = "POED" | "rollover" | "maturity";

export function getPhaseScheduleEndLabel(product: ProductRecord): PhaseScheduleEndLabel {
  const kind = getRolloverPhaseKind(product);
  switch (kind) {
    case "phase1":
      return getPhase1SchedulePoedDate(product) ? "POED" : "maturity";
    case "tenYear":
      return getProductRolloverScheduleDate(product) ? "rollover" : "maturity";
    case "blank":
    case "phase2":
      return "maturity";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Calendar days Working!F → asOf for IRR / lifecycle cards.
 * - Undefined when asOf is before Working!F (pre-launch)
 * - **0** on the phase start date itself (do not clamp to 1 — that annualises tiny moves to ~−100%)
 */
export function getElapsedDaysSinceWorkingAllotment(
  product: ProductRecord,
  asOf: Date,
): number | undefined {
  const start = getWorkingAllotmentDate(product, asOf);
  if (!start) return undefined;
  const days = differenceInCalendarDays(asOf, start);
  if (days < 0) return undefined;
  return days;
}

/**
 * Underlying index IRR from phase start (Working!F) to valuation.
 * Same-day (elapsed 0) → 0%; otherwise (current/entry)^(365/elapsed)−1.
 */
export function computeUnderlyingIrrSincePhaseStart(
  entryLevel: number,
  currentLevel: number,
  elapsedDays: number | undefined,
): number | undefined {
  if (elapsedDays == null || elapsedDays < 0) return undefined;
  if (!(entryLevel > 0) || !(currentLevel > 0)) return undefined;
  if (elapsedDays === 0) return 0;
  return Math.pow(currentLevel / entryLevel, 365 / elapsedDays) - 1;
}

/** Desk noun for Working!F — "Trade Date" (Phase 2) or "Allotment". */
export function phasePerformanceStartLabel(product: ProductRecord): string {
  return getRolloverPhaseKind(product) === "phase2" ? "Trade Date" : "Allotment";
}

/**
 * Calendar days until the phase schedule end (Maturity / POED / Rollover C/P).
 * Past the end returns elapsed days as a positive count.
 */
export function getDaysLeftToMaturity(product: ProductRecord, asOf: Date): number | undefined {
  const end = getPhaseScheduleEndDate(product);
  if (!end) return undefined;
  const days = differenceInCalendarDays(end, asOf);
  return days < 0 ? Math.abs(days) : Math.max(0, days);
}

/**
 * Rollover / last-observation anchor only — does **not** fall back to maturity.
 * Use for display when separating rollover products from maturity-only products.
 */
export function getProductRolloverDate(product: ProductRecord): Date | undefined {
  const lastObs =
    parseExcelishDate(product.lastObservationDateRaw) ??
    parseExcelishDate(rawField(product, "Last Observation Date", "Final Observation Date", "Observation date"));
  if (lastObs) return lastObs;

  const rollover = parseExcelishDate(
    rawField(product, "Rollover C/P Date", "Rollover C/P date", "Rollover CP Date", "Rollover Date"),
  );
  if (rollover) return rollover;

  const obs = getProductObservationDates(product);
  if (obs.length > 0) return obs[obs.length - 1];

  return undefined;
}

/**
 * True when the master row is on the rollover book — explicit Rollover C/P Date and/or Rollover Phase.
 * Does not infer rollover from Last Observation Date alone.
 */
export function productHasRolloverSchedule(product: ProductRecord): boolean {
  if (getProductRolloverScheduleDate(product)) return true;
  return Boolean(getProductRolloverPhase(product));
}

/** Portfolio / export Rollover Date — master Rollover C/P Date only (blank when absent). */
export function formatProductRolloverScheduleDate(product: ProductRecord): string | undefined {
  const date = getProductRolloverScheduleDate(product);
  return date ? formatProductCalendarDate(date) : undefined;
}

/** Master Rollover Phase cell — trimmed text or undefined when blank. */
export function parseMasterRolloverPhase(value: string | undefined | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed || undefined;
}

/** ~10-year Primary book — master uses `10years` when Rollover C/P is set on long-tenor deals. */
export const TEN_YEAR_PRIMARY_TENOR_DAYS = 3500;

/**
 * Infer rollover phase when the master column was stripped from an older cached row
 * but Rollover C/P Date (and tenor) are still present.
 */
export function inferRolloverPhaseFromMasterSignals(product: ProductRecord): string | undefined {
  const name = product.name ?? "";
  if (/\(ROLLOVER PHASE 2\)/i.test(name)) return "Phase II";
  if (/\(ROLLOVER PHASE 1\)/i.test(name)) return "Phase I";

  if (!getProductRolloverScheduleDate(product)) return undefined;

  const tenor = product.tenorDays ?? getProductTenorDays(product);
  if (tenor != null && tenor >= TEN_YEAR_PRIMARY_TENOR_DAYS) return "10years";

  const allotment = getProductAllotmentAnchorDate(product);
  const maturity = getProductMaturityDate(product);
  if (allotment && maturity) {
    const span = differenceInCalendarDays(maturity, allotment);
    if (span >= TEN_YEAR_PRIMARY_TENOR_DAYS) return "10years";
  }

  return undefined;
}

/** Desk-facing label — Phase 1, Phase 2, 10 Years (from master Phase I / Phase II / 10years). */
export function formatRolloverPhaseDeskLabel(phase: string): string {
  const lower = phase.trim().toLowerCase();
  if (lower.includes("10year") || lower === "10 years") return "10 Years";
  if (lower.includes("ii") || lower.includes("phase 2") || lower === "phase2") return "Phase 2";
  if (lower.includes("phase i") || lower.includes("phase 1") || lower === "phase1") return "Phase 1";
  return phase.trim();
}

/** Desk label for Rollover Phase — blank, Phase 1, Phase 2, 10 Years. */
export function formatProductRolloverPhaseLabel(product: ProductRecord): string | undefined {
  const phase = getProductRolloverPhase(product);
  if (!phase) return undefined;
  return formatRolloverPhaseDeskLabel(phase);
}

export function formatProductRolloverRaw(product: ProductRecord): string | undefined {
  const schedule = formatProductRolloverScheduleDate(product);
  if (schedule) return schedule;

  const d = getProductRolloverDate(product);
  if (!d) return undefined;
  return formatProductCalendarDate(d);
}

/** Desk tenor for display — computed from master dates, else parsed Tenor column. */
export function getDisplayTenorDays(product: ProductRecord, asOf?: Date): number | undefined {
  return getProductTenorDays(product, asOf) ?? product.tenorDays;
}

/**
 * Working!H schedule-end anchor for live desk valuation (Product IRR tenor + V growth).
 *
 * Prefer phase schedule end so Coupon Formed annualises and compounds over the same span:
 * - Blank / Phase 2 → Maturity
 * - Phase 1 → POED (fallback Maturity)
 * - 10 Years → Rollover C/P (fallback Maturity)
 *
 * Fallbacks match `computeValuation` when phase dates are blank
 * (master Maturity → expiry → raw fields → valuation date + tenor days).
 * Mode B Excel row replay still supplies Working!H via `deskRow.maturityDate`.
 */
export function resolveWorkingMaturityDate(product: ProductRecord, valuationDate: Date): Date {
  return (
    getPhaseScheduleEndDate(product) ??
    getProductMaturityDate(product) ??
    getProductExpiryDate(product) ??
    parseExcelishDate(product.maturityRaw ?? product.lastObservationDateRaw) ??
    new Date(valuationDate.getTime() + (product.tenorDays ?? 365) * 86400000)
  );
}

/**
 * Post-last-obs growth stop date — phase schedule end, else maturity fallbacks.
 * Matches `computeValuation` / `applyPostLastObservationGrowth`.
 */
export function resolvePostObsGrowthAnchorDate(product: ProductRecord, maturityDate: Date): Date {
  return (
    getProductExpirationDate(product) ??
    getProductMaturityDate(product) ??
    getProductExpiryDate(product) ??
    maturityDate
  );
}

const OBSERVATION_SLOT_FIELDS = [
  "Average 1",
  "Avg. 2",
  "Avg. 3",
  "Avg. 4",
  "Avg. 5",
  "Avg. 6",
  "Avg. 7",
] as const;

/** True when master Rollover Phase is the 10-year book (10years / 10 Years). */
export function isTenYearRolloverProduct(product: ProductRecord): boolean {
  const phase = getProductRolloverPhase(product);
  if (!phase) return false;
  return formatRolloverPhaseDeskLabel(phase) === "10 Years";
}

/**
 * Lifecycle / MTM / post-obs growth upper bound — phase schedule end
 * (Maturity, Phase 1 POED, or 10Y Rollover C/P).
 */
export function getProductExpirationDate(product: ProductRecord): Date | undefined {
  return getPhaseScheduleEndDate(product);
}

/**
 * Desk expiry anchor — Last Observation Date or Rollover C/P Date.
 * Maturity column is fallback only when obs fields are blank.
 */
export function getProductExpiryDate(product: ProductRecord): Date | undefined {
  const lastObs =
    parseExcelishDate(product.lastObservationDateRaw) ??
    parseExcelishDate(rawField(product, "Last Observation Date", "Final Observation Date", "Observation date"));
  if (lastObs) return lastObs;

  const rollover = parseExcelishDate(
    rawField(product, "Rollover C/P Date", "Rollover C/P date", "Rollover CP Date", "Rollover Date"),
  );
  if (rollover) return rollover;

  return parseExcelishDate(product.maturityRaw ?? rawField(product, "Maturity", "Maturity date", "Redemption Date"));
}

/**
 * Final fixing date for expired marks — latest scheduled observation date,
 * else the desk expiry anchor (last obs / rollover / maturity).
 */
export function getProductFinalObservationDate(product: ProductRecord): Date | undefined {
  const obs = getProductObservationDates(product);
  if (obs.length > 0) return obs[obs.length - 1];
  return getProductExpiryDate(product);
}

/** Observation 1–7 slot dates from master Average 1 / Avg. 2–7 (fixed column order). */
export function getProductObservationSlotDates(product: ProductRecord): (Date | undefined)[] {
  return OBSERVATION_SLOT_FIELDS.map((key) => {
    const raw = rawField(product, key);
    return raw?.trim() ? parseExcelishDate(raw) : undefined;
  });
}

/** Upcoming observation dates for obs-due filters — Average 1 / Avg. 2–7 only, sorted ascending. */
export function getProductObservationDates(product: ProductRecord): Date[] {
  const unique = new Map<number, Date>();
  for (const date of getProductObservationSlotDates(product)) {
    if (date) unique.set(date.getTime(), date);
  }
  return [...unique.values()].sort((a, b) => a.getTime() - b.getTime());
}

export function getProductRolloverPhase(product: ProductRecord): string | undefined {
  const topLevel = parseMasterRolloverPhase(product.rolloverPhase);
  if (topLevel) return topLevel;
  const fromRaw = parseMasterRolloverPhase(rawField(product, "Rollover Phase"));
  if (fromRaw) return fromRaw;
  return inferRolloverPhaseFromMasterSignals(product);
}

/** Backfill `rolloverPhase` from raw master column or desk inference — helps older cached datasets. */
export function hydrateProductRolloverPhases(products: ProductRecord[]): void {
  for (const product of products) {
    if (parseMasterRolloverPhase(product.rolloverPhase)) continue;
    const resolved = getProductRolloverPhase(product);
    if (resolved) product.rolloverPhase = resolved;
  }
}

export function formatProductCalendarDate(date: Date | undefined): string | undefined {
  if (!date) return undefined;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

export function formatProductTradeDate(product: ProductRecord): string {
  return formatProductCalendarDate(getProductTradeOpeningDate(product)) ?? "—";
}

export function formatProductPoedDate(product: ProductRecord): string {
  return formatProductCalendarDate(getProductPoedDate(product)) ?? "—";
}

export function formatProductMaturityDate(product: ProductRecord): string {
  return formatProductCalendarDate(getProductMaturityDate(product)) ?? "—";
}

/** Phase-aware actual start — Allotment (Blank / Phase 1 / 10Y) or Trade Date (Phase 2). */
export function formatProductActualStartDate(product: ProductRecord, asOf?: Date): string {
  return formatProductCalendarDate(getWorkingAllotmentDate(product, asOf)) ?? "—";
}

export function formatProductAllotmentDate(product: ProductRecord): string {
  return formatProductCalendarDate(getProductAllotmentDate(product)) ?? "—";
}

export function formatProductExpirationDate(product: ProductRecord): string {
  const expiration = getProductExpirationDate(product);
  if (expiration) return formatProductCalendarDate(expiration)!;
  return product.lastObservationDateRaw ?? product.maturityRaw ?? "—";
}

/** Elapsed calendar days Working!F → last observation (IRR / hurdle tenor). */
export function getAllotmentToLastObservationDays(product: ProductRecord, valuationDate?: Date): number {
  const start = getWorkingAllotmentDate(product, valuationDate);
  const end = getProductExpiryDate(product);
  if (!start || !end) return product.tenorDays ?? 365;
  const days = differenceInCalendarDays(end, start);
  return Math.max(30, days);
}

export function formatProductExpiryRaw(product: ProductRecord): string | undefined {
  const d = getProductExpiryDate(product);
  if (!d) return product.lastObservationDateRaw ?? product.maturityRaw;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
}

export function getProductExpirySerial(product: ProductRecord): number | undefined {
  const d = getProductExpiryDate(product);
  return d ? toExcelSerial(d) : undefined;
}

/** Redemption / maturity date from master (calendar maturity, not observation). */
export function getProductMaturityDate(product: ProductRecord): Date | undefined {
  return parseExcelishDate(
    product.maturityRaw ?? rawField(product, "Maturity", "Maturity date", "Maturity Date", "Redemption Date"),
  );
}

/**
 * Product Tenor (calendar days) — master Tenor Days column, else allotment (or trade) → expiration.
 */
export function getProductTenorDays(product: ProductRecord, _valuationDate?: Date): number | undefined {
  void _valuationDate;
  if (product.tenorDays != null && product.tenorDays > 0) return product.tenorDays;
  const start = getProductAllotmentAnchorDate(product);
  const end = getProductExpirationDate(product);
  if (!start || !end) return undefined;
  const days = differenceInCalendarDays(end, start);
  return days > 0 ? days : undefined;
}

/** Rollover Tenor (calendar days) — allotment (or trade) → rollover date when present. */
export function getRolloverTenorDays(product: ProductRecord): number | undefined {
  const start = getProductAllotmentAnchorDate(product);
  const end = getProductRolloverScheduleDate(product);
  if (!start || !end) return undefined;
  const days = differenceInCalendarDays(end, start);
  return days > 0 ? days : undefined;
}

/** Rollover span (calendar days) — allotment (or trade) → rollover C/P for 10-year phase products. */
export function getObservationTenorDays(product: ProductRecord, valuationDate?: Date): number | undefined {
  void valuationDate;
  if (!isTenYearRolloverProduct(product)) return undefined;
  return getRolloverTenorDays(product);
}
