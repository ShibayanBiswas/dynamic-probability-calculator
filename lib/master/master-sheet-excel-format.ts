import type ExcelJS from "exceljs";

import { MASTER_SHEET_REFERENCE_NOTE } from "@/lib/master/new-primary-export";

export const MASTER_SHEET_HEADER_ROW = 1;

export type MasterSheetAccent = {
  headerFill: string;
  headerFont: string;
  headerBorder: string;
  outerBorder: string;
  innerBorder: string;
  stripeFill: string;
  keyColumnHeaderFill: string;
  keyColumnDataFill: string;
  dataFont: string;
};

export const MASTER_SHEET_ACCENTS: Record<"Primary" | "Rollover" | "NEW PRIMARY", MasterSheetAccent> = {
  Primary: {
    headerFill: "FF1D4ED8",
    headerFont: "FFFFFFFF",
    headerBorder: "FF1E3A8A",
    outerBorder: "FF1E3A8A",
    innerBorder: "FF93C5FD",
    stripeFill: "FFEFF6FF",
    keyColumnHeaderFill: "FF1E3A8A",
    keyColumnDataFill: "FFDBEAFE",
    dataFont: "FF0F172A",
  },
  Rollover: {
    headerFill: "FF7C3AED",
    headerFont: "FFFFFFFF",
    headerBorder: "FF4C1D95",
    outerBorder: "FF4C1D95",
    innerBorder: "FFC4B5FD",
    stripeFill: "FFF5F3FF",
    keyColumnHeaderFill: "FF5B21B6",
    keyColumnDataFill: "FFEDE9FE",
    dataFont: "FF0F172A",
  },
  "NEW PRIMARY": {
    headerFill: "FF059669",
    headerFont: "FFFFFFFF",
    headerBorder: "FF064E3B",
    outerBorder: "FF064E3B",
    innerBorder: "FF6EE7B7",
    stripeFill: "FFECFDF5",
    keyColumnHeaderFill: "FF047857",
    keyColumnDataFill: "FFD1FAE5",
    dataFont: "FF0F172A",
  },
};

const KEY_COLUMN_HINTS = /product name|isin|rollover phase|payoff formula|trade amount|underlying/i;

function cellDisplayLength(value: unknown): number {
  if (value == null) return 0;
  return String(value).replace(/\s+/g, " ").trim().length;
}

function isWrapColumn(header: string): boolean {
  const lower = header.toLowerCase();
  return (
    lower.includes("formula") ||
    lower.includes("description") ||
    lower.includes("explanation") ||
    lower.includes("observation")
  );
}

function isNumericColumn(header: string): boolean {
  const lower = header.toLowerCase();
  return (
    lower.includes("amount") ||
    lower.includes("level") ||
    lower.includes("tenor") ||
    lower.includes("coupon") ||
    lower.includes("fees") ||
    lower.includes("price") ||
    lower.includes("percentage") ||
    lower.includes("average")
  );
}

/** Column width from longest header or cell value in that column. */
export function computeMasterColumnWidths(headers: string[], rows: unknown[][]): number[] {
  return headers.map((header, colIndex) => {
    let maxLen = String(header).length;
    for (const row of rows) {
      maxLen = Math.max(maxLen, cellDisplayLength(row[colIndex]));
    }

    const headerText = String(header);
    let width = maxLen + 4;

    if (isWrapColumn(headerText)) {
      width = Math.min(Math.max(width, 28), 96);
    } else if (headerText.toLowerCase().includes("isin")) {
      width = Math.min(Math.max(width, 18), 28);
    } else if (headerText.toLowerCase().includes("date") || headerText.toLowerCase().includes("month")) {
      width = Math.min(Math.max(width, 14), 32);
    } else if (isNumericColumn(headerText)) {
      width = Math.min(Math.max(width, 12), 24);
    } else {
      width = Math.min(Math.max(width, 12), 64);
    }

    return width;
  });
}

function borderSides(
  accent: MasterSheetAccent,
  rowNum: number,
  col: number,
  headerRowNumber: number,
  lastRow: number,
  columnCount: number,
) {
  const isHeader = rowNum === headerRowNumber;
  const isTop = rowNum === headerRowNumber;
  const isBottom = rowNum === lastRow;
  const isLeft = col === 1;
  const isRight = col === columnCount;

  const outer = { style: "medium" as const, color: { argb: accent.outerBorder } };
  const inner = { style: "thin" as const, color: { argb: accent.innerBorder } };
  const headerRule = { style: "medium" as const, color: { argb: accent.headerBorder } };

  return {
    top: isTop ? outer : inner,
    left: isLeft ? outer : inner,
    bottom: isHeader ? headerRule : isBottom ? outer : inner,
    right: isRight ? outer : inner,
  };
}

function isKeyColumn(header: string): boolean {
  return KEY_COLUMN_HINTS.test(header);
}

function paintMasterSheetGrid(
  sheet: ExcelJS.Worksheet,
  accent: MasterSheetAccent,
  headerRowNumber: number,
  displayHeaders: string[],
  columnWidths: number[],
  lastRow: number,
) {
  const columnCount = displayHeaders.length;
  sheet.getRow(headerRowNumber).height = 42;

  for (let rowNum = headerRowNumber; rowNum <= lastRow; rowNum += 1) {
    const isHeader = rowNum === headerRowNumber;
    const dataRowIndex = rowNum - headerRowNumber - 1;
    const isStripe = !isHeader && dataRowIndex % 2 === 1;
    const row = sheet.getRow(rowNum);

    if (!isHeader) {
      row.height = 22;
    }

    for (let col = 1; col <= columnCount; col += 1) {
      const header = displayHeaders[col - 1] ?? "";
      const keyColumn = isKeyColumn(header);
      const wrap = isWrapColumn(header);
      const numeric = !isHeader && isNumericColumn(header);
      const cell = row.getCell(col);

      let fillArgb = "FFFFFFFF";
      if (isHeader) {
        fillArgb = keyColumn ? accent.keyColumnHeaderFill : accent.headerFill;
      } else if (keyColumn) {
        fillArgb = accent.keyColumnDataFill;
      } else if (isStripe) {
        fillArgb = accent.stripeFill;
      }

      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: fillArgb },
      };
      cell.border = borderSides(accent, rowNum, col, headerRowNumber, lastRow, columnCount);

      if (isHeader) {
        cell.font = { bold: true, color: { argb: accent.headerFont }, size: 12, name: "Calibri" };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      } else {
        cell.font = { size: 10, color: { argb: accent.dataFont }, name: "Calibri" };
        cell.alignment = {
          vertical: wrap ? "top" : "middle",
          horizontal: numeric ? "right" : "left",
          wrapText: wrap,
          indent: wrap || numeric ? 0 : 1,
        };
      }
    }

    row.commit();
  }

  for (let col = 1; col <= columnCount; col += 1) {
    sheet.getColumn(col).width = columnWidths[col - 1] ?? 14;
  }
}

/** Filterable table from row 1 — accent headers, zebra rows, key-column highlights, auto column widths. */
export async function applyBeautifiedMasterSheetFormatting(
  sheet: ExcelJS.Worksheet,
  _tableName: string,
  sheetName: keyof typeof MASTER_SHEET_ACCENTS,
  _headerRowNumber: number,
  displayHeaders: string[],
  dataRows: unknown[][],
): Promise<void> {
  const accent = MASTER_SHEET_ACCENTS[sheetName];
  const columnCount = displayHeaders.length;
  const dataRowCount = dataRows.length;
  const headerRow = MASTER_SHEET_HEADER_ROW;
  const lastRow = headerRow + dataRowCount;
  const columnWidths = computeMasterColumnWidths(displayHeaders, dataRows);

  while (sheet.rowCount >= 1) {
    const row = sheet.getRow(1);
    const values = row.values;
    const hasContent =
      Array.isArray(values) &&
      values.some((value: unknown) => value !== null && value !== undefined && value !== "");
    if (hasContent) break;
    sheet.spliceRows(1, 1);
  }

  sheet.views = [{ state: "frozen", ySplit: headerRow, activeCell: "A2", showGridLines: false }];

  if (dataRowCount > 0) {
    sheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: lastRow, column: columnCount },
    };
  }

  paintMasterSheetGrid(sheet, accent, headerRow, displayHeaders, columnWidths, lastRow);
  appendMasterSheetReferenceNote(sheet, columnCount, lastRow, accent);
  trimWorksheetBelowRow(sheet, lastRow + 2);
}

function trimWorksheetBelowRow(sheet: ExcelJS.Worksheet, lastRowToKeep: number) {
  while (sheet.rowCount > lastRowToKeep) {
    sheet.spliceRows(lastRowToKeep + 1, 1);
  }
}

function appendMasterSheetReferenceNote(
  sheet: ExcelJS.Worksheet,
  columnCount: number,
  lastRow: number,
  accent: MasterSheetAccent,
) {
  const noteRow = lastRow + 2;
  sheet.mergeCells(noteRow, 1, noteRow, columnCount);
  const cell = sheet.getCell(noteRow, 1);
  cell.value = MASTER_SHEET_REFERENCE_NOTE;
  cell.font = { italic: true, size: 10, color: { argb: accent.dataFont }, name: "Calibri" };
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: accent.stripeFill },
  };
  cell.border = {
    top: { style: "thin", color: { argb: accent.innerBorder } },
    left: { style: "medium", color: { argb: accent.outerBorder } },
    bottom: { style: "medium", color: { argb: accent.outerBorder } },
    right: { style: "medium", color: { argb: accent.outerBorder } },
  };
  sheet.getRow(noteRow).height = 42;
}
