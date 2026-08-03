import type { WorkbookSheetRecord } from "@/lib/types";

/** Parse Trade Amount cells from a master sheet row (rupees). */
export function parsePrimaryTradeAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return 0;
  const num = Number(text);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

/** Sum Trade Amount across all rows on a master workbook tab. */
export function sumSheetTradeNotional(sheet: WorkbookSheetRecord | null | undefined): number {
  if (!sheet?.rows?.length) return 0;
  const tradeIdx = sheet.headers.findIndex(
    (header) => header === "Trade Amount" || header.trim().toLowerCase() === "trade amount",
  );
  if (tradeIdx < 0) return 0;

  let total = 0;
  for (const row of sheet.rows) {
    total += parsePrimaryTradeAmount(row.values[tradeIdx]?.value);
  }
  return total;
}

/** @deprecated use {@link sumSheetTradeNotional} */
export const sumPrimaryTabTradeNotional = sumSheetTradeNotional;

/** Compact grid shape from master-sheet-grids.json bake output. */
export function sumPrimaryGridTradeNotional(
  grid: { headers: string[]; rows: unknown[][] } | null | undefined,
): number {
  if (!grid || !("rows" in grid) || !grid.rows?.length) return 0;
  const tradeIdx = grid.headers.findIndex((header) => header === "Trade Amount");
  if (tradeIdx < 0) return 0;

  let total = 0;
  for (const row of grid.rows) {
    const cell = Array.isArray(row) ? row[tradeIdx] : null;
    total += parsePrimaryTradeAmount(cell);
  }
  return total;
}

export function roundNotionalCr(rupees: number): number {
  return Math.round((rupees / 1e7) * 100) / 100;
}
