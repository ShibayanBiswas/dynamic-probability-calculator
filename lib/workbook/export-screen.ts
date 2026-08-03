import type ExcelJS from "exceljs";

import { createWorkbook } from "@/lib/workbook/excel-runtime";

import type { ProductRecord } from "@/lib/types";
import type { ValuationResult } from "@/lib/workbook/valuation-engine";
import type { PayoffRowFlags } from "@/lib/workbook/payoff-pivots";
import { embedBrandLogo, fetchBrandLogoBase64 } from "@/lib/workbook/export-branding";
import {
  buildDescriptionLines,
  buildOverviewFooterRows,
  buildSpecRows,
  renderPayoffCurvePng,
  SCREEN_EXPORT_DISCLAIMER,
  screenExportStamp,
} from "@/lib/workbook/export-screen-shared";
import type { ObservationExportRow } from "@/lib/workbook/build-screen-export-payload";
import {
  addPayoffCurveSheet,
  attachCellNote,
  PAYOFF_SCENARIO_FORMULA_GUIDE,
  payoffHoverTooltip,
  registerDeskExportNamedRanges,
  setFormulaCell,
  colLetter,
} from "@/lib/workbook/export-interactivity";
import { buildDeskExportFilename } from "@/lib/workbook/export-filename";
import {
  EXCEL_FONT,
  EXCEL_THEME,
  addExcelKpiTiles,
  addExcelMasthead,
  addExcelSection,
  excelBox,
  excelFill,
  excelGoldBox,
  excelThin,
} from "@/lib/workbook/export-theme";
import { resolvePayoffScenarioTenorDays } from "@/lib/workbook/payoff-scenarios";
import { parseExcelishDate } from "@/lib/workbook/dates";
import { getDebenturePrice, getIndexEntryLevel } from "@/lib/product-utils";
import { getProductLifecycleStatus } from "@/lib/product-lifecycle";
import { valuationMetricLabels } from "@/lib/valuation-labels";
import {
  formatExcelCurrency,
  formatExcelProductUnitValue,
  formatFormulaReturn,
  formatPercent,
} from "@/lib/utils";

const FULL = 10; // A–J full width
const LEFT = 6; // A–F left pane
const RIGHT_START = 7; // G — payoff scenarios pane

const MAROON = EXCEL_THEME.maroon;
const GOLD = EXCEL_THEME.gold;
const GOLD_PALE = EXCEL_THEME.goldPale;
const INK = EXCEL_THEME.ink;
const WHITE = EXCEL_THEME.white;
const ROW_ALT = EXCEL_THEME.ivory;
const LABEL_FILL = EXCEL_THEME.label;
const MUTED = EXCEL_THEME.muted;

const thin = excelThin;
const boxBorder = excelBox;
const fill = excelFill;

/** Branded masthead — gold rule + maroon title + gold subtitle. */
function addBanner(sheet: ExcelJS.Worksheet, title: string, subtitle: string, rowOffset = 0) {
  return addExcelMasthead(sheet, {
    title,
    subtitle,
    eyebrow: "Anand Rathi Wealth · Primary Structured Products Desk",
    fromCol: 1,
    toCol: FULL,
    rowOffset,
  });
}

/** Section header bar over a column span. */
function addSection(sheet: ExcelJS.Worksheet, row: number, title: string, fromCol = 1, toCol = LEFT) {
  return addExcelSection(sheet, row, title, fromCol, toCol);
}

/** Two-column label / value block with calm ivory zebra. */
function addKeyValues(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  rows: Array<[string, string, string?]>,
) {
  let r = startRow;
  rows.forEach(([label, value, note], i) => {
    const labelCell = sheet.getCell(r, 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10, color: { argb: EXCEL_THEME.inkSoft }, name: EXCEL_FONT };
    labelCell.fill = fill(LABEL_FILL);
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    labelCell.border = boxBorder;

    sheet.mergeCells(r, 2, r, LEFT);
    const valueCell = sheet.getCell(r, 2);
    valueCell.value = value;
    valueCell.font = { size: 10, color: { argb: INK }, name: EXCEL_FONT };
    valueCell.fill = fill(i % 2 === 0 ? WHITE : ROW_ALT);
    valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    valueCell.border = boxBorder;
    if (note) attachCellNote(valueCell, note);
    for (let c = 3; c <= LEFT; c++) sheet.getCell(r, c).border = boxBorder;
    sheet.getRow(r).height = 20;
    r++;
  });
  return r + 1;
}

/** Plain reference table — Product Specifications (quiet white). */
function addPlainKeyValues(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  rows: Array<[string, string, string?]>,
) {
  let r = startRow;
  rows.forEach(([label, value, note], i) => {
    const labelCell = sheet.getCell(r, 1);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 9, color: { argb: MUTED }, name: EXCEL_FONT };
    labelCell.fill = fill(i % 2 === 0 ? WHITE : EXCEL_THEME.parchment);
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    labelCell.border = {
      top: thin(EXCEL_THEME.rule),
      left: thin(EXCEL_THEME.rule),
      bottom: thin(EXCEL_THEME.rule),
      right: thin(EXCEL_THEME.rule),
    };

    sheet.mergeCells(r, 2, r, LEFT);
    const valueCell = sheet.getCell(r, 2);
    valueCell.value = value;
    valueCell.font = { size: 10, color: { argb: INK }, name: EXCEL_FONT };
    valueCell.fill = fill(i % 2 === 0 ? WHITE : EXCEL_THEME.parchment);
    valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };
    valueCell.border = {
      top: thin(EXCEL_THEME.rule),
      left: thin(EXCEL_THEME.rule),
      bottom: thin(EXCEL_THEME.rule),
      right: thin(EXCEL_THEME.rule),
    };
    if (note) attachCellNote(valueCell, note);
    for (let c = 3; c <= LEFT; c++) {
      sheet.getCell(r, c).fill = fill(i % 2 === 0 ? WHITE : EXCEL_THEME.parchment);
      sheet.getCell(r, c).border = {
        top: thin(EXCEL_THEME.rule),
        left: thin(EXCEL_THEME.rule),
        bottom: thin(EXCEL_THEME.rule),
        right: thin(EXCEL_THEME.rule),
      };
    }
    sheet.getRow(r).height = 18;
    r++;
  });
  return r + 1;
}

/** Branded KPI strip — maroon accent + pale gold tiles. */
function addKpiHighlight(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  rows: Array<[string, string, string?]>,
) {
  return addExcelKpiTiles(sheet, startRow, rows, attachCellNote);
}

/** Product Overview — rich-text with maroon bold on key numbers / percentages. */
function overviewRichText(line: string): ExcelJS.CellValue {
  const highlightRe =
    /(\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:times|x)\b|\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi;
  const parts: ExcelJS.RichText[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = highlightRe.exec(line)) != null) {
    if (match.index > last) {
      parts.push({ text: line.slice(last, match.index), font: { size: 10, color: { argb: INK } } });
    }
    parts.push({
      text: match[0],
      font: { size: 10, bold: true, color: { argb: MAROON } },
    });
    last = match.index + match[0].length;
  }
  if (last < line.length) {
    parts.push({ text: line.slice(last), font: { size: 10, color: { argb: INK } } });
  }
  if (parts.length === 0) {
    return line;
  }
  return { richText: parts };
}

function addOverviewProse(sheet: ExcelJS.Worksheet, startRow: number, lines: string[]) {
  let r = startRow;
  for (const line of lines) {
    sheet.mergeCells(r, 1, r, LEFT);
    const cell = sheet.getCell(r, 1);
    cell.value = overviewRichText(line);
    cell.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
    cell.fill = fill(GOLD_PALE);
    cell.border = {
      top: thin(GOLD),
      left: thin(GOLD),
      bottom: thin(GOLD),
      right: thin(GOLD),
    };
    sheet.getRow(r).height = Math.max(20, Math.min(88, 12 + line.length / 7));
    r++;
  }
  return r + 1;
}

/** Description-only lines (structure/notional/coupon moved to Specifications). */
function descriptionLines(product: ProductRecord) {
  return buildDescriptionLines(product);
}

function specRows(product: ProductRecord): Array<[string, string]> {
  return buildSpecRows(product);
}

/** Payoff scenario table — Excel formulas + hover notes on product return. */
function addScenarioTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  scenarios: PayoffRowFlags[],
  startCol: number,
  formulaText: string,
) {
  let r = startRow;
  const headers = ["Final Fixing", "Underlying Performance", "Product Return", "XIRR"];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(r, startCol + i);
    cell.value = h;
    cell.fill = fill(EXCEL_THEME.maroonDeep);
    cell.font = { bold: true, size: 10, color: { argb: WHITE }, name: EXCEL_FONT };
    cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
    cell.border = excelGoldBox;
    attachCellNote(cell, PAYOFF_SCENARIO_FORMULA_GUIDE[i]?.description ?? "");
  });
  sheet.getRow(r).height = 26;
  r++;

  scenarios.forEach((row, i) => {
    const base = i % 2 === 0 ? WHITE : ROW_ALT;
    const excelRow = r;

    const fixingCell = sheet.getCell(excelRow, startCol);
    fixingCell.value = Math.round(row.finalFixing);
    fixingCell.numFmt = "#,##0";
    fixingCell.fill = fill(base);
    fixingCell.font = { size: 10, color: { argb: INK } };
    fixingCell.alignment = { vertical: "middle", horizontal: "left" };
    fixingCell.border = boxBorder;

    const fixingAddr = `${colLetter(startCol)}${excelRow}`;
    const perfCell = sheet.getCell(excelRow, startCol + 1);
    setFormulaCell(
      perfCell,
      `(${fixingAddr}-DESK_EntryLevel)/DESK_EntryLevel`,
      row.performance,
      `Underlying performance at this scenario = ${formatPercent(row.performance, 1)}`,
    );
    perfCell.numFmt = "0.0%";
    perfCell.fill = fill(base);
    perfCell.font = { size: 10, color: { argb: INK } };
    perfCell.alignment = { vertical: "middle", horizontal: "center" };
    perfCell.border = boxBorder;

    const returnCell = sheet.getCell(excelRow, startCol + 2);
    returnCell.value = row.maturityValue;
    returnCell.numFmt = "0.00%";
    returnCell.fill = fill(base);
    returnCell.font = { size: 10, color: { argb: INK } };
    returnCell.alignment = { vertical: "middle", horizontal: "center" };
    returnCell.border = boxBorder;
    attachCellNote(
      returnCell,
      row.isPivot || row.isCurrent
        ? `${payoffHoverTooltip(row.performance, row.maturityValue, row.finalFixing)}\n\nDesk formula:\n${formulaText.slice(0, 800)}${row.isPivot ? "\n\n◆ Plot kink / pivot row" : ""}${row.isCurrent ? "\n\n● Live market-move row" : ""}`
        : payoffHoverTooltip(row.performance, row.maturityValue, row.finalFixing),
    );

    const returnAddr = `${colLetter(startCol + 2)}${excelRow}`;
    const irrCell = sheet.getCell(excelRow, startCol + 3);
    setFormulaCell(
      irrCell,
      `IF(${returnAddr}>-1,(1+${returnAddr})^(365/DESK_TenorDays)-1,0)`,
      row.irr,
      `XIRR over remaining tenor (${formatPercent(row.irr, 2)} cached)`,
    );
    irrCell.numFmt = "0.00%";
    irrCell.fill = fill(base);
    irrCell.font = { size: 10, color: { argb: INK } };
    irrCell.alignment = { vertical: "middle", horizontal: "center" };
    irrCell.border = boxBorder;

    if (row.isCurrent) {
      for (let c = startCol; c < startCol + 4; c++) {
        sheet.getCell(excelRow, c).fill = fill("FFFFF3D6");
      }
    }

    sheet.getRow(excelRow).height = 17;
    r++;
  });
  return r + 1;
}

/** Embed payoff plot image + pointer to interactive curve sheet. */
function addPayoffPlot(
  wb: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  row: number,
  product: ProductRecord,
  startCol: number,
) {
  if (!product.formulaText) return row;
  const heading = addSection(sheet, row, "Payoff Plot", startCol, startCol + 3);
  const plotRow = heading;
  const png = renderPayoffCurvePng(product.formulaText, getIndexEntryLevel(product));
  if (!png) return plotRow + 1;

  const base64 = png.split(",")[1];
  if (!base64) return plotRow;

  const imageId = wb.addImage({ base64, extension: "png" });
  sheet.addImage(imageId, {
    tl: { col: startCol - 1, row: plotRow } as ExcelJS.Anchor,
    ext: { width: 520, height: 287 },
  });
  return plotRow + 16;
}

/** Full-width disclaimer footer — parchment panel under a gold rule. */
function addDisclaimer(sheet: ExcelJS.Worksheet, row: number) {
  const spacer = row + 1;
  sheet.getRow(spacer).height = 10;

  const labelRow = spacer + 1;
  sheet.mergeCells(labelRow, 1, labelRow, FULL);
  const label = sheet.getCell(labelRow, 1);
  label.value = "DISCLAIMER";
  label.fill = fill(EXCEL_THEME.parchment);
  label.font = { bold: true, size: 8, color: { argb: MAROON }, name: EXCEL_FONT };
  label.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  label.border = {
    top: { style: "medium", color: { argb: GOLD } },
    left: thin(EXCEL_THEME.rule),
    right: thin(EXCEL_THEME.rule),
  };
  sheet.getRow(labelRow).height = 16;

  const r = labelRow + 1;
  sheet.mergeCells(r, 1, r, FULL);
  const cell = sheet.getCell(r, 1);
  cell.value = SCREEN_EXPORT_DISCLAIMER;
  cell.fill = fill(EXCEL_THEME.parchment);
  cell.font = { italic: true, size: 8, color: { argb: MUTED }, name: EXCEL_FONT };
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
  cell.border = {
    left: thin(EXCEL_THEME.rule),
    right: thin(EXCEL_THEME.rule),
    bottom: thin(EXCEL_THEME.rule),
  };
  sheet.getRow(r).height = 62;
  return r + 1;
}

function baseColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns = [
    { width: 26 },
    { width: 18 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 20 },
    { width: 16 },
    { width: 12 },
  ];
}

async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  if (typeof document === "undefined") {
    throw new Error("Excel download is only available in the browser.");
  }
  wb.creator = "Primary SP Dashboard · Anand Rathi Wealth";
  wb.lastModifiedBy = "Primary SP Dashboard";
  wb.created = new Date();
  wb.modified = new Date();
  for (const sheet of wb.worksheets) {
    sheet.pageSetup = {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    };
    sheet.headerFooter = {
      oddFooter: "&LPrimary SP Dashboard · Anand Rathi Wealth&CPage &P of &N",
    };
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Observation dates grid — matches on-screen ObservationDatesTable. */
function addObservationTable(sheet: ExcelJS.Worksheet, startRow: number, rows: ObservationExportRow[]) {
  if (rows.length === 0) return startRow;
  let r = addSection(sheet, startRow, "Observation Dates");
  const headers = ["#", "Observation Date", "Underlying Level", "Performance vs Initial"];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(r, i + 1);
    cell.value = h;
    cell.fill = fill(EXCEL_THEME.maroonDeep);
    cell.font = { bold: true, size: 10, color: { argb: WHITE }, name: EXCEL_FONT };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = excelGoldBox;
  });
  sheet.getRow(r).height = 24;
  r++;

  rows.forEach((row, i) => {
    const base = i % 2 === 0 ? WHITE : ROW_ALT;
    row.forEach((value, ci) => {
      const cell = sheet.getCell(r, ci + 1);
      cell.value = value;
      cell.fill = fill(base);
      cell.font = { size: 10, color: { argb: INK } };
      cell.alignment = { vertical: "middle", horizontal: ci === 0 ? "center" : "left", indent: ci === 0 ? 0 : 1 };
      cell.border = boxBorder;
    });
    sheet.getRow(r).height = 17;
    r++;
  });
  return r + 1;
}

function buildPayoffWorkbookSheets(
  wb: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  product: ProductRecord,
  scenarios: PayoffRowFlags[],
  options: {
    marketMove: number;
    topRow: number;
    leftSections: Array<{ title: string; rows: Array<[string, string, string?]>; kpi?: boolean }>;
    debentures?: number;
    pricePerDebenture?: number;
    specRows?: Array<[string, string]>;
    observationRows?: ObservationExportRow[];
    valuationDate?: string;
    expired?: boolean;
  },
) {
  const formulaText = product.formulaText ?? "Z";
  const entryLevel = getIndexEntryLevel(product);
  const asOf = options.valuationDate ? parseExcelishDate(options.valuationDate) ?? new Date() : new Date();
  const tenorDays =
    resolvePayoffScenarioTenorDays(product, { asOf, expired: options.expired }) ?? 365;
  const paneStart = options.topRow;

  registerDeskExportNamedRanges(sheet, wb, {
    entryLevel,
    tenorDays,
    indexMove: options.marketMove,
  });

  addPayoffCurveSheet(wb, product.name, formulaText, entryLevel);

  let lr = paneStart;
  for (const section of options.leftSections) {
    lr = addSection(sheet, lr, section.title);
    lr = section.kpi
      ? addKpiHighlight(sheet, lr, section.rows)
      : addKeyValues(sheet, lr, section.rows);
  }
  lr = addSection(sheet, lr, "Product Specifications");
  lr = addPlainKeyValues(sheet, lr, options.specRows ?? specRows(product));
  if (options.observationRows?.length) {
    lr = addObservationTable(sheet, lr, options.observationRows);
  }
  lr = addSection(sheet, lr, "Product Overview");
  lr = addOverviewProse(sheet, lr, descriptionLines(product));
  lr = addPlainKeyValues(sheet, lr, buildOverviewFooterRows(product));

  let rr = addSection(sheet, paneStart, "Payoff Scenarios", RIGHT_START, RIGHT_START + 3);
  rr = addScenarioTable(sheet, rr, scenarios, RIGHT_START, formulaText);
  rr = addPayoffPlot(wb, sheet, rr, product, RIGHT_START);

  return Math.max(lr, rr);
}

/* ── Valuation screen (no plot) ───────────────────────────────────────── */
export async function downloadValuationScreenExcel(options: {
  product: ProductRecord;
  valuation: ValuationResult | null;
  inputs: {
    valuationDate: string;
    niftyLevel: string;
    sensexLevel: string;
    debentures: string;
    isin: string;
    productCode: string;
  };
  outputSheet?: Array<[string, string]>;
  specRows?: Array<[string, string]>;
  observationRows?: ObservationExportRow[];
}) {
  const { product, valuation, inputs, outputSheet, specRows: specRowsOverride, observationRows } = options;
  const wb = await createWorkbook();
  const sheet = wb.addWorksheet("Valuation", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
  });
  baseColumns(sheet);
  const logo = await fetchBrandLogoBase64();
  const logoRows = logo ? embedBrandLogo(wb, sheet, logo) : 0;

  let r = addBanner(sheet, "Valuation Output", `${product.name} · ${product.isin ?? "—"} · ${screenExportStamp()}`, logoRows);

  r = addSection(sheet, r, "Desk Inputs");
  r = addKeyValues(sheet, r, [
    ["Valuation Date", inputs.valuationDate || "—"],
    ["Val. Date Nifty Level", inputs.niftyLevel || "—"],
    ["Val. Date Sensex Level", inputs.sensexLevel || "—"],
    ["No. of Debentures", inputs.debentures || "—"],
  ]);

  if (valuation) {
    const labels = valuationMetricLabels(
      getProductLifecycleStatus(product) === "expired",
      inputs.valuationDate,
      product,
    );
    r = addSection(sheet, r, "Valuation Summary");
    r = addKpiHighlight(sheet, r, [
      [labels.value, formatExcelProductUnitValue(valuation.productValue)],
      [labels.coupon, formatPercent(valuation.absReturn, 1)],
      [labels.couponFormed, formatFormulaReturn(valuation.formulaReturn)],
      [labels.productIrr, formatPercent(valuation.productIrr, 2)],
      ["Total Amount", formatExcelCurrency(valuation.totalAmount, false)],
      ["Underlying Performance", formatPercent(valuation.z, 1)],
    ]);
  }

  if (outputSheet?.length) {
    r = addSection(sheet, r, "Output Sheet");
    r = addKeyValues(sheet, r, outputSheet);
  }

  r = addSection(sheet, r, "Product Specifications");
  r = addPlainKeyValues(sheet, r, specRowsOverride ?? specRows(product));

  if (observationRows?.length) {
    r = addObservationTable(sheet, r, observationRows);
  }

  r = addSection(sheet, r, "Product Overview");
  r = addOverviewProse(sheet, r, descriptionLines(product));
  r = addPlainKeyValues(sheet, r, buildOverviewFooterRows(product));

  addDisclaimer(sheet, r);
  await saveWorkbook(
    wb,
    buildDeskExportFilename({
      screen: "Valuation",
      isin: product.isin,
      productName: product.name,
      extension: "xlsx",
    }),
  );
}

/* ── Payoff screen (with plot) ────────────────────────────────────────── */
export async function downloadPayoffScreenExcel(options: {
  product: ProductRecord;
  scenarios: PayoffRowFlags[];
  marketMove: number;
  liveLevel: number;
  inputs: {
    debentures: string;
    pricePerDebenture: string;
    purchaseDate: string;
  };
  kpis: Array<[string, string]>;
  specRows?: Array<[string, string]>;
  payoffFootnotes?: Array<[string, string]>;
  observationRows?: ObservationExportRow[];
  valuationDate?: string;
  expired?: boolean;
}) {
  const { product, scenarios, kpis, marketMove, inputs, specRows: specRowsOverride, payoffFootnotes, observationRows, valuationDate, expired } =
    options;
  const wb = await createWorkbook();
  const sheet = wb.addWorksheet("Payoff", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
  });
  baseColumns(sheet);
  const logo = await fetchBrandLogoBase64();
  const logoRows = logo ? embedBrandLogo(wb, sheet, logo) : 0;

  const top = addBanner(sheet, "Payoff Output", `${product.name} · ${product.isin ?? "—"} · ${screenExportStamp()}`, logoRows);

  const leftSections: Array<{ title: string; rows: Array<[string, string, string?]>; kpi?: boolean }> = [
    {
      title: "Desk Inputs",
      rows: [
        ["Debentures", inputs.debentures || "—"],
        ["Price / Debenture", inputs.pricePerDebenture || "—"],
        ["Start Date", inputs.purchaseDate || "—"],
      ],
    },
    { title: "Live KPIs", rows: kpis.map(([label, value]) => [label, value]), kpi: true },
  ];
  if (payoffFootnotes?.length) {
    leftSections.push({ title: "Payoff Notes", rows: payoffFootnotes });
  }

  const endRow = buildPayoffWorkbookSheets(wb, sheet, product, scenarios, {
    marketMove,
    topRow: top,
    leftSections,
    debentures: Number(inputs.debentures) || undefined,
    pricePerDebenture: Number(inputs.pricePerDebenture) || getDebenturePrice(product),
    specRows: specRowsOverride,
    observationRows,
    valuationDate,
    expired,
  });

  addDisclaimer(sheet, endRow);
  await saveWorkbook(
    wb,
    buildDeskExportFilename({
      screen: "Payoff",
      isin: product.isin,
      productName: product.name,
      extension: "xlsx",
    }),
  );
}

/* ── Product Details screen (with plot) ───────────────────────────────── */
export async function downloadProductDetailsScreenExcel(options: {
  product: ProductRecord;
  valuation: ValuationResult | null;
  scenarios: PayoffRowFlags[];
  marketMove: number;
  canValue: boolean;
  inputs: {
    valuationDate: string;
    debentures: string;
    niftyLevel: string;
    sensexLevel: string;
  };
  specRows?: Array<[string, string]>;
  lifecycleRows?: Array<[string, string]>;
  observationRows?: ObservationExportRow[];
  expired?: boolean;
}) {
  const { product, valuation, scenarios, canValue, inputs, marketMove, specRows: specRowsOverride, lifecycleRows, observationRows, expired } =
    options;
  const wb = await createWorkbook();
  const sheet = wb.addWorksheet("Product Details", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
  });
  baseColumns(sheet);
  const logo = await fetchBrandLogoBase64();
  const logoRows = logo ? embedBrandLogo(wb, sheet, logo) : 0;

  const top = addBanner(sheet, "Product Details Output", `${product.name} · ${product.isin ?? "—"} · ${screenExportStamp()}`, logoRows);

  const leftSections: Array<{ title: string; rows: Array<[string, string, string?]>; kpi?: boolean }> = [
    {
      title: "Desk Inputs",
      rows: [
        ["Valuation Date", inputs.valuationDate || "—"],
        ["Val. Date Nifty Level", inputs.niftyLevel || "—"],
        ["Val. Date Sensex Level", inputs.sensexLevel || "—"],
        ["No. of Debentures", inputs.debentures || "—"],
      ],
    },
  ];

  if (canValue && valuation) {
    const labels = valuationMetricLabels(
      getProductLifecycleStatus(product) === "expired",
      inputs.valuationDate,
      product,
    );
    const formulaNote = product.formulaText
      ? `Desk valuation engine\nNifty ${inputs.niftyLevel} · Sensex ${inputs.sensexLevel}\n\nWorking formula:\n${product.formulaText.slice(0, 1000)}`
      : "Desk valuation engine";
    leftSections.push({
      title: "Valuation Summary",
      rows: [
        [labels.value, formatExcelProductUnitValue(valuation.productValue), formulaNote],
        [labels.coupon, formatPercent(valuation.absReturn, 1), "Present value ÷ investment − 1"],
        [labels.couponFormed, formatFormulaReturn(valuation.formulaReturn), "Payoff formula on projected path"],
        [labels.productIrr, formatPercent(valuation.productIrr, 2), "(1 + Absolute Return)^(365/days) − 1"],
        ["Total Amount", formatExcelCurrency(valuation.totalAmount, false), "Product value × debenture count"],
        ["Underlying Performance", formatPercent(valuation.z, 1), "Index move vs entry (Z)"],
      ],
      kpi: true,
    });
  }

  if (lifecycleRows?.length) {
    leftSections.push({
      title: "Performance & Lifecycle",
      rows: lifecycleRows,
    });
  }

  const endRow = buildPayoffWorkbookSheets(wb, sheet, product, scenarios, {
    marketMove,
    topRow: top,
    leftSections,
    debentures: Number(inputs.debentures) || undefined,
    pricePerDebenture: getDebenturePrice(product),
    specRows: specRowsOverride,
    observationRows,
    valuationDate: inputs.valuationDate,
    expired,
  });

  addDisclaimer(sheet, endRow);
  await saveWorkbook(
    wb,
    buildDeskExportFilename({
      screen: "Details",
      isin: product.isin,
      productName: product.name,
      extension: "xlsx",
    }),
  );
}
