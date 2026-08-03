import { getProductRolloverPhase } from "@/lib/product-dates";
import type { ProductRecord } from "@/lib/types";

const ROLLOVER_PHASE_SUFFIX_RE = /\(ROLLOVER PHASE [12]\)$/i;

/** NEW PRIMARY name suffix — `(ROLLOVER PHASE 1)` / `(ROLLOVER PHASE 2)`. */
export function rolloverPhaseBracketSuffix(phase: string | undefined | null): string | null {
  const lower = String(phase ?? "").trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes("ii") || lower.includes("phase 2") || lower === "phase2") return " (ROLLOVER PHASE 2)";
  if (lower.includes("phase i") || lower.includes("phase 1") || lower === "phase1") return " (ROLLOVER PHASE 1)";
  return null;
}

/** Strip rollover phase bracket from a desk product name. */
export function productDisplayNameBase(name: string): string {
  return name.replace(/\s*\(ROLLOVER PHASE [12]\)\s*$/i, "").trim();
}

/** Append phase bracket when master Rollover Phase is Phase I / Phase II. */
export function applyRolloverPhaseNameSuffixToName(name: string, phase: string | undefined | null): string {
  const trimmed = name.trim();
  if (!trimmed || ROLLOVER_PHASE_SUFFIX_RE.test(trimmed)) return trimmed;
  const suffix = rolloverPhaseBracketSuffix(phase);
  return suffix ? `${trimmed}${suffix}` : trimmed;
}

/** Desk-facing product title — matches NEW PRIMARY `Name on Signup Form` with phase brackets. */
export function getProductDisplayName(product: ProductRecord): string {
  return applyRolloverPhaseNameSuffixToName(product.name, getProductRolloverPhase(product));
}

/** Mutate `product.name` in place so pickers, exports, and portfolio tables stay aligned with NEW PRIMARY. */
export function hydrateProductDisplayNames(products: ProductRecord[]): void {
  for (const product of products) {
    const next = getProductDisplayName(product);
    if (next !== product.name) product.name = next;
  }
}
