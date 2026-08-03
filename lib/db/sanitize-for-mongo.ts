import type { ProductRecord } from "@/lib/types";

/** Preserve empty master cells — map NaN/undefined to null, never substitute defaults. */
export function sanitizeRawValue(value: unknown): string | number | boolean | null {
  if (value === undefined) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  return value as string | number | boolean | null;
}

export function sanitizeProductForMongo(product: ProductRecord): ProductRecord {
  const raw: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(product.raw ?? {})) {
    raw[key] = sanitizeRawValue(value);
  }

  return {
    ...product,
    raw,
    tradeAmount:
      product.tradeAmount != null && Number.isFinite(product.tradeAmount) ? product.tradeAmount : undefined,
    pricePerDebenture:
      product.pricePerDebenture != null && Number.isFinite(product.pricePerDebenture)
        ? product.pricePerDebenture
        : undefined,
    couponPercent:
      product.couponPercent != null && Number.isFinite(product.couponPercent) ? product.couponPercent : undefined,
    tenorDays: product.tenorDays != null && Number.isFinite(product.tenorDays) ? product.tenorDays : undefined,
  };
}

export function sanitizeDatasetProducts(products: ProductRecord[]) {
  return products.map(sanitizeProductForMongo);
}
