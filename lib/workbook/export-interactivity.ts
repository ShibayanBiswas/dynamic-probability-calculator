import type ExcelJS from "exceljs";

import { buildPayoffCurve } from "@/lib/workbook/formula-engine";
import { findPayoffPlotKinks } from "@/lib/workbook/payoff-kinks";
import { formatFormulaReturn, formatNumber } from "@/lib/utils";

export function colLetter(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Excel cell note — shows on hover (like chart tooltips). */
export function attachCellNote(cell: ExcelJS.Cell, text: string) {
  if (!text.trim()) return;
  cell.note = text.length > 32000 ? `${text.slice(0, 32000)}…` : text;
}

/** Formula visible in the formula bar; `result` is the cached display value. */
export function setFormulaCell(
  cell: ExcelJS.Cell,
  formula: string,
  result?: ExcelJS.CellValue,
  note?: string,
) {
  const clean = formula.startsWith("=") ? formula.slice(1) : formula;
  if (result !== undefined && result !== null && result !== "") {
    cell.value = { formula: clean, result: result as string | number | boolean | Date };
  } else {
    cell.value = { formula: clean };
  }
  if (note) attachCellNote(cell, note);
}

/** Matches web payoff chart tooltip copy. */
export function payoffHoverTooltip(z: number, payoff: number, underlying: number) {
  return [
    `Index move ${formatFormulaReturn(z, 1)}`,
    `Product return: ${formatFormulaReturn(payoff, 2)}`,
    `Underlying level: ${formatNumber(underlying, 2)}`,
  ].join("\n");
}

export type FormulaGuideEntry = {
  column: string;
  formula: string;
  description: string;
};

export const PORTFOLIO_FORMULA_GUIDE: FormulaGuideEntry[] = [
  {
    column: "Days Left",
    formula: "= calendar days to phase schedule end",
    description:
      "Live / observation-due tabs — days remaining until Blank/Phase 2 Maturity, Phase 1 POED, or 10Y Rollover C/P.",
  },
  {
    column: "Initial Prob",
    formula: "= successful daily paths ÷ included paths from phase start",
    description: "Historical path success rate versus adjusted start level from the product phase start.",
  },
  {
    column: "Current Prob",
    formula: "= successful daily paths ÷ included paths from valuation date",
    description: "Historical path success rate versus path start close from the selected valuation date.",
  },
  {
    column: "Observation Level 1–7",
    formula: "= bundled Nifty/Sensex close on Observation date (after NSE EOD)",
    description:
      "Underlying level at each Observation 1–7 date. Blank for empty slots, future dates, and same-day (0D) fixings until NSE cash close 15:30 IST.",
  },
  {
    column: "Effective Target",
    formula: "= (Total Obs × Target Level − Σ levels at passed obs) ÷ Remaining Obs",
    description: "Average level still required across pending observations so the full-period average can clear Target Level.",
  },
  {
    column: "Days Since Expiry",
    formula: "= calendar days since phase schedule end",
    description:
      "Expired tab only — elapsed days since Blank/Phase 2 Maturity, Phase 1 POED, or 10Y Rollover C/P.",
  },
];

export function addFormulaGuideSheet(wb: ExcelJS.Workbook, title: string, entries: FormulaGuideEntry[]) {
  const sheet = wb.addWorksheet("Formula Guide", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.mergeCells(1, 1, 1, 3);
  const rule = sheet.getCell(1, 1);
  rule.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4B24C" } };
  sheet.getRow(1).height = 5;

  sheet.mergeCells(2, 1, 2, 3);
  const banner = sheet.getCell(2, 1);
  banner.value = title;
  banner.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" }, name: "Calibri" };
  banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5C1622" } };
  banner.alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(2).height = 30;

  sheet.mergeCells(3, 1, 3, 3);
  sheet.getCell(3, 1).value =
    "Hover red-corner cells for desk notes. Scenario sheets also expose live Excel formulas in the formula bar.";
  sheet.getCell(3, 1).font = { italic: true, size: 9, color: { argb: "FF78716C" }, name: "Calibri" };
  sheet.getCell(3, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F4EA" } };
  sheet.getRow(3).height = 22;

  const headers = ["Column / Metric", "Formula / Logic", "Description"];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(4, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7A1E2C" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD4B24C" } },
      left: { style: "thin", color: { argb: "FFD4B24C" } },
      bottom: { style: "thin", color: { argb: "FFD4B24C" } },
      right: { style: "thin", color: { argb: "FFD4B24C" } },
    };
  });
  sheet.getRow(4).height = 22;

  entries.forEach((entry, ri) => {
    const row = 5 + ri;
    const zebra = ri % 2 === 0 ? "FFFFFFFF" : "FFFAF7EF";
    sheet.getCell(row, 1).value = entry.column;
    sheet.getCell(row, 1).font = { bold: true, size: 10, name: "Calibri" };
    const formulaCell = sheet.getCell(row, 2);
    formulaCell.value = entry.formula.startsWith("=") ? entry.formula.slice(1) : entry.formula;
    formulaCell.font = { size: 9, italic: true, color: { argb: "FF5C1622" }, name: "Calibri" };
    sheet.getCell(row, 3).value = entry.description;
    sheet.getCell(row, 3).font = { size: 9, name: "Calibri" };
    for (let c = 1; c <= 3; c++) {
      sheet.getCell(row, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      sheet.getCell(row, c).alignment = { wrapText: true, vertical: "top" };
    }
    sheet.getRow(row).height = 36;
  });

  sheet.columns = [{ width: 30 }, { width: 44 }, { width: 52 }];
  return sheet;
}

export type DeskInputRefs = {
  entryLevelRow: number;
  tenorRow: number;
  indexMoveRow: number;
  formulaRow: number;
};

/** ExcelJS definedNames.add expects (location, name) — not (name, location). */
function addDeskDefinedName(wb: ExcelJS.Workbook, sheetName: string, cell: string, name: string) {
  const quotedSheet = sheetName.replace(/'/g, "''");
  wb.definedNames.add(`'${quotedSheet}'!${cell}`, name);
}

/** Hidden named ranges for scenario formulas — no visible DESK INPUTS block on screen exports. */
export function registerDeskExportNamedRanges(
  sheet: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  options: {
    entryLevel: number;
    tenorDays: number;
    indexMove: number;
  },
) {
  const row = 1000;
  sheet.getRow(row).hidden = true;
  sheet.getCell(row, 1).value = options.entryLevel;
  sheet.getCell(row + 1, 1).value = options.tenorDays;
  sheet.getCell(row + 2, 1).value = options.indexMove * 100;

  addDeskDefinedName(wb, sheet.name, `$A$${row}`, "DESK_EntryLevel");
  addDeskDefinedName(wb, sheet.name, `$A$${row + 1}`, "DESK_TenorDays");
  addDeskDefinedName(wb, sheet.name, `$A$${row + 2}`, "DESK_IndexMovePct");
}

/** Interactive inputs + named ranges for payoff exports. */
export function addInteractiveDeskBlock(
  sheet: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  startRow: number,
  options: {
    entryLevel: number;
    tenorDays: number;
    indexMove: number;
    formulaText: string;
    debentures?: number;
    pricePerDebenture?: number;
  },
): number {
  const r = startRow;

  sheet.mergeCells(r, 1, r, 6);
  const title = sheet.getCell(r, 1);
  title.value = "  DESK INPUTS";
  title.font = { bold: true, size: 11, color: { argb: "FF7A1E2C" }, name: "Calibri" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6EDCF" } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  title.border = {
    left: { style: "medium", color: { argb: "FF7A1E2C" } },
    bottom: { style: "thin", color: { argb: "FFD4B24C" } },
  };
  sheet.getRow(r).height = 24;

  const rows: Array<[string, ExcelJS.CellValue, boolean]> = [
    ["Initial fixing (entry level)", options.entryLevel, false],
    ["Remaining tenor (days)", options.tenorDays, false],
    ["Index move % (edit me)", options.indexMove * 100, true],
    ["Debentures", options.debentures ?? 100, true],
    ["Initial Price / Debenture (₹)", options.pricePerDebenture ?? 100_000, false],
  ];

  rows.forEach(([label, value], i) => {
    const row = r + 1 + i;
    const zebra = i % 2 === 0 ? "FFFFFFFF" : "FFFAF7EF";
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF44403C" } };
    sheet.getCell(row, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = value;
    valueCell.font = { size: 10, name: "Calibri", bold: true, color: { argb: "FF5C1622" } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    if (label.includes("%")) valueCell.numFmt = "0.00";
    else valueCell.numFmt = "#,##0.00";
    if (i >= 2) {
      valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCF8EE" } };
      valueCell.border = {
        top: { style: "thin", color: { argb: "FFD4B24C" } },
        left: { style: "thin", color: { argb: "FFD4B24C" } },
        bottom: { style: "thin", color: { argb: "FFD4B24C" } },
        right: { style: "thin", color: { argb: "FFD4B24C" } },
      };
    }
  });

  const formulaRow = r + 6;
  sheet.getCell(formulaRow, 1).value = "Desk payoff formula (Working)";
  sheet.getCell(formulaRow, 1).font = { bold: true, size: 10, name: "Calibri" };
  sheet.mergeCells(formulaRow, 2, formulaRow + 1, 6);
  const formulaCell = sheet.getCell(formulaRow, 2);
  formulaCell.value = options.formulaText || "Z";
  formulaCell.alignment = { wrapText: true, vertical: "top" };
  formulaCell.font = { size: 9, italic: true, color: { argb: "FF5C1622" }, name: "Calibri" };
  formulaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F4EA" } };

  const entryLevelRow = r + 1;
  const tenorRow = r + 2;
  const indexMoveRow = r + 3;

  addDeskDefinedName(wb, sheet.name, `$B$${entryLevelRow}`, "DESK_EntryLevel");
  addDeskDefinedName(wb, sheet.name, `$B$${tenorRow}`, "DESK_TenorDays");
  addDeskDefinedName(wb, sheet.name, `$B$${indexMoveRow}`, "DESK_IndexMovePct");

  return formulaRow + 2;
}

export function addPayoffCurveSheet(
  wb: ExcelJS.Workbook,
  productName: string,
  formulaText: string,
  entryLevel: number,
) {
  const curve = buildPayoffCurve(formulaText).map((p) => ({
    z: p.z,
    payoff: Math.max(-1, Math.min(p.payoff, 3)),
    underlying: entryLevel * (1 + p.z),
  }));

  const sheet = wb.addWorksheet("Payoff Curve", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.mergeCells(1, 1, 1, 4);
  sheet.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4B24C" } };
  sheet.getRow(1).height = 5;

  sheet.mergeCells(2, 1, 2, 4);
  sheet.getCell(2, 1).value = `Payoff Curve · ${productName}`;
  sheet.getCell(2, 1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Calibri" };
  sheet.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5C1622" } };
  sheet.getCell(2, 1).alignment = { vertical: "middle", indent: 1 };
  sheet.getRow(2).height = 28;

  sheet.mergeCells(3, 1, 3, 4);
  sheet.getCell(3, 1).value = "Scenario series · edit Desk Inputs on the main sheet to refresh linked levels";
  sheet.getCell(3, 1).font = { italic: true, size: 8, color: { argb: "FF78716C" }, name: "Calibri" };
  sheet.getCell(3, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F4EA" } };
  sheet.getRow(3).height = 16;

  const headers = ["Index move (Z)", "Underlying level", "Product return", "Plot kink?"];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(4, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7A1E2C" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD4B24C" } },
      left: { style: "thin", color: { argb: "FFD4B24C" } },
      bottom: { style: "thin", color: { argb: "FFD4B24C" } },
      right: { style: "thin", color: { argb: "FFD4B24C" } },
    };
  });
  sheet.getRow(4).height = 22;

  const kinks = new Set(findPayoffPlotKinks(formulaText).map((k) => Math.round(k * 10000)));

  curve.forEach((point, i) => {
    const row = 5 + i;
    const zebra = i % 2 === 0 ? "FFFFFFFF" : "FFFAF7EF";
    const zCell = sheet.getCell(row, 1);
    zCell.value = point.z;
    zCell.numFmt = "0.00%";
    zCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    zCell.font = { size: 9, name: "Calibri" };

    const underlyingCell = sheet.getCell(row, 2);
    setFormulaCell(underlyingCell, `DESK_EntryLevel*(1+A${row})`, point.underlying);
    underlyingCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    underlyingCell.font = { size: 9, name: "Calibri" };

    const payoffCell = sheet.getCell(row, 3);
    payoffCell.value = point.payoff;
    payoffCell.numFmt = "0.00%";
    payoffCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    payoffCell.font = { size: 9, bold: true, color: { argb: "FF5C1622" }, name: "Calibri" };
    const isKink = kinks.has(Math.round(point.z * 10000));
    if (isKink || i % 8 === 0) {
      attachCellNote(payoffCell, payoffHoverTooltip(point.z, point.payoff, point.underlying));
    }

    const kinkCell = sheet.getCell(row, 4);
    kinkCell.value = isKink ? "◆ kink" : "";
    kinkCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
    kinkCell.font = { size: 9, color: { argb: "FF7A1E2C" }, name: "Calibri" };
  });

  sheet.columns = [{ width: 16 }, { width: 18 }, { width: 16 }, { width: 12 }];
  return sheet;
}

export function portfolioValuationNote(
  product: { name: string; formulaText?: string; isin?: string },
  snapshot: { valuationDate: string },
  levels: { niftyLevel?: number; sensexLevel?: number },
) {
  const parts = [
    `Desk MTM · ${product.name}`,
    product.isin ? `ISIN ${product.isin}` : "",
    snapshot.valuationDate ? `As of ${snapshot.valuationDate}` : "",
    levels.niftyLevel != null ? `Nifty ${formatNumber(levels.niftyLevel, 2)}` : "",
    levels.sensexLevel != null ? `Sensex ${formatNumber(levels.sensexLevel, 2)}` : "",
    product.formulaText ? `Working formula:\n${product.formulaText.slice(0, 900)}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

export const PAYOFF_SCENARIO_FORMULA_GUIDE: FormulaGuideEntry[] = [
  {
    column: "Final Fixing",
    formula: "= DESK_EntryLevel × (1 + underlying performance)",
    description: "Index level at scenario.",
  },
  {
    column: "Underlying Performance",
    formula: "=(FinalFixing-DESK_EntryLevel)/DESK_EntryLevel",
    description: "Excel formula in scenario table — click cell to see in formula bar.",
  },
  {
    column: "Product Return",
    formula: "= desk payoff formula at Z (hover for tooltip)",
    description: "Evaluated by dashboard engine; hover for chart-style tooltip. See Payoff Curve sheet.",
  },
  {
    column: "XIRR",
    formula: "=IF(ProductReturn>-1,(1+ProductReturn)^(365/DESK_TenorDays)-1,0)",
    description: "Annualised return over remaining tenor.",
  },
];
