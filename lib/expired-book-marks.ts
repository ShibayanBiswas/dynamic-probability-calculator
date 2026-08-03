import { computeExpiredMark, getExpiredMarkDeskDate } from "@/lib/expired-mark";
import { inferDebentureCount, resolveValuationLevel } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { computeValuation } from "@/lib/workbook/valuation-engine";

import type { StatSummary } from "@/lib/analytics";

export type IndexLevelsAtDate = {
  niftyLevel: number | null;
  sensexLevel: number | null;
};

export type ExpiredMarkResult = {
  absReturn: number;
  notional: number;
};

/** Group expired runnable products by last-observation desk date. */
export function groupExpiredProductsByMarkDate(products: ProductRecord[]): Map<string, ProductRecord[]> {
  const byDesk = new Map<string, ProductRecord[]>();
  for (const product of products) {
    if (!product.formulaText?.trim()) continue;
    const desk = getExpiredMarkDeskDate(product);
    if (!desk) continue;
    const bucket = byDesk.get(desk) ?? [];
    bucket.push(product);
    byDesk.set(desk, bucket);
  }
  return byDesk;
}

/** Absolute return at last observation using resolved Nifty/Sensex for that desk date. */
export function computeExpiredAbsReturnAtDesk(
  product: ProductRecord,
  deskDate: string,
  levels: IndexLevelsAtDate | null,
): number | null {
  const resolved = resolveValuationLevel(product, {
    niftyLevel: levels?.niftyLevel ?? undefined,
    sensexLevel: levels?.sensexLevel ?? undefined,
  });

  if (resolved > 0) {
    const valuation = computeValuation(product, {
      valuationDate: deskDate,
      currentLevel: resolved,
      debentures: inferDebentureCount(product),
    });
    if (Number.isFinite(valuation.absReturn)) return valuation.absReturn;
  }

  const fallback = computeExpiredMark(product);
  return fallback && Number.isFinite(fallback.absReturn) ? fallback.absReturn : null;
}

export function aumWeightedAverage(items: Array<{ value: number; weight: number }>): number | null {
  let weightSum = 0;
  let valueSum = 0;
  for (const { value, weight } of items) {
    if (!Number.isFinite(value) || !(weight > 0)) continue;
    weightSum += weight;
    valueSum += value * weight;
  }
  return weightSum > 0 ? valueSum / weightSum : null;
}

export function summariseAumWeightedAbsReturn(marks: ExpiredMarkResult[]): StatSummary {
  const clean = marks.filter((m) => Number.isFinite(m.absReturn) && m.notional > 0);
  if (clean.length === 0) return { min: null, max: null, avg: null, count: 0 };

  const returns = clean.map((m) => m.absReturn);
  return {
    min: Math.min(...returns),
    max: Math.max(...returns),
    avg: aumWeightedAverage(clean.map((m) => ({ value: m.absReturn, weight: m.notional }))),
    count: clean.length,
  };
}

const LEVEL_FETCH_CHUNK = 24;

/** Batch-resolve index levels per unique desk date, then mark each product. */
export async function computeExpiredBookMarks(
  products: ProductRecord[],
  resolveLevels: (deskDate: string) => Promise<IndexLevelsAtDate | null>,
): Promise<Map<string, ExpiredMarkResult>> {
  const byDesk = groupExpiredProductsByMarkDate(products);
  const desks = [...byDesk.keys()];
  const levelByDesk = new Map<string, IndexLevelsAtDate | null>();

  for (let start = 0; start < desks.length; start += LEVEL_FETCH_CHUNK) {
    const chunk = desks.slice(start, start + LEVEL_FETCH_CHUNK);
    const resolved = await Promise.all(chunk.map((desk) => resolveLevels(desk)));
    chunk.forEach((desk, index) => {
      levelByDesk.set(desk, resolved[index]);
    });
  }

  const marks = new Map<string, ExpiredMarkResult>();
  for (const [desk, bucket] of byDesk) {
    const levels = levelByDesk.get(desk) ?? null;
    for (const product of bucket) {
      const absReturn = computeExpiredAbsReturnAtDesk(product, desk, levels);
      const notional = product.tradeAmount ?? 0;
      if (absReturn == null || !(notional > 0)) continue;
      marks.set(product.rowId, { absReturn, notional });
    }
  }

  return marks;
}
