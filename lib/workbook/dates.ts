import { format, isValid, parse } from "date-fns";

/** Indian desk numeric dates (day-month). Slash US Excel forms use parseAmbiguousSlashDate. */
const DATE_PATTERNS = [
  "dd-MM-yyyy",
  "d-MM-yyyy",
  "dd-M-yyyy",
  "d-M-yyyy",
  "dd-MM-yy",
  "d-MM-yy",
  "dd-M-yy",
  "d-M-yy",
  "dd-MMM-yyyy",
  "d-MMM-yyyy",
  "dd-MMM-yy",
  "d-MMM-yy",
  "dd/MMM/yyyy",
  "d/MMM/yyyy",
  "dd/MMM/yy",
  "d/MMM/yy",
  "M-yyyy",
];

const REFERENCE_DATE = new Date();

export type ExcelishDateInput = string | number | Date | null | undefined;

/** Map 2-digit years to 19xx/20xx — desk convention for Primary master dates. */
function normalizeCentury(parsed: Date) {
  const year = parsed.getFullYear();
  if (year >= 100) {
    return parsed;
  }
  const adjusted = year >= 70 ? 1900 + year : 2000 + year;
  const next = new Date(parsed);
  next.setFullYear(adjusted);
  return next;
}

/** Excel serial → calendar Date using UTC day components (avoids TZ off-by-one). */
export function excelSerialToDate(serial: number): Date {
  const whole = Math.floor(serial);
  const utc = Date.UTC(1899, 11, 30) + whole * 86400000;
  const probe = new Date(utc);
  return new Date(probe.getUTCFullYear(), probe.getUTCMonth(), probe.getUTCDate());
}

/**
 * Ambiguous numeric **slash** dates only (both parts ≤ 12), e.g. `1/8/26`.
 * Excel US round-trips write `m/d/yy`. Hyphenated Indian `d-M-yy` stays in DATE_PATTERNS.
 * Prefer serial/Date/`dd-MMM-yy` upstream whenever possible.
 */
function parseAmbiguousSlashDate(text: string): Date | undefined {
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return undefined;

  const a = Number(match[1]);
  const b = Number(match[2]);
  const yearRaw = Number(match[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(yearRaw)) return undefined;

  const year = yearRaw < 100 ? (yearRaw >= 70 ? 1900 + yearRaw : 2000 + yearRaw) : yearRaw;

  let day: number;
  let monthIndex: number;
  if (a > 12 && b >= 1 && b <= 12) {
    day = a;
    monthIndex = b - 1;
  } else if (b > 12 && a >= 1 && a <= 12) {
    day = b;
    monthIndex = a - 1;
  } else if (a >= 1 && a <= 12 && b >= 1 && b <= 12) {
    // Ambiguous slash — Excel sheet display uses M/d/yy
    day = b;
    monthIndex = a - 1;
  } else {
    return undefined;
  }

  const parsed = new Date(year, monthIndex, day);
  return isValid(parsed) && parsed.getFullYear() === year && parsed.getMonth() === monthIndex && parsed.getDate() === day
    ? parsed
    : undefined;
}

export function parseExcelishDate(value?: ExcelishDateInput) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (value instanceof Date) {
    return isValid(value) ? value : undefined;
  }

  if (typeof value === "number" && value > 30000) {
    return excelSerialToDate(value);
  }

  const text = String(value).trim();
  const numeric = Number(text.replace(/,/g, ""));
  if (Number.isFinite(numeric) && numeric > 30000 && !text.includes("-") && !text.includes("/")) {
    return excelSerialToDate(numeric);
  }

  for (const pattern of DATE_PATTERNS) {
    const parsed = parse(text, pattern, REFERENCE_DATE);
    if (isValid(parsed)) {
      return normalizeCentury(parsed);
    }
  }

  const slash = parseAmbiguousSlashDate(text);
  if (slash) return slash;

  const native = new Date(text);
  return isValid(native) ? native : undefined;
}

export function toLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Excel serial date (1900 date system) for Working-sheet VLOOKUP keys. */
export function toExcelSerial(date: Date) {
  const base = Date.UTC(1899, 11, 30);
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utc - base) / 86400000);
}

export function formatDisplayDate(date: Date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}-${m}-${date.getFullYear()}`;
}

/** True when a desk-format date string is the same calendar day as now. */
export function isDeskToday(dateRaw?: string | null) {
  if (!dateRaw?.trim()) return false;
  const parsed = parseExcelishDate(dateRaw);
  if (!parsed) return false;
  return toLocalDateKey(parsed) === toLocalDateKey(new Date());
}

export function formatExcelishDate(value?: string | number | null) {
  const parsed = parseExcelishDate(value);
  if (!parsed) {
    return value ? String(value) : "Unknown";
  }
  return formatDisplayDate(parsed);
}

const MASTER_MONTH_ABBRS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const MASTER_MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Canonical source headers formatted as DD-MMM-YY calendar dates. */
export const MASTER_SOURCE_CALENDAR_DATE_HEADERS = new Set([
  "Trade Date/Opening date",
  "Allotment Date",
  "Last Observation Date",
  "Maturity",
  "Rollover C/P Date",
  "POED",
  "Average 1",
  "Avg. 2",
  "Avg. 3",
  "Avg. 4",
  "Avg. 5",
  "Avg. 6",
  "Avg. 7",
]);

function titleCaseMonthAbbr(raw: string): string {
  const index = MASTER_MONTH_INDEX[raw.toLowerCase()];
  return index === undefined ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : MASTER_MONTH_ABBRS[index]!;
}

function twoDigitYear(raw: string): string {
  const digits = String(raw).trim();
  if (digits.length >= 4) return digits.slice(-2);
  return digits.padStart(2, "0");
}

/** Master Excel + Intel explorer — Issue Month as `Nov / 14`. */
export function formatMasterIssueMonth(value?: ExcelishDateInput): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (!isValid(value)) return null;
    return `${MASTER_MONTH_ABBRS[value.getMonth()]} / ${String(value.getFullYear()).slice(-2)}`;
  }

  const text = String(value).trim();
  if (!text) return null;

  const slash = text.match(/^([A-Za-z]{3})\s*\/\s*(\d{2,4})$/);
  if (slash) {
    return `${titleCaseMonthAbbr(slash[1]!)} / ${twoDigitYear(slash[2]!)}`;
  }

  const dash = text.match(/^([A-Za-z]{3})-(\d{2,4})$/);
  if (dash) {
    return `${titleCaseMonthAbbr(dash[1]!)} / ${twoDigitYear(dash[2]!)}`;
  }

  const parsed = parseExcelishDate(value);
  if (parsed) {
    return `${MASTER_MONTH_ABBRS[parsed.getMonth()]} / ${String(parsed.getFullYear()).slice(-2)}`;
  }

  return text;
}

export function isMasterIssueMonthHeader(header: string): boolean {
  const trimmed = header.trim();
  if (trimmed === "Month") return true;
  if (trimmed === "Issue Month") return true;
  return /^Issue Month \(\d+\)$/.test(trimmed);
}

/** Master Excel + Intel explorer — calendar dates as `31-Aug-15`. */
export function formatMasterSheetDate(value?: ExcelishDateInput): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (!isValid(value)) return null;
    return format(value, "dd-MMM-yy");
  }

  const text = String(value).trim();
  if (!text) return null;

  const parsed = parseExcelishDate(value);
  if (!parsed) return text;
  return format(parsed, "dd-MMM-yy");
}

/** Normalize a master cell by canonical source header name. */
export function formatMasterCellBySourceHeader(
  sourceHeader: string,
  value?: ExcelishDateInput,
): string | null {
  const header = sourceHeader.trim();
  if (isMasterIssueMonthHeader(header) || header === "Month") {
    return formatMasterIssueMonth(value);
  }
  if (MASTER_SOURCE_CALENDAR_DATE_HEADERS.has(header)) {
    return formatMasterSheetDate(value);
  }
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return format(value, "dd-MMM-yy");
  return String(value).trim() || null;
}
