/**
 * Shared Anand Rathi desk export theme — Excel + PDF.
 * Maroon / gold brand language with calm ivory surfaces and hairline rules.
 */
import type ExcelJS from "exceljs";

/** ARGB hex for ExcelJS fills / fonts / borders. */
export const EXCEL_THEME = {
  maroon: "FF7A1E2C",
  maroonDeep: "FF5C1622",
  maroonSoft: "FFF7EDEF",
  gold: "FFD4B24C",
  goldRich: "FFC4A03E",
  goldSoft: "FFF6EDCF",
  goldPale: "FFFCF8EE",
  ivory: "FFFAF7EF",
  parchment: "FFF8F4EA",
  white: "FFFFFFFF",
  ink: "FF1C1917",
  inkSoft: "FF44403C",
  muted: "FF78716C",
  label: "FFF3EFE6",
  border: "FFE7E1CF",
  borderStrong: "FFD4B24C",
  rule: "FFC9B88A",
} as const;

/** RGB tuples for jsPDF. */
export const PDF_THEME = {
  maroon: [122, 30, 44] as [number, number, number],
  maroonDeep: [92, 22, 34] as [number, number, number],
  maroonSoft: [247, 237, 239] as [number, number, number],
  gold: [212, 178, 76] as [number, number, number],
  goldRich: [196, 160, 62] as [number, number, number],
  goldSoft: [246, 237, 207] as [number, number, number],
  goldPale: [252, 248, 238] as [number, number, number],
  ivory: [250, 247, 239] as [number, number, number],
  parchment: [248, 244, 234] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  ink: [28, 25, 23] as [number, number, number],
  inkSoft: [68, 64, 60] as [number, number, number],
  muted: [120, 113, 108] as [number, number, number],
  label: [243, 239, 230] as [number, number, number],
  border: [231, 225, 207] as [number, number, number],
  currentRow: [255, 243, 214] as [number, number, number],
  pivotRow: [252, 245, 235] as [number, number, number],
};

export const EXCEL_FONT = "Calibri";

export function excelFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

export function excelThin(argb: string = EXCEL_THEME.border): Partial<ExcelJS.Border> {
  return { style: "thin", color: { argb } };
}

export function excelHairline(argb: string = EXCEL_THEME.rule): Partial<ExcelJS.Border> {
  return { style: "hair", color: { argb } };
}

export function excelMedium(argb: string = EXCEL_THEME.gold): Partial<ExcelJS.Border> {
  return { style: "medium", color: { argb } };
}

export const excelBox: Partial<ExcelJS.Borders> = {
  top: excelThin(),
  left: excelThin(),
  bottom: excelThin(),
  right: excelThin(),
};

export const excelGoldBox: Partial<ExcelJS.Borders> = {
  top: excelThin(EXCEL_THEME.gold),
  left: excelThin(EXCEL_THEME.gold),
  bottom: excelThin(EXCEL_THEME.gold),
  right: excelThin(EXCEL_THEME.gold),
};

/**
 * Classy desk masthead — gold rule, maroon title band, gold subtitle, ink eyebrow.
 * Returns the next free content row.
 */
export function addExcelMasthead(
  sheet: ExcelJS.Worksheet,
  options: {
    title: string;
    subtitle: string;
    eyebrow?: string;
    fromCol?: number;
    toCol?: number;
    rowOffset?: number;
  },
): number {
  const from = options.fromCol ?? 1;
  const to = options.toCol ?? 10;
  const base = options.rowOffset ?? 0;

  // Slim gold accent rule
  sheet.mergeCells(1 + base, from, 1 + base, to);
  const rule = sheet.getCell(1 + base, from);
  rule.fill = excelFill(EXCEL_THEME.gold);
  sheet.getRow(1 + base).height = 5;

  // Maroon title band
  sheet.mergeCells(2 + base, from, 2 + base, to);
  const banner = sheet.getCell(2 + base, from);
  banner.value = options.title;
  banner.fill = excelFill(EXCEL_THEME.maroonDeep);
  banner.font = {
    bold: true,
    size: 18,
    color: { argb: EXCEL_THEME.white },
    name: EXCEL_FONT,
  };
  banner.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sheet.getRow(2 + base).height = 36;

  // Gold subtitle strip
  sheet.mergeCells(3 + base, from, 3 + base, to);
  const sub = sheet.getCell(3 + base, from);
  sub.value = options.subtitle;
  sub.fill = excelFill(EXCEL_THEME.gold);
  sub.font = {
    bold: true,
    size: 10,
    color: { argb: EXCEL_THEME.ink },
    name: EXCEL_FONT,
  };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
  sheet.getRow(3 + base).height = 22;

  let next = 4 + base;
  if (options.eyebrow?.trim()) {
    sheet.mergeCells(next, from, next, to);
    const eye = sheet.getCell(next, from);
    eye.value = options.eyebrow;
    eye.fill = excelFill(EXCEL_THEME.parchment);
    eye.font = {
      size: 8,
      italic: true,
      color: { argb: EXCEL_THEME.muted },
      name: EXCEL_FONT,
    };
    eye.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    eye.border = { bottom: excelThin(EXCEL_THEME.rule) };
    sheet.getRow(next).height = 16;
    next += 1;
  }

  // Breathing room
  sheet.getRow(next).height = 8;
  return next + 1;
}

/** Section rail — maroon accent bar + soft gold wash. */
export function addExcelSection(
  sheet: ExcelJS.Worksheet,
  row: number,
  title: string,
  fromCol = 1,
  toCol = 6,
): number {
  sheet.mergeCells(row, fromCol, row, toCol);
  const cell = sheet.getCell(row, fromCol);
  cell.value = `  ${title.toUpperCase()}`;
  cell.fill = excelFill(EXCEL_THEME.goldSoft);
  cell.font = {
    bold: true,
    size: 11,
    color: { argb: EXCEL_THEME.maroon },
    name: EXCEL_FONT,
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  cell.border = {
    left: excelMedium(EXCEL_THEME.maroon),
    bottom: excelThin(EXCEL_THEME.gold),
    top: excelHairline(EXCEL_THEME.rule),
    right: excelHairline(EXCEL_THEME.rule),
  };
  sheet.getRow(row).height = 24;
  return row + 1;
}

/** Classy KPI tiles — 2-up pale-gold cards; lone last metric spans full width. */
export function addExcelKpiTiles(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  rows: Array<[string, string, string?]>,
  attachNote?: (cell: ExcelJS.Cell, note: string) => void,
): number {
  let r = startRow;
  const pairs: Array<Array<[string, string, string?]>> = [];
  for (let i = 0; i < rows.length; i += 2) {
    pairs.push(rows.slice(i, i + 2));
  }

  const paintTile = (
    row: number,
    startCol: number,
    endCol: number,
    label: string,
    value: string,
    note?: string,
  ) => {
    // Soft wash across the tile block (hides Excel grid lines)
    for (let rr = row; rr <= row + 1; rr++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = sheet.getCell(rr, c);
        cell.fill = excelFill(EXCEL_THEME.goldPale);
        cell.border = {
          top: rr === row ? excelThin(EXCEL_THEME.gold) : excelHairline(EXCEL_THEME.goldPale),
          bottom: rr === row + 1 ? excelThin(EXCEL_THEME.gold) : excelHairline(EXCEL_THEME.goldPale),
          left: c === startCol ? excelThin(EXCEL_THEME.gold) : excelHairline(EXCEL_THEME.goldPale),
          right: c === endCol ? excelThin(EXCEL_THEME.gold) : excelHairline(EXCEL_THEME.goldPale),
        };
      }
    }

    // Maroon left rail on label row
    sheet.getCell(row, startCol).border = {
      top: excelThin(EXCEL_THEME.gold),
      bottom: excelHairline(EXCEL_THEME.goldPale),
      left: excelMedium(EXCEL_THEME.maroon),
      right: excelHairline(EXCEL_THEME.goldPale),
    };

    sheet.mergeCells(row, startCol, row, endCol);
    const labelCell = sheet.getCell(row, startCol);
    labelCell.value = label.toUpperCase();
    labelCell.font = {
      size: 8,
      color: { argb: EXCEL_THEME.muted },
      name: EXCEL_FONT,
      bold: true,
    };
    labelCell.fill = excelFill(EXCEL_THEME.goldPale);
    labelCell.alignment = { vertical: "bottom", horizontal: "left", indent: 1, wrapText: true };
    labelCell.border = {
      top: excelThin(EXCEL_THEME.gold),
      left: excelMedium(EXCEL_THEME.maroon),
      bottom: excelHairline(EXCEL_THEME.rule),
      right: excelThin(EXCEL_THEME.gold),
    };

    sheet.mergeCells(row + 1, startCol, row + 1, endCol);
    const valueCell = sheet.getCell(row + 1, startCol);
    valueCell.value = value;
    valueCell.font = {
      bold: true,
      size: 14,
      color: { argb: EXCEL_THEME.maroonDeep },
      name: EXCEL_FONT,
    };
    valueCell.fill = excelFill(EXCEL_THEME.goldPale);
    valueCell.alignment = { vertical: "top", horizontal: "left", indent: 1, wrapText: false };
    valueCell.border = {
      top: excelHairline(EXCEL_THEME.rule),
      left: excelMedium(EXCEL_THEME.maroon),
      bottom: excelThin(EXCEL_THEME.gold),
      right: excelThin(EXCEL_THEME.gold),
    };
    if (note && attachNote) attachNote(valueCell, note);
  };

  for (const pair of pairs) {
    const solo = pair.length === 1;
    if (solo) {
      const [label, value, note] = pair[0]!;
      paintTile(r, 1, 6, label, value, note);
    } else {
      pair.forEach(([label, value, note], colIdx) => {
        const startCol = colIdx === 0 ? 1 : 4;
        const endCol = colIdx === 0 ? 3 : 6;
        paintTile(r, startCol, endCol, label, value, note);
      });
      // Soft gutter between the two cards (col gap is visual via borders only)
    }

    sheet.getRow(r).height = 16;
    sheet.getRow(r + 1).height = 24;
    // Spacer row — parchment wash so default grid never peeks through
    const spacer = r + 2;
    for (let c = 1; c <= 6; c++) {
      sheet.getCell(spacer, c).fill = excelFill(EXCEL_THEME.parchment);
      sheet.getCell(spacer, c).border = {
        top: excelHairline(EXCEL_THEME.parchment),
        bottom: excelHairline(EXCEL_THEME.parchment),
        left: excelHairline(EXCEL_THEME.parchment),
        right: excelHairline(EXCEL_THEME.parchment),
      };
    }
    sheet.getRow(spacer).height = 6;
    r += 3;
  }
  return r;
}
