import { getUnderlyingKind, isCustomUnderlyingProduct } from "@/lib/underlying-benchmark";
import type { ProductRecord } from "@/lib/types";
import { isDeskToday } from "@/lib/workbook/dates";

export type DeskIndexGuardLevels = {
  loading?: boolean;
  indexSyncLoading?: boolean;
  marketStatus?: "idle" | "loading" | "ready" | "error";
  niftyLevel?: number | null;
  sensexLevel?: number | null;
  underlyingLevel?: number | null;
  selectionNifty?: number;
  selectionSensex?: number;
  marketNifty?: number;
  marketSensex?: number;
  expiredLevel?: number | null;
};

/** True when the product's linked underlying has a positive level from explicit inputs. */
export function hasProductIndexSource(
  product: ProductRecord | undefined,
  nifty?: number | null,
  sensex?: number | null,
  underlying?: number | null,
): boolean {
  if (!product) return false;
  const kind = getUnderlyingKind(product);
  if (kind === "sensex") {
    return sensex != null && Number.isFinite(sensex) && sensex > 0;
  }
  if (kind === "custom") {
    const picked = underlying ?? nifty;
    return picked != null && Number.isFinite(picked) && picked > 0;
  }
  return nifty != null && Number.isFinite(nifty) && nifty > 0;
}

function mergeNifty(levels: DeskIndexGuardLevels): number | undefined {
  const n = levels.selectionNifty ?? levels.niftyLevel ?? levels.marketNifty;
  return n != null && n > 0 ? n : undefined;
}

function mergeSensex(levels: DeskIndexGuardLevels): number | undefined {
  const n = levels.selectionSensex ?? levels.sensexLevel ?? levels.marketSensex;
  return n != null && n > 0 ? n : undefined;
}

function mergeUnderlying(levels: DeskIndexGuardLevels): number | undefined {
  const n = levels.underlyingLevel ?? levels.expiredLevel ?? levels.selectionNifty ?? levels.niftyLevel;
  return n != null && n > 0 ? n : undefined;
}

/** Block valuation until index levels are resolved — expired historical, ongoing live, or ongoing historical. */
export function hasResolvedDeskIndexLevel(
  product: ProductRecord | undefined,
  isExpired: boolean,
  valuationDate: string | undefined,
  levels: DeskIndexGuardLevels,
): boolean {
  if (!product || !valuationDate?.trim()) return false;

  if (levels.loading || levels.indexSyncLoading) return false;

  if (isExpired) {
    if (levels.expiredLevel != null && levels.expiredLevel > 0) return true;
    return hasProductIndexSource(
      product,
      mergeNifty(levels),
      mergeSensex(levels),
      isCustomUnderlyingProduct(product) ? mergeUnderlying(levels) : undefined,
    );
  }

  if (isDeskToday(valuationDate)) {
    if (levels.marketStatus === "loading") return false;
    return hasProductIndexSource(
      product,
      mergeNifty(levels),
      mergeSensex(levels),
      isCustomUnderlyingProduct(product) ? mergeUnderlying(levels) : undefined,
    );
  }

  return hasProductIndexSource(
    product,
    mergeNifty(levels),
    mergeSensex(levels),
    isCustomUnderlyingProduct(product) ? mergeUnderlying(levels) : undefined,
  );
}
