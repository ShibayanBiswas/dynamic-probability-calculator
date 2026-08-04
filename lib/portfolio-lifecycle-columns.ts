import {
  observationDateCells,
} from "@/lib/portfolio-observation-columns";
import {
  computeObservationScheduleMetrics,
  formatEffectiveTargetCell,
  observationLevelCells,
  PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL,
  PORTFOLIO_OBS_COUNT_COLUMN_LABELS,
  PORTFOLIO_OBS_LEVEL_COLUMN_LABELS,
  PORTFOLIO_PASSED_OBS_COLUMN_LABEL,
  PORTFOLIO_REMAINING_OBS_COLUMN_LABEL,
  PORTFOLIO_TOTAL_OBS_COLUMN_LABEL,
} from "@/lib/portfolio-observation-metrics";
import {
  getIndexEntryLevelRaw,
  getTargetLevel,
  rawField,
} from "@/lib/product-utils";
import {
  lifecycleListBadgeLabel,
  LIFECYCLE_STATUS_LABELS,
  type LifecycleFilter,
  type LifecycleStatus,
  getProductLifecycleStatus,
  getDisplayDaysToExpiry,
} from "@/lib/product-lifecycle";
import {
  lifecyclePortfolioColumnLabels,
  type LifecyclePortfolioColumnLabels,
} from "@/lib/valuation-labels";
import type { ProductRecord } from "@/lib/types";
import type { PortfolioValuationSnapshot } from "@/lib/workbook/portfolio-snapshots";
import { formatCrores, formatNumber, formatProductUnitValue } from "@/lib/utils";
import {
  formatProductActualStartDate,
  formatProductAllotmentDate,
  formatProductMaturityDate,
  formatProductPoedDate,
  formatProductRolloverPhaseLabel,
  formatProductRolloverScheduleDate,
  formatProductTradeDate,
  getDisplayTenorDays,
} from "@/lib/product-dates";
import { getDaysToExpiry } from "@/lib/product-lifecycle";
import { getProbabilityPair } from "@/lib/probability/portfolio-prob-store";
import { resolveMarkDateFallback } from "@/lib/desk-mark-as-of";

/**
 * Lifecycle table columns for the probability desk.
 * Phase calendars + Initial/Current Prob as of the desk mark session.
 */
export type PortfolioLifecycleColumnDef =
  | { kind: "fixed"; header: string }
  | { kind: "dynamic"; field: keyof LifecyclePortfolioColumnLabels }
  | { kind: "observations" }
  | { kind: "observationLevels" }
  | { kind: "observationCounts" }
  | { kind: "effectiveTarget" };

export const PORTFOLIO_AVG_COLUMN_LABELS = [
  "Average 1",
  "Average 2",
  "Average 3",
  "Average 4",
  "Average 5",
  "Average 6",
  "Average 7",
] as const;

/** Desk mark column — previous trading day until NSE close, then today. */
export const PORTFOLIO_AS_OF_TODAY_COLUMN_LABEL = "As of Today's Date";

const BASE_PORTFOLIO_LIFECYCLE_COLUMN_DEFS: readonly PortfolioLifecycleColumnDef[] = [
  { kind: "fixed", header: "No." },
  { kind: "fixed", header: "Status" },
  { kind: "fixed", header: "Product Name" },
  { kind: "fixed", header: PORTFOLIO_AS_OF_TODAY_COLUMN_LABEL },
  { kind: "fixed", header: "Initial Prob" },
  { kind: "fixed", header: "Current Prob" },
  { kind: "fixed", header: "Series" },
  { kind: "fixed", header: "Underlying" },
  { kind: "fixed", header: "Initial Level" },
  { kind: "fixed", header: "Target Level" },
  { kind: "fixed", header: "Trade Date" },
  { kind: "fixed", header: "Allotment Date" },
  { kind: "fixed", header: "Actual Start" },
  { kind: "fixed", header: "POED" },
  { kind: "fixed", header: "Rollover Phase" },
  { kind: "fixed", header: "Maturity Date" },
  { kind: "fixed", header: "Rollover Date" },
  { kind: "fixed", header: "Tenor" },
  { kind: "observations" },
  { kind: "fixed", header: "Amount" },
  { kind: "fixed", header: "ISIN" },
  { kind: "dynamic", field: "daysColumn" },
  { kind: "fixed", header: "Tenor Left" },
  { kind: "fixed", header: "Years" },
];

const LIVE_OBS_METRIC_COLUMN_DEFS: readonly PortfolioLifecycleColumnDef[] = [
  { kind: "observationLevels" },
  { kind: "observationCounts" },
  { kind: "effectiveTarget" },
];

/** Probability desk: phase calendars + observation / Effective Target metrics. */
export function portfolioLifecycleColumnDefs(
  _filter: LifecycleFilter = "ongoing",
): readonly PortfolioLifecycleColumnDef[] {
  void _filter;
  return [...BASE_PORTFOLIO_LIFECYCLE_COLUMN_DEFS, ...LIVE_OBS_METRIC_COLUMN_DEFS];
}

/** @deprecated Prefer portfolioLifecycleColumnDefs(filter) — live header registry anchor. */
export const PORTFOLIO_LIFECYCLE_COLUMN_DEFS = portfolioLifecycleColumnDefs("ongoing");

function expandColumnDef(
  def: PortfolioLifecycleColumnDef,
  labels: LifecyclePortfolioColumnLabels,
): string[] {
  switch (def.kind) {
    case "fixed":
      return [def.header];
    case "dynamic":
      return [labels[def.field]];
    case "observations":
      return [...PORTFOLIO_AVG_COLUMN_LABELS];
    case "observationLevels":
      return [...PORTFOLIO_OBS_LEVEL_COLUMN_LABELS];
    case "observationCounts":
      return [...PORTFOLIO_OBS_COUNT_COLUMN_LABELS];
    case "effectiveTarget":
      return [PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL];
    default: {
      const _exhaustive: never = def;
      return _exhaustive;
    }
  }
}

export function portfolioLifecycleTableHeaders(
  labels: LifecyclePortfolioColumnLabels,
  filter: LifecycleFilter = "ongoing",
): string[] {
  return portfolioLifecycleColumnDefs(filter).flatMap((def) => expandColumnDef(def, labels));
}

/** Canonical live-tab headers — regression anchor for verify scripts. */
export const LIVE_PORTFOLIO_LIFECYCLE_HEADERS = portfolioLifecycleTableHeaders(
  lifecyclePortfolioColumnLabels("ongoing"),
  "ongoing",
);

export const EXPIRED_PORTFOLIO_LIFECYCLE_HEADERS = portfolioLifecycleTableHeaders(
  lifecyclePortfolioColumnLabels("expired"),
  "expired",
);

export const PORTFOLIO_LIFECYCLE_TABLE_COLUMN_COUNT = LIVE_PORTFOLIO_LIFECYCLE_HEADERS.length;
export const EXPIRED_PORTFOLIO_LIFECYCLE_TABLE_COLUMN_COUNT = EXPIRED_PORTFOLIO_LIFECYCLE_HEADERS.length;

export type PortfolioLifecycleRowContext = {
  index: number;
  product: ProductRecord;
  snapshot: PortfolioValuationSnapshot;
  labels: LifecyclePortfolioColumnLabels;
  asOf: Date;
  badgeFilter: LifecycleFilter;
  status?: LifecycleStatus;
  missingMetric?: string;
};

export function portfolioLifecycleCellValues({
  index,
  product,
  snapshot,
  labels,
  asOf,
  badgeFilter,
  missingMetric = "",
}: PortfolioLifecycleRowContext): Record<string, string | number> {
  void snapshot;
  void missingMetric;
  const status = getProductLifecycleStatus(product, asOf);
  const days = getDisplayDaysToExpiry(product, asOf);
  const initialLevel = getIndexEntryLevelRaw(product);
  const targetLevel = getTargetLevel(product);
  const tenorDays = getDisplayTenorDays(product, asOf);
  const probs = getProbabilityPair(product.isin ?? "");
  const markFallback = resolveMarkDateFallback(asOf);
  const asOfToday =
    probs?.asOfDate?.trim() ||
    markFallback.markDateLabel;

  const values: Record<string, string | number> = {
    "No.": index + 1,
    Status: lifecycleListBadgeLabel(status, badgeFilter),
    "Product Name": product.name,
    [PORTFOLIO_AS_OF_TODAY_COLUMN_LABEL]: asOfToday,
    "Initial Prob":
      probs?.initial != null && Number.isFinite(probs.initial)
        ? Number((probs.initial * 100).toFixed(2))
        : "—",
    "Current Prob":
      probs?.current != null && Number.isFinite(probs.current)
        ? Number((probs.current * 100).toFixed(2))
        : "—",
    Series: product.series ?? rawField(product, "Product Series", "Series") ?? "",
    Underlying: product.underlying ?? rawField(product, "Underlying", "Underlying Index") ?? "",
    "Initial Level": initialLevel ?? "",
    "Target Level": targetLevel ?? "",
    "Trade Date": formatProductTradeDate(product),
    "Allotment Date": formatProductAllotmentDate(product),
    "Actual Start": formatProductActualStartDate(product, asOf),
    POED: formatProductPoedDate(product),
    "Rollover Phase": formatProductRolloverPhaseLabel(product) ?? "",
    "Maturity Date": formatProductMaturityDate(product),
    "Rollover Date": formatProductRolloverScheduleDate(product) ?? "—",
    Tenor: tenorDays ?? "",
    Amount:
      product.tradeAmount != null ? Number((product.tradeAmount / 1e7).toFixed(4)) : "",
    ISIN: product.isin ?? "",
    [labels.daysColumn]: days ?? "",
    "Tenor Left":
      days != null && Number.isFinite(days) ? Number((days / 365).toFixed(2)) : "",
    Years:
      tenorDays != null && Number.isFinite(tenorDays)
        ? Number((tenorDays / 365).toFixed(2))
        : "",
    ...Object.fromEntries(
      PORTFOLIO_AVG_COLUMN_LABELS.map((label, obsIndex) => [
        label,
        observationDateCells(product)[obsIndex] ?? "—",
      ]),
    ),
  };

  const levels = observationLevelCells(product, asOf);
  for (let i = 0; i < PORTFOLIO_OBS_LEVEL_COLUMN_LABELS.length; i += 1) {
    values[PORTFOLIO_OBS_LEVEL_COLUMN_LABELS[i]!] = levels[i] ?? "—";
  }
  const metrics = computeObservationScheduleMetrics(product, asOf);
  values[PORTFOLIO_TOTAL_OBS_COLUMN_LABEL] = metrics.total;
  values[PORTFOLIO_PASSED_OBS_COLUMN_LABEL] = metrics.passed;
  values[PORTFOLIO_REMAINING_OBS_COLUMN_LABEL] = metrics.remaining;
  values[PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL] =
    metrics.effectiveTarget != null && Number.isFinite(metrics.effectiveTarget)
      ? Number(metrics.effectiveTarget.toFixed(4))
      : "";

  return values;
}

export function portfolioLifecycleExportRow(context: PortfolioLifecycleRowContext): Record<string, string | number> {
  const headers = portfolioLifecycleTableHeaders(context.labels, context.badgeFilter);
  const values = portfolioLifecycleCellValues(context);
  const row: Record<string, string | number> = {};
  for (const header of headers) {
    row[header] = values[header] ?? "";
  }
  return row;
}

/** Status label for exports that use canonical lifecycle status (full workbook summary). */
export function portfolioLifecycleStatusExportLabel(product: ProductRecord, asOf: Date): string {
  return LIFECYCLE_STATUS_LABELS[getProductLifecycleStatus(product, asOf)];
}

export function portfolioLifecycleColumnLabels(filter: LifecycleFilter): LifecyclePortfolioColumnLabels {
  return lifecyclePortfolioColumnLabels(filter);
}

const NUMERIC_RIGHT_HEADERS = new Set([
  "No.",
  "Initial Prob",
  "Current Prob",
  "Tenor",
  "Initial Level",
  "Target Level",
  "Amount",
  "Tenor Left",
  "Years",
  PORTFOLIO_TOTAL_OBS_COLUMN_LABEL,
  PORTFOLIO_PASSED_OBS_COLUMN_LABEL,
  PORTFOLIO_REMAINING_OBS_COLUMN_LABEL,
  PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL,
  ...PORTFOLIO_AVG_COLUMN_LABELS,
  ...PORTFOLIO_OBS_LEVEL_COLUMN_LABELS,
]);

export function portfolioLifecycleHeaderAlign(
  header: string,
  labels: LifecyclePortfolioColumnLabels,
): "left" | "right" {
  if (
    header === "No." ||
    header === "Status" ||
    header === "Product Name" ||
    header === "Series" ||
    header === "ISIN" ||
    header === PORTFOLIO_AS_OF_TODAY_COLUMN_LABEL ||
    header === "Trade Date" ||
    header === "Allotment Date" ||
    header === "Actual Start" ||
    header === "POED" ||
    header === "Rollover Phase" ||
    header === "Maturity Date" ||
    header === "Rollover Date" ||
    header === "Underlying"
  ) {
    return "left";
  }
  if (NUMERIC_RIGHT_HEADERS.has(header)) return "right";
  if (header === labels.daysColumn) return "right";
  return "left";
}

export type PortfolioLifecycleCellParts = {
  display: string;
  status?: LifecycleStatus;
  badgeLabel?: string;
  rawDays?: number;
};

export function portfolioLifecycleCellParts(
  header: string,
  context: PortfolioLifecycleRowContext,
): PortfolioLifecycleCellParts {
  const { product, asOf, badgeFilter, index, snapshot, labels } = context;
  const status = getProductLifecycleStatus(product, asOf);

  if (header === "#" || header === "No.") {
    return { display: String(index + 1) };
  }

  if (header === "Status") {
    return {
      display: lifecycleListBadgeLabel(status, badgeFilter),
      status,
      badgeLabel: lifecycleListBadgeLabel(status, badgeFilter),
    };
  }

  if (header === labels.daysColumn) {
    const rawDays = getDaysToExpiry(product, asOf);
    const display = formatPortfolioLifecycleDisplayCell(header, context);
    return { display, rawDays: rawDays ?? undefined };
  }

  if (header === labels.absReturn || header === labels.productIrr) {
    const row = portfolioLifecycleExportRow(context);
    const value = row[header];
    if (value === "" || value == null) return { display: "—" };
    return { display: String(value) };
  }

  if (header === labels.couponFormed || header === "Maturity Coupon") {
    const row = portfolioLifecycleExportRow(context);
    const value = row[header];
    if (value === "" || value == null) return { display: "—" };
    return { display: String(value) };
  }

  if (header === labels.value) {
    return {
      display: snapshot.value != null ? formatProductUnitValue(snapshot.value) : "—",
    };
  }

  if (header === labels.totalAmount) {
    return {
      display: snapshot.totalAmount != null ? formatCrores(snapshot.totalAmount) : "—",
    };
  }

  if (header === "Investment Amount in ₹ Cr") {
    return {
      display: product.tradeAmount != null ? formatCrores(product.tradeAmount) : "—",
    };
  }

  if (header === "Initial Level" || header === "Target Level" || header === PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL) {
    const row = portfolioLifecycleExportRow(context);
    const value = row[header];
    return {
      display: value !== "" && value != null ? formatNumber(Number(value)) : "—",
    };
  }

  if (
    header === PORTFOLIO_TOTAL_OBS_COLUMN_LABEL ||
    header === PORTFOLIO_PASSED_OBS_COLUMN_LABEL ||
    header === PORTFOLIO_REMAINING_OBS_COLUMN_LABEL
  ) {
    const row = portfolioLifecycleExportRow(context);
    const value = row[header];
    return {
      display: value !== "" && value != null ? formatNumber(Number(value), 0) : "—",
    };
  }

  if ((PORTFOLIO_OBS_LEVEL_COLUMN_LABELS as readonly string[]).includes(header)) {
    const row = portfolioLifecycleExportRow(context);
    const value = row[header];
    return { display: value !== "" && value != null ? String(value) : "—" };
  }

  if (header === PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL) {
    const row = portfolioLifecycleExportRow(context);
    const value = row[header];
    return {
      display:
        value !== "" && value != null && typeof value === "number"
          ? formatEffectiveTargetCell(value)
          : "—",
    };
  }

  if (header === "Tenor" || header === "Tenor Days") {
    const tenor = getDisplayTenorDays(product, asOf);
    return { display: tenor != null ? formatNumber(tenor, 0) : "—" };
  }

  return { display: formatPortfolioLifecycleDisplayCell(header, context) };
}

export function formatPortfolioLifecycleDisplayCell(
  header: string,
  context: PortfolioLifecycleRowContext,
): string {
  const row = portfolioLifecycleExportRow(context);
  return formatPortfolioLifecycleValue(header, row[header], context.labels);
}

/** Format a precomputed export cell — use once-per-row values to avoid 40× rebuilds. */
export function formatPortfolioLifecycleValue(
  header: string,
  value: string | number | null | undefined,
  labels: LifecyclePortfolioColumnLabels,
): string {
  if (value === "" || value == null || value === "—") return "—";
  if (header === "Amount" && typeof value === "number") {
    return formatCrores(value * 1e7);
  }
  if (header === labels.daysColumn && typeof value === "number") {
    return formatNumber(value, 0);
  }
  if ((header === "Initial Prob" || header === "Current Prob") && typeof value === "number") {
    return `${formatNumber(value, 2)}%`;
  }
  if ((header === "Initial Level" || header === "Target Level") && typeof value === "number") {
    return formatNumber(value);
  }
  if ((header === "Tenor" || header === "No.") && typeof value === "number") {
    return formatNumber(value, 0);
  }
  if ((header === "Tenor Left" || header === "Years") && typeof value === "number") {
    return formatNumber(value, 2);
  }
  if (header === PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL && typeof value === "number") {
    return formatEffectiveTargetCell(value);
  }
  if (
    (header === PORTFOLIO_TOTAL_OBS_COLUMN_LABEL ||
      header === PORTFOLIO_PASSED_OBS_COLUMN_LABEL ||
      header === PORTFOLIO_REMAINING_OBS_COLUMN_LABEL) &&
    typeof value === "number"
  ) {
    return formatNumber(value, 0);
  }
  if ((PORTFOLIO_OBS_LEVEL_COLUMN_LABELS as readonly string[]).includes(header)) {
    return value === "" || value == null ? "—" : String(value);
  }
  return String(value);
}
