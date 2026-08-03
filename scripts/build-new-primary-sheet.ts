/**
 * Build NEW PRIMARY sheet — merges Primary + Rollover by unique ISIN, sorts by Month,
 * applies clean table formatting (no legacy fills, bordered grid, highlighted header row).
 *
 * Usage:
 *   npm run build:new-primary
 *   npm run bake   # runs this before seed bake
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

import { mergePrimaryAndRolloverSheets, sortSheetRowsByMonth } from "../lib/master/new-primary-merge";
import type { MasterGridRow } from "../lib/master/new-primary-merge";
import { applyBeautifiedMasterSheetFormatting } from "../lib/master/master-sheet-excel-format";
import { applyMasterSheetComputedFormulas } from "../lib/master/master-sheet-formulas";
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
import { parseWorkbookBuffer } from "../lib/workbook/parser";
import { clearMasterDatasetDiskCache } from "../lib/server/master-file";
import type { WorkbookSheetRecord } from "../lib/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = join(ROOT, "New Product Master_.xlsx");
const BACKUP = join(ROOT, "New Product Master_.backup.xlsx");
const MERGE_LOG = join(ROOT, "docs", "new-primary-merge-log.md");

const DESK_SHEET_ORDER = ["Primary", "Rollover", "NEW PRIMARY"] as const;

const SHEET_TABLE_NAMES: Record<(typeof DESK_SHEET_ORDER)[number], string> = {
  Primary: "PrimaryMaster",
  Rollover: "RolloverMaster",
  "NEW PRIMARY": "NewPrimaryMaster",
};

type Grid = { headers: unknown[]; rows: unknown[][]; headerRowNumber: number };

function writeMergeLog(report: ReturnType<typeof mergePrimaryAndRolloverSheets>["report"]) {
  mkdirSync(dirname(MERGE_LOG), { recursive: true });
  const lines = [
    "# NEW PRIMARY merge log",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Primary input rows: ${report.primaryInputRows}`,
    `- Rollover input rows: ${report.rolloverInputRows}`,
    `- Merged rows: ${report.mergedRowCount}`,
    `- Duplicate Phase II removed: ${report.duplicatePhase2Removed}`,
    `- Unique ISINs: ${report.uniqueIsins}`,
    `- Rows without ISIN: ${report.rowsWithoutIsin}`,
    `- By phase: blank=${report.byPhase.blank} · 10years=${report.byPhase.tenyears} · Phase I=${report.byPhase.phase1} · Phase II=${report.byPhase.phase2}`,
    "",
    "## Issues",
    "",
  ];

  const grouped = new Map<string, number>();
  for (const issue of report.issues) {
    grouped.set(issue.code, (grouped.get(issue.code) ?? 0) + 1);
  }
  lines.push("By code: " + JSON.stringify(Object.fromEntries(grouped)));
  lines.push("");

  for (const issue of report.issues.slice(0, 100)) {
    lines.push(`- **${issue.code}** ${issue.isin ?? ""} · ${issue.name ?? ""} — ${issue.message}`);
  }
  if (report.issues.length > 100) {
    lines.push(`- … and ${report.issues.length - 100} more`);
  }

  writeFileSync(MERGE_LOG, lines.join("\n"));
}

function sheetGridFromDataset(
  sheet: NonNullable<ReturnType<typeof parseWorkbookBuffer>["sheets"][number]>,
): Grid {
  return {
    headers: sheet.headers,
    rows: sheet.rows.map((row) => row.values.map((cell) => cell.formatted ?? cell.value ?? null)),
    headerRowNumber: sheet.rows[0] ? sheet.rows[0].rowNumber - 1 : 1,
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

/** Write a clean workbook containing only Primary, Rollover, and NEW PRIMARY (in that order). */
function buildDeskOnlyWorkbook(grids: Record<(typeof DESK_SHEET_ORDER)[number], Grid>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const name of DESK_SHEET_ORDER) {
    writeGridToXlsxSheet(wb, name, grids[name]);
  }
  wb.SheetNames = [...DESK_SHEET_ORDER];
  return wb;
}

async function formatWorkbookTables(path: string, grids: Record<(typeof DESK_SHEET_ORDER)[number], Grid>) {
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
    applyMasterSheetComputedFormulas(
      ws,
      grid.headers.map((header) => String(header)),
      grid.rows.length,
    );
  }

  await workbook.xlsx.writeFile(path);
}

async function main() {
  if (!existsSync(MASTER)) {
    console.error(`Master workbook not found: ${MASTER}`);
    process.exit(1);
  }

  if (!existsSync(BACKUP)) {
    copyFileSync(MASTER, BACKUP);
    console.log(`Backup written: ${BACKUP}`);
  }

  // Prefer current master (already synced). Only fall back to .backup.xlsx when master missing.
  const sourcePath = existsSync(MASTER) ? MASTER : BACKUP;
  const fileBuffer = readFileSync(sourcePath);
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  ) as ArrayBuffer;

  const dataset = parseWorkbookBuffer(arrayBuffer, "New Product Master_.xlsx");
  const primarySheet = dataset.sheets.find((sheet) => sheet.name === "Primary");
  const rolloverSheet = dataset.sheets.find((sheet) => sheet.name === "Rollover");

  if (!primarySheet || !rolloverSheet) {
    console.error("Primary and Rollover sheets are required in the master workbook.");
    process.exit(1);
  }

  const poedByIsin = await loadPhase1PoedFromWorkingSheet();
  const primaryRaw = sheetGridFromDataset(primarySheet);
  const rolloverRaw = sheetGridFromDataset(rolloverSheet);
  const rolloverBackfill = backfillPhase1PoedOnGrid(
    rolloverSheet.headers,
    rolloverRaw.rows,
    poedByIsin,
  );
  if (rolloverBackfill.report.filled > 0) {
    console.log(`  Rollover Phase I POED backfill: ${rolloverBackfill.report.filled}`);
  }

  const rolloverForMerge: WorkbookSheetRecord = {
    ...rolloverSheet,
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

  const { headers, rows, report } = mergePrimaryAndRolloverSheets(primarySheet, rolloverForMerge);
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
  const rolloverExportBackfill = backfillPhase1PoedOnGrid(
    rolloverExport.sourceHeaders,
    rolloverExport.rows,
    poedByIsin,
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
  await formatWorkbookTables(MASTER, {
    Primary: primaryGrid,
    Rollover: rolloverGrid,
    "NEW PRIMARY": newPrimaryGrid,
  });

  clearMasterDatasetDiskCache();

  console.log("\n=== NEW PRIMARY merge complete ===");
  console.log(`  Primary rows in:     ${report.primaryInputRows}`);
  console.log(`  Rollover rows in:    ${report.rolloverInputRows}`);
  console.log(`  NEW PRIMARY rows:    ${report.mergedRowCount}`);
  console.log(`  Phase II dupes removed: ${report.duplicatePhase2Removed}`);
  console.log(`  Named columns:       Primary/NEW PRIMARY ${exportGrid.displayHeaders.length} · Rollover ${rolloverExport.displayHeaders.length}`);
  console.log(
    `  Phase parity — Phase I (Primary+Rollover): ${phaseParity.rolloverPhase1} rollover + primary → NEW PRIMARY ${phaseParity.newPrimaryPhase1}`,
  );
  console.log(
    `  Phase parity — Primary 10yr: ${phaseParity.primaryTenYears} = NEW PRIMARY 10yr: ${phaseParity.newPrimaryTenYears}`,
  );
  console.log(
    `  Phase parity — Primary blank: ${phaseParity.primaryBlank} = NEW PRIMARY blank: ${phaseParity.newPrimaryBlank}`,
  );
  if (phaseParity.violations.length) {
    console.error("  Phase parity FAILED:");
    for (const violation of phaseParity.violations) console.error(`    - ${violation}`);
    process.exit(1);
  }
  console.log(
    `  Rollover Phase II in Primary: ${phase2Coverage.rolloverPhase2Count}/${phase2Coverage.rolloverPhase2Count} ISINs` +
      (phase2Coverage.missingFromPrimary.length
        ? ` — MISSING: ${phase2Coverage.missingFromPrimary.join(", ")}`
        : " (all present)"),
  );
  if (phase2Coverage.missingFromPrimary.length) process.exit(1);
  console.log(`  Unique ISINs:        ${report.uniqueIsins}`);
  console.log(
    `  Rollover Phase I rows: ${isinStats.phase1Rows} · Phase II rows: ${isinStats.phase2Rows}`,
  );
  console.log(`  ISINs with both Phase I & II: ${isinStats.isinsWithBothPhases}`);
  console.log(
    `  ISINs with multiple phase rows: ${isinStats.isinsWithMultiplePhaseRows} (${isinStats.rowsOnSharedIsins} total rows)`,
  );
  console.log(
    `  By phase: blank=${report.byPhase.blank} · 10years=${report.byPhase.tenyears} · Phase I=${report.byPhase.phase1} · Phase II=${report.byPhase.phase2}`,
  );
  console.log(`  Sheets kept:         ${DESK_SHEET_ORDER.join(", ")}`);
  console.log(`  Merge log:           ${MERGE_LOG}`);
  console.log(`  Workbook:            ${MASTER}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
