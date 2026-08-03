import { getProductDisplayName } from "@/lib/product-display-name";
import {
  formatProductRolloverPhaseLabel,
  formatProductRolloverScheduleDate,
  getProductAllotmentDate,
  getProductMaturityDate,
  getProductTradeOpeningDate,
} from "@/lib/product-dates";
import type { ProductRecord } from "@/lib/types";
import {
  getCouponLabel,
  getIndexEntryLevel,
  getIndexEntryLevelRaw,
  getTargetLevel,
  rawField,
} from "@/lib/product-utils";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";
import { formatCurrency, formatNumber } from "@/lib/utils";

export type ProductSpecCard = {
  label: string;
  value: string;
  mono?: boolean;
};

export type ProductSpecOptions = {
  /** @deprecated Live underlying is not part of the fixed NEW PRIMARY spec rail. */
  includeTradeDate?: boolean;
  /** @deprecated Kept for call-site compatibility — ignored. */
  underlyingLevel?: number;
  /** @deprecated Kept for call-site compatibility — ignored. */
  underlyingLevelLabel?: string;
  /** @deprecated Specs always show Trade Amount in rupees. */
  notionalFormat?: "crores" | "currency";
  /** @deprecated Observation dates have a dedicated panel. */
  includeObservationDates?: boolean;
  asOf?: Date;
};

/** Canonical ordered labels — probability desk Specs rail (no price / fee economics). */
export const PRODUCT_SPECIFICATION_LABELS = [
  "Issue Month",
  "Trade Date",
  "Product Name",
  "Rollover Phase",
  "Underlying Index",
  "Product Series",
  "Issuer Name",
  "ISIN Number",
  "Initial Entry Level",
  "Target Level",
  "Last Observation Date",
  "Trade Amount in Rupees",
  "Maturity Date",
  "Structure Type",
  "Capital Protection",
  "Listed or Unlisted",
  "Allotment Date",
  "POED",
  "Coupon Percentage",
  "Tenor Days",
  "Rollover Date",
  "Tenor Classification",
] as const;

function dash(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const text = String(value).trim();
  if (!text || text === "-" || text === "–" || text === "—") return "—";
  return text;
}

function dateFromParsedOrRaw(
  product: ProductRecord,
  parsed: Date | undefined,
  ...keys: string[]
): string {
  if (parsed) return formatDisplayDate(parsed);
  const raw = rawField(product, ...keys);
  if (!raw?.trim()) return "—";
  const fromRaw = parseExcelishDate(raw);
  return fromRaw ? formatDisplayDate(fromRaw) : dash(raw);
}

function masterTenorDays(product: ProductRecord): number | undefined {
  if (product.tenorDays != null && product.tenorDays > 0) return product.tenorDays;
  const raw = rawField(product, "Tenor", "Product tenor");
  if (raw == null || raw === "") return undefined;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Fixed Product Specifications rail — NEW PRIMARY sheet fields in desk-export order.
 * Missing cells always show "—".
 */
export function buildProductSpecCards(
  product: ProductRecord,
  _options: ProductSpecOptions = {},
): ProductSpecCard[] {
  void _options;

  const tradeDate = getProductTradeOpeningDate(product);
  const allotment = getProductAllotmentDate(product);
  const maturity = getProductMaturityDate(product);
  const entry = getIndexEntryLevelRaw(product) ?? getIndexEntryLevel(product);
  const target = getTargetLevel(product);
  const coupon = getCouponLabel(product);
  const tenorFromMaster = masterTenorDays(product);

  const lastObsRaw =
    product.lastObservationDateRaw?.trim() ||
    rawField(product, "Last Observation Date", "Final Observation Date") ||
    "";
  const lastObsParsed = lastObsRaw ? parseExcelishDate(lastObsRaw) : undefined;

  return [
    { label: "Issue Month", value: dash(product.month ?? rawField(product, "Month")) },
    {
      label: "Trade Date",
      value: dateFromParsedOrRaw(product, tradeDate, "Trade Date/Opening date", "Trade Date"),
    },
    { label: "Product Name", value: dash(getProductDisplayName(product) || product.name) },
    { label: "Rollover Phase", value: dash(formatProductRolloverPhaseLabel(product)) },
    {
      label: "Underlying Index",
      value: dash(product.underlying ?? rawField(product, "Underlying")),
    },
    {
      label: "Product Series",
      value: dash(product.series ?? rawField(product, "Series", "Product Code")),
    },
    {
      label: "Issuer Name",
      value: dash(product.issuer ?? rawField(product, "Issuer", "Issuer Name")),
    },
    { label: "ISIN Number", value: dash(product.isin), mono: true },
    {
      label: "Initial Entry Level",
      value: entry != null && entry > 0 ? formatNumber(entry) : "—",
    },
    {
      label: "Target Level",
      value:
        target != null && Number.isFinite(target)
          ? formatNumber(target)
          : dash(rawField(product, "Target Level", "Target Nifty", "Target Nifty ")),
    },
    {
      label: "Last Observation Date",
      value: lastObsParsed ? formatDisplayDate(lastObsParsed) : dash(lastObsRaw),
    },
    {
      label: "Trade Amount in Rupees",
      value: product.tradeAmount != null && product.tradeAmount > 0 ? formatCurrency(product.tradeAmount) : "—",
    },
    {
      label: "Maturity Date",
      value: maturity
        ? formatDisplayDate(maturity)
        : dash(product.maturityRaw ?? rawField(product, "Maturity", "Maturity Date")),
    },
    {
      label: "Structure Type",
      value: dash(product.productType ?? rawField(product, "Product Type", "Structure Type")),
    },
    {
      label: "Capital Protection",
      value: dash(
        product.principalProtection ??
          rawField(product, "Principal Protection", "PP/Non PP", "Capital Protection"),
      ),
    },
    {
      label: "Listed or Unlisted",
      value: dash(product.listing ?? rawField(product, "Listing", "Listed/Unlisted")),
    },
    {
      label: "Allotment Date",
      value: dateFromParsedOrRaw(product, allotment, "Allotment Date"),
    },
    { label: "POED", value: dash(rawField(product, "POED")) },
    {
      label: "Coupon Percentage",
      value: dash(coupon),
    },
    {
      label: "Tenor Days",
      value: tenorFromMaster != null ? formatNumber(tenorFromMaster, 0) : "—",
    },
    {
      label: "Rollover Date",
      value: dash(formatProductRolloverScheduleDate(product)),
    },
    {
      label: "Tenor Classification",
      value: dash(
        product.tenorBucket ?? rawField(product, "Classification based on tenor", "Tenor Classification"),
      ),
    },
  ];
}

export function buildProductSpecRows(
  product: ProductRecord,
  options?: ProductSpecOptions,
): Array<[string, string]> {
  return buildProductSpecCards(product, options).map((card) => [card.label, card.value]);
}
