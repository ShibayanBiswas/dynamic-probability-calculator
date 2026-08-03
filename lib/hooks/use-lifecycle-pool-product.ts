"use client";

import { useCallback, useEffect, useState } from "react";

import { pickDefaultLifecycleProduct } from "@/lib/desk-lifecycle-defaults";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import {
  assessProductData,
  isCleanProduct,
  isHardBlockedProduct,
  notifyProductBlockedAndReset,
  resetDataQualityAlertDedupe,
} from "@/lib/product-data-guards";
import { formatDeskDate } from "@/lib/market-data";
import { getExpiredMarkDeskDate } from "@/lib/expired-mark";
import { getProductLifecycleStatus, isProductInLifecyclePickerPool, type LifecycleFilter } from "@/lib/product-lifecycle";
import type { ProductRecord } from "@/lib/types";
import { isDeskToday } from "@/lib/workbook/dates";

/** Prefer a computable product without data-quality prompts when auto-picking. */
export function pickAutoSelectProduct(pool: ProductRecord[]): ProductRecord | undefined {
  return pickDefaultLifecycleProduct(pool, "ongoing", new Date());
}

/**
 * Keep the shared product pick across Details → Valuation → Payoff.
 * Only swap to the tab default when the current product is outside this tab's pool
 * (or nothing is selected yet). Does not re-run on every asOf tick.
 */
export function useResyncProductToLifecyclePool(
  pool: ProductRecord[],
  lifecycleFilter: LifecycleFilter,
  asOf: Date,
) {
  const selection = useProductSelection();
  const poolKey = `${lifecycleFilter}:${pool.length}:${pool[0]?.rowId ?? ""}:${pool[pool.length - 1]?.rowId ?? ""}`;

  useEffect(() => {
    if (!pool.length) return;

    const current = selection.resolvedProduct;
    if (current && isProductInLifecyclePickerPool(current, lifecycleFilter, asOf)) {
      // User's pick (or a prior page's pick) is still valid for this tab — keep it.
      return;
    }

    const next = pickDefaultLifecycleProduct(pool, lifecycleFilter, asOf);
    if (!next) return;
    if (current?.rowId === next.rowId) return;
    selection.selectProduct(next, { silent: true, resetValuationDate: true });
    // poolKey covers tab + pool identity; asOf day changes remount via dayKey elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycleFilter, poolKey]);
}

/** Pick the active product from the lifecycle pool (falls back to tab default). */
export function pickLifecyclePoolProduct(
  pool: ProductRecord[],
  resolved: ProductRecord | undefined,
  lifecycleFilter: LifecycleFilter = "ongoing",
  asOf: Date = new Date(),
): ProductRecord | undefined {
  if (resolved && pool.some((p) => p.rowId === resolved.rowId)) return resolved;
  return pickDefaultLifecycleProduct(pool, lifecycleFilter, asOf);
}

export function isDeskReadyProduct(product: ProductRecord | undefined): boolean {
  if (!product) return false;
  const assessment = assessProductData(product);
  return assessment.canValue && assessment.canPayoff && !assessment.missingDescription;
}

/**
 * Lifecycle-scoped product pick — blocks incomplete master rows, shows quality state,
 * and resets to the tab default when formula or entry level is missing.
 */
export function useLifecycleProductPick(
  pool: ProductRecord[],
  lifecycleFilter: LifecycleFilter,
  asOf: Date,
) {
  const selection = useProductSelection();
  const [qualityNotice, setQualityNotice] = useState<{
    filter: LifecycleFilter;
    product: ProductRecord;
    attempted: ProductRecord;
  } | null>(null);

  useEffect(() => {
    resetDataQualityAlertDedupe();
  }, [lifecycleFilter]);

  const applyDefault = useCallback(
    (silent = true) => {
      const fallback = pickDefaultLifecycleProduct(pool, lifecycleFilter, asOf);
      if (fallback) {
        selection.selectProduct(fallback, { silent, resetValuationDate: true });
      }
    },
    [asOf, lifecycleFilter, pool, selection],
  );

  const selectFromPool = useCallback(
    (product: ProductRecord, options?: { silent?: boolean }) => {
      if (!isProductInLifecyclePickerPool(product, lifecycleFilter, asOf)) return;

      if (isHardBlockedProduct(product)) {
        const fallback = pickDefaultLifecycleProduct(pool, lifecycleFilter, asOf);
        if (!options?.silent) {
          setQualityNotice({
            filter: lifecycleFilter,
            product: fallback ?? product,
            attempted: product,
          });
          notifyProductBlockedAndReset(product, fallback?.name);
        }
        applyDefault(true);
        return;
      }

      setQualityNotice(null);
      selection.selectProduct(product, {
        silent: options?.silent,
        resetValuationDate: true,
      });
    },
    [applyDefault, asOf, lifecycleFilter, pool, selection],
  );

  /** Tab default product + valuation date + debentures (Desk Inputs refresh). */
  const resetToLifecycleDefaults = useCallback(() => {
    applyDefault(true);
  }, [applyDefault]);

  const activeQualityNotice =
    qualityNotice?.filter === lifecycleFilter ? qualityNotice : null;

  return {
    selectFromPool,
    resetToLifecycleDefaults,
    qualityNotice: activeQualityNotice,
    dismissQualityNotice: () => setQualityNotice(null),
  };
}

/** @deprecated use pickDefaultLifecycleProduct */
export function pickLongestTenureProduct(pool: ProductRecord[], asOf: Date) {
  return pickDefaultLifecycleProduct(pool, "ongoing", asOf);
}

export function pickCleanLifecycleProduct(pool: ProductRecord[]) {
  return pool.find(isCleanProduct) ?? pool[0];
}

export function shouldResetValuationToToday(lifecycleFilter: LifecycleFilter, valuationDate: string): boolean {
  if (lifecycleFilter === "expired") return false;
  return !isDeskToday(valuationDate);
}

export function defaultValuationDateForProduct(product: ProductRecord, asOf = new Date()): string {
  const expired = getProductLifecycleStatus(product, asOf) === "expired";
  if (expired) return getExpiredMarkDeskDate(product) ?? formatDeskDate(new Date());
  return formatDeskDate(new Date());
}
