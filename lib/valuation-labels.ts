import {
  getPhaseScheduleEndLabel,
  getRolloverPhaseKind,
  phasePerformanceStartLabel,
  type RolloverPhaseKind,
} from "@/lib/product-dates";
import type { LifecycleFilter } from "@/lib/product-lifecycle";
import type { ProductRecord } from "@/lib/types";
import {
  formatDisplayDate,
  isDeskToday,
  parseExcelishDate,
} from "@/lib/workbook/dates";

/** Days-left card / column title from Rollover Phase schedule end. */
export function phaseDaysLeftLabel(product?: ProductRecord): string {
  if (!product) return "Days Left to Maturity";
  const kind: RolloverPhaseKind = getRolloverPhaseKind(product);
  switch (kind) {
    case "phase1":
      return getPhaseScheduleEndLabel(product) === "POED"
        ? "Days Left to POED"
        : "Days Left to Maturity";
    case "tenYear":
      return getPhaseScheduleEndLabel(product) === "rollover"
        ? "Days Left to Rollover"
        : "Days Left to Maturity";
    case "blank":
    case "phase2":
      return "Days Left to Maturity";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** "Allotment" or "Trade Date" — Working!F noun for IRR / elapsed labels. */
function phaseStartNoun(product?: ProductRecord): string {
  return product ? phasePerformanceStartLabel(product) : "Allotment";
}

/** Maturity / POED / rollover — phase schedule end for coupon-IRR labels. */
function phaseEndNoun(product?: ProductRecord): string {
  if (!product) return "maturity";
  const label = getPhaseScheduleEndLabel(product);
  switch (label) {
    case "POED":
      return "POED";
    case "rollover":
      return "rollover";
    case "maturity":
      return "maturity";
    default: {
      const _exhaustive: never = label;
      return _exhaustive;
    }
  }
}

/** Portfolio table — final scheduled observation / desk expiry date label. */
export const PORTFOLIO_LAST_OBS_COLUMN_LABEL = "Expiration Date";

/** Portfolio table: calendar days until expiration or maturity on live tabs. */
export const PORTFOLIO_DAYS_COLUMN_LABEL = "Days Left";
/** Expired portfolio tab — elapsed days since phase schedule end. */
export const PORTFOLIO_EXPIRED_DAYS_COLUMN_LABEL = "Days Since Expiry";
export const PORTFOLIO_DAYS_COLUMN_HINT =
  "Calendar days until phase schedule end — Maturity, Phase 1 POED, or Rollover for 10 Years";
export const PORTFOLIO_EXPIRED_DAYS_COLUMN_HINT =
  "Calendar days elapsed since phase schedule end — Maturity, Phase 1 POED, or Rollover for 10 Years";

/** Valuation column headers for Portfolio by Lifecycle — UI + Excel. */
export type LifecyclePortfolioColumnLabels = {
  /** Per-debenture mark using ₹1L face. */
  value: string;
  /** Total mark in crores using value times debenture count. */
  totalAmount: string;
  absReturn: string;
  couponFormed: string;
  productIrr: string;
  markDate: string;
  /** Days Left to Expiry live, or Days Since Expiry when expired. */
  daysColumn: string;
};

const LIVE_PORTFOLIO_COLUMNS: LifecyclePortfolioColumnLabels = {
  value: "Mark Level",
  totalAmount: "Book Amount ₹ Cr",
  absReturn: "Path Performance",
  couponFormed: "Coupon Path",
  productIrr: "Path Annualisation",
  markDate: "As of Today",
  daysColumn: PORTFOLIO_DAYS_COLUMN_LABEL,
};

const EXPIRED_PORTFOLIO_COLUMNS: LifecyclePortfolioColumnLabels = {
  value: "Mark Level at Last Observation",
  totalAmount: "Book Amount at Last Observation ₹ Cr",
  absReturn: "Path Performance at Last Observation",
  couponFormed: "Coupon Path at Last Observation",
  productIrr: "Path Annualisation",
  markDate: "Last Observation",
  daysColumn: PORTFOLIO_EXPIRED_DAYS_COLUMN_LABEL,
};

const QUICK_ANALYTICS_PORTFOLIO_COLUMNS: LifecyclePortfolioColumnLabels = {
  ...LIVE_PORTFOLIO_COLUMNS,
  value: "Mark Level on Valuation Date",
  totalAmount: "Book Amount on Valuation Date ₹ Cr",
  absReturn: "Path Performance on Valuation Date",
  couponFormed: "Coupon Path on Valuation Date",
  markDate: "Valuation Date",
};

/** Column titles for Quick Analytics exports using the selected valuation date. */
export function quickAnalyticsPortfolioColumnLabels(): LifecyclePortfolioColumnLabels {
  return QUICK_ANALYTICS_PORTFOLIO_COLUMNS;
}

/** Tooltip for the portfolio days column on a lifecycle tab. */
export function portfolioDaysColumnHint(filter: LifecycleFilter): string {
  return filter === "expired"
    ? PORTFOLIO_EXPIRED_DAYS_COLUMN_HINT
    : PORTFOLIO_DAYS_COLUMN_HINT;
}

/** Portfolio table header tooltips — lifecycle coupon columns. */
export function portfolioLifecycleColumnHint(
  header: string,
  filter: LifecycleFilter,
): string | undefined {
  const labels = lifecyclePortfolioColumnLabels(filter);
  if (header === labels.couponFormed) {
    return "Coupon path on the observation schedule — not a price-per-debenture mark.";
  }
  if (header === "Maturity Coupon") {
    return "Headline coupon from the master sheet — the maximum coupon if the full barrier is met at maturity.";
  }
  if (header === labels.productIrr) {
    return "Path annualisation over the product's actual phase tenure — not a product IRR mark.";
  }
  if (header === labels.absReturn) {
    return "Path performance versus entry on the observation-average path — not Absolute Return on deal price.";
  }
  if (/^Observation Level \d+$/.test(header) || /^Observation \d+$/.test(header)) {
    return "Underlying index close or observation date from the master — blank em dash when the date is empty, still ahead, or history is missing.";
  }
  if (header === "Initial Prob") {
    return "Historical path success rate versus adjusted start level from the product phase start.";
  }
  if (header === "Current Prob") {
    return "Historical path success rate versus path start close from the selected valuation date.";
  }
  if (header === "Tenor Left") {
    return "Days left to phase schedule end divided by 365.";
  }
  if (header === "Years") {
    return "Full phase tenor days divided by 365.";
  }
  if (header === "Total Observation Dates") {
    return "Count of unique scheduled observation dates on the master Observation 1 through Observation 7.";
  }
  if (header === "Observation Dates Passed") {
    return "Scheduled observation dates settled as of today — same calendar day stays pending until NSE cash close 15:30 IST.";
  }
  if (header === "Observation Dates Remaining") {
    return "Scheduled observation dates still pending, including same-day fixings before NSE cash close 15:30 IST.";
  }
  if (header === "Effective Target") {
    return (
      "Total Observation Dates × Target Level, minus the sum of underlying levels at passed observations, " +
      "then divided by Observation Dates Remaining. Blank when Target Level is missing, no pending observations remain, " +
      "or a passed observation has no historical level."
    );
  }
  return undefined;
}

/** Column titles for the lifecycle portfolio table and exports. */
export function lifecyclePortfolioColumnLabels(
  filter: LifecycleFilter,
): LifecyclePortfolioColumnLabels {
  return filter === "expired"
    ? EXPIRED_PORTFOLIO_COLUMNS
    : LIVE_PORTFOLIO_COLUMNS;
}

/**
 * Metric labels for the valuation / details / payoff screens.
 *
 * - **live** — valuation date is today; ongoing product marked to current market.
 * - **historical** — ongoing product but valuation date is in the past (or not today).
 * - **expired** — product past final observation; marks use the *selected* observation date
 *   (first, intermediate, or last) — never a fixed “Last Observation” wording.
 */
export type ValuationLabelMode = "live" | "historical" | "expired";

export type ValuationMetricLabels = {
  value: string;
  coupon: string;
  couponFormed: string;
  productIrr: string;
  underlyingIrr: string;
  underlyingLevel: string;
  daysElapsed: string;
  daysToRollover: string;
  performanceNote: string;
  lifecycleSection: string;
};

export function resolveValuationLabelMode(
  isExpired: boolean,
  valuationDate?: string,
): ValuationLabelMode {
  if (isExpired) return "expired";
  return isDeskToday(valuationDate) ? "live" : "historical";
}

function observationDateLabel(valuationDate?: string): string {
  const parsed = parseExcelishDate(valuationDate);
  return parsed ? formatDisplayDate(parsed) : "Selected Observation";
}

export function valuationMetricLabels(
  isExpired: boolean,
  valuationDate?: string,
  product?: ProductRecord,
): ValuationMetricLabels {
  const mode = resolveValuationLabelMode(isExpired, valuationDate);
  const obsLabel = observationDateLabel(valuationDate);
  const daysLeft = phaseDaysLeftLabel(product);
  const startNoun = phaseStartNoun(product);
  const endNoun = phaseEndNoun(product);

  if (mode === "expired") {
    return {
      value: `Mark Level as of ${obsLabel}`,
      coupon: `Path Performance as of ${obsLabel}`,
      couponFormed: `Coupon Path as of ${obsLabel}`,
      productIrr: `Path Annualisation to ${endNoun}`,
      underlyingIrr: `Underlying Path to ${obsLabel}`,
      underlyingLevel: `Underlying Level as of ${obsLabel}`,
      daysElapsed: `Days ${startNoun} → ${obsLabel}`,
      daysToRollover: `Days to ${obsLabel}`,
      lifecycleSection: `Performance & Lifecycle as of ${obsLabel}`,
      performanceNote: `As of ${obsLabel} from ${startNoun}.`,
    };
  }

  if (mode === "historical") {
    return {
      value: "Mark Level on Valuation Date",
      coupon: "Path Performance on Valuation Date",
      couponFormed: "Coupon Path on Valuation Date",
      productIrr: `Path Annualisation to ${endNoun}`,
      underlyingIrr: `Underlying Path since ${startNoun}`,
      underlyingLevel: "Underlying Level on Valuation Date",
      daysElapsed: `Days Elapsed since ${startNoun}`,
      daysToRollover: daysLeft,
      lifecycleSection: "Performance & Lifecycle on Valuation Date",
      performanceNote: `On the selected valuation date from ${startNoun}.`,
    };
  }

  return {
    value: "Mark Level",
    coupon: "Path Performance",
    couponFormed: "Coupon Path",
    productIrr: `Path Annualisation to ${endNoun}`,
    underlyingIrr: `Underlying Path since ${startNoun}`,
    underlyingLevel: "Live Underlying Level",
    daysElapsed: `Days Elapsed since ${startNoun}`,
    daysToRollover: daysLeft,
    lifecycleSection: "Live Performance & Lifecycle",
    performanceNote: `As of today from ${startNoun}.`,
  };
}
