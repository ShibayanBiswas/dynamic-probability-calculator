import type ExcelJS from "exceljs";

import { preloadPdfExport } from "@/lib/workbook/pdf-runtime";

let excelModule: Promise<typeof import("exceljs")> | null = null;

/** Lazy-load ExcelJS (~1MB) only when an export is requested. */
export function loadExcelJS(): Promise<typeof import("exceljs")> {
  if (!excelModule) {
    excelModule = import("exceljs");
  }
  return excelModule;
}

export async function createWorkbook(): Promise<ExcelJS.Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Primary SP Dashboard · Anand Rathi Wealth";
  return wb;
}

/** Warm screen export chunks while the user reads on-screen output. */
export function preloadExcelExport(): void {
  void loadExcelJS();
  void import("@/lib/workbook/export-screen");
  preloadPdfExport();
}
