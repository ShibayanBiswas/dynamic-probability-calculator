import { formatCurrency, formatProductUnitValue } from "@/lib/utils";

/** jsPDF Helvetica lacks ₹ — substitute desk-safe ASCII for PDF exports. */
export function pdfSafeText(text: string): string {
  return stripUserFacingBrackets(text.replace(/\u20b9/g, "Rs. ").replace(/\u00a0/g, " "));
}

/**
 * Desk copy must not show date asides in parentheses — e.g. `(2026-08-03)`.
 * Prefer middot prose in the UI; strip leftovers before Excel/PDF.
 */
export function stripUserFacingBrackets(text: string): string {
  return text
    .replace(/\s*\(\d{4}-\d{2}-\d{2}\)/g, "")
    .replace(/\s*\(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\)/g, "")
    .replace(/\s*\([^)]*series opens[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function formatPdfProductUnitValue(value: number): string {
  return pdfSafeText(formatProductUnitValue(value));
}

export function formatPdfCurrency(value: number, compact = true): string {
  return pdfSafeText(formatCurrency(value, compact));
}
