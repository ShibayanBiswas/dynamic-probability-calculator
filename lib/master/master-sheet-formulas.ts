/**
 * Apply desk Excel formulas to beautified Primary / Rollover / NEW PRIMARY sheets.
 * Mirrors the backup master computed columns:
 * - Last Observation Date = MAX(observation averages)
 * - Observation Months = TEXT join of observation averages
 * - Arranger / Upfront Fees Amount = Trade Amount × fee %
 *
 * Always keep a cached `result` so parsers that do not recalculate still read values.
 */
import type ExcelJS from "exceljs";

function colLetter(col1Based: number): string {
  let n = col1Based;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function findHeaderIndex(headers: string[], ...candidates: string[]): number {
  const lowered = headers.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const i = lowered.indexOf(cand.trim().toLowerCase());
    if (i >= 0) return i;
  }
  for (const cand of candidates) {
    const key = cand.trim().toLowerCase();
    const i = lowered.findIndex((h) => h === key || h.includes(key));
    if (i >= 0) return i;
  }
  return -1;
}

function observationAverageIndices(headers: string[]): number[] {
  const idxs: number[] = [];
  for (let i = 0; i < headers.length; i += 1) {
    const h = headers[i]!.trim().toLowerCase();
    if (
      h === "observation average 1" ||
      h === "average 1" ||
      /^observation average [2-7]$/.test(h) ||
      /^avg\.?\s*[2-7]$/.test(h)
    ) {
      idxs.push(i);
    }
  }
  return idxs.sort((a, b) => a - b);
}

function cellResult(value: ExcelJS.CellValue): ExcelJS.CellValue {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const obj = value as { result?: ExcelJS.CellValue; formula?: string; sharedFormula?: string; text?: string };
    if ("result" in obj) return obj.result ?? null;
    if ("text" in obj && obj.text != null) return obj.text;
  }
  return value;
}

function setFormulaKeepingResult(
  cell: ExcelJS.Cell,
  formula: string,
): void {
  const result = cellResult(cell.value);
  const simpleResult =
    typeof result === "string" ||
    typeof result === "number" ||
    typeof result === "boolean" ||
    result instanceof Date
      ? result
      : null;
  cell.value =
    simpleResult != null && simpleResult !== ""
      ? { formula, result: simpleResult }
      : { formula };
}

/**
 * Overwrite computed cells with Excel formulas. Row 1 = headers; data starts at row 2.
 */
export function applyMasterSheetComputedFormulas(
  sheet: ExcelJS.Worksheet,
  displayHeaders: string[],
  dataRowCount: number,
): { applied: Record<string, number> } {
  const applied: Record<string, number> = {};
  if (dataRowCount <= 0) return { applied };

  const obsIdx = observationAverageIndices(displayHeaders);
  const lastObsIdx = findHeaderIndex(displayHeaders, "Last Observation Date");
  const obsMonthsIdx = findHeaderIndex(displayHeaders, "Observation Months");
  const tradeAmtIdx = findHeaderIndex(displayHeaders, "Trade Amount (Rupees)", "Trade Amount");
  const arrPctIdx = findHeaderIndex(displayHeaders, "Arranger Fees Percentage", "Arranger Fees (%)");
  const upPctIdx = findHeaderIndex(displayHeaders, "Upfront Fees Percentage", "Upfront fees (%)");
  const arrAmtIdx = findHeaderIndex(displayHeaders, "Arranger Fees Amount", "Arranger Fees (Rs.)");
  const upAmtIdx = findHeaderIndex(displayHeaders, "Upfront Fees Amount", "Upfront fees (Rs.)");

  for (let i = 0; i < dataRowCount; i += 1) {
    const excelRow = i + 2;
    const row = sheet.getRow(excelRow);

    if (obsIdx.length > 0 && lastObsIdx >= 0) {
      const start = colLetter(obsIdx[0]! + 1);
      const end = colLetter(obsIdx[obsIdx.length - 1]! + 1);
      setFormulaKeepingResult(row.getCell(lastObsIdx + 1), `MAX(${start}${excelRow}:${end}${excelRow})`);
      applied.lastObservation = (applied.lastObservation ?? 0) + 1;
    }

    if (obsIdx.length > 0 && obsMonthsIdx >= 0) {
      const parts = obsIdx.map((idx) => `TEXT(${colLetter(idx + 1)}${excelRow},"dd-mmm-yy")`);
      setFormulaKeepingResult(row.getCell(obsMonthsIdx + 1), parts.join("&\",\"&"));
      applied.observationMonths = (applied.observationMonths ?? 0) + 1;
    }

    if (tradeAmtIdx >= 0 && arrPctIdx >= 0 && arrAmtIdx >= 0) {
      const pct = cellResult(row.getCell(arrPctIdx + 1).value);
      if (pct != null && pct !== "" && pct !== "-") {
        setFormulaKeepingResult(
          row.getCell(arrAmtIdx + 1),
          `${colLetter(tradeAmtIdx + 1)}${excelRow}*${colLetter(arrPctIdx + 1)}${excelRow}`,
        );
        applied.arrangerFeesAmount = (applied.arrangerFeesAmount ?? 0) + 1;
      }
    }

    if (tradeAmtIdx >= 0 && upPctIdx >= 0 && upAmtIdx >= 0) {
      const pct = cellResult(row.getCell(upPctIdx + 1).value);
      if (pct != null && pct !== "" && pct !== "-") {
        setFormulaKeepingResult(
          row.getCell(upAmtIdx + 1),
          `${colLetter(tradeAmtIdx + 1)}${excelRow}*${colLetter(upPctIdx + 1)}${excelRow}`,
        );
        applied.upfrontFeesAmount = (applied.upfrontFeesAmount ?? 0) + 1;
      }
    }
  }

  return { applied };
}
