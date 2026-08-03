import { formatLastObservationDate } from "@/lib/portfolio-observation-columns";
import type { ProductRecord } from "@/lib/types";
import { PORTFOLIO_LAST_OBS_COLUMN_LABEL } from "@/lib/valuation-labels";

function normalizeDeskDate(value: string): string {
  return value.trim();
}

/**
 * Valuation output / export — show Expiration Date and Maturity Date only when they differ.
 * When both resolve to the same desk date (common case), keep a single Expiration Date row.
 */
export function buildValuationExpirationMaturityRows(
  product: ProductRecord,
  maturityDisplay: string,
): Array<[string, string]> {
  const expirationDisplay = formatLastObservationDate(product);
  const expiration = normalizeDeskDate(expirationDisplay);
  const maturity = normalizeDeskDate(maturityDisplay);

  if (expiration === "—" && maturity !== "—") {
    return [["Maturity Date", maturityDisplay]];
  }
  if (maturity === "—" || expiration === maturity) {
    return [[PORTFOLIO_LAST_OBS_COLUMN_LABEL, expirationDisplay]];
  }
  return [
    [PORTFOLIO_LAST_OBS_COLUMN_LABEL, expirationDisplay],
    ["Maturity Date", maturityDisplay],
  ];
}

/** Same labels for on-screen FieldRow rendering. */
export function buildValuationExpirationMaturityFields(
  product: ProductRecord,
  maturityDisplay: string,
): Array<{ label: string; value: string }> {
  return buildValuationExpirationMaturityRows(product, maturityDisplay).map(([label, value]) => ({
    label,
    value,
  }));
}
