import { formatCurrency, formatProductUnitValue } from "@/lib/utils";

/** jsPDF Helvetica lacks ₹ — substitute desk-safe ASCII for PDF exports. */
export function pdfSafeText(text: string): string {
  return text.replace(/\u20b9/g, "Rs. ").replace(/\u00a0/g, " ");
}

export function formatPdfProductUnitValue(value: number): string {
  return pdfSafeText(formatProductUnitValue(value));
}

export function formatPdfCurrency(value: number, compact = true): string {
  return pdfSafeText(formatCurrency(value, compact));
}
