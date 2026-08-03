import { formatMasterColumnLabel } from "@/lib/master-column-labels";

/** Primary master sheet column order — one Trade Date + Coupon / PR / DM (38 named columns). */
export const PRIMARY_MASTER_SHEET_COLUMNS = [
  "Month",
  "Trade Date/Opening date",
  "Name on Signup Form",
  "Rollover Phase",
  "Underlying",
  "Series",
  "Issuer",
  "ISIN No.",
  "Actual Entry Level",
  "Target Nifty",
  "Average 1",
  "Avg. 2",
  "Avg. 3",
  "Avg. 4",
  "Avg. 5",
  "Avg. 6",
  "Avg. 7",
  "Observation Months",
  "Last Observation Date",
  "Trade Amount",
  "Maturity",
  "Product Type",
  "Principal Protection",
  "Listing",
  "Formulae",
  "Product Explanation",
  "Allotment Date",
  "POED",
  "Coupon / PR / DM",
  "Coupon (%)",
  "Tenor",
  "Rollover C/P Date",
  "price per debenture",
  "Classification based on tenor",
  "Arranger Fees (%)",
  "Upfront fees (%)",
  "Arranger Fees (Rs.)",
  "Upfront fees (Rs.)",
] as const;

/** Rollover sheet columns — Primary layout without Rollover C/P Date (37 columns). */
export const ROLLOVER_MASTER_SHEET_COLUMNS = [
  "Month",
  "Trade Date/Opening date",
  "Name on Signup Form",
  "Rollover Phase",
  "Underlying",
  "Series",
  "Issuer",
  "ISIN No.",
  "Actual Entry Level",
  "Target Nifty",
  "Average 1",
  "Avg. 2",
  "Avg. 3",
  "Avg. 4",
  "Avg. 5",
  "Avg. 6",
  "Avg. 7",
  "Observation Months",
  "Last Observation Date",
  "Trade Amount",
  "Maturity",
  "Product Type",
  "Principal Protection",
  "Listing",
  "Formulae",
  "Product Explanation",
  "Allotment Date",
  "POED",
  "Coupon / PR / DM",
  "Coupon (%)",
  "Tenor",
  "price per debenture",
  "Classification based on tenor",
  "Arranger Fees (%)",
  "Upfront fees (%)",
  "Arranger Fees (Rs.)",
  "Upfront fees (Rs.)",
] as const;

export type PrimaryMasterColumn = (typeof PRIMARY_MASTER_SHEET_COLUMNS)[number];

const NUMERIC_COLUMNS = new Set<string>([
  "Actual Entry Level",
  "Target Nifty",
  "Trade Amount",
  "Coupon (%)",
  "Tenor",
  "price per debenture",
  "Arranger Fees (%)",
  "Upfront fees (%)",
  "Arranger Fees (Rs.)",
  "Upfront fees (Rs.)",
]);

/** Flat row from a parsed product — fallback when workbook sheets are unavailable. */
export function productToMasterSheetRow(product: {
  raw: Record<string, string | number | boolean | null>;
  name: string;
}) {
  const row: Record<string, unknown> = {};
  for (const key of PRIMARY_MASTER_SHEET_COLUMNS) {
    row[key] = product.raw[key] ?? null;
  }
  if (!row["Name on Signup Form"]) {
    row["Name on Signup Form"] = product.name;
  }
  return row;
}

/** Legacy helper — prefer `columnsFromWorkbookSheet` for Intel explorer. */
export function getPrimaryMasterSheetColumns() {
  return PRIMARY_MASTER_SHEET_COLUMNS.map((key) => ({
    key,
    label: formatMasterColumnLabel(key),
    numeric: NUMERIC_COLUMNS.has(key),
    sourceHeader: key,
  }));
}
