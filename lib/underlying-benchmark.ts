/**
 * Underlying benchmark classification for desk valuation.
 *
 * Nifty / Sensex use bundled + Mongo + Yahoo index history.
 * Custom equity / commodity underlyings use dedicated series — never silently
 * substituted with Nifty closes against a stock/gold entry level.
 */
import type { ProductRecord } from "@/lib/types";

export type UnderlyingKind = "nifty" | "sensex" | "custom";

export type CustomUnderlyingSpec = {
  /** Stable key used in baked history JSON. */
  key: string;
  /** Desk display label. */
  label: string;
  /** Yahoo Finance chart symbol for equity closes. */
  yahooSymbol?: string;
  /**
   * Commodity proxy estimate:
   * - gold-inr-g: GC=F × INR=X / troyOzGrams  (INR per gram)
   * - silver-inr-kg: SI=F × INR=X × (1000 / troyOzGrams)  (INR per kg)
   */
  estimate?: "gold-inr-g" | "silver-inr-kg";
};

const TROY_OZ_GRAMS = 31.1034768;

/** Master Underlying string (normalised) → instrument spec. */
const CUSTOM_BY_NORMALIZED: Record<string, CustomUnderlyingSpec> = {
  infosys: { key: "infosys", label: "Infosys", yahooSymbol: "INFY.NS" },
  itc: { key: "itc", label: "ITC", yahooSymbol: "ITC.NS" },
  "m&m": { key: "m-and-m", label: "M&M", yahooSymbol: "M&M.NS" },
  mahindra: { key: "m-and-m", label: "M&M", yahooSymbol: "M&M.NS" },
  ioc: { key: "ioc", label: "IOC", yahooSymbol: "IOC.NS" },
  rec: { key: "rec", label: "REC", yahooSymbol: "RECLTD.NS" },
  "bharti airtel": { key: "bharti-airtel", label: "Bharti Airtel", yahooSymbol: "BHARTIARTL.NS" },
  airtel: { key: "bharti-airtel", label: "Bharti Airtel", yahooSymbol: "BHARTIARTL.NS" },
  "sun pharmaceuticals": { key: "sun-pharma", label: "Sun Pharmaceuticals", yahooSymbol: "SUNPHARMA.NS" },
  "sun pharma": { key: "sun-pharma", label: "Sun Pharmaceuticals", yahooSymbol: "SUNPHARMA.NS" },
  grasim: { key: "grasim", label: "Grasim", yahooSymbol: "GRASIM.NS" },
  "axis bank": { key: "axis-bank", label: "Axis Bank", yahooSymbol: "AXISBANK.NS" },
  hul: { key: "hul", label: "HUL", yahooSymbol: "HINDUNILVR.NS" },
  "hindustan unilever": { key: "hul", label: "HUL", yahooSymbol: "HINDUNILVR.NS" },
  "bajaj finance": { key: "bajaj-finance", label: "Bajaj Finance", yahooSymbol: "BAJFINANCE.NS" },
  "asian paints": { key: "asian-paints", label: "Asian Paints", yahooSymbol: "ASIANPAINT.NS" },
  "larsen & toubro": { key: "l-and-t", label: "Larsen & Toubro", yahooSymbol: "LT.NS" },
  "l&t": { key: "l-and-t", label: "Larsen & Toubro", yahooSymbol: "LT.NS" },
  reliance: { key: "reliance", label: "Reliance", yahooSymbol: "RELIANCE.NS" },
  "mcx silver": {
    key: "mcx-silver",
    label: "MCX Silver",
    estimate: "silver-inr-kg",
  },
  "reliance 24 karat index": {
    key: "reliance-24k-gold",
    label: "Reliance 24 Karat Index",
    estimate: "gold-inr-g",
  },
};

export function normalizeUnderlyingLabel(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getProductUnderlyingRaw(product: ProductRecord | undefined): string {
  if (!product) return "";
  const fromField = product.underlying?.trim();
  if (fromField) return fromField;
  const raw = product.raw?.Underlying ?? product.raw?.underlying;
  return raw != null ? String(raw).trim() : "";
}

export function resolveCustomUnderlyingSpec(
  product: ProductRecord | undefined,
): CustomUnderlyingSpec | undefined {
  return resolveCustomUnderlyingSpecFromLabel(getProductUnderlyingRaw(product));
}

/** Resolve instrument map from a master Underlying string (API / bake helpers). */
export function resolveCustomUnderlyingSpecFromLabel(
  underlying: string | undefined | null,
): CustomUnderlyingSpec | undefined {
  const normalized = normalizeUnderlyingLabel(underlying);
  if (!normalized) return undefined;
  if (CUSTOM_BY_NORMALIZED[normalized]) return CUSTOM_BY_NORMALIZED[normalized];

  // Fuzzy contains for slight master wording drift.
  for (const [key, spec] of Object.entries(CUSTOM_BY_NORMALIZED)) {
    if (normalized.includes(key) || key.includes(normalized)) return spec;
  }
  return undefined;
}

export function getUnderlyingKind(product: ProductRecord | undefined): UnderlyingKind {
  const raw = normalizeUnderlyingLabel(getProductUnderlyingRaw(product));
  if (!raw) return "nifty";
  if (raw.includes("sensex")) return "sensex";
  if (raw.includes("nifty")) return "nifty";
  if (resolveCustomUnderlyingSpec(product)) return "custom";
  // Unknown non-index underlying — treat as custom so we never bluff with Nifty.
  return "custom";
}

export function isCustomUnderlyingProduct(product: ProductRecord | undefined): boolean {
  return getUnderlyingKind(product) === "custom";
}

/** Short label for Val. Date / live level fields (Nifty · Sensex · Infosys · …). */
export function getUnderlyingIndexLabel(product: ProductRecord | undefined): string {
  const kind = getUnderlyingKind(product);
  if (kind === "sensex") return "Sensex";
  if (kind === "nifty") return "Nifty";
  const spec = resolveCustomUnderlyingSpec(product);
  if (spec) return spec.label;
  const raw = getProductUnderlyingRaw(product);
  return raw || "Underlying";
}

export function listKnownCustomUnderlyingSpecs(): CustomUnderlyingSpec[] {
  const byKey = new Map<string, CustomUnderlyingSpec>();
  for (const spec of Object.values(CUSTOM_BY_NORMALIZED)) {
    byKey.set(spec.key, spec);
  }
  return [...byKey.values()];
}

export function estimateCommodityInrLevel(
  estimate: NonNullable<CustomUnderlyingSpec["estimate"]>,
  futuresUsdPerOz: number,
  usdInr: number,
): number | undefined {
  if (!(futuresUsdPerOz > 0) || !(usdInr > 0)) return undefined;
  if (estimate === "gold-inr-g") {
    return Math.round(((futuresUsdPerOz * usdInr) / TROY_OZ_GRAMS) * 100) / 100;
  }
  if (estimate === "silver-inr-kg") {
    return Math.round(futuresUsdPerOz * usdInr * (1000 / TROY_OZ_GRAMS) * 100) / 100;
  }
  const _exhaustive: never = estimate;
  void _exhaustive;
  return undefined;
}
