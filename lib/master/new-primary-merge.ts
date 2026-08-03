import type { WorkbookSheetRecord } from "@/lib/types";

export type MasterGridRow = unknown[];

export type RolloverPhaseBucket = "blank" | "phase1" | "phase2" | "tenyears" | "other";

export type MasterMergeIssue = {
  code: "MISSING_ISIN" | "ROW_APPENDED" | "DUPLICATE_PHASE2_SKIPPED";
  isin?: string;
  name?: string;
  message: string;
};

export type MasterMergeReport = {
  primaryInputRows: number;
  rolloverInputRows: number;
  mergedRowCount: number;
  uniqueIsins: number;
  rowsWithoutIsin: number;
  duplicatePhase2Removed: number;
  byPhase: Record<RolloverPhaseBucket, number>;
  issues: MasterMergeIssue[];
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Sort key for master `Month` column — handles `Mar / 08`, `Jun-26`, etc. */
export function monthColumnSortKey(raw: unknown): number {
  const text = String(raw ?? "").trim();
  if (!text) return Number.MAX_SAFE_INTEGER;

  const slash = text.match(/^([A-Za-z]{3})\s*\/\s*(\d{2,4})$/);
  if (slash) {
    const month = MONTH_NAMES[slash[1]!.toLowerCase()] ?? 0;
    let year = Number(slash[2]);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    return year * 100 + month;
  }

  const dash = text.match(/^([A-Za-z]{3})-(\d{2})$/);
  if (dash) {
    const month = MONTH_NAMES[dash[1]!.toLowerCase()] ?? 0;
    const year = 2000 + Number(dash[2]);
    return year * 100 + month;
  }

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) return parsed;

  return Number.MAX_SAFE_INTEGER;
}

function sheetToGrid(sheet: WorkbookSheetRecord): { headers: string[]; rows: MasterGridRow[] } {
  return {
    headers: sheet.headers,
    rows: sheet.rows.map((row) => row.values.map((cell) => cell.formatted ?? cell.value ?? null)),
  };
}

function normalizeIsin(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

function headerIndex(headers: string[], name: string): number {
  return headers.findIndex((h) => h.trim() === name);
}

function headerIndexMap(headers: string[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  headers.forEach((header, index) => {
    const key = header.trim();
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(index);
    map.set(key, list);
  });
  return map;
}

/** Map a source row onto the target Primary header layout (same column names / order). */
export function mapRowToPrimaryLayout(
  sourceHeaders: string[],
  sourceRow: MasterGridRow,
  targetHeaders: string[],
): MasterGridRow {
  const sourceMap = headerIndexMap(sourceHeaders);
  const targetOccurrence = new Map<string, number>();

  return targetHeaders.map((header) => {
    const key = header.trim();
    if (!key) return null;

    const indices = sourceMap.get(key);
    if (!indices?.length) return null;

    const occurrence = targetOccurrence.get(key) ?? 0;
    targetOccurrence.set(key, occurrence + 1);
    const sourceIndex = indices[Math.min(occurrence, indices.length - 1)]!;
    return sourceRow[sourceIndex] ?? null;
  });
}

function rowLabel(row: MasterGridRow, headers: string[], isinIndex: number): string {
  const nameIdx = headerIndex(headers, "Name on Signup Form");
  const name = nameIdx >= 0 ? String(row[nameIdx] ?? "").trim() : "";
  const isin = isinIndex >= 0 ? normalizeIsin(row[isinIndex]) : "";
  return name || isin || "unknown row";
}

/** Classify rollover phase bucket — blank, Phase I, Phase II, 10years. */
export function rolloverPhaseBucket(row: MasterGridRow, headers: string[]): RolloverPhaseBucket {
  const idx = headerIndex(headers, "Rollover Phase");
  const phase = idx >= 0 ? String(row[idx] ?? "").trim().toLowerCase() : "";
  if (!phase) return "blank";
  if (phase.includes("10year")) return "tenyears";
  if (phase.includes("ii") || phase.includes("phase 2")) return "phase2";
  if (phase.includes("phase i") || (phase.includes("i") && !phase.includes("ii"))) return "phase1";
  return "other";
}

/** Phase II rollover is a continuation of Phase I — rank II above I for desk canonical pick. */
export function rolloverPhaseRank(row: MasterGridRow, headers: string[]): number {
  const bucket = rolloverPhaseBucket(row, headers);
  switch (bucket) {
    case "phase2":
      return 3;
    case "phase1":
      return 2;
    case "tenyears":
      return 1;
    case "blank":
      return 0;
    default:
      return 0;
  }
}

type TaggedRow = {
  row: MasterGridRow;
  source: "primary" | "rollover";
  index: number;
};

/** Prefer Phase II (continuation) over Phase I; tie-break by later Month then Rollover source. */
export function pickCanonicalRolloverRow(candidates: TaggedRow[], headers: string[]): TaggedRow {
  return candidates.reduce((best, candidate) => {
    const bestPhase = rolloverPhaseRank(best.row, headers);
    const candidatePhase = rolloverPhaseRank(candidate.row, headers);
    if (candidatePhase !== bestPhase) {
      return candidatePhase > bestPhase ? candidate : best;
    }

    const monthIdx = headerIndex(headers, "Month");
    const bestMonth = monthIdx >= 0 ? monthColumnSortKey(best.row[monthIdx]) : 0;
    const candidateMonth = monthIdx >= 0 ? monthColumnSortKey(candidate.row[monthIdx]) : 0;
    if (candidateMonth !== bestMonth) {
      return candidateMonth > bestMonth ? candidate : best;
    }

    if (candidate.source === "rollover" && best.source === "primary") return candidate;
    return best;
  });
}

/** Count rows by rollover phase bucket. */
export function countRowsByPhase(rows: MasterGridRow[], headers: string[]): Record<RolloverPhaseBucket, number> {
  const counts: Record<RolloverPhaseBucket, number> = {
    blank: 0,
    phase1: 0,
    phase2: 0,
    tenyears: 0,
    other: 0,
  };
  for (const row of rows) {
    counts[rolloverPhaseBucket(row, headers)] += 1;
  }
  return counts;
}

/**
 * Merge Primary + Rollover into NEW PRIMARY.
 * Primary rows are kept in full; Rollover Phase I (original terms) is appended.
 * Rollover Phase II is skipped when Primary already has Phase II for the same ISIN
 * (continuation row duplicates Primary current terms).
 * Desk app still dedupes by ISIN via `pickCanonicalRowsForDesk`.
 */
export function mergePrimaryAndRolloverSheets(
  primarySheet: WorkbookSheetRecord,
  rolloverSheet: WorkbookSheetRecord,
): { headers: string[]; rows: MasterGridRow[]; report: MasterMergeReport } {
  const primary = sheetToGrid(primarySheet);
  const rollover = sheetToGrid(rolloverSheet);
  const targetHeaders = [...primary.headers];
  const primaryIsinIdx = headerIndex(targetHeaders, "ISIN No.");
  const rolloverIsinIdx = headerIndex(rollover.headers, "ISIN No.");

  const issues: MasterMergeIssue[] = [];
  const merged: MasterGridRow[] = [];
  const seenIsins = new Set<string>();
  const primaryPhase2Isins = new Set<string>();
  let rowsWithoutIsin = 0;
  let duplicatePhase2Removed = 0;

  for (const row of primary.rows) {
    merged.push([...row]);
    const isin = primaryIsinIdx >= 0 ? normalizeIsin(row[primaryIsinIdx]) : "";
    if (isin) {
      seenIsins.add(isin);
      if (rolloverPhaseBucket(row, targetHeaders) === "phase2") {
        primaryPhase2Isins.add(isin);
      }
    } else {
      rowsWithoutIsin += 1;
    }
  }

  for (const row of rollover.rows) {
    const isin = rolloverIsinIdx >= 0 ? normalizeIsin(row[rolloverIsinIdx]) : "";
    const mapped = mapRowToPrimaryLayout(rollover.headers, row, targetHeaders);
    const label = rowLabel(row, rollover.headers, rolloverIsinIdx);

    if (!isin) {
      issues.push({
        code: "MISSING_ISIN",
        name: label,
        message: "Rollover row has no ISIN — still appended",
      });
      rowsWithoutIsin += 1;
    } else {
      seenIsins.add(isin);
    }

    if (
      isin &&
      rolloverPhaseBucket(mapped, targetHeaders) === "phase2" &&
      primaryPhase2Isins.has(isin)
    ) {
      duplicatePhase2Removed += 1;
      issues.push({
        code: "DUPLICATE_PHASE2_SKIPPED",
        isin,
        name: label,
        message:
          "Rollover Phase II skipped — Primary Phase II already holds current continuation terms for this ISIN",
      });
      continue;
    }

    merged.push(mapped);
    issues.push({
      code: "ROW_APPENDED",
      isin: isin || undefined,
      name: label,
      message: "Rollover row appended to NEW PRIMARY",
    });
  }

  const monthIdx = headerIndex(targetHeaders, "Month");
  const sortedMerged =
    monthIdx >= 0
      ? [...merged].sort((a, b) => monthColumnSortKey(a[monthIdx]) - monthColumnSortKey(b[monthIdx]))
      : merged;

  return {
    headers: targetHeaders,
    rows: sortedMerged,
    report: {
      primaryInputRows: primary.rows.length,
      rolloverInputRows: rollover.rows.length,
      mergedRowCount: sortedMerged.length,
      uniqueIsins: seenIsins.size,
      rowsWithoutIsin,
      duplicatePhase2Removed,
      byPhase: countRowsByPhase(sortedMerged, targetHeaders),
      issues,
    },
  };
}

/**
 * From a full NEW PRIMARY grid, pick one desk row per ISIN (Phase II > Phase I > 10years > blank).
 * Used by the valuation parser — sheet keeps every row for reference.
 */
export function pickCanonicalRowsForDesk(
  headers: string[],
  rows: MasterGridRow[],
): MasterGridRow[] {
  const isinIdx = headerIndex(headers, "ISIN No.");
  const noIsin: MasterGridRow[] = [];
  const byIsin = new Map<string, TaggedRow[]>();

  rows.forEach((row, index) => {
    const isin = isinIdx >= 0 ? normalizeIsin(row[isinIdx]) : "";
    if (!isin) {
      noIsin.push(row);
      return;
    }
    const bucket = byIsin.get(isin) ?? [];
    bucket.push({ row, source: "primary", index });
    byIsin.set(isin, bucket);
  });

  const canonical: MasterGridRow[] = [...noIsin];
  for (const candidates of byIsin.values()) {
    canonical.push(pickCanonicalRolloverRow(candidates, headers).row);
  }

  const monthIdx = headerIndex(headers, "Month");
  if (monthIdx < 0) return canonical;
  return [...canonical].sort((a, b) => monthColumnSortKey(a[monthIdx]) - monthColumnSortKey(b[monthIdx]));
}

export function sortSheetRowsByMonth(headers: string[], rows: MasterGridRow[]): MasterGridRow[] {
  const monthIdx = headerIndex(headers, "Month");
  if (monthIdx < 0) return rows;
  return [...rows].sort((a, b) => monthColumnSortKey(a[monthIdx]) - monthColumnSortKey(b[monthIdx]));
}
