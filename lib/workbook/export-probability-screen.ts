/**
 * Probability desk screen Excel / PDF — Primary SP Dashboard gold-standard branding.
 */
import type ExcelJS from "exceljs";
import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

import { createWorkbook } from "@/lib/workbook/excel-runtime";
import { embedBrandLogo, fetchBrandLogoBase64 } from "@/lib/workbook/export-branding";
import { buildDeskExportFilename } from "@/lib/workbook/export-filename";
import {
  EXCEL_FONT,
  EXCEL_THEME,
  PDF_THEME,
  addExcelKpiTiles,
  addExcelMasthead,
  addExcelSection,
  excelFill,
  excelHairline,
  excelMedium,
  excelThin,
} from "@/lib/workbook/export-theme";
import { SCREEN_EXPORT_DISCLAIMER, screenExportStamp } from "@/lib/workbook/export-screen-shared";
import { loadAutoTable, loadJsPdf } from "@/lib/workbook/pdf-runtime";
import { pdfSafeText } from "@/lib/workbook/pdf-format";
import { buildProductSpecCards } from "@/lib/product-specifications";
import type { ProbabilityRunResult } from "@/lib/probability/engine";
import type { ProductRecord } from "@/lib/types";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";
import { formatNumber, formatPercent } from "@/lib/utils";

export type ProbabilityScreenExportInput = {
  product: ProductRecord;
  surface: "summary" | "initial" | "current";
  checkingDate: string;
  asOfLastObservation?: boolean;
  initial?: ProbabilityRunResult | null;
  current?: ProbabilityRunResult | null;
  targetPercent?: number | null;
  requiredPercent?: number | null;
  daysLeft?: number | null;
  niftyLevel?: number | null;
  sensexLevel?: number | null;
};

type JsPdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };
type AutoTableFn = (doc: jsPDF, options: UserOptions) => void;

const MARGIN = 14;
const PAGE_BOTTOM = 278;

function surfaceTitle(surface: ProbabilityScreenExportInput["surface"]): string {
  switch (surface) {
    case "summary":
      return "Probability";
    case "initial":
      return "Initial Probability";
    case "current":
      return "Current Probability";
    default: {
      const _exhaustive: never = surface;
      return _exhaustive;
    }
  }
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatPercent(value);
}

function num(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatNumber(value, digits);
}

function scheduleDateLabel(value: Date | string | null | undefined): string {
  if (value == null) return "—";
  if (typeof value === "string") {
    const parsed = parseExcelishDate(value);
    return parsed ? formatDisplayDate(parsed) : value;
  }
  return formatDisplayDate(value);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function styleMetaRow(sheet: ExcelJS.Worksheet, row: number, label: string, value: string) {
  const labelCell = sheet.getCell(row, 1);
  const valueCell = sheet.getCell(row, 2);
  labelCell.value = label;
  valueCell.value = value;
  labelCell.font = { bold: true, size: 10, color: { argb: EXCEL_THEME.inkSoft }, name: EXCEL_FONT };
  valueCell.font = { bold: true, size: 11, color: { argb: EXCEL_THEME.maroonDeep }, name: EXCEL_FONT };
  labelCell.fill = excelFill(EXCEL_THEME.label);
  valueCell.fill = excelFill(EXCEL_THEME.ivory);
  labelCell.border = {
    top: excelHairline(EXCEL_THEME.rule),
    bottom: excelHairline(EXCEL_THEME.rule),
    left: excelMedium(EXCEL_THEME.maroon),
    right: excelThin(EXCEL_THEME.border),
  };
  valueCell.border = {
    top: excelHairline(EXCEL_THEME.rule),
    bottom: excelHairline(EXCEL_THEME.rule),
    left: excelThin(EXCEL_THEME.border),
    right: excelThin(EXCEL_THEME.gold),
  };
}

function addExcelDisclaimerBlock(sheet: ExcelJS.Worksheet, row: number, toCol = 8): number {
  sheet.mergeCells(row, 1, row, toCol);
  const title = sheet.getCell(row, 1);
  title.value = "  DISCLAIMER";
  title.fill = excelFill(EXCEL_THEME.parchment);
  title.font = { bold: true, size: 9, color: { argb: EXCEL_THEME.maroon }, name: EXCEL_FONT };
  title.border = { top: excelMedium(EXCEL_THEME.gold) };
  sheet.getRow(row).height = 18;

  const bodyRow = row + 1;
  sheet.mergeCells(bodyRow, 1, bodyRow + 1, toCol);
  const body = sheet.getCell(bodyRow, 1);
  body.value = SCREEN_EXPORT_DISCLAIMER;
  body.fill = excelFill(EXCEL_THEME.parchment);
  body.font = { italic: true, size: 8, color: { argb: EXCEL_THEME.muted }, name: EXCEL_FONT };
  body.alignment = { wrapText: true, vertical: "top" };
  sheet.getRow(bodyRow).height = 36;
  sheet.getRow(bodyRow + 1).height = 8;

  const stampRow = bodyRow + 2;
  sheet.mergeCells(stampRow, 1, stampRow, toCol);
  const stamp = sheet.getCell(stampRow, 1);
  stamp.value = screenExportStamp();
  stamp.font = { size: 8, color: { argb: EXCEL_THEME.muted }, name: EXCEL_FONT };
  return stampRow + 1;
}

function writeScheduleSheet(
  wb: ExcelJS.Workbook,
  title: string,
  result: ProbabilityRunResult | null | undefined,
  daysLabel: string,
  logo: string | null,
  product: ProductRecord,
) {
  if (!result) return;
  const sheet = wb.addWorksheet(title.slice(0, 31));
  let rowOffset = 0;
  if (logo) rowOffset = embedBrandLogo(wb, sheet, logo);
  let row = addExcelMasthead(sheet, {
    title,
    subtitle: `${product.name} · ${product.isin ?? "—"}`,
    eyebrow: "Anand Rathi Wealth · Dynamic Probability Calculator",
    fromCol: 1,
    toCol: 8,
    rowOffset,
  });
  row = addExcelSection(sheet, row, "Observation Schedule", 1, 8);

  const present = result.schedule.filter((s) => s.date);
  sheet.getCell(row, 1).value = "Observation";
  sheet.getCell(row, 1).font = { bold: true, color: { argb: "FFFFFFFF" }, name: EXCEL_FONT };
  sheet.getCell(row, 1).fill = excelFill(EXCEL_THEME.maroon);
  present.forEach((_s, i) => {
    const cell = sheet.getCell(row, i + 2);
    cell.value = i + 1;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: EXCEL_FONT };
    cell.fill = excelFill(EXCEL_THEME.maroon);
  });
  row += 1;
  sheet.getCell(row, 1).value = "Dates";
  present.forEach((s, i) => {
    sheet.getCell(row, i + 2).value = scheduleDateLabel(s.date);
  });
  row += 1;
  sheet.getCell(row, 1).value = daysLabel;
  present.forEach((s, i) => {
    sheet.getCell(row, i + 2).value = s.daysFromBase;
  });
  sheet.columns = [{ width: 28 }, ...present.map(() => ({ width: 14 }))];
}

function writePathsSheet(
  wb: ExcelJS.Workbook,
  title: string,
  result: ProbabilityRunResult | null | undefined,
  filter: "all" | "included" | "excluded" = "all",
  logo?: string | null,
  product?: ProductRecord | null,
) {
  if (!result || result.paths.length === 0) return;
  const sheet = wb.addWorksheet(title.slice(0, 31));
  let headerRow = 1;
  if (logo && product) {
    const rowOffset = embedBrandLogo(wb, sheet, logo);
    headerRow = addExcelMasthead(sheet, {
      title,
      subtitle: `${product.name} · ${product.isin ?? "—"} · As of ${result.lastIndexDate ?? "—"}`,
      eyebrow: "Anand Rathi Wealth · Dynamic Probability Calculator",
      fromCol: 1,
      toCol: 10,
      rowOffset,
    });
    headerRow = addExcelSection(sheet, headerRow, "Historical Path Backtest", 1, 10);
  }

  const presentIdx = result.schedule.map((s, i) => (s.date ? i : -1)).filter((i) => i >= 0);
  const headers = [
    "Start",
    "Underlying Closing Level",
    ...(result.mode === "initial" ? ["Start Level"] : []),
    ...presentIdx.map((_i, display) => `Average Date ${display + 1}`),
    ...presentIdx.map((_i, display) => `Average Level ${display + 1}`),
    "Average Underlying Level",
    "Underlying Performance",
    "Path Taken",
  ];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: EXCEL_FONT };
    cell.fill = excelFill(EXCEL_THEME.maroon);
  });

  const filtered = result.paths.filter((p) => {
    if (filter === "included") return p.pathIncluded;
    if (filter === "excluded") return !p.pathIncluded;
    return true;
  });

  const maxRows = Math.min(filtered.length, 20_000);
  for (let r = 0; r < maxRows; r++) {
    const path = filtered[r]!;
    const values: Array<string | number> = [path.pathStartDate, path.underlyingClosingLevel];
    if (result.mode === "initial") {
      values.push(path.adjustedStartLevel ?? "—");
    }
    for (const i of presentIdx) values.push(path.observationDates[i] ?? "—");
    for (const i of presentIdx) values.push(path.observationLevels[i] ?? "—");
    values.push(path.averageObservationLevel ?? "—");
    values.push(path.underlyingPerformance ?? "—");
    values.push(path.pathIncluded ? "Yes" : "No");
    values.forEach((v, c) => {
      const cell = sheet.getCell(headerRow + 1 + r, c + 1);
      cell.value = v;
      if (r % 2 === 1) cell.fill = excelFill(EXCEL_THEME.ivory);
    });
  }
  sheet.columns = headers.map(() => ({ width: 16 }));
}

/** Dedicated path workbook — Included / Excluded / All sheets. */
export async function downloadProbabilityPathsExcel(input: {
  product: ProductRecord;
  result: ProbabilityRunResult;
  filter?: "all" | "included" | "excluded";
}) {
  const logo = await fetchBrandLogoBase64();
  const wb = await createWorkbook();
  wb.creator = "Dynamic Probability Calculator · Anand Rathi Wealth";
  const filter = input.filter ?? "included";
  const modeLabel = input.result.mode === "initial" ? "Initial" : "Current";
  writePathsSheet(wb, `${modeLabel} Paths`, input.result, filter, logo, input.product);
  if (filter === "all") {
    writePathsSheet(wb, "Included Only", input.result, "included", logo, input.product);
    writePathsSheet(wb, "Excluded Only", input.result, "excluded", logo, input.product);
  }
  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    buildDeskExportFilename({
      screen: `${modeLabel}-Paths`,
      productName: input.product.name,
      isin: input.product.isin,
      extension: "xlsx",
    }),
  );
}

export async function downloadProbabilityScreenExcel(input: ProbabilityScreenExportInput) {
  const logo = await fetchBrandLogoBase64();
  const wb = await createWorkbook();
  wb.creator = "Dynamic Probability Calculator · Anand Rathi Wealth";

  const sheet = wb.addWorksheet("Overview");
  const title = surfaceTitle(input.surface);
  let rowOffset = 0;
  if (logo) {
    rowOffset = embedBrandLogo(wb, sheet, logo);
  }

  let row = addExcelMasthead(sheet, {
    title,
    subtitle: `${input.product.name} · ${input.product.isin ?? "—"}`,
    eyebrow: "Anand Rathi Wealth · Dynamic Probability Calculator",
    fromCol: 1,
    toCol: 8,
    rowOffset,
  });

  row = addExcelSection(sheet, row, "Probability Results", 1, 8);
  row = addExcelKpiTiles(sheet, row, [
    ["Initial Probability", pct(input.initial?.probability)],
    ["Current Probability", pct(input.current?.probability)],
    ["Target Underlying", pct(input.targetPercent)],
    ["Required Underlying", pct(input.requiredPercent)],
    ["Days Left", num(input.daysLeft, 0)],
  ]);

  row = addExcelSection(sheet, row, "Desk Inputs", 1, 8);
  const meta: Array<[string, string]> = [
    ["Checking Date", input.checkingDate],
    ["As of Last Observation", input.asOfLastObservation ? "Yes" : "No"],
    ["Nifty Level", num(input.niftyLevel)],
    ["Sensex Level", num(input.sensexLevel)],
    ["Paths Taken · Initial", num(input.initial?.includedCount, 0)],
    ["Successful Paths · Initial", num(input.initial?.successCount, 0)],
    ["Paths Taken · Current", num(input.current?.includedCount, 0)],
    ["Successful Paths · Current", num(input.current?.successCount, 0)],
    ["Index As Of · Initial", input.initial?.lastIndexDate ?? "—"],
    ["Index As Of · Current", input.current?.lastIndexDate ?? "—"],
  ];
  for (const [label, value] of meta) {
    styleMetaRow(sheet, row, label, value);
    row += 1;
  }

  row += 1;
  row = addExcelSection(sheet, row, "Product Specifications", 1, 8);
  for (const card of buildProductSpecCards(input.product)) {
    styleMetaRow(sheet, row, card.label, String(card.value));
    row += 1;
  }

  row += 1;
  addExcelDisclaimerBlock(sheet, row, 8);
  sheet.columns = [{ width: 36 }, { width: 28 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];

  writeScheduleSheet(wb, "Initial Schedule", input.initial, "Days from Phase Start", logo, input.product);
  writeScheduleSheet(wb, "Current Schedule", input.current, "Days from Valuation Date", logo, input.product);
  if ((input.initial?.paths?.length ?? 0) > 0) {
    writePathsSheet(wb, "Initial Paths", input.initial, "included", logo, input.product);
  }
  if ((input.current?.paths?.length ?? 0) > 0) {
    writePathsSheet(wb, "Current Paths", input.current, "included", logo, input.product);
  }

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    buildDeskExportFilename({
      screen: title,
      productName: input.product.name,
      isin: input.product.isin,
      extension: "xlsx",
    }),
  );
}

/** Primary-identical PDF chrome for probability screens. */
class ProbabilityPdfBuilder {
  private readonly doc: JsPdfWithAutoTable;
  private readonly autoTable: AutoTableFn;
  private y = MARGIN;
  private readonly contentWidth: number;

  constructor(doc: jsPDF, autoTable: AutoTableFn) {
    this.doc = doc as JsPdfWithAutoTable;
    this.autoTable = autoTable;
    this.contentWidth = doc.internal.pageSize.getWidth() - MARGIN * 2;
  }

  private ensureSpace(mm: number) {
    if (this.y + mm > PAGE_BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  async addLogo() {
    const logo = await fetchBrandLogoBase64();
    const pageW = this.doc.internal.pageSize.getWidth();
    this.doc.setFillColor(...PDF_THEME.parchment);
    this.doc.rect(0, 0, pageW, 18, "F");
    this.doc.setDrawColor(...PDF_THEME.gold);
    this.doc.setLineWidth(0.6);
    this.doc.line(0, 18, pageW, 18);
    if (logo) {
      try {
        this.doc.addImage(`data:image/png;base64,${logo}`, "PNG", MARGIN, 4, 46, 10);
      } catch {
        /* optional */
      }
    }
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(6.5);
    this.doc.setTextColor(...PDF_THEME.muted);
    this.doc.text("Dynamic Probability Calculator", pageW - MARGIN, 7.5, { align: "right" });
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...PDF_THEME.maroon);
    this.doc.text(screenExportStamp(), pageW - MARGIN, 12.5, { align: "right" });
    this.y = 22;
  }

  addBanner(title: string, subtitle: string) {
    this.ensureSpace(34);
    const w = this.contentWidth;
    this.doc.setFillColor(...PDF_THEME.gold);
    this.doc.rect(MARGIN, this.y, w, 1.4, "F");
    this.y += 1.4;
    this.doc.setFillColor(...PDF_THEME.maroonDeep);
    this.doc.rect(MARGIN, this.y, w, 13, "F");
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(15);
    this.doc.text(title, MARGIN + 4.5, this.y + 8.5);
    this.y += 13;
    this.doc.setFillColor(...PDF_THEME.gold);
    this.doc.rect(MARGIN, this.y, w, 9, "F");
    this.doc.setTextColor(...PDF_THEME.ink);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8);
    const subLines = this.doc.splitTextToSize(subtitle, w - 9) as string[];
    this.doc.text(subLines, MARGIN + 4.5, this.y + 5.8);
    this.y += 9 + Math.max(0, (subLines.length - 1) * 3.2);
    this.doc.setFillColor(...PDF_THEME.parchment);
    this.doc.rect(MARGIN, this.y, w, 6, "F");
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(6.5);
    this.doc.setTextColor(...PDF_THEME.muted);
    this.doc.text("Anand Rathi Wealth  ·  Confidential desk report", MARGIN + 4.5, this.y + 4);
    this.y += 8;
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  addProductHero(product: ProductRecord) {
    this.ensureSpace(20);
    const w = this.contentWidth;
    this.doc.setFillColor(...PDF_THEME.ivory);
    this.doc.roundedRect(MARGIN, this.y, w, 16, 1.4, 1.4, "F");
    this.doc.setDrawColor(...PDF_THEME.gold);
    this.doc.setLineWidth(0.35);
    this.doc.roundedRect(MARGIN, this.y, w, 16, 1.4, 1.4, "S");
    this.doc.setFillColor(...PDF_THEME.maroon);
    this.doc.rect(MARGIN, this.y, 1.6, 16, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(...PDF_THEME.maroonDeep);
    const nameLines = this.doc.splitTextToSize(pdfSafeText(product.name), w - 10) as string[];
    this.doc.text(nameLines.slice(0, 2), MARGIN + 5, this.y + 5.5);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...PDF_THEME.muted);
    const meta = [product.isin ? `ISIN ${product.isin}` : null, product.underlying ? `Underlying ${product.underlying}` : null]
      .filter(Boolean)
      .join("   ·   ");
    this.doc.text(this.doc.splitTextToSize(pdfSafeText(meta), w - 10), MARGIN + 5, this.y + 12);
    this.y += 18;
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  addSection(title: string) {
    this.ensureSpace(12);
    this.doc.setFillColor(...PDF_THEME.goldSoft);
    this.doc.roundedRect(MARGIN, this.y, this.contentWidth, 8, 1.1, 1.1, "F");
    this.doc.setFillColor(...PDF_THEME.maroon);
    this.doc.rect(MARGIN, this.y, 1.8, 8, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...PDF_THEME.maroon);
    this.doc.text(title.toUpperCase(), MARGIN + 4.5, this.y + 5.2);
    this.y += 9.5;
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  addKpiHighlightTable(rows: Array<[string, string]>) {
    if (rows.length === 0) return;
    const colGap = 2.5;
    const colW = (this.contentWidth - colGap) / 2;
    const cellH = 12;
    const rowGap = 2.4;
    let yCursor = this.y;
    for (let i = 0; i < rows.length; i += 2) {
      const left = rows[i]!;
      const right = rows[i + 1];
      const solo = right == null;
      this.ensureSpace(cellH + rowGap + 2);
      const drawCard = (label: string, value: string, x: number, w: number) => {
        this.doc.setFillColor(...PDF_THEME.goldPale);
        this.doc.roundedRect(x, yCursor, w, cellH, 1.2, 1.2, "F");
        this.doc.setDrawColor(...PDF_THEME.gold);
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(x, yCursor, w, cellH, 1.2, 1.2, "S");
        this.doc.setFillColor(...PDF_THEME.maroon);
        this.doc.rect(x, yCursor, 1.5, cellH, "F");
        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(6);
        this.doc.setTextColor(...PDF_THEME.muted);
        this.doc.text(pdfSafeText(label).toUpperCase(), x + 4, yCursor + 4.4);
        this.doc.setFontSize(11);
        this.doc.setTextColor(...PDF_THEME.maroonDeep);
        this.doc.text(pdfSafeText(value), x + 4, yCursor + 9.2);
      };
      if (solo) drawCard(left[0], left[1], MARGIN, this.contentWidth);
      else {
        drawCard(left[0], left[1], MARGIN, colW);
        drawCard(right[0], right[1], MARGIN + colW + colGap, colW);
      }
      yCursor += cellH + rowGap;
    }
    this.y = yCursor;
    this.doc.setTextColor(...PDF_THEME.ink);
  }

  addKeyValueTable(rows: Array<[string, string]>) {
    if (rows.length === 0) return;
    const labelWidth = 52;
    const valueWidth = this.contentWidth - labelWidth;
    this.autoTable(this.doc, {
      startY: this.y,
      tableWidth: this.contentWidth,
      margin: { left: MARGIN, right: MARGIN },
      body: rows.map(([label, value]) => [pdfSafeText(label), pdfSafeText(value)]),
      theme: "grid",
      styles: {
        fontSize: 7.2,
        cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
        textColor: PDF_THEME.ink,
        lineColor: [231, 225, 207],
        lineWidth: 0.1,
        valign: "middle",
      },
      columnStyles: {
        0: { fontStyle: "bold", fillColor: PDF_THEME.label, cellWidth: labelWidth },
        1: { cellWidth: valueWidth, fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: PDF_THEME.ivory },
    });
    this.y = (this.doc.lastAutoTable?.finalY ?? this.y) + 1.5;
  }

  addDisclaimer() {
    this.ensureSpace(28);
    const w = this.contentWidth;
    this.doc.setFillColor(...PDF_THEME.parchment);
    this.doc.roundedRect(MARGIN, this.y, w, 24, 1.2, 1.2, "F");
    this.doc.setDrawColor(...PDF_THEME.gold);
    this.doc.setLineWidth(0.4);
    this.doc.line(MARGIN, this.y, MARGIN + w, this.y);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...PDF_THEME.maroon);
    this.doc.text("DISCLAIMER", MARGIN + 4, this.y + 5);
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(6.5);
    this.doc.setTextColor(...PDF_THEME.muted);
    const lines = this.doc.splitTextToSize(pdfSafeText(SCREEN_EXPORT_DISCLAIMER), w - 8) as string[];
    this.doc.text(lines, MARGIN + 4, this.y + 10);
    this.y += 26;
  }

  addFooters() {
    const pageW = this.doc.internal.pageSize.getWidth();
    const pageCount = this.doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(6.5);
      this.doc.setTextColor(...PDF_THEME.muted);
      this.doc.text("Anand Rathi Wealth", MARGIN, 287);
      this.doc.text(`Dynamic Probability Calculator · Confidential · ${i}/${pageCount}`, pageW - MARGIN, 287, {
        align: "right",
      });
    }
  }

  save(filename: string) {
    this.addFooters();
    this.doc.save(filename);
  }
}

export async function downloadProbabilityScreenPdf(input: ProbabilityScreenExportInput) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([loadJsPdf(), loadAutoTable()]);
  const doc: jsPDF = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const title = surfaceTitle(input.surface);
  const pdf = new ProbabilityPdfBuilder(doc, autoTableMod.default as AutoTableFn);

  doc.setProperties({
    title,
    subject: "Probability desk export",
    creator: "Dynamic Probability Calculator · Anand Rathi Wealth",
  });

  await pdf.addLogo();
  pdf.addBanner(title, `${input.product.name} · ${input.product.isin ?? "—"}`);
  pdf.addProductHero(input.product);

  pdf.addSection("Probability Results");
  pdf.addKpiHighlightTable([
    ["Initial Probability", pct(input.initial?.probability)],
    ["Current Probability", pct(input.current?.probability)],
    ["Target Underlying", pct(input.targetPercent)],
    ["Required Underlying", pct(input.requiredPercent)],
    ["Days Left", num(input.daysLeft, 0)],
  ]);

  pdf.addSection("Desk Inputs");
  pdf.addKeyValueTable([
    ["Checking Date", input.checkingDate],
    ["As of Last Observation", input.asOfLastObservation ? "Yes" : "No"],
    ["Nifty Level", num(input.niftyLevel)],
    ["Sensex Level", num(input.sensexLevel)],
    ["Paths Taken · Initial", num(input.initial?.includedCount, 0)],
    ["Successful Paths · Initial", num(input.initial?.successCount, 0)],
    ["Paths Taken · Current", num(input.current?.includedCount, 0)],
    ["Successful Paths · Current", num(input.current?.successCount, 0)],
  ]);

  pdf.addSection("Product Specifications");
  pdf.addKeyValueTable(buildProductSpecCards(input.product).map((c) => [c.label, String(c.value)]));

  pdf.addDisclaimer();
  pdf.save(
    buildDeskExportFilename({
      screen: title,
      productName: input.product.name,
      isin: input.product.isin,
      extension: "pdf",
    }),
  );
}
