import { getProductDisplayName, productDisplayNameBase } from "@/lib/product-display-name";
import { getProductTradeOpeningDate, getWorkingAllotmentDate } from "@/lib/product-dates";
import type { ProductCategory, ProductRecord } from "@/lib/types";
import { formatCouponDisplay, formatFormulaReturn } from "@/lib/utils";

export function rawField(product: ProductRecord | undefined, ...keys: string[]) {
  if (!product) {
    return undefined;
  }
  for (const key of keys) {
    const value = product.raw[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value);
    }
  }
  return undefined;
}

export function parseNumericField(value?: string | number | null) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function getProductTradeDate(product: ProductRecord): Date | undefined {
  return getProductTradeOpeningDate(product) ?? getWorkingAllotmentDate(product);
}

export function getIndexEntryLevel(product: ProductRecord) {
  return getIndexEntryLevelRaw(product) ?? 10000;
}

/** Entry level from master only — undefined when blank / NaN (no default). */
export function getIndexEntryLevelRaw(product: ProductRecord): number | undefined {
  return (
    parseNumericField(rawField(product, "Actual Entry Level", "Entry Level", "Initial Level", "Initial Fixing Level")) ??
    parseNumericField(rawField(product, "Target Nifty", "Target Level"))
  );
}

/**
 * Probability / threshold entry — Actual Entry / Initial Fixing only.
 * Does not fall back to Target Level (that would collapse Initial threshold to 0).
 */
export function getProbabilityEntryLevel(product: ProductRecord): number | undefined {
  return parseNumericField(
    rawField(product, "Actual Entry Level", "Entry Level", "Initial Level", "Initial Fixing Level"),
  );
}

export function getCouponLabel(product: ProductRecord): string | undefined {
  const headline = rawField(product, "Coupon (%)", "Coupon");
  const headlineDisplay = formatCouponDisplay(headline);
  if (headlineDisplay && /%/.test(headlineDisplay)) return headlineDisplay;

  // Decimal master values (0.38) and mixed Coupon (%) cells → always show as percent.
  const parsed = getCouponPercent(product);
  if (parsed !== undefined) return formatFormulaReturn(parsed);
  return undefined;
}

export function getTargetLevel(product: ProductRecord) {
  return parseNumericField(rawField(product, "Target Level", "Final Observation Level", "Target Nifty"));
}

export function getClientInvestment(product: ProductRecord) {
  const explicitFace = parseNumericField(
    rawField(product, "Face Value", "Initial Investment (Rs.)", "Initial Investment"),
  );
  if (explicitFace && explicitFace > 0) return explicitFace;

  const price =
    product.pricePerDebenture ?? parseNumericField(rawField(product, "price per debenture", "Price / Debenture"));
  if (price && price >= 100_000 && price % 25_000 === 0) return 100_000;
  return price ?? 100_000;
}

export function getFaceValue(product: ProductRecord) {
  return getClientInvestment(product);
}

export function resolveProduct(
  products: ProductRecord[],
  {
    isin,
    productCode,
    productName,
    category,
  }: {
    isin?: string;
    productCode?: string;
    productName?: string;
    category?: ProductCategory;
  },
) {
  const pool = category ? products.filter((product) => product.category === category) : products;

  if (isin?.trim()) {
    const match = pool.find((product) => product.isin?.toLowerCase().includes(isin.trim().toLowerCase()));
    if (match) {
      return match;
    }
  }

  if (productCode?.trim()) {
    const match = pool.find((product) => product.series?.toLowerCase().includes(productCode.trim().toLowerCase()));
    if (match) {
      return match;
    }
  }

  if (productName?.trim()) {
    const needle = productName.trim();
    const match = pool.find((product) => {
      const display = getProductDisplayName(product);
      return (
        display === needle ||
        product.name === needle ||
        productDisplayNameBase(display) === productDisplayNameBase(needle)
      );
    });
    if (match) {
      return match;
    }
  }

  return pool[0];
}

/**
 * Coupon / participation values in the master arrive as messy strings such as
 * "49.0%", "150% PR", "59% / 1.59", "CC1: 60%, CC2: 30%", "N/A".
 *
 * Prefer CC1 / first explicit `N%` tokens — never the stray digit inside `CC1`.
 * Values > 1.5 (without %) are treated as percentages (so "49" → 0.49, "150" → 1.5).
 */
export function parseCouponString(value?: string | number | null): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value > 1.5 ? value / 100 : value;
  }
  const text = String(value).trim();
  if (!text || /^(n\/?a|na|-|nil)$/i.test(text)) return undefined;

  const toDecimal = (num: number, hadPercent: boolean) => {
    if (!Number.isFinite(num)) return undefined;
    return hadPercent || num > 1.5 ? num / 100 : num;
  };

  // Dual-coupon masters: CC1 is the headline full-coupon return.
  const cc1 = text.match(/CC\s*1\s*:\s*(-?\d+(?:\.\d+)?)\s*(%)?/i);
  if (cc1) {
    const parsed = toDecimal(Number(cc1[1]), Boolean(cc1[2]) || text.includes("%"));
    if (parsed != null) return parsed;
  }

  // First explicit percent token ("60%", "49.0%") — skips label digits in CC1/PR1.
  const pctToken = text.match(/-?\d+(?:\.\d+)?%/);
  if (pctToken) {
    const parsed = toDecimal(Number(pctToken[0].replace("%", "")), true);
    if (parsed != null) return parsed;
  }

  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  return toDecimal(Number(match[0]), text.includes("%"));
}

/**
 * Effective headline return for full-coupon / KPIs.
 * Prefer fresh parse of master Coupon (%) text (survives bad baked couponPercent),
 * then typed field, then Coupon / PR / DM.
 */
export function getCouponPercent(product: ProductRecord): number | undefined {
  return (
    parseCouponString(rawField(product, "Coupon (%)")) ??
    (product.couponPercent !== undefined ? product.couponPercent : undefined) ??
    parseCouponString(rawField(product, "Coupon / PR / DM", "Product return"))
  );
}

export type ProtectionClass = "protected" | "exposed" | "unknown";

/**
 * Classify principal protection. IMPORTANT: check "non" first, because
 * "Non-Principal Protected".includes("principal protected") is true.
 */
export function classifyProtection(flag?: string | null): ProtectionClass {
  const text = String(flag ?? "").toLowerCase();
  if (!text.trim()) return "unknown";
  if (text.includes("non") || text.includes("npp") || /\bn-?pp\b/.test(text)) return "exposed";
  if (text.includes("principal protected") || text.includes("capital guarantee") || /\bpp\b/.test(text)) {
    return "protected";
  }
  return "unknown";
}

import {
  getUnderlyingIndexLabel,
  getUnderlyingKind,
  isCustomUnderlyingProduct,
} from "@/lib/underlying-benchmark";

/** True when the product is benchmarked to the Sensex. */
export function isSensexLinked(product: ProductRecord | undefined) {
  return getUnderlyingKind(product) === "sensex";
}

/** Master underlying label as entered on the NEW PRIMARY desk book (dynamic for new rows). */
export function getProductUnderlyingLabel(product: ProductRecord): string {
  const raw = (product.underlying ?? rawField(product, "Underlying") ?? "").trim();
  return raw || "Unspecified";
}

/** Desk field label for the active underlying level (Nifty / Sensex / Infosys / …). */
export function getProductIndexFieldLabel(product: ProductRecord | undefined): string {
  return getUnderlyingIndexLabel(product);
}

/**
 * Picks the valuation-date underlying level for the product.
 * Custom underlyings use `underlyingLevel` (or niftyLevel slot when the desk wrote the custom close there) —
 * never Sensex/Nifty index history against a stock/gold entry.
 * Falls back to the product entry level so the engine never divides by zero.
 */
export function resolveValuationLevel(
  product: ProductRecord | undefined,
  levels: {
    niftyLevel?: number;
    sensexLevel?: number;
    underlyingLevel?: number;
    currentLevel?: number;
  },
  options?: { preferLiveIndex?: boolean },
) {
  const preferLive = options?.preferLiveIndex !== false;
  if (!preferLive && levels.currentLevel && Number.isFinite(levels.currentLevel) && levels.currentLevel > 0) {
    return levels.currentLevel;
  }

  const kind = getUnderlyingKind(product);
  let picked: number | undefined;
  if (kind === "sensex") {
    picked = levels.sensexLevel;
  } else if (kind === "custom") {
    // Desk hooks store custom closes in underlyingLevel, or niftyLevel as the active channel.
    picked = levels.underlyingLevel ?? levels.niftyLevel;
  } else {
    picked = levels.niftyLevel;
  }

  if (picked && Number.isFinite(picked) && picked > 0) {
    return picked;
  }
  if (levels.currentLevel && Number.isFinite(levels.currentLevel) && levels.currentLevel > 0) {
    return levels.currentLevel;
  }
  // Custom with no dedicated series: do not invent a Nifty mark — entry fallback only for engine safety.
  if (kind === "custom" && preferLive) {
    return 0;
  }
  return product ? getIndexEntryLevel(product) : 0;
}

export { isCustomUnderlyingProduct };

/** Payoff & live marks — always Yahoo Nifty/Sensex, never stale manual level. */
export function resolveLiveIndexLevel(
  product: ProductRecord | undefined,
  levels: { niftyLevel?: number; sensexLevel?: number },
) {
  return resolveValuationLevel(product, levels, { preferLiveIndex: true });
}

export function getDebenturePrice(product: ProductRecord) {
  return (
    product.pricePerDebenture ??
    parseNumericField(rawField(product, "price per debenture", "Price / Debenture", "Price per debenture")) ??
    getFaceValue(product)
  );
}

/** Desk-default debenture count from trade notional ÷ price, else master field, else 100. */
export function inferDebentureCount(product: ProductRecord): number {
  const fromRaw = parseNumericField(rawField(product, "No. of Debentures", "Debentures", "No of Debentures"));
  if (fromRaw && fromRaw >= 1 && Number.isFinite(fromRaw)) return Math.round(fromRaw);

  const tradeAmount = product.tradeAmount;
  const price = getDebenturePrice(product);
  if (tradeAmount && price > 0) {
    const n = Math.round(tradeAmount / price);
    if (n >= 1 && n <= 1_000_000) return n;
  }

  return 100;
}

/** Upper bound for debenture input — notional ÷ price; generous cap when notional unknown. */
export function getMaxDebentures(product: ProductRecord): number {
  const price = getDebenturePrice(product);
  const tradeAmount = product.tradeAmount;
  if (tradeAmount != null && Number.isFinite(tradeAmount) && tradeAmount > 0 && price > 0) {
    return Math.max(1, Math.floor(tradeAmount / price));
  }
  return 1_000_000;
}
