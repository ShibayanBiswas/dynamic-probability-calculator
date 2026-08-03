import { getProductRolloverPhase } from "@/lib/product-dates";
import type { ProductRecord } from "@/lib/types";

/** Desk name suffix — no parentheses: ` · Rollover Phase 1` / ` · Rollover Phase 2`. */
export function rolloverPhaseBracketSuffix(phase: string | undefined | null): string | null {
  const lower = String(phase ?? "").trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes("ii") || lower.includes("phase 2") || lower === "phase2") {
    return " · Rollover Phase 2";
  }
  if (lower.includes("phase i") || lower.includes("phase 1") || lower === "phase1") {
    return " · Rollover Phase 1";
  }
  return null;
}

/** Strip rollover phase suffix from a desk product name. */
export function productDisplayNameBase(name: string): string {
  return name
    .replace(/\s*\(ROLLOVER PHASE [12]\)\s*$/i, "")
    .replace(/\s*[·\-–—]\s*Rollover Phase [12]\s*$/i, "")
    .trim();
}

/** Append phase marker when master Rollover Phase is Phase I / Phase II. */
export function applyRolloverPhaseNameSuffixToName(
  name: string,
  phase: string | undefined | null,
): string {
  const base = productDisplayNameBase(name);
  if (!base) return "";
  const suffix = rolloverPhaseBracketSuffix(phase);
  return suffix ? `${base}${suffix}` : base;
}

/** Desk-facing product title — phase marker without parentheses. */
export function getProductDisplayName(product: ProductRecord): string {
  return applyRolloverPhaseNameSuffixToName(product.name, getProductRolloverPhase(product));
}

/** Mutate `product.name` in place so pickers, exports, and portfolio tables stay aligned. */
export function hydrateProductDisplayNames(products: ProductRecord[]): void {
  for (const product of products) {
    const next = getProductDisplayName(product);
    if (next !== product.name) product.name = next;
  }
}
