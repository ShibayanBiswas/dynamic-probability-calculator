import { formatMasterColumnLabel } from "@/lib/master-column-labels";
import {
  formatMasterIssueMonth,
  formatMasterSheetDate,
  isMasterIssueMonthHeader,
  MASTER_SOURCE_CALENDAR_DATE_HEADERS,
} from "@/lib/workbook/dates";
import {
  PRIMARY_MASTER_SHEET_COLUMNS,
  ROLLOVER_MASTER_SHEET_COLUMNS,
} from "@/lib/master-sheet-columns";
import type { WorkbookSheetRecord } from "@/lib/types";

export type MasterSheetTab = "Primary" | "Rollover" | "NEW PRIMARY";

export type MasterSheetColumnDef = {
  key: string;
  label: string;
  numeric: boolean;
  isDate: boolean;
  isIssueMonth: boolean;
  sourceHeader: string;
};

export type CompactMasterSheetPayload = {
  name: string;
  headers: string[];
  rowCount: number;
  columnCount: number;
  rows: unknown[][];
};

export type MasterSheetsApiPayload = {
  ok: boolean;
  reason?: "master_not_found" | "master_parse_failed" | "sheets_missing" | "mongodb_empty";
  source?: "mongodb" | "disk" | "upload" | "client" | "seed";
  workbookName?: string;
  loadedAt?: string;
  masterPath?: string;
  sheets?: {
    primary: CompactMasterSheetPayload | null;
    rollover: CompactMasterSheetPayload | null;
    newPrimary: CompactMasterSheetPayload | null;
  };
};

export const MASTER_SHEET_REFERENCE_NOTE =
  "All monetary amounts are in Indian Rupees (₹). Issue Month is MMM / YY (e.g. Nov / 14). All other dates are DD-MMM-YY (e.g. 31-Aug-15).";

const NUMERIC_HEADER_HINTS =
  /\b(level|amount|tenor|coupon|fees|price|target|average|avg)\b|%\)|\(rs\.\)/i;

/** Prose / mixed coupon text — never force numeric formatting on Intel explorer. */
const NON_NUMERIC_SOURCE_HEADERS = new Set(["Coupon / PR / DM", "Coupon Participation Return"]);

const DATE_EXPLORER_HEADERS = new Set([
  ...MASTER_SOURCE_CALENDAR_DATE_HEADERS,
  "Trade Date",
  "Allotment Date",
  "Last Observation Date",
  "Maturity Date",
  "Rollover Date",
  "POED",
  "Observation Average 1",
  "Observation Average 2",
  "Observation Average 3",
  "Observation Average 4",
  "Observation Average 5",
  "Observation Average 6",
  "Observation Average 7",
]);

function canonicalColumnsForTab(tab: MasterSheetTab): readonly string[] {
  if (tab === "Rollover") return ROLLOVER_MASTER_SHEET_COLUMNS;
  return PRIMARY_MASTER_SHEET_COLUMNS;
}

function resolveColumnIndices(canonical: readonly string[], rawHeaders: string[]): number[] {
  const searchFrom = new Map<string, number>();

  return canonical.map((header) => {
    const start = searchFrom.get(header) ?? 0;
    const idx = rawHeaders.findIndex((candidate, index) => index >= start && candidate.trim() === header);
    if (idx >= 0) searchFrom.set(header, idx + 1);
    return idx;
  });
}

function cellValueAt(row: unknown[], index: number): unknown {
  if (index < 0) return null;
  return row[index] ?? null;
}

/** Align explorer grid to canonical Primary/Rollover column order — drops blank / junk columns. */
export function alignExplorerSheetToCanonical(
  tab: MasterSheetTab,
  payload: CompactMasterSheetPayload,
): CompactMasterSheetPayload {
  const canonical = canonicalColumnsForTab(tab);
  if (payload.headers.length === canonical.length && canonical.every((h, i) => payload.headers[i] === h)) {
    return payload;
  }

  const indices = resolveColumnIndices(canonical, payload.headers);
  const headers = [...canonical];
  const rows = payload.rows.map((row) => indices.map((index) => cellValueAt(row, index)));

  return {
    name: payload.name,
    headers,
    rowCount: rows.length,
    columnCount: headers.length,
    rows,
  };
}

function isNumericExplorerColumn(header: string) {
  const trimmed = header.trim();
  if (!trimmed) return false;
  if (NON_NUMERIC_SOURCE_HEADERS.has(trimmed)) return false;
  if (DATE_EXPLORER_HEADERS.has(trimmed)) return false;
  return NUMERIC_HEADER_HINTS.test(trimmed);
}

function isIssueMonthExplorerColumn(header: string) {
  return isMasterIssueMonthHeader(header);
}

function isDateExplorerColumn(header: string) {
  const trimmed = header.trim();
  if (isIssueMonthExplorerColumn(trimmed)) return false;
  if (DATE_EXPLORER_HEADERS.has(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return lower.includes("date") || lower.startsWith("observation average");
}

function columnKeyForHeader(header: string, occurrence: number): string {
  const trimmed = header.trim();
  return occurrence > 0 ? `${trimmed}__${occurrence + 1}` : trimmed;
}

/** Column defs for Intel explorer — canonical order, desk labels, date flags. */
export function columnsForExplorerTab(tab: MasterSheetTab, headers: string[]): MasterSheetColumnDef[] {
  const occurrence = new Map<string, number>();

  return headers.map((header) => {
    const sourceHeader = header.trim();
    const index = occurrence.get(sourceHeader) ?? 0;
    occurrence.set(sourceHeader, index + 1);

    return {
      key: columnKeyForHeader(sourceHeader, index),
      label: formatMasterColumnLabel(sourceHeader, index),
      numeric: isNumericExplorerColumn(sourceHeader),
      isDate: isDateExplorerColumn(sourceHeader),
      isIssueMonth: isIssueMonthExplorerColumn(sourceHeader),
      sourceHeader,
    };
  });
}

/** @deprecated Use columnsForExplorerTab — kept for non-explorer callers. */
export function columnsFromHeaders(headers: string[]): MasterSheetColumnDef[] {
  const tab: MasterSheetTab = headers.includes("Rollover C/P Date") ? "Primary" : "Rollover";
  return columnsForExplorerTab(tab, headers);
}

export function columnsFromWorkbookSheet(sheet: WorkbookSheetRecord): MasterSheetColumnDef[] {
  const tab = sheet.name === "Rollover" ? "Rollover" : "Primary";
  const aligned = alignExplorerSheetToCanonical(tab, compactWorkbookSheet(sheet));
  return columnsForExplorerTab(tab, aligned.headers);
}

export function rowsFromCompactGrid(
  tab: MasterSheetTab,
  headers: string[],
  grid: unknown[][],
): Record<string, unknown>[] {
  const columns = columnsForExplorerTab(tab, headers);
  return grid.map((cells) => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, index) => {
      record[col.key] = cells[index] ?? null;
    });
    return record;
  });
}

export function rowsFromWorkbookSheet(sheet: WorkbookSheetRecord): Record<string, unknown>[] {
  const tab = sheet.name === "Rollover" ? "Rollover" : "Primary";
  const aligned = alignExplorerSheetToCanonical(tab, compactWorkbookSheet(sheet));
  return rowsFromCompactGrid(tab, aligned.headers, aligned.rows);
}

/** Compact grid for MongoDB / API — canonical Primary/Rollover columns only. */
export function compactWorkbookSheet(sheet: WorkbookSheetRecord): CompactMasterSheetPayload {
  const rawRows = sheet.rows.map((row) =>
    row.values.map((cell) => {
      const display = cell.formatted?.trim();
      if (display) return display;
      const value = cell.value;
      if (typeof value === "number" && Number.isNaN(value)) return null;
      return value ?? null;
    }),
  );

  const base: CompactMasterSheetPayload = {
    name: sheet.name,
    headers: sheet.headers,
    rowCount: sheet.rowCount,
    columnCount: sheet.columnCount,
    rows: rawRows,
  };

  if (sheet.name === "Primary" || sheet.name === "Rollover" || sheet.name === "NEW PRIMARY") {
    const tab = sheet.name === "NEW PRIMARY" ? "Primary" : sheet.name;
    return alignExplorerSheetToCanonical(tab, base);
  }

  return base;
}

/** Full-fidelity grid for Intel explorer — every column and row as stored in Excel. */
export function compactWorkbookSheetRaw(sheet: WorkbookSheetRecord): CompactMasterSheetPayload {
  const rawRows = sheet.rows.map((row) =>
    row.values.map((cell) => {
      const display = cell.formatted?.trim();
      if (display) return display;
      const value = cell.value;
      if (typeof value === "number" && Number.isNaN(value)) return null;
      return value ?? null;
    }),
  );

  return {
    name: sheet.name,
    headers: sheet.headers,
    rowCount: rawRows.length,
    columnCount: sheet.headers.length,
    rows: rawRows,
  };
}

export function explorerTableForSheet(
  sheet: WorkbookSheetRecord | CompactMasterSheetPayload,
  tab: MasterSheetTab,
): { columns: MasterSheetColumnDef[]; rows: Record<string, unknown>[] } {
  const payload = Array.isArray((sheet as CompactMasterSheetPayload).rows?.[0])
    ? alignExplorerSheetToCanonical(tab, sheet as CompactMasterSheetPayload)
    : alignExplorerSheetToCanonical(tab, compactWorkbookSheet(sheet as WorkbookSheetRecord));

  return {
    columns: columnsForExplorerTab(tab, payload.headers),
    rows: rowsFromCompactGrid(tab, payload.headers, payload.rows),
  };
}

/** Intel explorer — all Excel columns/rows with desk-readable header labels only. */
export function explorerTableForSheetRaw(
  sheet: WorkbookSheetRecord | CompactMasterSheetPayload,
  tab: MasterSheetTab,
): { columns: MasterSheetColumnDef[]; rows: Record<string, unknown>[] } {
  const payload: CompactMasterSheetPayload =
    "headers" in sheet && Array.isArray(sheet.rows) && Array.isArray(sheet.rows[0])
      ? (sheet as CompactMasterSheetPayload)
      : compactWorkbookSheetRaw(sheet as WorkbookSheetRecord);

  return {
    columns: columnsForExplorerTab(tab, payload.headers),
    rows: rowsFromCompactGrid(tab, payload.headers, payload.rows),
  };
}

export function findWorkbookSheet(
  sheets: WorkbookSheetRecord[],
  tab: MasterSheetTab,
): WorkbookSheetRecord | undefined {
  return sheets.find((sheet) => sheet.name === tab);
}

export function looksNumeric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const text = value.replace(/,/g, "").trim();
  return text !== "" && Number.isFinite(Number(text));
}

export function formatMasterSheetCell(value: unknown, col: MasterSheetColumnDef | boolean): string {
  const numeric = typeof col === "boolean" ? col : col.numeric;
  const isDate = typeof col === "boolean" ? false : col.isDate;
  const isIssueMonth = typeof col === "boolean" ? false : col.isIssueMonth;

  if (value == null || String(value).trim() === "") return "—";

  if (isIssueMonth) {
    const formatted = formatMasterIssueMonth(value as string | number | null);
    return formatted && formatted.trim() ? formatted : "—";
  }

  if (isDate) {
    const formatted = formatMasterSheetDate(value as string | number | null);
    return formatted && formatted.trim() ? formatted : "—";
  }

  if (numeric && looksNumeric(value)) {
    return Number(String(value).replace(/,/g, "")).toLocaleString("en-IN", { maximumFractionDigits: 4 });
  }

  return String(value);
}
