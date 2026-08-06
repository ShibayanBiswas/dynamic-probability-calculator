import { getProbabilityEntryLevel, getTargetLevel } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";

/**
 * Parse desk Target Underlying input as a fraction (0.36 for 36%).
 * Values are treated as percent points (36 or 36.0 → 0.36), matching Excel display.
 */
export function parseTargetUnderlyingPercentInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/%/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

/** Format a Target Underlying fraction for the input box (e.g. 0.36 → "36.0"). */
export function formatTargetUnderlyingPercentInput(fraction: number | null | undefined): string {
  if (fraction == null || !Number.isFinite(fraction)) return "";
  return (fraction * 100).toFixed(1);
}

/**
 * Working Target Level from an editable Target Underlying %, else master Target Level.
 * Target Level = Entry × (1 + Target Underlying).
 */
export function workingTargetLevel(
  product: ProductRecord,
  targetUnderlyingFraction: number | null | undefined,
): number | null {
  const entry = getProbabilityEntryLevel(product);
  if (
    targetUnderlyingFraction != null &&
    Number.isFinite(targetUnderlyingFraction) &&
    entry != null &&
    entry > 0
  ) {
    const level = entry * (1 + targetUnderlyingFraction);
    return Number.isFinite(level) && level > 0 ? level : null;
  }
  const master = getTargetLevel(product);
  return master != null && master > 0 ? master : null;
}
