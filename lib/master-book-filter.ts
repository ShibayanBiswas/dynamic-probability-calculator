import type { ProductRecord } from "@/lib/types";
import { getIndexEntryLevelRaw } from "@/lib/product-utils";

const ISIN_PATTERN = /^INE[A-Z0-9]{8,12}$/i;

/** Legal / allotment footnotes that sometimes spill into product columns. */
const LEGAL_BOILERPLATE =
  /ZERO\s+COUPON|UNSECURED\s+REDEEMABLE|NON[- ]CONVERTIBLE\s+DEBENTURE|LETTER\s+OF\s+ALLOTMENT|DATE\s+OF\s+MATURITY|TRANCHE\s+[IVXLC]+/i;

/** Footer / holding-statement titles that are not product rows. */
const FOOTER_TITLE =
  /MARKET\s+LINKED\s+DEBENTURES|HELD\s+AS\s+ON|EXCLUDES\s+DMF|Reference\s*:/i;

/** Internal desk labels — PC/NM/PM footnotes, protected-call notes, analyst initials. */
const INTERNAL_DESK_LABEL =
  /^(?:PC|NM|PM|NA|LNM|Protected\s+call)(?:\s*[-–]|\s+\d)|^Note\s*:/i;

/** Payoff formula markers — excludes ISIN-only or prose cells mis-tagged as Formulae. */
const FORMULA_MARKERS = /MIN\s*\(|MAX\s*\(|IF\s*\(|ROUND\s*\(|ABS\s*\(|[Zz]\s*%|[Uu]\s*%|[Xx]\s*%|\*|\/|\^|\d+\s*%/;

const EMPTY_CELL = /^(?:—|-+|n\/?a)?$/i;

export function isValidMasterIsin(value: string | undefined | null): boolean {
  const text = value?.trim();
  if (!text) return false;
  return ISIN_PATTERN.test(text);
}

export function isPayoffFormulaText(value: string | undefined | null): boolean {
  const text = value?.trim();
  if (!text) return false;
  if (isValidMasterIsin(text)) return false;
  if (LEGAL_BOILERPLATE.test(text)) return false;
  if (isInternalDeskLabel(text)) return false;
  if (text.length > 140 && !FORMULA_MARKERS.test(text)) return false;
  return FORMULA_MARKERS.test(text) || (text.length >= 8 && text.length <= 120 && /[%()]/.test(text));
}

export function isInternalDeskLabel(value: string | undefined | null): boolean {
  const text = value?.trim();
  if (!text) return false;
  return INTERNAL_DESK_LABEL.test(text);
}

export function isLegalBoilerplateText(value: string | undefined | null): boolean {
  const text = value?.trim();
  if (!text) return false;
  return LEGAL_BOILERPLATE.test(text);
}

function cellText(value: unknown): string {
  if (value == null) return "";
  const text = String(value).trim();
  if (!text || EMPTY_CELL.test(text)) return "";
  return text;
}

function hasAnnotationTextSignal(texts: string[]): boolean {
  return texts.some(
    (text) => isLegalBoilerplateText(text) || isInternalDeskLabel(text) || FOOTER_TITLE.test(text),
  );
}

function countFilledCells(values: unknown[]): number {
  let count = 0;
  for (const value of values) {
    if (cellText(value)) count += 1;
  }
  return count;
}

type MasterIdentityCells = {
  tradeAmount?: number | null;
  isin?: string;
  formula?: string;
  underlying?: string;
  issuer?: string;
  entryLevel?: number | null;
  name?: string;
};

/** True when a master row carries enough real product identity to show in explorer / lifecycle. */
export function hasMasterIdentityCells(cells: MasterIdentityCells): boolean {
  if (isValidMasterIsin(cells.isin)) return true;
  if (isPayoffFormulaText(cells.formula)) return true;

  const trade = cells.tradeAmount;
  const hasTrade = trade != null && Number.isFinite(trade) && trade > 0;
  const hasUnderlying = Boolean(cells.underlying?.trim());
  const hasIssuer = Boolean(cells.issuer?.trim());
  const hasEntry =
    cells.entryLevel != null && Number.isFinite(cells.entryLevel) && cells.entryLevel > 0;
  const name = cells.name?.trim() ?? "";

  if (hasTrade && hasUnderlying && hasIssuer && !isInternalDeskLabel(name) && !isLegalBoilerplateText(name)) {
    return true;
  }
  if (hasUnderlying && hasIssuer && hasEntry && !hasAnnotationTextSignal([name])) {
    return true;
  }

  return false;
}

/**
 * Rows that only carry an internal desk label (e.g. "NM - 272", "PC - 442 - varun")
 * with no ISIN, formula, underlying, issuer, entry level, or trade notional.
 */
export function isSparseMasterAnnotationRow(product: ProductRecord): boolean {
  // Booked rows (ISIN + notional + identity) stay in the live portfolio — e.g. Protected Call series.
  if (hasMasterBookIdentity(product)) return false;

  const name = product.name?.trim() ?? "";
  const texts = [
    name,
    product.formulaText,
    product.underlying,
    product.issuer,
    product.isin,
    typeof product.raw?.["Product Explanation"] === "string" ? product.raw["Product Explanation"] : undefined,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (hasAnnotationTextSignal(texts)) return true;

  return !hasMasterIdentityCells({
    tradeAmount: product.tradeAmount,
    isin: product.isin,
    formula: product.formulaText,
    underlying: product.underlying,
    issuer: product.issuer,
    entryLevel: getIndexEntryLevelRaw(product),
    name,
  });
}

/** Minimum identity for a live Primary master row — excludes name-only annotations. */
export function hasMasterBookIdentity(product: ProductRecord): boolean {
  return hasMasterIdentityCells({
    tradeAmount: product.tradeAmount,
    isin: product.isin,
    formula: product.formulaText,
    underlying: product.underlying,
    issuer: product.issuer,
    entryLevel: getIndexEntryLevelRaw(product),
    name: product.name,
  });
}

/** Parse-time guard before building a full ProductRecord. */
export function isSparseMasterRowCells(cells: {
  tradeAmount?: number | null;
  isin?: string;
  formula?: string;
  underlying?: string;
  issuer?: string;
  entryLevel?: number | null;
  name?: string;
}): boolean {
  if (hasMasterIdentityCells(cells)) return false;

  const texts = [cells.name, cells.formula, cells.underlying, cells.issuer, cells.isin].filter(
    (value): value is string => Boolean(value?.trim()),
  );
  if (hasAnnotationTextSignal(texts)) return true;
  return !hasMasterIdentityCells(cells);
}

/** Read a master explorer cell — handles duplicate headers (`Trade Date__2`). */
export function explorerRowCell(row: Record<string, unknown>, header: string): string {
  const direct = row[header];
  if (direct != null && String(direct).trim() !== "" && String(direct).trim() !== "—") {
    return String(direct).trim();
  }
  for (const [key, value] of Object.entries(row)) {
    if (key !== header && !key.startsWith(`${header}__`)) continue;
    const text = value != null ? String(value).trim() : "";
    if (text && text !== "—") return text;
  }
  return "";
}

function explorerRowNumber(row: Record<string, unknown>, header: string): number | null {
  const raw = explorerRowCell(row, header);
  if (!raw) return null;
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function explorerRowTexts(row: Record<string, unknown>): string[] {
  return Object.values(row)
    .map((value) => cellText(value))
    .filter(Boolean);
}

/**
 * Master explorer annotation rows — internal desk labels, legal footnotes, or sparse
 * rows without ISIN, payoff formula, underlying+issuer+entry, or trade notional.
 */
export function isSparseMasterExplorerRow(row: Record<string, unknown>): boolean {
  if (hasMasterExplorerIdentity(row)) return false;

  const texts = explorerRowTexts(row);
  if (hasAnnotationTextSignal(texts)) return true;

  const filled = countFilledCells(Object.values(row));
  if (filled <= 4) return true;

  const name = explorerRowCell(row, "Name on Signup Form");
  const month = explorerRowCell(row, "Month");
  const label = name || month;

  if (!label) return true;
  if (isInternalDeskLabel(label)) return true;
  if (isLegalBoilerplateText(label)) return true;
  if (label.length > 42) return true;

  return true;
}

export function hasMasterExplorerIdentity(row: Record<string, unknown>): boolean {
  return hasMasterIdentityCells({
    tradeAmount: explorerRowNumber(row, "Trade Amount"),
    isin: explorerRowCell(row, "ISIN No."),
    formula: explorerRowCell(row, "Formulae"),
    underlying: explorerRowCell(row, "Underlying"),
    issuer: explorerRowCell(row, "Issuer"),
    entryLevel: explorerRowNumber(row, "Actual Entry Level"),
    name: explorerRowCell(row, "Name on Signup Form"),
  });
}

export function filterCanonicalExplorerRows(rows: Record<string, unknown>[]) {
  const canonical = rows.filter((row) => !isSparseMasterExplorerRow(row));
  return {
    rows: canonical,
    hiddenCount: rows.length - canonical.length,
  };
}

/**
 * Export-grid guard for Primary / Rollover / NEW PRIMARY sheets.
 * Drops footer titles, Note: lines, name-only annotations, and orphan ISIN stubs
 * (ISIN with no product name / notional / underlying identity).
 */
export function isSparseMasterExportGridRow(headers: string[], row: unknown[]): boolean {
  const cellAt = (name: string) => {
    const idx = headers.findIndex((header) => header.trim() === name);
    return idx >= 0 ? cellText(row[idx]) : "";
  };

  const texts = row.map((value) => cellText(value)).filter(Boolean);
  if (texts.some((text) => FOOTER_TITLE.test(text))) return true;
  if (hasAnnotationTextSignal(texts)) {
    // Keep booked products that happen to carry a PC/NM name with full identity.
    if (
      hasMasterIdentityCells({
        tradeAmount: (() => {
          const raw = cellAt("Trade Amount");
          if (!raw) return null;
          const n = Number(raw.replace(/,/g, ""));
          return Number.isFinite(n) ? n : null;
        })(),
        isin: cellAt("ISIN No."),
        formula: cellAt("Formulae"),
        underlying: cellAt("Underlying"),
        issuer: cellAt("Issuer"),
        entryLevel: (() => {
          const raw = cellAt("Actual Entry Level");
          if (!raw) return null;
          const n = Number(raw.replace(/,/g, ""));
          return Number.isFinite(n) ? n : null;
        })(),
        name: cellAt("Name on Signup Form") || cellAt("Product Name"),
      }) &&
      isValidMasterIsin(cellAt("ISIN No.")) &&
      (cellAt("Name on Signup Form") || cellAt("Underlying") || cellAt("Trade Amount"))
    ) {
      return false;
    }
    return true;
  }

  const isin = cellAt("ISIN No.");
  const name = cellAt("Name on Signup Form") || cellAt("Product Name");
  const underlying = cellAt("Underlying");
  const issuer = cellAt("Issuer");
  const trade = cellAt("Trade Amount");
  const filled = countFilledCells(row);

  if (isValidMasterIsin(isin)) {
    // Orphan ISIN stub (screenshot junk) — ISIN alone / nearly empty row
    if (filled <= 2 && !name && !underlying && !trade) return true;
    if (!name && !underlying && !issuer && !trade) return true;
    return false;
  }

  if (filled <= 4) return true;
  if (!name && !underlying) return true;
  if (name && (isInternalDeskLabel(name) || isLegalBoilerplateText(name) || name.length > 80)) {
    return true;
  }

  return !hasMasterIdentityCells({
    tradeAmount: trade ? Number(trade.replace(/,/g, "")) : null,
    isin,
    formula: cellAt("Formulae"),
    underlying,
    issuer,
    entryLevel: (() => {
      const raw = cellAt("Actual Entry Level");
      if (!raw) return null;
      const n = Number(raw.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    })(),
    name,
  });
}

export function filterMasterExportGridRows(headers: string[], rows: unknown[][]) {
  const kept = rows.filter((row) => !isSparseMasterExportGridRow(headers, row));
  return {
    rows: kept,
    removedCount: rows.length - kept.length,
  };
}
