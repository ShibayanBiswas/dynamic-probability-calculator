import type { jsPDF } from "jspdf";
import type { CellHookData, UserOptions } from "jspdf-autotable";

import type { ProductRecord } from "@/lib/types";
import type { ValuationResult } from "@/lib/workbook/valuation-engine";
import type { PayoffRowFlags } from "@/lib/workbook/payoff-pivots";
import { fetchBrandLogoBase64 } from "@/lib/workbook/export-branding";
import {
  buildDescriptionLines,
  buildOverviewFooterRows,
  buildSpecRowsForPdf,
  renderPayoffCurvePng,
  SCREEN_EXPORT_DISCLAIMER,
  screenExportStamp,
} from "@/lib/workbook/export-screen-shared";
import { loadAutoTable, loadJsPdf } from "@/lib/workbook/pdf-runtime";
import type { ObservationExportRow } from "@/lib/workbook/build-screen-export-payload";
import { formatPdfCurrency, formatPdfProductUnitValue, pdfSafeText } from "@/lib/workbook/pdf-format";
import { buildDeskExportFilename } from "@/lib/workbook/export-filename";
import { PDF_THEME } from "@/lib/workbook/export-theme";
import { getProductLifecycleStatus } from "@/lib/product-lifecycle";
import { getIndexEntryLevel } from "@/lib/product-utils";
import { valuationMetricLabels } from "@/lib/valuation-labels";
import {
  formatFormulaReturn,
  formatNumber,
  formatPercent,
} from "@/lib/utils";

const MAROON = PDF_THEME.maroon;
const MAROON_DEEP = PDF_THEME.maroonDeep;
const GOLD = PDF_THEME.gold;
const GOLD_SOFT = PDF_THEME.goldSoft;
const GOLD_PALE = PDF_THEME.goldPale;
const INK = PDF_THEME.ink;
const ROW_ALT = PDF_THEME.ivory;
const LABEL_FILL = PDF_THEME.label;
const CURRENT_ROW = PDF_THEME.currentRow;
const PIVOT_ROW = PDF_THEME.pivotRow;
const MUTED = PDF_THEME.muted;
const PARCHMENT = PDF_THEME.parchment;
const MARGIN = 14;
const PAGE_BOTTOM = 278;
const FOOTER_Y = 287;
const PROSE_LINE_HEIGHT = 3.7;
const PROSE_FONT_SIZE = 7.6;

type AutoTableFn = (doc: jsPDF, options: UserOptions) => void;

type JsPdfWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

class ScreenPdfBuilder {
  private readonly doc: JsPdfWithAutoTable;
  private readonly autoTable: AutoTableFn;
  private y = MARGIN;
  private readonly contentWidth: number;

  constructor(doc: jsPDF, autoTable: AutoTableFn) {
    this.doc = doc as JsPdfWithAutoTable;
    this.autoTable = autoTable;
    this.contentWidth = doc.internal.pageSize.getWidth() - MARGIN * 2;
  }

  setDocumentProperties(options: { title?: string; subject?: string }) {
    this.doc.setProperties({
      title: options.title ?? "Primary SP Dashboard",
      subject: options.subject ?? "Desk screen export",
      creator: "Primary SP Dashboard · Anand Rathi Wealth",
    });
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

    // Quiet parchment header band
    this.doc.setFillColor(...PARCHMENT);
    this.doc.rect(0, 0, pageW, 18, "F");
    this.doc.setDrawColor(...GOLD);
    this.doc.setLineWidth(0.6);
    this.doc.line(0, 18, pageW, 18);

    if (logo) {
      try {
        this.doc.addImage(`data:image/png;base64,${logo}`, "PNG", MARGIN, 4, 46, 10);
      } catch {
        // Logo optional
      }
    }
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(6.5);
    this.doc.setTextColor(...MUTED);
    this.doc.text("Primary Structured Products Desk", pageW - MARGIN, 7.5, { align: "right" });
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...MAROON);
    this.doc.text(screenExportStamp(), pageW - MARGIN, 12.5, { align: "right" });
    this.y = 22;
  }

  addBanner(title: string, subtitle: string) {
    this.ensureSpace(34);
    const w = this.contentWidth;

    // Gold hairline
    this.doc.setFillColor(...GOLD);
    this.doc.rect(MARGIN, this.y, w, 1.4, "F");
    this.y += 1.4;

    // Deep maroon title band
    this.doc.setFillColor(...MAROON_DEEP);
    this.doc.rect(MARGIN, this.y, w, 13, "F");
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(15);
    this.doc.text(title, MARGIN + 4.5, this.y + 8.5);
    this.y += 13;

    // Gold subtitle
    this.doc.setFillColor(...GOLD);
    this.doc.rect(MARGIN, this.y, w, 9, "F");
    this.doc.setTextColor(...INK);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8);
    const subLines = this.doc.splitTextToSize(subtitle, w - 9) as string[];
    this.doc.text(subLines, MARGIN + 4.5, this.y + 5.8);
    this.y += 9 + Math.max(0, (subLines.length - 1) * 3.2);

    // Soft eyebrow
    this.doc.setFillColor(...PARCHMENT);
    this.doc.rect(MARGIN, this.y, w, 6, "F");
    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(6.5);
    this.doc.setTextColor(...MUTED);
    this.doc.text("Anand Rathi Wealth  ·  Confidential desk report", MARGIN + 4.5, this.y + 4);
    this.y += 8;
    this.doc.setTextColor(...INK);
  }

  /** Product identity strip — elegant card with maroon accent. */
  addProductHero(product: ProductRecord) {
    this.ensureSpace(20);
    const w = this.contentWidth;
    const status = getProductLifecycleStatus(product);

    this.doc.setFillColor(...ROW_ALT);
    this.doc.roundedRect(MARGIN, this.y, w, 16, 1.4, 1.4, "F");
    this.doc.setDrawColor(...GOLD);
    this.doc.setLineWidth(0.35);
    this.doc.roundedRect(MARGIN, this.y, w, 16, 1.4, 1.4, "S");

    // Maroon left accent
    this.doc.setFillColor(...MAROON);
    this.doc.rect(MARGIN, this.y, 1.6, 16, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.setTextColor(...MAROON_DEEP);
    const nameLines = this.doc.splitTextToSize(pdfSafeText(product.name), w - 10) as string[];
    this.doc.text(nameLines.slice(0, 2), MARGIN + 5, this.y + 5.5);

    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...MUTED);
    const meta = [
      product.isin ? `ISIN ${product.isin}` : null,
      product.issuer ? `Issuer ${product.issuer}` : null,
      product.underlying ? `Underlying ${product.underlying}` : null,
      `Status ${status}`,
    ]
      .filter(Boolean)
      .join("   ·   ");
    this.doc.text(this.doc.splitTextToSize(pdfSafeText(meta), w - 10), MARGIN + 5, this.y + 12);

    this.y += 18;
    this.doc.setTextColor(...INK);
  }

  /** Highlight strip for headline KPIs — refined 2-column cards; odd last spans full width. */
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
        this.doc.setFillColor(...GOLD_PALE);
        this.doc.roundedRect(x, yCursor, w, cellH, 1.2, 1.2, "F");
        this.doc.setDrawColor(...GOLD);
        this.doc.setLineWidth(0.3);
        this.doc.roundedRect(x, yCursor, w, cellH, 1.2, 1.2, "S");

        // Maroon left rail
        this.doc.setFillColor(...MAROON);
        this.doc.rect(x, yCursor, 1.5, cellH, "F");

        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(6);
        this.doc.setTextColor(...MUTED);
        this.doc.text(pdfSafeText(label).toUpperCase(), x + 4, yCursor + 4.4);

        this.doc.setFont("helvetica", "bold");
        this.doc.setFontSize(11);
        this.doc.setTextColor(...MAROON_DEEP);
        this.doc.text(pdfSafeText(value), x + 4, yCursor + 9.2);
      };

      if (solo) {
        drawCard(left[0], left[1], MARGIN, this.contentWidth);
      } else {
        drawCard(left[0], left[1], MARGIN, colW);
        drawCard(right[0], right[1], MARGIN + colW + colGap, colW);
      }
      yCursor += cellH + rowGap;
    }

    this.y = yCursor;
    this.doc.setTextColor(...INK);
  }

  addSection(title: string) {
    this.ensureSpace(12);
    this.doc.setFillColor(...GOLD_SOFT);
    this.doc.roundedRect(MARGIN, this.y, this.contentWidth, 8, 1.1, 1.1, "F");
    this.doc.setDrawColor(...GOLD);
    this.doc.setLineWidth(0.2);
    this.doc.roundedRect(MARGIN, this.y, this.contentWidth, 8, 1.1, 1.1, "S");

    // Maroon left rail
    this.doc.setFillColor(...MAROON);
    this.doc.rect(MARGIN, this.y, 1.8, 8, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(9);
    this.doc.setTextColor(...MAROON);
    this.doc.text(title.toUpperCase(), MARGIN + 4.5, this.y + 5.2);
    this.y += 9.5;
    this.doc.setTextColor(...INK);
  }

  private syncYFromTable() {
    this.y = (this.doc.lastAutoTable?.finalY ?? this.y) + 1.5;
  }

  /** Side-by-side label/value rows — fixed column widths so label and value stay on one line. */
  addKeyValueTable(rows: Array<[string, string]>, options?: { compact?: boolean }) {
    if (rows.length === 0) return;
    const compact = options?.compact ?? true;
    const labelWidth = compact ? 52 : 62;
    const valueWidth = this.contentWidth - labelWidth;
    const body = rows.map(([label, value]) => [pdfSafeText(label), pdfSafeText(value)]);

    this.autoTable(this.doc, {
      startY: this.y,
      tableWidth: this.contentWidth,
      margin: { left: MARGIN, right: MARGIN },
      body,
      theme: "grid",
      rowPageBreak: "avoid",
      styles: {
        fontSize: compact ? 7.2 : 8,
        cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
        textColor: INK,
        lineColor: [231, 225, 207],
        lineWidth: 0.1,
        overflow: "linebreak",
        valign: "middle",
        minCellHeight: compact ? 5 : 6,
      },
      columnStyles: {
        0: { fontStyle: "bold", fillColor: LABEL_FILL, cellWidth: labelWidth },
        1: { cellWidth: valueWidth, fontStyle: "bold", halign: "left" },
      },
      alternateRowStyles: { fillColor: ROW_ALT },
    });
    this.syncYFromTable();
  }

  /** Four-column grid — fits ~2× the fields per page vs a single-column table. */
  addCompactGridTable(rows: Array<[string, string]>) {
    if (rows.length === 0) return;

    const observation = rows.find(([label]) => label === "Observation Dates");
    const coreRows = rows.filter(([label]) => label !== "Observation Dates");
    const mid = Math.ceil(coreRows.length / 2);
    const left = coreRows.slice(0, mid);
    const right = coreRows.slice(mid);
    const body: string[][] = [];

    const labelCol = 32;
    const valueCol = this.contentWidth / 2 - labelCol - 2;

    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      body.push([
        pdfSafeText(left[i]?.[0] ?? ""),
        pdfSafeText(left[i]?.[1] ?? ""),
        pdfSafeText(right[i]?.[0] ?? ""),
        pdfSafeText(right[i]?.[1] ?? ""),
      ]);
    }

    this.autoTable(this.doc, {
      startY: this.y,
      tableWidth: this.contentWidth,
      margin: { left: MARGIN, right: MARGIN },
      body,
      theme: "grid",
      rowPageBreak: "avoid",
      styles: {
        fontSize: 6.8,
        cellPadding: { top: 1.4, right: 1.6, bottom: 1.4, left: 1.6 },
        textColor: INK,
        lineColor: [231, 225, 207],
        lineWidth: 0.1,
        overflow: "linebreak",
        valign: "middle",
        minCellHeight: 4.8,
      },
      columnStyles: {
        0: { fontStyle: "bold", fillColor: LABEL_FILL, cellWidth: labelCol },
        1: { fontStyle: "bold", halign: "left", cellWidth: valueCol },
        2: { fontStyle: "bold", fillColor: LABEL_FILL, cellWidth: labelCol },
        3: { fontStyle: "bold", halign: "left", cellWidth: valueCol },
      },
      alternateRowStyles: { fillColor: ROW_ALT },
    });
    this.syncYFromTable();

    if (observation) {
      this.addKeyValueTable([observation], { compact: true });
    }
  }

  /**
   * Product Specifications — plain compact two-column grid (no value highlighting).
   */
  addSpecificationTable(rows: Array<[string, string]>) {
    if (rows.length === 0) return;

    const observation = rows.find(([label]) => label === "Observation Dates");
    const coreRows = rows.filter(([label]) => label !== "Observation Dates");
    const mid = Math.ceil(coreRows.length / 2);
    const left = coreRows.slice(0, mid);
    const right = coreRows.slice(mid);
    const body: string[][] = [];

    const labelCol = 30;
    const valueCol = this.contentWidth / 2 - labelCol - 1.5;

    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      body.push([
        pdfSafeText(left[i]?.[0] ?? ""),
        pdfSafeText(left[i]?.[1] ?? ""),
        pdfSafeText(right[i]?.[0] ?? ""),
        pdfSafeText(right[i]?.[1] ?? ""),
      ]);
    }

    this.autoTable(this.doc, {
      startY: this.y,
      tableWidth: this.contentWidth,
      margin: { left: MARGIN, right: MARGIN },
      body,
      theme: "plain",
      rowPageBreak: "avoid",
      styles: {
        fontSize: 6.5,
        cellPadding: { top: 1.0, right: 1.3, bottom: 1.0, left: 1.3 },
        textColor: INK,
        lineColor: [220, 215, 205],
        lineWidth: 0.1,
        overflow: "linebreak",
        valign: "middle",
        minCellHeight: 4.0,
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: labelCol, textColor: [60, 55, 50] },
        1: { halign: "left", cellWidth: valueCol },
        2: { fontStyle: "bold", cellWidth: labelCol, textColor: [60, 55, 50] },
        3: { halign: "left", cellWidth: valueCol },
      },
    });
    this.syncYFromTable();

    if (observation) {
      this.addPlainKeyValueTable([observation]);
    }
  }

  /** Label/value rows without tinted fills — used for Product Specifications tail rows. */
  private addPlainKeyValueTable(rows: Array<[string, string]>) {
    if (rows.length === 0) return;
    const labelWidth = 52;
    const valueWidth = this.contentWidth - labelWidth;
    const body = rows.map(([label, value]) => [pdfSafeText(label), pdfSafeText(value)]);

    this.autoTable(this.doc, {
      startY: this.y,
      tableWidth: this.contentWidth,
      margin: { left: MARGIN, right: MARGIN },
      body,
      theme: "plain",
      rowPageBreak: "avoid",
      styles: {
        fontSize: 6.8,
        cellPadding: { top: 1.5, right: 1.8, bottom: 1.5, left: 1.8 },
        textColor: INK,
        lineColor: [220, 215, 205],
        lineWidth: 0.12,
        overflow: "linebreak",
        valign: "middle",
        minCellHeight: 4.8,
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: labelWidth, textColor: [60, 55, 50] },
        1: { cellWidth: valueWidth, halign: "left" },
      },
    });
    this.syncYFromTable();
  }

  addProse(lines: string[]) {
    for (const line of lines) {
      this.addHighlightedProseLine(line);
    }
  }

  /** Product Overview — maroon bold on percentages, levels, and key multipliers. */
  private addHighlightedProseLine(line: string) {
    const maxX = MARGIN + this.contentWidth - 4;
    this.ensureSpace(PROSE_LINE_HEIGHT * 2 + 5);

    const blockStartY = this.y;
    let x = MARGIN + 3.5;
    let y = blockStartY + 2.8;
    const safe = pdfSafeText(line);
    const tokens = safe.split(/(\s+)/);
    const highlightRe =
      /(\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:times|x)\b|\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/gi;

    for (const token of tokens) {
      if (!token) continue;
      const isSpace = /^\s+$/.test(token);
      const isHighlight = !isSpace && highlightRe.test(token);
      highlightRe.lastIndex = 0;

      this.doc.setFont("helvetica", isHighlight ? "bold" : "normal");
      this.doc.setFontSize(isHighlight ? PROSE_FONT_SIZE + 0.3 : PROSE_FONT_SIZE);
      const width = this.doc.getTextWidth(token);
      if (x + width > maxX && x > MARGIN + 3.5) {
        x = MARGIN + 3.5;
        y += PROSE_LINE_HEIGHT;
        this.ensureSpace(PROSE_LINE_HEIGHT + 4);
      }
      this.doc.setTextColor(...(isHighlight ? MAROON : INK));
      this.doc.text(token, x, y);
      x += width;
    }

    this.doc.setDrawColor(...GOLD);
    this.doc.setLineWidth(0.15);
    this.doc.roundedRect(
      MARGIN + 0.2,
      blockStartY + 0.2,
      this.contentWidth - 0.4,
      y - blockStartY + 2.4,
      0.6,
      0.6,
      "S",
    );
    this.doc.setFillColor(...GOLD_PALE);
    this.doc.rect(MARGIN + 0.2, blockStartY + 0.2, 1.2, y - blockStartY + 2.4, "F");
    this.y = y + 2.6;
    this.doc.setTextColor(...INK);
  }

  addObservationTable(rows: ObservationExportRow[]) {
    if (rows.length === 0) return;
    this.autoTable(this.doc, {
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["#", "Observation Date", "Underlying Level", "Performance vs Initial"]],
      body: rows,
      theme: "grid",
      headStyles: {
        fillColor: MAROON_DEEP,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: "bold",
        fontSize: 7.5,
        lineColor: GOLD,
        lineWidth: 0.25,
      },
      styles: {
        fontSize: 7.2,
        cellPadding: 1.8,
        textColor: INK,
        fontStyle: "bold",
        lineColor: [231, 225, 207],
        lineWidth: 0.12,
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 10, fontStyle: "normal" },
        1: { halign: "left", fontStyle: "normal" },
        2: { halign: "left" },
        3: { halign: "center" },
      },
      alternateRowStyles: { fillColor: ROW_ALT },
    });
    this.y = (this.doc.lastAutoTable?.finalY ?? this.y) + 4;
  }

  addScenarioTable(scenarios: PayoffRowFlags[]) {
    if (scenarios.length === 0) return;
    this.autoTable(this.doc, {
      startY: this.y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Final Fixing", "Underlying Perf.", "Product Return", "XIRR"]],
      body: scenarios.map((row) => [
        formatNumber(row.finalFixing, 0),
        formatPercent(row.performance, 1),
        formatFormulaReturn(row.maturityValue, 2),
        formatPercent(row.irr, 2),
      ]),
      theme: "grid",
      headStyles: {
        fillColor: MAROON_DEEP,
        textColor: [255, 255, 255] as [number, number, number],
        fontStyle: "bold",
        fontSize: 8,
        lineColor: GOLD,
        lineWidth: 0.25,
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: INK,
        halign: "center",
        fontStyle: "bold",
        lineColor: [231, 225, 207],
        lineWidth: 0.12,
      },
      columnStyles: {
        0: { halign: "left", fontStyle: "normal" },
        2: { fontStyle: "bold", textColor: MAROON },
        3: { fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: ROW_ALT },
      didParseCell: (data: CellHookData) => {
        if (data.section !== "body") return;
        const row = scenarios[data.row.index];
        if (row?.isCurrent) {
          data.cell.styles.fillColor = CURRENT_ROW;
        } else if (row?.isPivot) {
          data.cell.styles.fillColor = PIVOT_ROW;
        }
      },
    });
    this.y = (this.doc.lastAutoTable?.finalY ?? this.y) + 4;
  }

  addPayoffPlot(product: ProductRecord) {
    if (!product.formulaText) return;
    const png = renderPayoffCurvePng(product.formulaText, getIndexEntryLevel(product));
    if (!png) return;
    this.addSection("Payoff Plot");
    const plotWidth = this.contentWidth;
    const plotHeight = plotWidth * 0.52;
    this.ensureSpace(plotHeight + 4);
    try {
      this.doc.addImage(png, "PNG", MARGIN, this.y, plotWidth, plotHeight);
      this.y += plotHeight + 4;
    } catch {
      // Skip plot if image embed fails
    }
  }

  addDisclaimer() {
    const lines = this.doc.splitTextToSize(SCREEN_EXPORT_DISCLAIMER, this.contentWidth - 12) as string[];
    const blockHeight = lines.length * 3.3 + 12;
    this.ensureSpace(blockHeight + 2);

    this.doc.setFillColor(...PARCHMENT);
    this.doc.setDrawColor(...GOLD);
    this.doc.setLineWidth(0.4);
    this.doc.roundedRect(MARGIN, this.y, this.contentWidth, blockHeight - 2, 1.2, 1.2, "FD");

    // Maroon top rule inside panel
    this.doc.setFillColor(...MAROON);
    this.doc.rect(MARGIN + 1, this.y + 1, this.contentWidth - 2, 0.7, "F");

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(7);
    this.doc.setTextColor(...MAROON);
    this.doc.text("DISCLAIMER", MARGIN + 4.5, this.y + 5.5);

    this.doc.setFont("helvetica", "italic");
    this.doc.setFontSize(6.4);
    this.doc.setTextColor(...MUTED);
    this.doc.text(lines, MARGIN + 4.5, this.y + 9.5);
    this.y += blockHeight;
    this.doc.setTextColor(...INK);
  }

  private addFooters() {
    const total = this.doc.getNumberOfPages();
    const pageW = this.doc.internal.pageSize.getWidth();
    for (let page = 1; page <= total; page += 1) {
      this.doc.setPage(page);
      this.doc.setDrawColor(...GOLD);
      this.doc.setLineWidth(0.55);
      this.doc.line(MARGIN, FOOTER_Y - 2.5, pageW - MARGIN, FOOTER_Y - 2.5);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(6.2);
      this.doc.setTextColor(...MAROON);
      this.doc.text("Anand Rathi Wealth", MARGIN, FOOTER_Y + 2.2);
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(...MUTED);
      this.doc.text("Primary SP Dashboard · Confidential", MARGIN + 32, FOOTER_Y + 2.2);
      this.doc.setFont("helvetica", "bold");
      this.doc.setTextColor(...MAROON);
      this.doc.text(`${page} / ${total}`, pageW - MARGIN, FOOTER_Y + 2.2, { align: "right" });
    }
  }

  save(filename: string) {
    if (typeof document === "undefined") {
      throw new Error("PDF download is only available in the browser.");
    }
    this.addFooters();
    const name = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    this.doc.save(name);
  }
}

async function createScreenPdf() {
  const [{ jsPDF }, autoTableMod] = await Promise.all([loadJsPdf(), loadAutoTable()]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.setProperties({
    title: "Primary SP Dashboard",
    subject: "Desk screen export",
    creator: "Primary SP Dashboard · Anand Rathi Wealth",
  });
  return new ScreenPdfBuilder(doc, autoTableMod.default);
}

function productSubtitle(product: ProductRecord) {
  return `${product.name} · ${product.isin ?? "—"} · ${screenExportStamp()}`;
}

export async function downloadValuationScreenPdf(options: {
  product: ProductRecord;
  valuation: ValuationResult | null;
  inputs: {
    valuationDate: string;
    niftyLevel: string;
    sensexLevel: string;
    debentures: string;
  };
  outputSheet?: Array<[string, string]>;
  specRows?: Array<[string, string]>;
  observationRows?: ObservationExportRow[];
}) {
  const { product, valuation, inputs, outputSheet, specRows, observationRows } = options;
  const pdf = await createScreenPdf();
  pdf.setDocumentProperties({
    title: `Valuation · ${product.isin ?? product.name}`,
    subject: `Valuation as of ${inputs.valuationDate || "desk date"}`,
  });
  await pdf.addLogo();
  pdf.addBanner("Valuation Output", productSubtitle(product));
  pdf.addProductHero(product);

  pdf.addSection("Desk Inputs");
  pdf.addKeyValueTable([
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
    pdf.addSection("Valuation Summary");
    pdf.addKpiHighlightTable([
      [labels.value, formatPdfProductUnitValue(valuation.productValue)],
      [labels.coupon, formatPercent(valuation.absReturn, 1)],
      [labels.couponFormed, formatFormulaReturn(valuation.formulaReturn)],
      [labels.productIrr, formatPercent(valuation.productIrr, 2)],
      ["Total Amount", formatPdfCurrency(valuation.totalAmount, false)],
      ["Underlying Performance", formatPercent(valuation.z, 1)],
    ]);
  }

  if (outputSheet?.length) {
    pdf.addSection("Output Sheet");
    pdf.addCompactGridTable(outputSheet);
  }

  pdf.addSection("Product Specifications");
  pdf.addSpecificationTable(specRows ?? buildSpecRowsForPdf(product));

  if (observationRows?.length) {
    pdf.addSection("Observation Dates");
    pdf.addObservationTable(observationRows);
  }

  pdf.addSection("Product Overview");
  pdf.addProse(buildDescriptionLines(product));
  pdf.addKeyValueTable(buildOverviewFooterRows(product), { compact: true });

  pdf.addDisclaimer();
  pdf.save(
    buildDeskExportFilename({
      screen: "Valuation",
      isin: product.isin,
      productName: product.name,
      extension: "pdf",
    }),
  );
}

export async function downloadPayoffScreenPdf(options: {
  product: ProductRecord;
  scenarios: PayoffRowFlags[];
  marketMove: number;
  inputs: {
    debentures: string;
    pricePerDebenture: string;
    purchaseDate: string;
  };
  kpis: Array<[string, string]>;
  specRows?: Array<[string, string]>;
  payoffFootnotes?: Array<[string, string]>;
  observationRows?: ObservationExportRow[];
}) {
  const { product, scenarios, kpis, inputs, specRows, payoffFootnotes, observationRows } = options;
  const pdf = await createScreenPdf();
  await pdf.addLogo();
  pdf.addBanner("Payoff Output", productSubtitle(product));
  pdf.addProductHero(product);

  pdf.addSection("Desk Inputs");
  pdf.addKeyValueTable([
    ["Debentures", inputs.debentures || "—"],
    ["Price / Debenture", inputs.pricePerDebenture || "—"],
    ["Start Date", inputs.purchaseDate || "—"],
  ]);

  pdf.addSection("Live KPIs");
  pdf.addKpiHighlightTable(kpis);

  if (payoffFootnotes?.length) {
    pdf.addSection("Payoff Notes");
    pdf.addKeyValueTable(payoffFootnotes);
  }

  pdf.addSection("Product Specifications");
  pdf.addSpecificationTable(specRows ?? buildSpecRowsForPdf(product));

  if (observationRows?.length) {
    pdf.addSection("Observation Dates");
    pdf.addObservationTable(observationRows);
  }

  pdf.addSection("Product Overview");
  pdf.addProse(buildDescriptionLines(product));
  pdf.addKeyValueTable(buildOverviewFooterRows(product), { compact: true });

  pdf.addSection("Payoff Scenarios");
  pdf.addScenarioTable(scenarios);
  pdf.addPayoffPlot(product);

  pdf.addDisclaimer();
  pdf.save(
    buildDeskExportFilename({
      screen: "Payoff",
      isin: product.isin,
      productName: product.name,
      extension: "pdf",
    }),
  );
}

export async function downloadProductDetailsScreenPdf(options: {
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
}) {
  const { product, valuation, scenarios, canValue, inputs, specRows, lifecycleRows, observationRows } =
    options;
  const pdf = await createScreenPdf();
  await pdf.addLogo();
  pdf.addBanner("Product Details Output", productSubtitle(product));
  pdf.addProductHero(product);

  pdf.addSection("Desk Inputs");
  pdf.addKeyValueTable([
    ["Valuation Date", inputs.valuationDate || "—"],
    ["Val. Date Nifty Level", inputs.niftyLevel || "—"],
    ["Val. Date Sensex Level", inputs.sensexLevel || "—"],
    ["No. of Debentures", inputs.debentures || "—"],
  ]);

  if (canValue && valuation) {
    const labels = valuationMetricLabels(
      getProductLifecycleStatus(product) === "expired",
      inputs.valuationDate,
      product,
    );
    pdf.addSection("Valuation Summary");
    pdf.addKpiHighlightTable([
      [labels.value, formatPdfProductUnitValue(valuation.productValue)],
      [labels.coupon, formatPercent(valuation.absReturn, 1)],
      [labels.couponFormed, formatFormulaReturn(valuation.formulaReturn)],
      [labels.productIrr, formatPercent(valuation.productIrr, 2)],
      ["Total Amount", formatPdfCurrency(valuation.totalAmount, false)],
      ["Underlying Performance", formatPercent(valuation.z, 1)],
    ]);
  }

  pdf.addSection("Product Specifications");
  pdf.addSpecificationTable(specRows ?? buildSpecRowsForPdf(product));

  if (lifecycleRows?.length) {
    pdf.addSection("Performance & Lifecycle");
    pdf.addKeyValueTable(lifecycleRows);
  }

  if (observationRows?.length) {
    pdf.addSection("Observation Dates");
    pdf.addObservationTable(observationRows);
  }

  pdf.addSection("Product Overview");
  pdf.addProse(buildDescriptionLines(product));
  pdf.addKeyValueTable(buildOverviewFooterRows(product), { compact: true });

  pdf.addSection("Payoff Scenarios");
  pdf.addScenarioTable(scenarios);
  pdf.addPayoffPlot(product);

  pdf.addDisclaimer();
  pdf.save(
    buildDeskExportFilename({
      screen: "Details",
      isin: product.isin,
      productName: product.name,
      extension: "pdf",
    }),
  );
}
