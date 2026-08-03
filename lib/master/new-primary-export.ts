import { formatMasterColumnLabel } from "@/lib/master-column-labels";
import { filterMasterExportGridRows } from "@/lib/master-book-filter";
import type { MasterGridRow } from "@/lib/master/new-primary-merge";
import {
  countRowsByPhase,
  mapRowToPrimaryLayout,
  rolloverPhaseBucket,
  sortSheetRowsByMonth,
} from "@/lib/master/new-primary-merge";
import { rolloverPhaseBracketSuffix, applyRolloverPhaseNameSuffixToName } from "@/lib/product-display-name";
import { formatMasterCellBySourceHeader } from "@/lib/workbook/dates";

export const MASTER_SHEET_REFERENCE_NOTE =
  "Reference: All monetary amounts are in Indian Rupees (₹). Issue Month is MMM / YY (e.g. Nov / 14). All other dates are DD-MMM-YY (e.g. 31-Aug-15).";

export type NewPrimaryExportGrid = {
  sourceHeaders: string[];
  displayHeaders: string[];
  rows: MasterGridRow[];
};

/**
 * Keep named master columns from the reference book, including `Coupon / PR / DM`.
 * Drop blank trailing headers and duplicate source headers (extra Trade Date / Month).
 */
export function filterNamedColumns(headers: string[], rows: MasterGridRow[]): NewPrimaryExportGrid {
  const indices: number[] = [];
  const seenHeaders = new Set<string>();

  for (let index = 0; index < headers.length; index += 1) {
    const name = String(headers[index] ?? "").trim();
    if (!name) continue;
    if (seenHeaders.has(name)) continue;
    seenHeaders.add(name);
    indices.push(index);
  }

  const sourceHeaders = indices.map((index) => String(headers[index]!).trim());
  const displayHeaders = displayHeadersForSource(sourceHeaders);
  const trimmedRows = rows.map((row) =>
    normalizeExportRow(sourceHeaders, indices.map((index) => row[index] ?? null)),
  );

  return { sourceHeaders, displayHeaders, rows: trimmedRows };
}

function normalizeExportRow(sourceHeaders: string[], row: MasterGridRow): MasterGridRow {
  return sourceHeaders.map((header, index) => {
    const value = row[index] ?? null;
    const formatted = formatMasterCellBySourceHeader(header, value as string | number | Date | null);
    return formatted ?? value;
  });
}

const ROLLOVER_CP_SOURCE_HEADER = "Rollover C/P Date";

/**
 * Rollover C/P Date is Primary / NEW PRIMARY only.
 * Values apply solely to `10years` rows — blank / Phase I / Phase II stay empty.
 */
function withRolloverCpDatePolicy(grid: NewPrimaryExportGrid): NewPrimaryExportGrid {
  const cpIdx = grid.sourceHeaders.indexOf(ROLLOVER_CP_SOURCE_HEADER);
  if (cpIdx < 0) return grid;

  return {
    ...grid,
    rows: grid.rows.map((row) => {
      const copy = [...row];
      if (rolloverPhaseBucket(copy, grid.sourceHeaders) !== "tenyears") {
        copy[cpIdx] = null;
      }
      return copy;
    }),
  };
}

/** Drop Rollover C/P Date — backup Rollover sheet never carries this column. */
function withoutRolloverCpDateColumn(grid: NewPrimaryExportGrid): NewPrimaryExportGrid {
  const indices = grid.sourceHeaders
    .map((header, index) => (header === ROLLOVER_CP_SOURCE_HEADER ? -1 : index))
    .filter((index) => index >= 0);

  if (indices.length === grid.sourceHeaders.length) return grid;

  return {
    sourceHeaders: indices.map((index) => grid.sourceHeaders[index]!),
    displayHeaders: indices.map((index) => grid.displayHeaders[index]!),
    rows: grid.rows.map((row) => indices.map((index) => row[index] ?? null)),
  };
}

/** Drop annotation / footer / orphan-ISIN rows after named-column trim. */
function withExportableRows(grid: NewPrimaryExportGrid): NewPrimaryExportGrid {
  const filtered = filterMasterExportGridRows(grid.sourceHeaders, grid.rows);
  return { ...grid, rows: filtered.rows };
}

/** Apply `(ROLLOVER PHASE 1/2)` on product names for Primary, Rollover, and NEW PRIMARY. */
function withRolloverPhaseNameSuffixes(grid: NewPrimaryExportGrid): NewPrimaryExportGrid {
  return {
    ...grid,
    rows: grid.rows.map((row) => applyRolloverPhaseNameSuffix(row, grid.sourceHeaders)),
  };
}

export function displayHeadersForSource(sourceHeaders: string[]): string[] {
  const occurrence = new Map<string, number>();
  return sourceHeaders.map((header) => {
    const index = occurrence.get(header) ?? 0;
    occurrence.set(header, index + 1);
    return formatMasterColumnLabel(header, index);
  });
}

const DISPLAY_TO_SOURCE: Record<string, string> = {
  "Issue Month": "Month",
  "Issue Month (2)": "Month",
  "Trade Date": "Trade Date/Opening date",
  "Trade Date (2)": "Trade Date/Opening date",
  "Rollover Phase": "Rollover Phase",
  "Rollover Date": "Rollover C/P Date",
  "Product Name": "Name on Signup Form",
  "Product Series": "Series",
  "ISIN Number": "ISIN No.",
  "Issuer Name": "Issuer",
  "Underlying Index": "Underlying",
  "Allotment Date": "Allotment Date",
  "Initial Entry Level": "Actual Entry Level",
  "Target Level": "Target Nifty",
  "Observation Months": "Observation Months",
  "Observation Average 1": "Average 1",
  "Observation Average 2": "Avg. 2",
  "Observation Average 3": "Avg. 3",
  "Observation Average 4": "Avg. 4",
  "Observation Average 5": "Avg. 5",
  "Observation Average 6": "Avg. 6",
  "Observation Average 7": "Avg. 7",
  "Last Observation Date": "Last Observation Date",
  "Maturity Date": "Maturity",
  "Tenor Days": "Tenor",
  "Trade Amount": "Trade Amount",
  "Trade Amount (Rupees)": "Trade Amount",
  "Price per Debenture": "price per debenture",
  "Price per Debenture (Rupees)": "price per debenture",
  "Coupon Percentage": "Coupon (%)",
  "Coupon / PR / DM": "Coupon / PR / DM",
  "Payoff Formula": "Formulae",
  "Product Description": "Product Explanation",
  "Capital Protection": "Principal Protection",
  "Listed or Unlisted": "Listing",
  "Structure Type": "Product Type",
  "Tenor Classification": "Classification based on tenor",
  "Arranger Fees Percentage": "Arranger Fees (%)",
  "Arranger Fees Amount": "Arranger Fees (Rs.)",
  "Upfront Fees Percentage": "Upfront fees (%)",
  "Upfront Fees Amount": "Upfront fees (Rs.)",
  POED: "POED",
};

/** Map Excel display headers back to canonical master keys for NEW PRIMARY parsing. */
export function resolveSourceHeadersFromDisplay(displayHeaders: string[]): string[] {
  return displayHeaders.map((label) => DISPLAY_TO_SOURCE[label.trim()] ?? label.trim());
}

export function rolloverPhaseNameSuffix(row: MasterGridRow, sourceHeaders: string[]): string | null {
  const bucket = rolloverPhaseBucket(row, sourceHeaders);
  if (bucket === "phase1") return rolloverPhaseBracketSuffix("Phase I");
  if (bucket === "phase2") return rolloverPhaseBracketSuffix("Phase II");
  return null;
}

export function applyRolloverPhaseNameSuffix(row: MasterGridRow, sourceHeaders: string[]): MasterGridRow {
  const nameIdx = sourceHeaders.indexOf("Name on Signup Form");
  if (nameIdx < 0) return row;
  const bucket = rolloverPhaseBucket(row, sourceHeaders);
  const phase = bucket === "phase1" ? "Phase I" : bucket === "phase2" ? "Phase II" : undefined;
  if (!phase) return row;
  const copy = [...row];
  copy[nameIdx] = applyRolloverPhaseNameSuffixToName(String(copy[nameIdx] ?? "").trim(), phase);
  return copy;
}

/** Named columns + display headers + phase brackets for Primary sheet. */
export function prepareMasterSheetExportGrid(fullHeaders: string[], rows: MasterGridRow[]): NewPrimaryExportGrid {
  const named = withExportableRows(filterNamedColumns(fullHeaders, rows));
  return withRolloverPhaseNameSuffixes(withRolloverCpDatePolicy(named));
}

/** Map Rollover onto Primary layout, drop C/P Date column, filter junk, apply phase brackets. */
export function prepareRolloverExportGrid(
  rolloverHeaders: string[],
  rolloverRows: MasterGridRow[],
  primaryHeaders: string[],
): NewPrimaryExportGrid {
  const mapped = rolloverRows.map((row) =>
    mapRowToPrimaryLayout(rolloverHeaders, row, primaryHeaders),
  );
  const named = withExportableRows(filterNamedColumns(primaryHeaders, mapped));
  return withRolloverPhaseNameSuffixes(withoutRolloverCpDateColumn(named));
}

/** Named columns, display headers, Phase I/II name suffixes — rows sorted by Month ascending. */
export function prepareNewPrimaryExportGrid(fullHeaders: string[], rows: MasterGridRow[]): NewPrimaryExportGrid {
  const named = withExportableRows(filterNamedColumns(fullHeaders, rows));
  const policy = withRolloverCpDatePolicy(named);
  const suffixed = withRolloverPhaseNameSuffixes(policy);
  const sortedRows = sortSheetRowsByMonth(suffixed.sourceHeaders, suffixed.rows);
  return {
    ...suffixed,
    rows: sortedRows,
  };
}

export function isDisplayMasterHeaders(headers: string[]): boolean {
  const trimmed = headers.map((header) => String(header ?? "").trim());
  return (
    trimmed.includes("Product Name") ||
    trimmed.includes("Issue Month") ||
    trimmed.includes("ISIN Number") ||
    trimmed.includes("Payoff Formula")
  );
}

/** Normalize Excel display headers back to canonical master keys for parsing. */
export function sourceHeadersFromSheetHeaders(headers: string[]): string[] {
  if (!isDisplayMasterHeaders(headers)) return headers.map((header) => String(header ?? "").trim());
  return resolveSourceHeadersFromDisplay(headers);
}

export type PhaseParityReport = {
  rolloverPhase1: number;
  newPrimaryPhase1: number;
  primaryTenYears: number;
  newPrimaryTenYears: number;
  primaryBlank: number;
  newPrimaryBlank: number;
  violations: string[];
};

/** Rollover Phase I + Primary Phase I, Primary 10-year, and Primary blank must match NEW PRIMARY. */
export function verifyPhaseParity(
  primaryHeaders: string[],
  primaryRows: MasterGridRow[],
  rolloverHeaders: string[],
  rolloverRows: MasterGridRow[],
  newPrimaryHeaders: string[],
  newPrimaryRows: MasterGridRow[],
): PhaseParityReport {
  const primaryPhases = countRowsByPhase(primaryRows, primaryHeaders);
  const rolloverPhases = countRowsByPhase(rolloverRows, rolloverHeaders);
  const newPrimaryPhases = countRowsByPhase(newPrimaryRows, newPrimaryHeaders);

  const expectedPhase1 = rolloverPhases.phase1 + primaryPhases.phase1;
  const violations: string[] = [];
  if (expectedPhase1 !== newPrimaryPhases.phase1) {
    violations.push(
      `Phase I: Primary ${primaryPhases.phase1} + Rollover ${rolloverPhases.phase1} = ${expectedPhase1} ≠ NEW PRIMARY ${newPrimaryPhases.phase1}`,
    );
  }
  if (primaryPhases.tenyears !== newPrimaryPhases.tenyears) {
    violations.push(
      `10years: Primary sheet ${primaryPhases.tenyears} ≠ NEW PRIMARY ${newPrimaryPhases.tenyears}`,
    );
  }
  if (primaryPhases.blank !== newPrimaryPhases.blank) {
    violations.push(
      `Blank: Primary sheet ${primaryPhases.blank} ≠ NEW PRIMARY ${newPrimaryPhases.blank}`,
    );
  }

  return {
    rolloverPhase1: rolloverPhases.phase1,
    newPrimaryPhase1: newPrimaryPhases.phase1,
    primaryTenYears: primaryPhases.tenyears,
    newPrimaryTenYears: newPrimaryPhases.tenyears,
    primaryBlank: primaryPhases.blank,
    newPrimaryBlank: newPrimaryPhases.blank,
    violations,
  };
}

export type RolloverPhase2CoverageReport = {
  rolloverPhase2Count: number;
  primaryPhase2Count: number;
  missingFromPrimary: string[];
};

/** Every Rollover Phase II ISIN must exist as Primary Phase II. */
export function verifyRolloverPhase2InPrimary(
  primaryHeaders: string[],
  primaryRows: MasterGridRow[],
  rolloverHeaders: string[],
  rolloverRows: MasterGridRow[],
): RolloverPhase2CoverageReport {
  const primaryIsinIdx = primaryHeaders.indexOf("ISIN No.");
  const rolloverIsinIdx = rolloverHeaders.indexOf("ISIN No.");

  const primaryPhase2Isins = new Set<string>();
  for (const row of primaryRows) {
    if (rolloverPhaseBucket(row, primaryHeaders) !== "phase2") continue;
    const isin = primaryIsinIdx >= 0 ? String(row[primaryIsinIdx] ?? "").trim().toUpperCase() : "";
    if (isin) primaryPhase2Isins.add(isin);
  }

  const rolloverPhase2Isins = new Set<string>();
  for (const row of rolloverRows) {
    if (rolloverPhaseBucket(row, rolloverHeaders) !== "phase2") continue;
    const isin = rolloverIsinIdx >= 0 ? String(row[rolloverIsinIdx] ?? "").trim().toUpperCase() : "";
    if (isin) rolloverPhase2Isins.add(isin);
  }

  const missingFromPrimary = [...rolloverPhase2Isins].filter((isin) => !primaryPhase2Isins.has(isin));

  return {
    rolloverPhase2Count: rolloverPhase2Isins.size,
    primaryPhase2Count: primaryPhase2Isins.size,
    missingFromPrimary,
  };
}

export type SameIsinPhaseStats = {
  phase1Rows: number;
  phase2Rows: number;
  isinsWithBothPhases: number;
  isinsWithMultiplePhaseRows: number;
  rowsOnSharedIsins: number;
};

/** Count Phase I/II rows and ISINs that repeat across phases (from merged grid). */
export function sameIsinPhaseStats(headers: string[], rows: MasterGridRow[]): SameIsinPhaseStats {
  const isinIdx = headers.indexOf("ISIN No.");
  const byIsin = new Map<string, MasterGridRow[]>();

  let phase1Rows = 0;
  let phase2Rows = 0;

  for (const row of rows) {
    const bucket = rolloverPhaseBucket(row, headers);
    if (bucket === "phase1") phase1Rows += 1;
    if (bucket === "phase2") phase2Rows += 1;

    const isin = isinIdx >= 0 ? String(row[isinIdx] ?? "").trim().toUpperCase() : "";
    if (!isin) continue;
    const list = byIsin.get(isin) ?? [];
    list.push(row);
    byIsin.set(isin, list);
  }

  let isinsWithBothPhases = 0;
  let isinsWithMultiplePhaseRows = 0;
  let rowsOnSharedIsins = 0;

  for (const group of byIsin.values()) {
    const buckets = new Set(group.map((row) => rolloverPhaseBucket(row, headers)));
    if (group.length > 1) {
      isinsWithMultiplePhaseRows += 1;
      rowsOnSharedIsins += group.length;
    }
    if (buckets.has("phase1") && buckets.has("phase2")) {
      isinsWithBothPhases += 1;
    }
  }

  return {
    phase1Rows,
    phase2Rows,
    isinsWithBothPhases,
    isinsWithMultiplePhaseRows,
    rowsOnSharedIsins,
  };
}
