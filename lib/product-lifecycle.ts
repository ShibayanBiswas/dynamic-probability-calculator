import type { ProductRecord } from "@/lib/types";
import {
  formatProductCalendarDate,
  getPhaseScheduleEndLabel,
  getProductExpirationDate,
  getProductObservationDates,
  getRolloverPhaseKind,
  getWorkingAllotmentDate,
} from "@/lib/product-dates";
import { getExpiredValuationUpperBound } from "@/lib/expired-valuation-dates";
import {
  hasMasterBookIdentity,
  isSparseMasterAnnotationRow,
} from "@/lib/master-book-filter";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";
import { differenceInCalendarDays, startOfDay } from "date-fns";

/** Calendar-day horizons — labelled as months in the UI. */
export const EXPIRING_1M_DAYS = 30;
export const EXPIRING_3M_DAYS = 90;
export const OBS_DUE_1M_DAYS = 30;
export const OBS_DUE_2M_DAYS = 60;
export const OBS_DUE_3M_DAYS = 90;
/** Within an Observation Due tab: ≤ this many days → red; further → green. */
export const OBS_URGENCY_NEAR_DAYS = 7;

export type ObservationUrgency = "near" | "scheduled";

/** Red vs green segregation for next-observation proximity on obs-due tabs. */
export function getObservationUrgency(
  daysToNextObs: number | null | undefined,
): ObservationUrgency | undefined {
  if (daysToNextObs == null || !Number.isFinite(daysToNextObs) || daysToNextObs < 0) {
    return undefined;
  }
  return daysToNextObs <= OBS_URGENCY_NEAR_DAYS ? "near" : "scheduled";
}

export type LifecycleStatus =
  | "ongoing"
  | "expired"
  | "perpetual"
  | "expiring-1m"
  | "expiring-3m"
  | "unknown"
  | "upcoming";

/** All filter ids including expired for internal pool math. */
export const LIFECYCLE_FILTERS = [
  "ongoing",
  "obs-due-3m",
  "obs-due-2m",
  "obs-due-1m",
  "expiring-3m",
  "expiring-1m",
  "expired",
] as const;

export type LifecycleFilter = (typeof LIFECYCLE_FILTERS)[number];

/** Live-book pills only — expired products are never shown on this desk. */
export const UI_LIFECYCLE_FILTERS = [
  "ongoing",
  "obs-due-3m",
  "obs-due-2m",
  "obs-due-1m",
  "expiring-3m",
  "expiring-1m",
] as const satisfies readonly LifecycleFilter[];

/** Quick Analytics export on Product Details — Ongoing book only. */
export const QUICK_ANALYTICS_LIFECYCLE_FILTERS = ["ongoing"] as const satisfies readonly LifecycleFilter[];

const OBS_DUE_FILTERS = new Set<LifecycleFilter>(["obs-due-3m", "obs-due-2m", "obs-due-1m"]);

/**
 * Expiration tabs — phase schedule end via `getProductExpirationDate`:
 * Blank / Phase 2 → Maturity · Phase 1 → POED · 10 Years → Rollover C/P.
 */
export const EXPIRATION_LIFECYCLE_FILTERS = [
  "ongoing",
  "expiring-3m",
  "expiring-1m",
  "expired",
] as const satisfies readonly LifecycleFilter[];

export function isObservationDueFilter(filter: LifecycleFilter): boolean {
  return OBS_DUE_FILTERS.has(filter);
}

export function isExpirationLifecycleFilter(filter: LifecycleFilter): boolean {
  return (EXPIRATION_LIFECYCLE_FILTERS as readonly LifecycleFilter[]).includes(filter);
}

export const LIFECYCLE_FILTER_LABELS: Record<LifecycleFilter, string> = {
  ongoing: "Ongoing",
  expired: "Expired",
  "expiring-3m": "Expiring in 3M",
  "expiring-1m": "Expiring in 1M",
  "obs-due-3m": "Observation Due in 3M",
  "obs-due-2m": "Observation Due in 2M",
  "obs-due-1m": "Observation Due in 1M",
};

/** Human label for desk alerts / picker copy. */
export function lifecycleFilterBookLabel(filter: LifecycleFilter | undefined): string {
  if (!filter) return "current";
  return LIFECYCLE_FILTER_LABELS[filter];
}

/** Badge text in product list — true product status on every tab (Ongoing vs Expiring in 1M/3M). */
export function lifecycleListBadgeLabel(status: LifecycleStatus, _filter?: LifecycleFilter): string {
  return LIFECYCLE_STATUS_LABELS[status];
}

export const LIFECYCLE_STATUS_LABELS: Record<LifecycleStatus, string> = {
  ongoing: "Ongoing",
  expired: "Expired",
  perpetual: "Perpetual",
  "expiring-1m": "Expiring in 1M",
  "expiring-3m": "Expiring in 3M",
  unknown: "Unknown",
  upcoming: "Upcoming",
};

export function getProductLifecycleStatus(product: ProductRecord, asOf = new Date()): LifecycleStatus {
  const perpetual =
    product.name.toLowerCase().includes("perpetual") ||
    String(product.raw?.Maturity ?? product.raw?.["Maturity date"] ?? product.productType ?? "")
      .toLowerCase()
      .includes("perpetual");

  if (perpetual) return "perpetual";

  const launch = getWorkingAllotmentDate(product, asOf);
  if (launch && differenceInCalendarDays(launch, asOf) > 0) {
    return "upcoming";
  }

  const expiration = getProductExpirationDate(product);
  if (!expiration) return "unknown";

  const days = differenceInCalendarDays(expiration, asOf);
  if (days < 0) return "expired";
  if (days <= EXPIRING_1M_DAYS) return "expiring-1m";
  if (days <= EXPIRING_3M_DAYS) return "expiring-3m";
  return "ongoing";
}

export function getDaysToExpiry(product: ProductRecord, asOf = new Date()): number | undefined {
  const anchor = getProductExpirationDate(product);
  if (!anchor) return undefined;
  return differenceInCalendarDays(anchor, asOf);
}

/** Days until maturity, or days since maturity when already expired. */
export function getDisplayDaysToExpiry(product: ProductRecord, asOf = new Date()): number | undefined {
  const days = getDaysToExpiry(product, asOf);
  if (days == null) return undefined;
  return days < 0 ? Math.abs(days) : days;
}

/** @deprecated use getDaysToExpiry */
export function getDaysToMaturity(product: ProductRecord, asOf = new Date()): number | undefined {
  return getDaysToExpiry(product, asOf);
}

export function isValidMasterProduct(product: ProductRecord, asOf = new Date()): boolean {
  if (product.category !== "Primary") return false;
  if (isSparseMasterAnnotationRow(product)) return false;

  const notional = product.tradeAmount;
  if (notional == null || !Number.isFinite(notional) || notional <= 0) return false;
  if (!hasMasterBookIdentity(product)) return false;

  return getProductLifecycleStatus(product, asOf) !== "unknown";
}

/** Alias — same rules as {@link isValidMasterProduct}. */
export const isCanonicalMasterProduct = isValidMasterProduct;

export function filterValidMasterProducts(products: ProductRecord[], asOf = new Date()): ProductRecord[] {
  return products.filter((product) => isValidMasterProduct(product, asOf));
}

/** Alias — same rules as {@link filterValidMasterProducts}. */
export const filterCanonicalMasterProducts = filterValidMasterProducts;

export function isValuationApplicable(product: ProductRecord, asOf = new Date()): boolean {
  const status = getProductLifecycleStatus(product, asOf);
  return status !== "upcoming";
}

export type ValuationDateApplicability = {
  ok: boolean;
  reason?: string;
  phaseStart?: Date;
  phaseEnd?: Date;
};

export type PhaseValuationDateBounds = {
  /** Inclusive — Working!F (Trade for Phase 2, Allotment otherwise). */
  minDate?: Date;
  /** Inclusive — earlier of desk today and phase schedule end. */
  maxDate: Date;
  /** Desk label for the min bound ("Trade Date" / "Allotment Date"). */
  startFieldLabel: string;
  /** Desk label for phase schedule end ("maturity" / "POED" / "rollover"). */
  endFieldLabel: string;
  phaseEnd?: Date;
};

/**
 * Selectable Valuation Date window — applies to Blank, Phase 1, Phase 2, and 10 Years.
 * - Start = Working!F (Allotment; Trade for Phase 2)
 * - End = min(today, Maturity / Phase 1 POED / 10Y Rollover)
 */
export function getPhaseValuationDateBounds(
  product: ProductRecord,
  asOf: Date = new Date(),
): PhaseValuationDateBounds {
  const today = startOfDay(asOf);
  const phaseStart = getWorkingAllotmentDate(product, asOf);
  const phaseEnd = getExpiredValuationUpperBound(product);
  const kind = getRolloverPhaseKind(product);
  const startFieldLabel = kind === "phase2" ? "Trade Date" : "Allotment Date";
  const endKind = getPhaseScheduleEndLabel(product);
  let endFieldLabel: string;
  switch (endKind) {
    case "POED":
      endFieldLabel = "POED";
      break;
    case "rollover":
      endFieldLabel = "Rollover C/P";
      break;
    case "maturity":
      endFieldLabel = "maturity";
      break;
    default: {
      const _exhaustive: never = endKind;
      return _exhaustive;
    }
  }

  const minDate = phaseStart ? startOfDay(phaseStart) : undefined;
  let maxDate = today;
  if (phaseEnd) {
    const end = startOfDay(phaseEnd);
    if (differenceInCalendarDays(end, maxDate) < 0) maxDate = end;
  }
  if (minDate && differenceInCalendarDays(maxDate, minDate) < 0) {
    maxDate = minDate;
  }

  return {
    minDate,
    maxDate,
    startFieldLabel,
    endFieldLabel,
    phaseEnd: phaseEnd ? startOfDay(phaseEnd) : undefined,
  };
}

/**
 * Under-field range copy for Valuation / Observation date controls.
 * Live: `Trade Date 02-05-2023 → maturity / today 15-07-2026`
 * Expired: `Allotment Date 28-12-2020 → maturity 13-07-2026`
 */
export function formatPhaseValuationWindowHint(
  product: ProductRecord,
  asOf: Date = new Date(),
): string {
  const bounds = getPhaseValuationDateBounds(product, asOf);
  if (!bounds.minDate) {
    return `Through ${formatDisplayDate(bounds.maxDate)}`;
  }
  const start = `${bounds.startFieldLabel} ${formatDisplayDate(bounds.minDate)}`;
  const phaseEnd = bounds.phaseEnd;
  const today = startOfDay(asOf);
  if (phaseEnd && differenceInCalendarDays(phaseEnd, today) < 0) {
    return `${start} → ${bounds.endFieldLabel} ${formatDisplayDate(phaseEnd)}`;
  }
  return `${start} → ${bounds.endFieldLabel} / today ${formatDisplayDate(bounds.maxDate)}`;
}

/** Clamp a desk DD-MM-YYYY into the product phase window (returns unchanged when already valid). */
export function clampValuationDateToPhaseWindow(
  product: ProductRecord,
  valuationDateRaw: string,
  asOf: Date = new Date(),
): string {
  const bounds = getPhaseValuationDateBounds(product, asOf);
  const parsed = parseExcelishDate(valuationDateRaw);
  if (!parsed) {
    return formatDisplayDate(bounds.maxDate);
  }
  const day = startOfDay(parsed);
  if (bounds.minDate && differenceInCalendarDays(day, bounds.minDate) < 0) {
    return formatDisplayDate(bounds.minDate);
  }
  if (differenceInCalendarDays(day, bounds.maxDate) > 0) {
    return formatDisplayDate(bounds.maxDate);
  }
  return formatDisplayDate(day);
}

/**
 * Phase valuation window:
 * - Start = Working!F (Allotment; Trade for Phase 2)
 * - End = phase schedule end (Maturity / Phase 1 POED / 10Y Rollover)
 */
export function getValuationDateApplicability(
  product: ProductRecord,
  valuationDateRaw: string,
): ValuationDateApplicability {
  const valuationDate = parseExcelishDate(valuationDateRaw);
  if (!valuationDate) {
    return { ok: isValuationApplicable(product), reason: "Valuation date could not be parsed." };
  }

  const phaseStart = getWorkingAllotmentDate(product, valuationDate);
  const phaseEnd = getExpiredValuationUpperBound(product);

  if (phaseStart && differenceInCalendarDays(valuationDate, phaseStart) < 0) {
    const startLabel = formatProductCalendarDate(phaseStart) ?? "phase start";
    return {
      ok: false,
      phaseStart,
      phaseEnd,
      reason:
        `Valuation date is before the phase start (${startLabel}). ` +
        "Phase 2 starts on Trade Date; Blank / Phase 1 / 10 Years start on Allotment. " +
        "MTM and Performance & Lifecycle stay blank until that date.",
    };
  }

  if (phaseEnd && differenceInCalendarDays(valuationDate, phaseEnd) > 0) {
    const endLabel = formatProductCalendarDate(phaseEnd) ?? "phase end";
    return {
      ok: false,
      phaseStart,
      phaseEnd,
      reason: `Valuation date is after the phase end (${endLabel}). Pick a date on or before that schedule end.`,
    };
  }

  return { ok: true, phaseStart, phaseEnd };
}

/** MTM when valuation date is on/after phase start and on/before phase schedule end. */
export function isValuationApplicableAt(product: ProductRecord, valuationDateRaw: string): boolean {
  return getValuationDateApplicability(product, valuationDateRaw).ok;
}

/** Live mark for portfolio export — product must exist and be runnable on the desk date. */
export function isActiveMarkAtDate(product: ProductRecord, valuationDateRaw: string): boolean {
  if (!product.formulaText?.trim()) return false;
  if (!isValuationApplicableAt(product, valuationDateRaw)) return false;

  const valuationDate = parseExcelishDate(valuationDateRaw);
  if (!valuationDate) return true;

  const status = getProductLifecycleStatus(product, valuationDate);
  return status !== "upcoming" && status !== "unknown";
}

function observationDueHorizonDays(filter: LifecycleFilter): number | null {
  switch (filter) {
    case "obs-due-3m":
      return OBS_DUE_3M_DAYS;
    case "obs-due-2m":
      return OBS_DUE_2M_DAYS;
    case "obs-due-1m":
      return OBS_DUE_1M_DAYS;
    default:
      return null;
  }
}

/** Any upcoming observation date within the horizon (live book only). */
export function productHasObservationDueWithin(
  product: ProductRecord,
  horizonDays: number,
  asOf = new Date(),
): boolean {
  const status = getProductLifecycleStatus(product, asOf);
  if (status === "expired" || status === "upcoming" || status === "unknown") return false;

  const deskDay = startOfDay(asOf);
  return getProductObservationDates(product).some((date) => {
    const daysUntil = differenceInCalendarDays(startOfDay(date), deskDay);
    return daysUntil >= 0 && daysUntil <= horizonDays;
  });
}

/** Calendar days to the nearest upcoming observation, including an observation due today. */
export function getDaysToNextObservation(
  product: ProductRecord,
  asOf = new Date(),
): number | undefined {
  const deskDay = startOfDay(asOf);
  const upcomingDays = getProductObservationDates(product)
    .map((date) => differenceInCalendarDays(startOfDay(date), deskDay))
    .filter((days) => days >= 0);

  return upcomingDays.length > 0 ? Math.min(...upcomingDays) : undefined;
}

export function filterProductsByLifecycle(
  products: ProductRecord[],
  filter: LifecycleFilter,
  asOf = new Date(),
): ProductRecord[] {
  const obsHorizon = observationDueHorizonDays(filter);
  if (obsHorizon != null) {
    return products.filter((product) => productHasObservationDueWithin(product, obsHorizon, asOf));
  }
  return products.filter((product) => lifecycleStatusMatchesFilter(getProductLifecycleStatus(product, asOf), filter));
}

/** Products searchable/selectable on a lifecycle desk tab — identical to {@link filterProductsByLifecycle}. */
export function getLifecyclePickerPool(
  products: ProductRecord[],
  filter: LifecycleFilter,
  asOf = new Date(),
): ProductRecord[] {
  return filterProductsByLifecycle(products, filter, asOf);
}

export function isProductInLifecyclePickerPool(
  product: ProductRecord,
  filter: LifecycleFilter,
  asOf = new Date(),
): boolean {
  return getLifecyclePickerPool([product], filter, asOf).length > 0;
}

export function lifecycleStatusMatchesFilter(status: LifecycleStatus, filter: LifecycleFilter): boolean {
  if (isObservationDueFilter(filter)) return false;
  if (filter === "ongoing") {
    // Live book: long-dated ongoing + anything expiring within 3M / 1M (and perpetual).
    // Dedicated Expiring tabs remain narrower subsets of this pool.
    return (
      status === "ongoing" ||
      status === "perpetual" ||
      status === "expiring-3m" ||
      status === "expiring-1m"
    );
  }
  if (filter === "expired") return status === "expired";
  if (filter === "expiring-1m") return status === "expiring-1m";
  if (filter === "expiring-3m") return status === "expiring-1m" || status === "expiring-3m";
  return false;
}

export function countProductsByLifecycleFilter(
  products: ProductRecord[],
  filter: LifecycleFilter,
  asOf = new Date(),
): number {
  return filterProductsByLifecycle(products, filter, asOf).length;
}

export function partitionByLifecycle(products: ProductRecord[], asOf = new Date()) {
  const buckets: Record<LifecycleStatus, ProductRecord[]> = {
    ongoing: [],
    expired: [],
    perpetual: [],
    "expiring-1m": [],
    "expiring-3m": [],
    unknown: [],
    upcoming: [],
  };

  for (const product of products) {
    buckets[getProductLifecycleStatus(product, asOf)].push(product);
  }

  return buckets;
}

export function getLifecycleNotional(products: ProductRecord[], asOf = new Date()) {
  const buckets = partitionByLifecycle(products, asOf);
  return (Object.keys(buckets) as LifecycleStatus[]).map((status) => ({
    status,
    count: buckets[status].length,
    notional: buckets[status].reduce((sum, p) => sum + (p.tradeAmount ?? 0), 0),
  }));
}

export { getProductObservationDates } from "@/lib/product-dates";
