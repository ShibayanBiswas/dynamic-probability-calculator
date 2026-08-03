/**
 * Probability desk screen Excel / PDF — KPIs, schedule, path sample, specs.
 * Omits valuation IRR, payoff scenarios, and narrative blocks.
 */
import type ExcelJS from "exceljs";
import type { jsPDF } from "jspdf";

import { createWorkbook } from "@/lib/workbook/excel-runtime";
import { embedBrandLogo, fetchBrandLogoBase64 } from "@/lib/workbook/export-branding";
import { buildDeskExportFilename } from "@/lib/workbook/export-filename";
import {
  EXCEL_THEME,
  addExcelKpiTiles,
  addExcelMasthead,
  addExcelSection,
  excelFill,
} from "@/lib/workbook/export-theme";
import { SCREEN_EXPORT_DISCLAIMER, screenExportStamp } from "@/lib/workbook/export-screen-shared";
import { loadJsPdf } from "@/lib/workbook/pdf-runtime";
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

function writeScheduleSheet(
  wb: ExcelJS.Workbook,
  title: string,
  result: ProbabilityRunResult | null | undefined,
  daysLabel: string,
) {
  if (!result) return;
  const sheet = wb.addWorksheet(title.slice(0, 31));
  const present = result.schedule.filter((s) => s.date);
  sheet.getCell(1, 1).value = "";
  present.forEach((_s, i) => {
    sheet.getCell(1, i + 2).value = i + 1;
  });
  sheet.getCell(2, 1).value = "Dates";
  present.forEach((s, i) => {
    sheet.getCell(2, i + 2).value = scheduleDateLabel(s.date);
  });
  sheet.getCell(3, 1).value = daysLabel;
  present.forEach((s, i) => {
    sheet.getCell(3, i + 2).value = s.daysFromBase;
  });
  sheet.columns = [{ width: 28 }, ...present.map(() => ({ width: 14 }))];
}

function writePathsSheet(
  wb: ExcelJS.Workbook,
  title: string,
  result: ProbabilityRunResult | null | undefined,
  filter: "all" | "included" | "excluded" = "all",
) {
  if (!result || result.paths.length === 0) return;
  const sheet = wb.addWorksheet(title.slice(0, 31));
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
    const cell = sheet.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
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
      sheet.getCell(r + 2, c + 1).value = v;
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
  const wb = await createWorkbook();
  wb.creator = "Dynamic Probability Calculator · Anand Rathi Wealth";
  const filter = input.filter ?? "all";
  const modeLabel = input.result.mode === "initial" ? "Initial" : "Current";
  writePathsSheet(wb, `${modeLabel} Paths`, input.result, filter);
  if (filter === "all") {
    writePathsSheet(wb, "Included Only", input.result, "included");
    writePathsSheet(wb, "Excluded Only", input.result, "excluded");
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

  const meta: Array<[string, string]> = [
    ["Checking Date", input.checkingDate],
    ["As of Last Observation", input.asOfLastObservation ? "Yes" : "No"],
    ["Nifty Level", num(input.niftyLevel)],
    ["Sensex Level", num(input.sensexLevel)],
    ["Paths Taken · Initial", num(input.initial?.includedCount, 0)],
    ["Successful Paths · Initial", num(input.initial?.successCount, 0)],
    ["Paths Taken · Current", num(input.current?.includedCount, 0)],
    ["Successful Paths · Current", num(input.current?.successCount, 0)],
  ];
  for (const [label, value] of meta) {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 2).value = value;
    sheet.getCell(row, 1).font = { bold: true };
    row += 1;
  }

  row += 1;
  row = addExcelSection(sheet, row, "Product Specifications", 1, 8);
  for (const card of buildProductSpecCards(input.product)) {
    sheet.getCell(row, 1).value = card.label;
    sheet.getCell(row, 2).value = card.value;
    row += 1;
  }

  row += 1;
  sheet.getCell(row, 1).value = SCREEN_EXPORT_DISCLAIMER;
  sheet.getCell(row + 1, 1).value = screenExportStamp();
  sheet.columns = [{ width: 36 }, { width: 28 }, { width: 18 }, { width: 18 }];

  writeScheduleSheet(wb, "Initial Schedule", input.initial, "Days from Phase Start");
  writeScheduleSheet(wb, "Current Schedule", input.current, "Days from Valuation Date");
  writePathsSheet(wb, "Initial Paths", input.initial);
  writePathsSheet(wb, "Current Paths", input.current);

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

export async function downloadProbabilityScreenPdf(input: ProbabilityScreenExportInput) {
  const { jsPDF } = await loadJsPdf();
  const doc: jsPDF = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const title = surfaceTitle(input.surface);
  let y = 18;

  const line = (text: string, size = 10, bold = false) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, 180);
    doc.text(wrapped, 14, y);
    y += wrapped.length * (size * 0.4) + 3;
  };

  line(title, 16, true);
  line(`${input.product.name} · ${input.product.isin ?? "—"}`, 11);
  line(
    `Checking date ${input.checkingDate}${input.asOfLastObservation ? " · last observation" : ""}`,
    10,
  );
  line(`Initial Probability ${pct(input.initial?.probability)}`);
  line(`Current Probability ${pct(input.current?.probability)}`);
  line(`Target Underlying ${pct(input.targetPercent)}`);
  line(`Required Underlying ${pct(input.requiredPercent)}`);
  line(`Days Left ${num(input.daysLeft, 0)}`);
  y += 2;
  line("Product Specifications", 12, true);
  for (const card of buildProductSpecCards(input.product)) {
    line(`${card.label}: ${card.value}`, 9);
  }
  y += 2;
  line(SCREEN_EXPORT_DISCLAIMER, 8);
  line(screenExportStamp(), 8);

  doc.save(
    buildDeskExportFilename({
      screen: title,
      productName: input.product.name,
      isin: input.product.isin,
      extension: "pdf",
    }),
  );
}
