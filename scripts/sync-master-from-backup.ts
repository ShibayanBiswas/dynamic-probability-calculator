/**
 * Sync desk master from Downloads backup workbooks:
 * 1. Primary + Rollover from the reference backup (default: New Product Master_ (1).xlsx)
 * 2. Backfill blank Phase I POED from Valuation Working!Maturity
 * 3. Rebuild beautified Primary / Rollover / NEW PRIMARY + formulas
 * 4. Copy to public/data for Intel / reference download
 *
 * Usage:
 *   npx tsx scripts/sync-master-from-backup.ts [primary.xlsx] [rollover.xlsx]
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

import { applyMasterSheetComputedFormulas } from "../lib/master/master-sheet-formulas";
import { applyBeautifiedMasterSheetFormatting } from "../lib/master/master-sheet-excel-format";
import { filterMasterExportGridRows } from "../lib/master-book-filter";
import { mergePrimaryAndRolloverSheets, sortSheetRowsByMonth } from "../lib/master/new-primary-merge";
import type { MasterGridRow } from "../lib/master/new-primary-merge";
import {
  prepareMasterSheetExportGrid,
  prepareNewPrimaryExportGrid,
  prepareRolloverExportGrid,
  sameIsinPhaseStats,
  verifyPhaseParity,
  verifyRolloverPhase2InPrimary,
} from "../lib/master/new-primary-export";
import {
  backfillPhase1PoedOnGrid,
  loadPhase1PoedFromWorkingSheet,
} from "../lib/master/phase1-poed-backfill";
import { clearMasterDatasetDiskCache } from "../lib/server/master-file";
import { formatMasterIssueMonth, formatMasterSheetDate } from "../lib/workbook/dates";
import { parseWorkbookBuffer } from "../lib/workbook/parser";
import type { DashboardDataset, WorkbookSheetRecord } from "../lib/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = join(ROOT, "New Product Master_.xlsx");
const MASTER_PRE_SYNC = join(ROOT, "New Product Master_.pre-sync.xlsx");
const MERGE_LOG = join(ROOT, "docs", "new-primary-merge-log.md");
/** Single Downloads reference — Primary + Rollover both from this workbook. */
const DEFAULT_PRIMARY_BACKUP = "/home/shibayanbiswas/Downloads/New Product Master_ (1).xlsx";
/** Same file as Primary unless overridden via argv[3]. */
const DEFAULT_ROLLOVER_BACKUP = "/home/shibayanbiswas/Downloads/New Product Master_ (1).xlsx";
const PUBLIC_DIR = join(ROOT, "public", "data");
const PUBLIC_MASTER = join(PUBLIC_DIR, "New Product Master_.xlsx");

const DESK_SHEET_ORDER = ["Primary", "Rollover", "NEW PRIMARY"] as const;
const SHEET_TABLE_NAMES: Record<(typeof DESK_SHEET_ORDER)[number], string> = {
  Primary: "PrimaryMaster",
  Rollover: "RolloverMaster",
  "NEW PRIMARY": "NewPrimaryMaster",
};

type Grid = { headers: unknown[]; rows: unknown[][]; headerRowNumber: number };

/** Cached formula results ExcelJS accepts on CellFormulaValue.result. */
type FormulaCachedResult = number | string | boolean | Date | ExcelJS.CellErrorValue;

function isFormulaCachedResult(value: ExcelJS.CellValue): value is FormulaCachedResult {
  if (value == null) return false;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return true;
  if (value instanceof Date) return true;
  return typeof value === "object" && "error" in value;
}

function sanitizeCellValue(value: ExcelJS.CellValue, numFmt?: string): ExcelJS.CellValue {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const fmt = String(numFmt ?? "").toLowerCase();
    // Month columns use mmm-yy — emit desk Issue Month `MMM / YY`
    if (/(^|[^d])mmm(-|\/)?yy/.test(fmt) && !/d-mmm|dd-mmm|d\/mmm/.test(fmt)) {
      return formatMasterIssueMonth(value) ?? null;
    }
    return formatMasterSheetDate(value) ?? null;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;

  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) {
      const formula =
        "formula" in value && value.formula
          ? String(value.formula)
          : "sharedFormula" in value
            ? String(value.sharedFormula ?? "")
            : "";
      const result = sanitizeCellValue(value.result ?? null, numFmt);
      if (!formula) return result;
      if (result == null || result === "") return { formula };
      if (isFormulaCachedResult(result)) return { formula, result };
      return { formula, result: String(result) };
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) {
      const nestedResult = (value as { result?: ExcelJS.CellValue }).result ?? null;
      return sanitizeCellValue(nestedResult, numFmt);
    }
    if ("hyperlink" in value) {
      return typeof value.text === "string" ? value.text : String(value.hyperlink ?? "");
    }
    if ("error" in value) return null;
  }

  try {
    return String(value);
  } catch {
    return null;
  }
}

/** Prefer cached formula result; otherwise the cell value (staging drops live formulas). */
function cellCalculatedValue(cell: ExcelJS.Cell): ExcelJS.CellValue {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) {
    return value.result ?? null;
  }
  return value ?? null;
}

function writeMergeLog(report: ReturnType<typeof mergePrimaryAndRolloverSheets>["report"]) {
  mkdirSync(dirname(MERGE_LOG), { recursive: true });
  const lines = [
    "# NEW PRIMARY merge log",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Source: Downloads backup sync (formulas restored)`,
    `- Primary input rows: ${report.primaryInputRows}`,
    `- Rollover input rows: ${report.rolloverInputRows}`,
    `- Merged rows: ${report.mergedRowCount}`,
    `- Duplicate Phase II removed: ${report.duplicatePhase2Removed}`,
    `- Unique ISINs: ${report.uniqueIsins}`,
    `- Rows without ISIN: ${report.rowsWithoutIsin}`,
    `- By phase: blank=${report.byPhase.blank} · 10years=${report.byPhase.tenyears} · Phase I=${report.byPhase.phase1} · Phase II=${report.byPhase.phase2}`,
    "",
  ];
  writeFileSync(MERGE_LOG, lines.join("\n"));
}

function sheetGridFromDataset(sheet: WorkbookSheetRecord): Grid {
  return {
    headers: sheet.headers,
    rows: sheet.rows.map((row) => row.values.map((cell) => cell.formatted ?? cell.value ?? null)),
    headerRowNumber: sheet.rows[0] ? sheet.rows[0].rowNumber - 1 : 1,
  };
}

/** Drop annotation / footer rows before merge + export. */
function filterSheetRecord(sheet: WorkbookSheetRecord): WorkbookSheetRecord {
  const filteredRows = sheet.rows.filter((row) => {
    const values = row.values.map((cell) => cell.formatted ?? cell.value ?? null);
    return filterMasterExportGridRows(sheet.headers, [values]).removedCount === 0;
  });
  const removedCount = sheet.rows.length - filteredRows.length;
  if (removedCount > 0) {
    console.log(`  Filtered ${removedCount} junk rows from ${sheet.name}`);
  }
  return {
    ...sheet,
    rows: filteredRows,
    rowCount: filteredRows.length,
  };
}

function gridToAoA(grid: Grid): unknown[][] {
  return [grid.headers, ...grid.rows];
}

function writeGridToXlsxSheet(wb: XLSX.WorkBook, sheetName: string, grid: Grid) {
  const ws = XLSX.utils.aoa_to_sheet(gridToAoA(grid));
  if (wb.Sheets[sheetName]) {
    delete wb.Sheets[sheetName];
    wb.SheetNames = wb.SheetNames.filter((name) => name !== sheetName);
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

function buildDeskOnlyWorkbook(grids: Record<(typeof DESK_SHEET_ORDER)[number], Grid>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const name of DESK_SHEET_ORDER) {
    writeGridToXlsxSheet(wb, name, grids[name]);
  }
  wb.SheetNames = [...DESK_SHEET_ORDER];
  return wb;
}

/**
 * Copy Primary from primaryBackup and Rollover from rolloverBackup
 * (header row normalized to row 1; formula results cached as values).
 */
async function materializeBackupPrimaryRollover(
  primaryBackup: string,
  rolloverBackup: string,
  outPath: string,
) {
  const dest = new ExcelJS.Workbook();

  for (const { name, path } of [
    { name: "Primary" as const, path: primaryBackup },
    { name: "Rollover" as const, path: rolloverBackup },
  ]) {
    const src = new ExcelJS.Workbook();
    await src.xlsx.readFile(path);
    const srcWs = src.getWorksheet(name);
    if (!srcWs) throw new Error(`Backup missing sheet: ${name} in ${path}`);

    // Backup layout: row 1 = column index numbers, row 2 = real headers
    let headerRowNum = 2;
    for (let r = 1; r <= 5; r++) {
      const vals: string[] = [];
      srcWs.getRow(r).eachCell((cell) => vals.push(String(cell.value ?? "").toLowerCase()));
      if (vals.some((v) => v.includes("isin")) && vals.some((v) => v.includes("month") || v.includes("name"))) {
        headerRowNum = r;
        break;
      }
    }

    const destWs = dest.addWorksheet(name);
    const srcHeader = srcWs.getRow(headerRowNum);
    let maxCol = 0;
    srcHeader.eachCell({ includeEmpty: false }, (_cell, col) => {
      maxCol = Math.max(maxCol, col);
    });

    for (let c = 1; c <= maxCol; c++) {
      const headerCell = srcHeader.getCell(c);
      const headerVal = sanitizeCellValue(headerCell.value, headerCell.numFmt);
      destWs.getRow(1).getCell(c).value = headerVal;
    }

    let outRow = 2;
    for (let r = headerRowNum + 1; r <= srcWs.rowCount; r++) {
      const srcRow = srcWs.getRow(r);
      let hasData = false;
      for (let c = 1; c <= maxCol; c++) {
        if (srcRow.getCell(c).value != null && srcRow.getCell(c).value !== "") {
          hasData = true;
          break;
        }
      }
      if (!hasData) continue;

      const destRow = destWs.getRow(outRow);
      for (let c = 1; c <= maxCol; c++) {
        const srcCell = srcRow.getCell(c);
        // Staging keeps calculated results only — desk formulas are re-applied on beautified sheets.
        const cleaned = sanitizeCellValue(cellCalculatedValue(srcCell), srcCell.numFmt);
        if (cleaned != null && cleaned !== "") destRow.getCell(c).value = cleaned;
      }
      outRow += 1;
    }
    console.log(
      `  Copied ${name} from ${path}: header@${headerRowNum} → ${outRow - 2} data rows, ${maxCol} cols`,
    );
  }

  await dest.xlsx.writeFile(outPath);
}

async function formatAndApplyFormulas(
  path: string,
  grids: Record<(typeof DESK_SHEET_ORDER)[number], Grid>,
) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  for (const name of DESK_SHEET_ORDER) {
    const ws = workbook.getWorksheet(name);
    const grid = grids[name];
    if (!ws || !grid) continue;

    await applyBeautifiedMasterSheetFormatting(
      ws,
      SHEET_TABLE_NAMES[name],
      name,
      grid.headerRowNumber,
      grid.headers.map((header) => String(header)),
      grid.rows,
    );

    const { applied } = applyMasterSheetComputedFormulas(
      ws,
      grid.headers.map((h) => String(h)),
      grid.rows.length,
    );
    console.log(`  Formulas on ${name}:`, applied);
  }

  await workbook.xlsx.writeFile(path);
}

async function main() {
  const primaryBackup = process.argv[2] ?? DEFAULT_PRIMARY_BACKUP;
  const rolloverBackup = process.argv[3] ?? DEFAULT_ROLLOVER_BACKUP;
  if (!existsSync(primaryBackup)) {
    console.error(`Primary backup not found: ${primaryBackup}`);
    process.exit(1);
  }
  if (!existsSync(rolloverBackup)) {
    console.error(`Rollover backup not found: ${rolloverBackup}`);
    process.exit(1);
  }

  if (existsSync(MASTER)) {
    copyFileSync(MASTER, MASTER_PRE_SYNC);
    console.log(`Pre-sync snapshot: ${MASTER_PRE_SYNC}`);
  }

  const staging = join(ROOT, "New Product Master_.staging-from-backup.xlsx");
  console.log(`\nMaterializing Primary from:\n  ${primaryBackup}`);
  console.log(`Materializing Rollover from:\n  ${rolloverBackup}`);
  await materializeBackupPrimaryRollover(primaryBackup, rolloverBackup, staging);

  const fileBuffer = readFileSync(staging);
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  ) as ArrayBuffer;

  const dataset: DashboardDataset = parseWorkbookBuffer(arrayBuffer, "New Product Master_.xlsx");
  const primarySheetRaw = dataset.sheets.find((sheet) => sheet.name === "Primary");
  const rolloverSheetRaw = dataset.sheets.find((sheet) => sheet.name === "Rollover");
  if (!primarySheetRaw || !rolloverSheetRaw) {
    console.error("Primary and Rollover required after backup materialize.");
    process.exit(1);
  }

  const primarySheet = filterSheetRecord(primarySheetRaw);
  const rolloverSheetFiltered = filterSheetRecord(rolloverSheetRaw);

  const poedByIsin = await loadPhase1PoedFromWorkingSheet();
  console.log(`  Working Phase I POED map: ${poedByIsin.size} ISINs`);

  const primaryRaw = sheetGridFromDataset(primarySheet);
  const rolloverRaw = sheetGridFromDataset(rolloverSheetFiltered);
  const rolloverBackfill = backfillPhase1PoedOnGrid(
    rolloverSheetFiltered.headers,
    rolloverRaw.rows,
    poedByIsin,
  );
  console.log(
    `  Rollover Phase I POED backfill: filled ${rolloverBackfill.report.filled}` +
      (rolloverBackfill.report.stillBlank.length
        ? ` · still blank ${rolloverBackfill.report.stillBlank.join(", ")}`
        : " · none blank"),
  );

  const rolloverSheet: WorkbookSheetRecord = {
    ...rolloverSheetFiltered,
    rows: rolloverBackfill.rows.map((values: MasterGridRow, index: number) => ({
      rowNumber: index + 2,
      values: values.map((value: unknown) => ({
        address: "",
        value:
          typeof value === "number" || typeof value === "boolean" || value == null
            ? (value as string | number | boolean | null)
            : String(value),
        formatted: value == null ? "" : String(value),
      })),
    })),
    rowCount: rolloverBackfill.rows.length,
  };

  const { headers, rows, report } = mergePrimaryAndRolloverSheets(primarySheet, rolloverSheet);
  const sortedPrimaryRows = sortSheetRowsByMonth(primarySheet.headers, primaryRaw.rows);
  const sortedRolloverRows = sortSheetRowsByMonth(rolloverSheet.headers, rolloverBackfill.rows);

  const primaryExport = prepareMasterSheetExportGrid(primarySheet.headers, sortedPrimaryRows);
  const rolloverExport = prepareRolloverExportGrid(
    rolloverSheet.headers,
    sortedRolloverRows,
    primarySheet.headers,
  );
  let exportGrid = prepareNewPrimaryExportGrid(headers, rows);
  const newPrimaryBackfill = backfillPhase1PoedOnGrid(
    exportGrid.sourceHeaders,
    exportGrid.rows,
    poedByIsin,
  );
  exportGrid = { ...exportGrid, rows: newPrimaryBackfill.rows };
  console.log(
    `  NEW PRIMARY Phase I POED backfill: filled ${newPrimaryBackfill.report.filled}` +
      (newPrimaryBackfill.report.stillBlank.length
        ? ` · still blank ${newPrimaryBackfill.report.stillBlank.join(", ")}`
        : " · none blank"),
  );

  const isinStats = sameIsinPhaseStats(exportGrid.sourceHeaders, exportGrid.rows);
  const phaseParity = verifyPhaseParity(
    primarySheet.headers,
    sortedPrimaryRows,
    rolloverSheet.headers,
    sortedRolloverRows,
    exportGrid.sourceHeaders,
    exportGrid.rows,
  );
  const phase2Coverage = verifyRolloverPhase2InPrimary(
    primarySheet.headers,
    sortedPrimaryRows,
    rolloverSheet.headers,
    sortedRolloverRows,
  );
  writeMergeLog(report);

  const rolloverExportBackfill = backfillPhase1PoedOnGrid(
    rolloverExport.sourceHeaders,
    rolloverExport.rows,
    poedByIsin,
  );

  const primaryGrid: Grid = {
    headers: primaryExport.displayHeaders,
    rows: primaryExport.rows,
    headerRowNumber: 1,
  };
  const rolloverGrid: Grid = {
    headers: rolloverExport.displayHeaders,
    rows: rolloverExportBackfill.rows,
    headerRowNumber: 1,
  };
  const newPrimaryGrid: Grid = {
    headers: exportGrid.displayHeaders,
    rows: exportGrid.rows,
    headerRowNumber: 1,
  };

  const xlsxWorkbook = buildDeskOnlyWorkbook({
    Primary: primaryGrid,
    Rollover: rolloverGrid,
    "NEW PRIMARY": newPrimaryGrid,
  });
  XLSX.writeFile(xlsxWorkbook, MASTER);
  await formatAndApplyFormulas(MASTER, {
    Primary: primaryGrid,
    Rollover: rolloverGrid,
    "NEW PRIMARY": newPrimaryGrid,
  });

  mkdirSync(PUBLIC_DIR, { recursive: true });
  copyFileSync(MASTER, PUBLIC_MASTER);
  clearMasterDatasetDiskCache();

  if (existsSync(staging)) {
    unlinkSync(staging);
  }

  const phase2Present =
    phase2Coverage.rolloverPhase2Count - phase2Coverage.missingFromPrimary.length;

  console.log("\n=== Master sync from backup complete ===");
  console.log(`  Primary rows in:     ${report.primaryInputRows}`);
  console.log(`  Rollover rows in:    ${report.rolloverInputRows}`);
  console.log(`  NEW PRIMARY rows:    ${report.mergedRowCount}`);
  console.log(`  Unique ISINs:        ${report.uniqueIsins}`);
  console.log(
    `  By phase: blank=${report.byPhase.blank} · 10years=${report.byPhase.tenyears} · Phase I=${report.byPhase.phase1} · Phase II=${report.byPhase.phase2}`,
  );
  console.log(
    `  Phase parity OK: ${phaseParity.violations.length === 0} · Phase2 in Primary: ${phase2Coverage.primaryPhase2Count}`,
  );
  if (phaseParity.violations.length) {
    console.warn("  Phase parity WARNINGS (non-blocking after backup sync):");
    for (const violation of phaseParity.violations) console.warn(`    - ${violation}`);
  }
  console.log(
    `  Rollover Phase II in Primary: ${phase2Present}/${phase2Coverage.rolloverPhase2Count} ISINs` +
      (phase2Coverage.missingFromPrimary.length
        ? ` — MISSING: ${phase2Coverage.missingFromPrimary.join(", ")}`
        : " (all present)"),
  );
  if (phase2Coverage.missingFromPrimary.length) process.exit(1);
  console.log(`  Shared-ISIN phase rows: ${isinStats.isinsWithBothPhases}`);
  console.log(`  Workbook: ${MASTER}`);
  console.log(`  Public:   ${PUBLIC_MASTER}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
