"use client";

import { useMemo } from "react";

import { useProductSelection } from "@/lib/context/product-selection-provider";
import { hasProductIndexSource } from "@/lib/desk-index-guards";
import { getIndexEntryLevel, resolveLiveIndexLevel, resolveValuationLevel } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { isDeskToday } from "@/lib/workbook/dates";

type ExpiredIndexLevels = {
  level: number | null;
  niftyLevel: number | null;
  sensexLevel: number | null;
};

/** Live Nifty/Sensex level for payoff — prefers Yahoo sync, never stale entry on ongoing books. */
export function useLiveIndexLevel(
  product: ProductRecord | undefined,
  isExpired: boolean,
  expiredLevels: ExpiredIndexLevels,
) {
  const selection = useProductSelection();

  return useMemo(() => {
    if (!product) return 0;
    if (isExpired) {
      const niftyLevel = Number(selection.niftyLevel) || expiredLevels.niftyLevel || undefined;
      const sensexLevel = Number(selection.sensexLevel) || expiredLevels.sensexLevel || undefined;
      const resolved = resolveValuationLevel(product, { niftyLevel, sensexLevel });
      if (resolved > 0) return resolved;
      if (expiredLevels.level != null) return expiredLevels.level;
      return getIndexEntryLevel(product);
    }

    const useLiveMarket = isDeskToday(selection.valuationDate);
    const niftyLevel = useLiveMarket
      ? selection.marketLevels?.niftyLevel || Number(selection.niftyLevel) || undefined
      : Number(selection.niftyLevel) || undefined;
    const sensexLevel = useLiveMarket
      ? selection.marketLevels?.sensexLevel || Number(selection.sensexLevel) || undefined
      : Number(selection.sensexLevel) || undefined;

    const hasSource = hasProductIndexSource(product, niftyLevel, sensexLevel);
    const resolved = resolveLiveIndexLevel(product, { niftyLevel, sensexLevel });
    if (!hasSource) return 0;
    return resolved;
  }, [
    product,
    isExpired,
    expiredLevels.level,
    expiredLevels.niftyLevel,
    expiredLevels.sensexLevel,
    selection.valuationDate,
    selection.niftyLevel,
    selection.sensexLevel,
    selection.marketLevels?.niftyLevel,
    selection.marketLevels?.sensexLevel,
  ]);
}

/** Index move (Z) vs initial fixing — live for ongoing / expiring products. */
export function useLiveIndexMove(
  product: ProductRecord | undefined,
  isExpired: boolean,
  expiredLevels: ExpiredIndexLevels,
) {
  const level = useLiveIndexLevel(product, isExpired, expiredLevels);
  return useMemo(() => {
    if (!product) return 0;
    const entry = getIndexEntryLevel(product);
    return entry > 0 && level > 0 ? level / entry - 1 : 0;
  }, [product, level]);
}
