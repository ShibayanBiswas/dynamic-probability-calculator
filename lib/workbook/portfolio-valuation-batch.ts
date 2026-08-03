import { formatDeskDate } from "@/lib/market-data";
import { computeExpiredMark, getExpiredMarkDeskDate } from "@/lib/expired-mark";
import { resolveDeskIndexLevels, resolveDeskIndexLevelsForDate } from "@/lib/desk-index-levels";
import { getProductExpirationDate } from "@/lib/product-dates";
import { getProductLifecycleStatus, isActiveMarkAtDate, type LifecycleStatus } from "@/lib/product-lifecycle";
import { inferDebentureCount, isSensexLinked, resolveLiveIndexLevel } from "@/lib/product-utils";
import type { DeskIndexLevels } from "@/lib/desk-index-levels";
import type { ProductRecord } from "@/lib/types";
import { computeValuation } from "@/lib/workbook/valuation-engine";
import {
  blankValuationSnapshot,
  snapshotFromValuation,
  type PortfolioValuationSnapshot,
} from "@/lib/workbook/portfolio-snapshots";

export type PortfolioLevelInputs = {
  niftyLevel?: number;
  sensexLevel?: number;
  asOf?: Date;
};

export type ActiveValuationBatchOptions = {
  valuationDate: string;
  niftyLevel?: number;
  sensexLevel?: number;
};

const debentureCache = new WeakMap<ProductRecord, number>();

function debenturesFor(product: ProductRecord): number {
  const cached = debentureCache.get(product);
  if (cached != null) return cached;
  const count = inferDebentureCount(product);
  debentureCache.set(product, count);
  return count;
}

function expiredPortfolioMarkDate(product: ProductRecord, asOf: Date): string {
  const finalObs = getExpiredMarkDeskDate(product);
  if (finalObs) return finalObs;
  const maturity = getProductExpirationDate(product);
  return maturity ? formatDeskDate(maturity) : formatDeskDate(asOf);
}

function hasRequiredIndexLevel(product: ProductRecord, levels: DeskIndexLevels): boolean {
  if (isSensexLinked(product)) {
    return levels.sensexLevel != null && Number.isFinite(levels.sensexLevel) && levels.sensexLevel > 0;
  }
  return levels.niftyLevel != null && Number.isFinite(levels.niftyLevel) && levels.niftyLevel > 0;
}

/** Batch MTM for active book rows — shared index levels, minimal per-row overhead. */
export function computeActiveValuationSnapshots(
  products: ProductRecord[],
  options: ActiveValuationBatchOptions,
): PortfolioValuationSnapshot[] {
  const levels = resolveDeskIndexLevelsForDate(
    { niftyLevel: options.niftyLevel, sensexLevel: options.sensexLevel },
    options.valuationDate,
  );
  const valuationDate = options.valuationDate;
  const snapshots: PortfolioValuationSnapshot[] = new Array(products.length);

  for (let i = 0; i < products.length; i++) {
    const product = products[i]!;
    if (!isActiveMarkAtDate(product, valuationDate) || !hasRequiredIndexLevel(product, levels)) {
      snapshots[i] = blankValuationSnapshot(valuationDate);
      continue;
    }
    const result = computeValuation(product, {
      valuationDate,
      currentLevel: resolveLiveIndexLevel(product, levels),
      debentures: debenturesFor(product),
    });
    snapshots[i] = snapshotFromValuation(result, valuationDate);
  }
  return snapshots;
}

/** Single-row portfolio mark — respects explicit lifecycle status from the caller. */
export function computePortfolioValuation(
  product: ProductRecord,
  status: LifecycleStatus,
  inputs: PortfolioLevelInputs = {},
): PortfolioValuationSnapshot {
  const asOf = inputs.asOf ?? new Date();
  const deskToday = formatDeskDate(asOf);

  if (!product.formulaText) {
    return blankValuationSnapshot(
      status === "expired" ? expiredPortfolioMarkDate(product, asOf) : deskToday,
    );
  }

  if (status === "expired") {
    const mark = computeExpiredMark(product);
    const markDate = expiredPortfolioMarkDate(product, asOf);
    return mark ? snapshotFromValuation(mark, markDate) : blankValuationSnapshot(markDate);
  }

  const levels = resolveDeskIndexLevels(
    { niftyLevel: inputs.niftyLevel, sensexLevel: inputs.sensexLevel },
    asOf,
  );
  const result = computeValuation(product, {
    valuationDate: deskToday,
    currentLevel: resolveLiveIndexLevel(product, levels),
    debentures: debenturesFor(product),
  });
  return snapshotFromValuation(result, deskToday);
}

/** Portfolio valuations — live desk today or final-observation marks for expired. */
export function computePortfolioValuationSnapshots(
  products: ProductRecord[],
  inputs: PortfolioLevelInputs = {},
): PortfolioValuationSnapshot[] {
  const asOf = inputs.asOf ?? new Date();
  const deskToday = formatDeskDate(asOf);
  const levels = resolveDeskIndexLevels(
    { niftyLevel: inputs.niftyLevel, sensexLevel: inputs.sensexLevel },
    asOf,
  );
  const snapshots: PortfolioValuationSnapshot[] = new Array(products.length);

  // Partition once so live rows share one index resolve path without branching noise.
  for (let i = 0; i < products.length; i++) {
    const product = products[i]!;
    const status = getProductLifecycleStatus(product, asOf);

    if (!product.formulaText) {
      snapshots[i] = blankValuationSnapshot(
        status === "expired" ? expiredPortfolioMarkDate(product, asOf) : deskToday,
      );
      continue;
    }

    if (status === "expired") {
      const mark = computeExpiredMark(product);
      const markDate = expiredPortfolioMarkDate(product, asOf);
      snapshots[i] = mark ? snapshotFromValuation(mark, markDate) : blankValuationSnapshot(markDate);
      continue;
    }

    if (!hasRequiredIndexLevel(product, levels)) {
      snapshots[i] = blankValuationSnapshot(deskToday);
      continue;
    }

    const result = computeValuation(product, {
      valuationDate: deskToday,
      currentLevel: resolveLiveIndexLevel(product, levels),
      debentures: debenturesFor(product),
    });
    snapshots[i] = snapshotFromValuation(result, deskToday);
  }
  return snapshots;
}
