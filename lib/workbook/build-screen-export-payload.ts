import { isValuationApplicableAt } from "@/lib/product-lifecycle";
import { buildValuationExpirationMaturityRows } from "@/lib/valuation-output-fields";
import {
  getProductAllotmentDate,
  getProductMaturityDate,
  getProductTradeOpeningDate,
  computeUnderlyingIrrSincePhaseStart,
  getElapsedDaysSinceWorkingAllotment,
  getDaysLeftToMaturity,
} from "@/lib/product-dates";
import { formatOptionalNumber } from "@/lib/product-data-guards";
import {
  computeObservationScheduleMetrics,
  formatEffectiveTargetCell,
} from "@/lib/portfolio-observation-metrics";
import { buildProductSpecCards } from "@/lib/product-specifications";
import type { ProductRecord } from "@/lib/types";
import {
  getDebenturePrice,
  getIndexEntryLevel,
  getIndexEntryLevelRaw,
  getProductIndexFieldLabel,
  getTargetLevel,
  rawField,
} from "@/lib/product-utils";
import { valuationMetricLabels } from "@/lib/valuation-labels";
import type { ValuationResult } from "@/lib/workbook/valuation-engine";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";
import { buildObservationLevelsSnapshot } from "@/lib/workbook/observation-levels-snapshot";
import {
  formatCrores,
  formatCurrency,
  formatFormulaReturn,
  formatNumber,
  formatPercent,
  formatProductUnitValue,
} from "@/lib/utils";

export type DeskExportIndexLevels = {
  niftyLevel: number | null;
  sensexLevel: number | null;
};

export type DeskExportInputs = {
  valuationDate: string;
  niftyLevel: string;
  sensexLevel: string;
  debentures: string;
};

/** Desk input levels shown in exports — mirrors expired/historical index resolution on screen. */
export function buildDeskExportInputs(
  isExpired: boolean,
  selection: DeskExportInputs,
  expired: DeskExportIndexLevels,
): DeskExportInputs {
  if (!isExpired) return selection;
  return {
    valuationDate: selection.valuationDate,
    niftyLevel: expired.niftyLevel != null ? String(expired.niftyLevel) : selection.niftyLevel,
    sensexLevel: expired.sensexLevel != null ? String(expired.sensexLevel) : selection.sensexLevel,
    debentures: selection.debentures,
  };
}

export type ValuationOutputSheetContext = {
  product: ProductRecord;
  valuation: ValuationResult | null;
  effectiveDate: string;
  isExpired: boolean;
  tradeDisplay: string;
  allotmentDisplay: string;
  maturityDisplay: string;
  productTenorDays: number | undefined;
  rolloverTenorDays: number | undefined;
};

/** Output Sheet rows — identical field order and labels to the Valuation screen. */
export function buildValuationOutputSheetRows(ctx: ValuationOutputSheetContext): Array<[string, string]> {
  const {
    product,
    valuation,
    effectiveDate,
    isExpired,
    tradeDisplay,
    allotmentDisplay,
    maturityDisplay,
    productTenorDays,
    rolloverTenorDays,
  } = ctx;
  const labels = valuationMetricLabels(isExpired, effectiveDate, product);
  const indexLabel = getProductIndexFieldLabel(product);

  const rows: Array<[string, string]> = [
    ["Product Name", product.name],
    ["Category", product.category],
    ["ISIN", product.isin ?? "—"],
    ["Issuer", product.issuer ?? "—"],
    ["Underlying", product.underlying ?? "—"],
    [
      "Entry / Initial Fixing",
      formatOptionalNumber(getIndexEntryLevelRaw(product) ?? valuation?.indexEntryLevel, formatNumber) ?? "—",
    ],
    [`Val. Date ${indexLabel} Level`, formatOptionalNumber(valuation?.currentLevel, formatNumber) ?? "—"],
    ["Target Level", String(getTargetLevel(product) ?? rawField(product, "Target Level", "Target Nifty ") ?? "—")],
    ["Price / Debenture", formatProductUnitValue(getDebenturePrice(product))],
    ["Trade Date", tradeDisplay],
    ["Allotment Date", allotmentDisplay],
    ...buildValuationExpirationMaturityRows(product, maturityDisplay),
  ];

  if (rolloverTenorDays != null) {
    rows.push(["Rollover Tenor · Days", formatNumber(rolloverTenorDays, 0)]);
  }
  rows.push(
    ["Product Tenor · Days", productTenorDays != null ? formatNumber(productTenorDays, 0) : "—"],
    [labels.daysElapsed, valuation ? formatNumber(valuation.elapsedDays, 0) : "—"],
    ["Underlying Performance", formatPercent(valuation?.z ?? 0, 1)],
    [labels.couponFormed, formatFormulaReturn(valuation?.formulaReturn ?? 0)],
    [labels.productIrr, formatPercent(valuation?.productIrr ?? 0, 2)],
    [labels.value, formatProductUnitValue(valuation?.productValue ?? 0)],
    ["Total Amount", formatCurrency(valuation?.totalAmount ?? 0, false)],
    ["Notional", product.tradeAmount ? formatCrores(product.tradeAmount) : "—"],
  );

  return rows;
}

export type ScreenSpecPage = "valuation" | "payoff" | "product-details";

/** Product specification rows aligned with each desk page's NEW PRIMARY spec rail. */
export function buildScreenSpecExportRows(
  _page: ScreenSpecPage,
  product: ProductRecord,
  _options?: {
    underlyingLevel?: number;
    underlyingLevelLabel?: string;
    asOf?: Date;
  },
): Array<[string, string]> {
  void _page;
  void _options;
  return buildProductSpecCards(product).map((card) => [card.label, card.value]);
}

export type LifecycleExportContext = {
  product: ProductRecord;
  valuation: ValuationResult | null;
  effectiveLevel: number;
  valuationDate: string;
  asOf: Date;
  isExpired: boolean;
};

/** Performance & lifecycle cards from the Product Details screen (ongoing products only). */
export function buildLifecycleExportRows(ctx: LifecycleExportContext): Array<[string, string]> {
  const { product, valuation, effectiveLevel, valuationDate, asOf, isExpired } = ctx;
  if (isExpired) return [];

  const labels = valuationMetricLabels(false, valuationDate, product);
  const entry = getIndexEntryLevel(product);
  const currentLevel = effectiveLevel > 0 ? effectiveLevel : entry;
  const asOfSelected = parseExcelishDate(valuationDate) ?? asOf;
  const canValue = isValuationApplicableAt(product, valuationDate);
  const daysLeftToMaturity = canValue ? getDaysLeftToMaturity(product, asOfSelected) : undefined;
  const daysSinceAllotment = canValue
    ? getElapsedDaysSinceWorkingAllotment(product, asOfSelected)
    : undefined;
  const underlyingIrr = canValue
    ? computeUnderlyingIrrSincePhaseStart(entry, currentLevel, daysSinceAllotment)
    : undefined;
  const effectiveTarget = canValue
    ? formatEffectiveTargetCell(computeObservationScheduleMetrics(product, asOfSelected).effectiveTarget)
    : "—";

  return [
    [labels.daysToRollover, daysLeftToMaturity != null ? formatNumber(daysLeftToMaturity, 0) : "—"],
    [labels.daysElapsed, daysSinceAllotment != null ? formatNumber(daysSinceAllotment, 0) : "—"],
    [labels.productIrr, valuation && canValue ? formatPercent(valuation.productIrr, 2) : "—"],
    [labels.underlyingIrr, underlyingIrr != null ? formatPercent(underlyingIrr, 2) : "—"],
    [labels.couponFormed, valuation && canValue ? formatFormulaReturn(valuation.formulaReturn) : "—"],
    [labels.coupon, valuation && canValue ? formatPercent(valuation.absReturn, 1) : "—"],
    ["Effective Target", effectiveTarget],
  ];
}

export type ObservationExportRow = [string, string, string, string];

/** Observation dates table — matches ObservationDatesTable columns. */
export function buildObservationExportTable(
  product: ProductRecord,
  asOf: Date,
): ObservationExportRow[] {
  const levels = buildObservationLevelsSnapshot(product, asOf);
  return levels.map((row, index) => [
    String(index + 1),
    formatDisplayDate(row.date),
    row.isFuture ? "Yet to come" : row.level != null ? formatNumber(row.level) : "—",
    row.performance != null ? formatPercent(row.performance, 1) : "—",
  ]);
}

export function buildPayoffExportFootnotes(
  isExpired: boolean,
  valuation: ValuationResult | null,
  labels: ReturnType<typeof valuationMetricLabels>,
  payoffBandNote?: string,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (isExpired && valuation) {
    rows.push([
      `${labels.coupon} · ${labels.couponFormed}`,
      `${formatPercent(valuation.absReturn, 1)} · ${formatFormulaReturn(valuation.formulaReturn)}`,
    ]);
  }
  if (payoffBandNote) {
    rows.push(["Desk note", payoffBandNote]);
  }
  return rows;
}

/** Date display helpers shared by valuation export builders. */
export function buildValuationDateDisplays(product: ProductRecord) {
  const allotment = getProductAllotmentDate(product);
  const tradeDate = getProductTradeOpeningDate(product);
  const maturityDate = getProductMaturityDate(product);
  return {
    tradeDisplay: tradeDate
      ? formatDisplayDate(tradeDate)
      : (rawField(product, "Trade Date/Opening date", "Trade Date") ?? "—"),
    allotmentDisplay: allotment
      ? formatDisplayDate(allotment)
      : (rawField(product, "Allotment Date") ?? "—"),
    maturityDisplay: maturityDate ? formatDisplayDate(maturityDate) : (product.maturityRaw ?? "—"),
  };
}
