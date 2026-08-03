import ExcelJS from "exceljs";

import {
  filterProductsByLifecycle,
  getValuationDateApplicability,
  isActiveMarkAtDate,
  LIFECYCLE_FILTERS,
  LIFECYCLE_FILTER_LABELS,
  QUICK_ANALYTICS_LIFECYCLE_FILTERS,
  type LifecycleFilter,
  type LifecycleStatus,
} from "@/lib/product-lifecycle";
import { differenceInCalendarDays } from "date-fns";
import { resolveDeskIndexLevelsAsync } from "@/lib/desk-index-levels";
import { buildLifecycleIndex, productsForLifecycleFilter } from "@/lib/lifecycle-index";
import {
  lifecyclePortfolioColumnLabels,
  PORTFOLIO_EXPIRED_DAYS_COLUMN_HINT,
  PORTFOLIO_EXPIRED_DAYS_COLUMN_LABEL,
  PORTFOLIO_DAYS_COLUMN_HINT,
  quickAnalyticsPortfolioColumnLabels,
  type LifecyclePortfolioColumnLabels,
} from "@/lib/valuation-labels";
import { parseExcelishDate } from "@/lib/workbook/dates";
import { blankValuationSnapshot } from "@/lib/workbook/portfolio-snapshots";
import { computeActiveValuationSnapshots } from "@/lib/workbook/portfolio-valuation-batch";
import {
  portfolioLifecycleExportRow,
  portfolioLifecycleTableHeaders,
} from "@/lib/portfolio-lifecycle-columns";
import { formatDeskDate } from "@/lib/market-data";
import type { ProductRecord } from "@/lib/types";
import { formatCrores } from "@/lib/utils";
import { embedBrandLogo, fetchBrandLogoBase64 } from "@/lib/workbook/export-branding";
import {
  addFormulaGuideSheet,
  attachCellNote,
  PORTFOLIO_FORMULA_GUIDE,
  portfolioValuationNote,
} from "@/lib/workbook/export-interactivity";
import {
  computePortfolioValuation,
  computePortfolioValuationSnapshots,
  type PortfolioLevelInputs,
} from "@/lib/workbook/portfolio-valuation-batch";
import {
  snapshotFromValuation,
  type PortfolioValuationSnapshot,
} from "@/lib/workbook/portfolio-snapshots";
import { SCREEN_EXPORT_DISCLAIMER } from "@/lib/workbook/export-screen-shared";
import { buildDeskExportFilename } from "@/lib/workbook/export-filename";
import {
  EXCEL_FONT,
  EXCEL_THEME,
  addExcelMasthead,
  excelBox,
  excelFill,
  excelGoldBox,
} from "@/lib/workbook/export-theme";

/* ── Anand Rathi desk palette ─────────────────────────────────────────── */
const GOLD = EXCEL_THEME.gold;
const MAROON = EXCEL_THEME.maroon;
const INK = EXCEL_THEME.ink;
const WHITE = EXCEL_THEME.white;
const ROW_ALT = EXCEL_THEME.ivory;
const MUTED = EXCEL_THEME.muted;

const DISCLAIMER = SCREEN_EXPORT_DISCLAIMER;

const boxBorder = excelBox;
const fill = excelFill;

/** Columns shared by Portfolio by Lifecycle UI + Export view / Full workbook. */
export const PORTFOLIO_EXPORT_COLUMNS = portfolioLifecycleTableHeaders(
  lifecyclePortfolioColumnLabels("ongoing"),
  "ongoing",
) as readonly string[];

export type PortfolioExportColumn = (typeof PORTFOLIO_EXPORT_COLUMNS)[number];

export type { PortfolioValuationSnapshot, PortfolioLevelInputs };
export { computePortfolioValuation, computePortfolioValuationSnapshots };

export function snapshotFromResult(
  result: Parameters<typeof snapshotFromValuation>[0],
  valuationDate: string,
): PortfolioValuationSnapshot {
  return snapshotFromValuation(result, valuationDate);
}

/** @deprecated Use {@link computePortfolioValuation} */
export function computePortfolioLiveValuation(
  product: ProductRecord,
  status: LifecycleStatus,
  inputs: PortfolioLevelInputs = {},
): PortfolioValuationSnapshot {
  return computePortfolioValuation(product, status, inputs);
}

export function portfolioExportHeaders(
  labels: LifecyclePortfolioColumnLabels,
  filter: LifecycleFilter = "ongoing",
): string[] {
  return portfolioLifecycleTableHeaders(labels, filter);
}

export function productToPortfolioExportRow(
  product: ProductRecord,
  index: number,
  snapshot: PortfolioValuationSnapshot,
  labels: LifecyclePortfolioColumnLabels,
  asOf = new Date(),
  options?: { missingMetric?: string; badgeFilter?: LifecycleFilter },
): Record<string, string | number> {
  return portfolioLifecycleExportRow({
    index,
    product,
    snapshot,
    labels,
    asOf,
    badgeFilter: options?.badgeFilter ?? "ongoing",
    missingMetric: options?.missingMetric ?? "",
  });
}

function columnWidthForHeader(header: string, maxLen: number): number {
  const padded = maxLen + 3;
  if (header === "#") return Math.min(Math.max(padded, 5), 8);
  if (header.includes("Name")) return Math.min(Math.max(padded, 28), 56);
  if (header.includes("ISIN")) return Math.min(Math.max(padded, 16), 24);
  if (header.includes("Issuer") || header.includes("Underlying")) return Math.min(Math.max(padded, 18), 40);
  if (header.includes("Amount") || header.includes("Price") || header.includes("Debenture")) {
    return Math.min(Math.max(padded, 22), 52);
  }
  if (header.includes("Coupon") || header.includes("Return") || header.includes("IRR")) {
    return Math.min(Math.max(padded, 20), 48);
  }
  if (header.includes("Date") || header.includes("Left") || header.includes("Expiry")) {
    return Math.min(Math.max(padded, 14), 22);
  }
  if (header.includes("Observation Level") || header.includes("Effective Target")) {
    return Math.min(Math.max(padded, 16), 28);
  }
  return Math.min(Math.max(padded, 12), 44);
}

function computeSheetColumnWidths(headers: string[], rows: Array<Record<string, unknown>>): { width: number }[] {
  return headers.map((header) => {
    const maxLen = Math.max(header.length, ...rows.map((row) => String(row[header] ?? "").length));
    return { width: columnWidthForHeader(header, maxLen) };
  });
}

function portfolioHeaderNotes(labels: LifecyclePortfolioColumnLabels): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const entry of PORTFOLIO_FORMULA_GUIDE) {
    notes[entry.column] = `${entry.formula}\n\n${entry.description}`;
  }
  notes[labels.daysColumn] =
    labels.daysColumn === PORTFOLIO_EXPIRED_DAYS_COLUMN_LABEL
      ? PORTFOLIO_EXPIRED_DAYS_COLUMN_HINT
      : PORTFOLIO_DAYS_COLUMN_HINT;
  notes["Initial Prob"] =
    "= successful daily paths ÷ included paths from phase start\n\nHistorical path success rate versus adjusted start level.";
  notes["Current Prob"] =
    "= successful daily paths ÷ included paths from valuation date\n\nHistorical path success rate versus path start close.";
  notes["Effective Target"] =
    "= (Total Obs × Target Level − Σ levels at passed obs) ÷ Remaining Obs\n\nAverage level still required across pending observations.";
  return notes;
}

function annotatePortfolioDataNotes(
  sheet: ExcelJS.Worksheet,
  headerRowIndex: number,
  headers: string[],
  products: ProductRecord[],
  snapshots: PortfolioValuationSnapshot[],
  labels: LifecyclePortfolioColumnLabels,
  levels: { niftyLevel?: number; sensexLevel?: number },
  maxRows = 250,
) {
  const noteColumns = new Set([labels.value, labels.absReturn, labels.couponFormed, labels.productIrr, labels.totalAmount]);
  const colIndex = new Map(headers.map((h, i) => [h, i + 1]));
  const limit = Math.min(products.length, maxRows);

  for (let ri = 0; ri < limit; ri++) {
    const product = products[ri]!;
    const snapshot = snapshots[ri]!;
    const note = portfolioValuationNote(product, snapshot, levels);
    for (const header of noteColumns) {
      const ci = colIndex.get(header);
      if (!ci) continue;
      attachCellNote(sheet.getCell(headerRowIndex + 1 + ri, ci), note);
    }
  }
}

/** Styled data sheet — banner, gold header row, borders, zebra, freeze, autofilter. */
function buildStyledSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  subtitle: string,
  rows: Record<string, unknown>[],
  logoBase64?: string | null,
  options?: {
    fast?: boolean;
    headerNotes?: Record<string, string>;
    headers?: readonly string[];
    annotateRows?: {
      products: ProductRecord[];
      snapshots: PortfolioValuationSnapshot[];
      labels: LifecyclePortfolioColumnLabels;
      levels: { niftyLevel?: number; sensexLevel?: number };
    };
  },
) {
  const fast = options?.fast === true || rows.length > 400;
  const headerNotes = options?.headerNotes;
  const sheet = wb.addWorksheet(sheetName.slice(0, 31));
  const headers =
    options?.headers?.length
      ? [...options.headers]
      : rows.length > 0
        ? Object.keys(rows[0]!)
        : [...PORTFOLIO_EXPORT_COLUMNS];
  const cols = Math.max(headers.length, 1);
  const rowOffset = logoBase64 ? embedBrandLogo(wb, sheet, logoBase64) : 0;

  const afterMasthead = addExcelMasthead(sheet, {
    title,
    subtitle,
    eyebrow: "Anand Rathi Wealth · Primary Structured Products Desk",
    fromCol: 1,
    toCol: cols,
    rowOffset,
  });

  const headerRowIndex = afterMasthead;
  headers.forEach((h, i) => {
    const cell = sheet.getCell(headerRowIndex, i + 1);
    cell.value = h;
    cell.fill = fill(EXCEL_THEME.maroonDeep);
    cell.font = { bold: true, size: 10, color: { argb: WHITE }, name: EXCEL_FONT };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = excelGoldBox;
    if (headerNotes?.[h]) attachCellNote(cell, headerNotes[h]!);
  });
  sheet.getRow(headerRowIndex).height = 26;

  if (fast) {
    const matrix = rows.map((data) => headers.map((h) => (data[h] ?? "") as ExcelJS.CellValue));
    if (matrix.length > 0) {
      sheet.addRows(matrix, "n");
    }
    const dataStart = headerRowIndex + 1;
    for (let ri = 0; ri < rows.length; ri++) {
      const excelRow = dataStart + ri;
      if (ri % 2 === 1) {
        for (let ci = 1; ci <= cols; ci++) {
          sheet.getCell(excelRow, ci).fill = fill(ROW_ALT);
        }
      }
    }
    sheet.columns = computeSheetColumnWidths(headers, rows);
  } else {
    rows.forEach((data, ri) => {
      const excelRow = headerRowIndex + 1 + ri;
      headers.forEach((h, ci) => {
        const cell = sheet.getCell(excelRow, ci + 1);
        const value = data[h];
        cell.value = (value ?? "") as ExcelJS.CellValue;
        cell.fill = fill(ri % 2 === 0 ? WHITE : ROW_ALT);
        cell.font = { size: 9, color: { argb: INK } };
        cell.alignment = { vertical: "middle", horizontal: typeof value === "number" ? "right" : "left", indent: 1 };
        cell.border = boxBorder;
      });
    });

    sheet.columns = computeSheetColumnWidths(headers, rows);
  }

  if (options?.annotateRows && !fast) {
    annotatePortfolioDataNotes(
      sheet,
      headerRowIndex,
      headers,
      options.annotateRows.products,
      options.annotateRows.snapshots,
      options.annotateRows.labels,
      options.annotateRows.levels,
    );
  }

  sheet.views = [{ state: "frozen", ySplit: headerRowIndex }];
  if (rows.length > 0 && rows.length <= 5000) {
    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex + rows.length, column: cols },
    };
  }

  const discRow = headerRowIndex + rows.length + 2;
  sheet.mergeCells(discRow, 1, discRow, cols);
  const discLabel = sheet.getCell(discRow, 1);
  discLabel.value = "DISCLAIMER";
  discLabel.fill = fill(EXCEL_THEME.parchment);
  discLabel.font = { bold: true, size: 8, color: { argb: MAROON }, name: EXCEL_FONT };
  discLabel.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  discLabel.border = { top: { style: "medium", color: { argb: GOLD } } };
  sheet.getRow(discRow).height = 16;

  const discBody = discRow + 1;
  sheet.mergeCells(discBody, 1, discBody, cols);
  const disc = sheet.getCell(discBody, 1);
  disc.value = DISCLAIMER;
  disc.fill = fill(EXCEL_THEME.parchment);
  disc.font = { italic: true, size: 8, color: { argb: MUTED }, name: EXCEL_FONT };
  disc.alignment = { vertical: "top", horizontal: "left", wrapText: true, indent: 1 };
  sheet.getRow(discBody).height = 54;

  return sheet;
}

async function saveWorkbook(wb: ExcelJS.Workbook, filename: string) {
  if (typeof document === "undefined") {
    throw new Error("Excel download is only available in the browser.");
  }
  wb.creator = wb.creator || "Primary SP Dashboard · Anand Rathi Wealth";
  wb.lastModifiedBy = "Primary SP Dashboard";
  wb.created = wb.created ?? new Date();
  wb.modified = new Date();
  for (const sheet of wb.worksheets) {
    const wide = (sheet.columns?.length ?? 0) > 20;
    sheet.pageSetup = {
      paperSize: 9,
      orientation: wide ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
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
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp() {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function buildPortfolioRows(
  products: ProductRecord[],
  inputs: PortfolioLevelInputs,
  lifecycleFilter: LifecycleFilter,
): Record<string, string | number>[] {
  const asOf = inputs.asOf ?? new Date();
  const labels = lifecyclePortfolioColumnLabels(lifecycleFilter);
  const snapshots = computePortfolioValuationSnapshots(products, inputs);
  return products.map((product, index) =>
    productToPortfolioExportRow(product, index, snapshots[index]!, labels, asOf, {
      badgeFilter: lifecycleFilter,
    }),
  );
}

export async function downloadProductsExcel(
  products: ProductRecord[],
  filename: string,
  options?: {
    asOf?: Date;
    sheetName?: string;
    niftyLevel?: number;
    sensexLevel?: number;
    lifecycleFilter?: LifecycleFilter;
  },
) {
  if (products.length === 0) return;
  const asOf = options?.asOf ?? new Date();
  const lifecycleFilter = options?.lifecycleFilter ?? "ongoing";
  const rows = buildPortfolioRows(
    products,
    {
      asOf,
      niftyLevel: options?.niftyLevel,
      sensexLevel: options?.sensexLevel,
    },
    lifecycleFilter,
  );
  const labels = lifecyclePortfolioColumnLabels(lifecycleFilter);
  const snapshots = computePortfolioValuationSnapshots(products, {
    asOf,
    niftyLevel: options?.niftyLevel,
    sensexLevel: options?.sensexLevel,
  });
  const logo = await fetchBrandLogoBase64();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Primary SP Dashboard · Anand Rathi Wealth";
  const markLabel = lifecycleFilter === "expired" ? "last observation marks" : `as of ${formatDeskDate(asOf)}`;
  const headers = portfolioExportHeaders(labels, lifecycleFilter);
  buildStyledSheet(
    wb,
    options?.sheetName ?? "Products",
    "Portfolio by Lifecycle",
    `${products.length} products · ${markLabel} · Generated ${stamp()} · Hover cells for desk notes`,
    rows,
    logo,
    {
      fast: products.length > 400,
      headers,
      headerNotes: portfolioHeaderNotes(labels),
      annotateRows:
        products.length <= 400
          ? {
              products,
              snapshots,
              labels,
              levels: { niftyLevel: options?.niftyLevel, sensexLevel: options?.sensexLevel },
            }
          : undefined,
    },
  );
  addFormulaGuideSheet(wb, "Portfolio Formula Guide", PORTFOLIO_FORMULA_GUIDE);
  await saveWorkbook(
    wb,
    filename.includes("SP-")
      ? filename
      : buildDeskExportFilename({
          screen: lifecycleFilter,
          productName: options?.sheetName ?? "Portfolio",
          asOf,
          extension: "xlsx",
        }),
  );
}

export async function downloadLifecycleWorkbook(
  products: ProductRecord[],
  filename?: string,
  asOf = new Date(),
  levels?: { niftyLevel?: number; sensexLevel?: number },
) {
  if (products.length === 0) return;
  const logo = await fetchBrandLogoBase64();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Primary SP Dashboard · Anand Rathi Wealth";
  const valuationDate = formatDeskDate(asOf);
  const inputs: PortfolioLevelInputs = { asOf, niftyLevel: levels?.niftyLevel, sensexLevel: levels?.sensexLevel };

  const buckets: Array<{ name: string; filter: LifecycleFilter }> = LIFECYCLE_FILTERS.map((filter) => ({
    name: LIFECYCLE_FILTER_LABELS[filter].slice(0, 31),
    filter,
  }));

  const summaryRows = buckets.map((bucket) => {
    const pool = filterProductsByLifecycle(products, bucket.filter, asOf);
    const notional = pool.reduce((sum, p) => sum + (p.tradeAmount ?? 0), 0);
    return {
      Category: bucket.name,
      Products: pool.length,
      "Notional (₹ Cr)": Number((notional / 1e7).toFixed(4)),
      "Notional (formatted)": formatCrores(notional),
    };
  });

  buildStyledSheet(
    wb,
    "Summary",
    "Portfolio by Lifecycle — Summary",
    `Desk snapshot ${valuationDate} · Generated ${stamp()}`,
    summaryRows,
    logo,
  );

  for (const bucket of buckets) {
    const pool = filterProductsByLifecycle(products, bucket.filter, asOf);
    if (pool.length === 0) continue;
    const rows = buildPortfolioRows(pool, inputs, bucket.filter);
    const bucketLabels = lifecyclePortfolioColumnLabels(bucket.filter);
    const subtitle =
      bucket.filter === "expired"
        ? `${pool.length} products · Final observation marks · Hover cells for desk notes`
        : `${pool.length} products · Live marks as of ${valuationDate} · Hover cells for desk notes`;
    buildStyledSheet(wb, bucket.name, `${bucket.name} Products`, subtitle, rows, logo, {
      fast: pool.length > 400,
      headers: portfolioExportHeaders(bucketLabels, bucket.filter),
      headerNotes: portfolioHeaderNotes(bucketLabels),
    });
  }

  addFormulaGuideSheet(wb, "Portfolio Formula Guide", PORTFOLIO_FORMULA_GUIDE);
  await saveWorkbook(
    wb,
    filename ??
      buildDeskExportFilename({
        screen: "Portfolio-Lifecycle",
        asOf,
        extension: "xlsx",
      }),
  );
}

/** Quick Analytics blank cells — pre-launch / post-end / missing formula get explicit status. */
function quickAnalyticsMissingMetric(product: ProductRecord, valuationDate: string): string {
  if (!product.formulaText?.trim()) return "-";

  const applicability = getValuationDateApplicability(product, valuationDate);
  const valDate = parseExcelishDate(valuationDate);
  if (!valDate) return "-";

  if (
    !applicability.ok &&
    applicability.phaseStart &&
    differenceInCalendarDays(valDate, applicability.phaseStart) < 0
  ) {
    return "Not yet started";
  }

  if (
    !applicability.ok &&
    applicability.phaseEnd &&
    differenceInCalendarDays(valDate, applicability.phaseEnd) > 0
  ) {
    return "Past schedule end";
  }

  return "-";
}

function buildQuickAnalyticsRows(
  products: ProductRecord[],
  snapshots: PortfolioValuationSnapshot[],
  labels: LifecyclePortfolioColumnLabels,
  asOf: Date,
  valuationDate: string,
): Record<string, string | number>[] {
  return products.map((product, index) => {
    const active = isActiveMarkAtDate(product, valuationDate);
    const snapshot = active ? snapshots[index]! : blankValuationSnapshot(valuationDate);
    return productToPortfolioExportRow(product, index, snapshot, labels, asOf, {
      missingMetric: active ? "-" : quickAnalyticsMissingMetric(product, valuationDate),
    });
  });
}

/** Quick Analytics — Ongoing book marked to the selected valuation date (Product Details only). */
export async function downloadQuickAnalyticsWorkbook(
  products: ProductRecord[],
  options: {
    valuationDate: string;
    niftyLevel?: number;
    sensexLevel?: number;
    asOf?: Date;
    filename?: string;
  },
) {
  const deskAsOf = parseExcelishDate(options.valuationDate) ?? options.asOf ?? new Date();
  const asOf = options.asOf ?? deskAsOf;
  const buckets: Array<{ name: string; filter: LifecycleFilter }> = QUICK_ANALYTICS_LIFECYCLE_FILTERS.map(
    (filter) => ({
      name: LIFECYCLE_FILTER_LABELS[filter].slice(0, 31),
      filter,
    }),
  );

  const [levels, logo, lifecycleIndex] = await Promise.all([
    resolveDeskIndexLevelsAsync(
      { niftyLevel: options.niftyLevel, sensexLevel: options.sensexLevel },
      options.valuationDate,
    ),
    fetchBrandLogoBase64(),
    Promise.resolve(buildLifecycleIndex(products, asOf)),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Primary SP Dashboard · Anand Rathi Wealth";
  const qaLabels = quickAnalyticsPortfolioColumnLabels();

  const summaryRows = buckets.map((bucket) => {
    const pool = productsForLifecycleFilter(lifecycleIndex, bucket.filter);
    const notional = pool.reduce((sum, p) => sum + (p.tradeAmount ?? 0), 0);
    return {
      Category: bucket.name,
      Products: pool.length,
      "Notional (₹ Cr)": Number((notional / 1e7).toFixed(4)),
      "Valuation Date": options.valuationDate,
      "Nifty Level": levels.niftyLevel ?? "",
      "Sensex Level": levels.sensexLevel ?? "",
    };
  });

  buildStyledSheet(
    wb,
    "Summary",
    "Quick Analytics — Portfolio Snapshot",
    `Valuation date ${options.valuationDate} · Generated ${stamp()}`,
    summaryRows,
    logo,
    { fast: true },
  );

  for (const bucket of buckets) {
    const pool = productsForLifecycleFilter(lifecycleIndex, bucket.filter);
    if (pool.length === 0) continue;

    const snapshots = computeActiveValuationSnapshots(pool, {
      valuationDate: options.valuationDate,
      niftyLevel: levels.niftyLevel,
      sensexLevel: levels.sensexLevel,
    });
    const rows = buildQuickAnalyticsRows(pool, snapshots, qaLabels, asOf, options.valuationDate);

    buildStyledSheet(
      wb,
      bucket.name,
      `Quick Analytics · ${bucket.name}`,
      `${pool.length} products · Valuation date ${options.valuationDate} · Generated ${stamp()}`,
      rows,
      logo,
      { fast: true, headers: portfolioExportHeaders(qaLabels) },
    );
  }

  addFormulaGuideSheet(wb, "Portfolio Formula Guide", PORTFOLIO_FORMULA_GUIDE);
  const filename =
    options.filename ??
    buildDeskExportFilename({
      screen: "Quick-Analytics",
      asOf: deskAsOf,
      extension: "xlsx",
    });
  await saveWorkbook(wb, filename);
}

/** @deprecated Prefer PORTFOLIO_EXPORT_COLUMNS — kept for callers expecting the old name. */
export const CORE_COLUMNS = PORTFOLIO_EXPORT_COLUMNS;
