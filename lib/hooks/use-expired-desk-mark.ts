"use client";

import { useEffect } from "react";

import { useProductSelection } from "@/lib/context/product-selection-provider";
import { hasResolvedDeskIndexLevel } from "@/lib/desk-index-guards";
import { useExpiredLevel } from "@/lib/hooks/use-expired-level";
import type { ProductRecord } from "@/lib/types";

/**
 * Historical underlying for expired products — Nifty/Sensex or dedicated custom series —
 * syncs into the shared selection store so Valuation, Details, and Payoff stay aligned.
 */
export function useExpiredDeskMark(
  product: ProductRecord | undefined,
  valuationDate?: string | null,
) {
  const selection = useProductSelection();
  const mark = useExpiredLevel(product, valuationDate);

  useEffect(() => {
    if (!mark.isExpired || !valuationDate || mark.loading) return;
    if (mark.niftyLevel == null && mark.sensexLevel == null && mark.underlyingLevel == null) return;

    selection.setValuationIndexLevels(
      {
        // Custom closes are carried on niftyLevel (active channel) and labelled in the UI.
        niftyLevel: mark.underlyingLevel ?? mark.niftyLevel,
        sensexLevel: mark.sensexLevel,
      },
      product,
    );
    // selection object identity churns each render; setter is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- omit `selection` snapshot
  }, [
    mark.isExpired,
    mark.loading,
    mark.niftyLevel,
    mark.sensexLevel,
    mark.underlyingLevel,
    product,
    valuationDate,
    selection.setValuationIndexLevels,
  ]);

  return mark;
}

export function hasResolvedExpiredIndexLevel(
  isExpired: boolean,
  levels: {
    loading: boolean;
    level: number | null;
    niftyLevel: number | null;
    sensexLevel: number | null;
    selectionNifty?: number;
    selectionSensex?: number;
  },
): boolean {
  if (!isExpired) return true;
  return hasResolvedDeskIndexLevel(undefined, true, "01-01-2000", {
    loading: levels.loading,
    niftyLevel: levels.niftyLevel,
    sensexLevel: levels.sensexLevel,
    selectionNifty: levels.selectionNifty,
    selectionSensex: levels.selectionSensex,
    expiredLevel: levels.level,
  });
}

export { hasResolvedDeskIndexLevel } from "@/lib/desk-index-guards";
