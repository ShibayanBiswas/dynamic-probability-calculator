/**
 * Phase 1 POED backfill from the desk Valuation Working sheet.
 *
 * Backup Rollover leaves POED blank for a small Phase I set. The Valuation
 * Working!Maturity Date for those Phase I rows is the contractual phase end
 * (same field Working uses as POED for filled Phase I products). Use that to
 * restore POED on Rollover / NEW PRIMARY so post-obs growth runs lastObs → POED.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import ExcelJS from "exceljs";

import type { MasterGridRow } from "@/lib/master/new-primary-merge";
import { rolloverPhaseBucket } from "@/lib/master/new-primary-merge";
import { formatMasterSheetDate } from "@/lib/workbook/dates";

export const DEFAULT_WORKING_POED_SOURCE = join(
  process.cwd(),
  "Dashboards - 31st May 26",
  "Primary Structured Products Valuation - 31st May 26.xlsm",
);

function cellDate(value: ExcelJS.CellValue): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === "object" && "result" in value) {
    const result = (value as { result?: ExcelJS.CellValue }).result;
    if (result instanceof Date && !Number.isNaN(result.getTime())) return result;
  }
  return undefined;
}

function isBlank(value: unknown): boolean {
  if (value == null || value === "") return true;
  const text = String(value).trim();
  return !text || text === "-" || /^n\/?a$/i.test(text);
}

/**
 * ISIN → Phase I phase-end date from Working!Maturity (skips Phase II Working rows).
 */
export async function loadPhase1PoedFromWorkingSheet(
  workingPath: string = DEFAULT_WORKING_POED_SOURCE,
): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (!existsSync(workingPath)) {
    console.warn(`Working POED source missing: ${workingPath}`);
    return out;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workingPath);
  const ws = workbook.getWorksheet("Working");
  if (!ws) {
    console.warn(`Working sheet missing in ${workingPath}`);
    return out;
  }

  let headerRow = 2;
  const headers: string[] = [];
  for (let r = 1; r <= 6; r++) {
    const vals: string[] = [];
    ws.getRow(r).eachCell((cell, col) => {
      vals[col] = String(cell.value ?? "");
    });
    if (vals.some((v) => /isin/i.test(v)) && vals.some((v) => /maturity|allotment/i.test(v))) {
      headerRow = r;
      for (let i = 0; i < vals.length; i++) headers[i] = vals[i] ?? "";
      break;
    }
  }

  const isinCol = headers.findIndex((h) => /isin/i.test(h || ""));
  const matCol = headers.findIndex((h) => /maturity/i.test(h || ""));
  const rollCol = headers.findIndex((h) => String(h || "").trim().toLowerCase() === "rollover");
  if (isinCol < 0 || matCol < 0) {
    console.warn("Working sheet missing ISIN / Maturity columns for POED backfill");
    return out;
  }

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const isin = String(row.getCell(isinCol).value ?? "")
      .trim()
      .toUpperCase();
    if (!isin) continue;

    const rollLabel = rollCol > 0 ? String(row.getCell(rollCol).value ?? "") : "";
    if (/phase\s*ii|phase\s*2/i.test(rollLabel)) continue;

    const maturity = cellDate(row.getCell(matCol).value);
    if (!maturity) continue;

    // Prefer the first Phase I / blank-rollover Working row (canonical Phase I end).
    if (!out.has(isin)) out.set(isin, maturity);
  }

  return out;
}

export type Phase1PoedBackfillReport = {
  scannedPhase1: number;
  filled: number;
  stillBlank: string[];
};

/** Fill blank Phase I POED cells from Working-derived dates. */
export function backfillPhase1PoedOnGrid(
  headers: string[],
  rows: MasterGridRow[],
  poedByIsin: Map<string, Date>,
): { rows: MasterGridRow[]; report: Phase1PoedBackfillReport } {
  const isinIdx = headers.indexOf("ISIN No.");
  const poedIdx = headers.indexOf("POED");
  if (isinIdx < 0 || poedIdx < 0) {
    return {
      rows,
      report: { scannedPhase1: 0, filled: 0, stillBlank: [] },
    };
  }

  let scannedPhase1 = 0;
  let filled = 0;
  const stillBlank: string[] = [];

  const nextRows = rows.map((row) => {
    if (rolloverPhaseBucket(row, headers) !== "phase1") return row;
    scannedPhase1 += 1;
    const isin = String(row[isinIdx] ?? "")
      .trim()
      .toUpperCase();
    if (!isBlank(row[poedIdx])) return row;

    const poed = isin ? poedByIsin.get(isin) : undefined;
    if (!poed) {
      if (isin) stillBlank.push(isin);
      return row;
    }

    const copy = [...row];
    copy[poedIdx] = formatMasterSheetDate(poed) ?? poed;
    filled += 1;
    return copy;
  });

  return {
    rows: nextRows,
    report: { scannedPhase1, filled, stillBlank },
  };
}
