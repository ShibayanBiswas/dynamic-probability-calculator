import indexHistory from "@/lib/data/valuation-index-history.json";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import { resolveCustomUnderlyingLevel } from "@/lib/custom-underlying-history";
import { formatDeskDate } from "@/lib/market-data";
import { getProductFinalObservationDate } from "@/lib/product-dates";
import { inferDebentureCount } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { getUnderlyingKind } from "@/lib/underlying-benchmark";
import { toExcelSerial } from "@/lib/workbook/dates";
import { lookupIndexLevelOnOrBefore, type IndexHistoryEntry } from "@/lib/workbook/index-history";
import { parseExcelishDate } from "@/lib/workbook/dates";
import { computeValuation, type ValuationResult } from "@/lib/workbook/valuation-engine";

const NIFTY_HISTORY: IndexHistoryEntry[] = [...indexHistory.entries].sort(
  (a, b) => a.dateSerial - b.dateSerial,
);

/** Desk date for the final observation (last fixing) of an expired product. */
export function getExpiredMarkDeskDate(product: ProductRecord): string | undefined {
  const finalObs = getProductFinalObservationDate(product);
  return finalObs ? formatDeskDate(finalObs) : undefined;
}

/** Bundled Nifty history close on or before `date` (sync — no network). */
export function resolveHistoricalNiftyLevel(date: Date): number | undefined {
  return lookupIndexLevelOnOrBefore(NIFTY_HISTORY, toExcelSerial(date));
}

/** Bundled Sensex history close on or before `date` (sync — no network). */
export function resolveHistoricalSensexLevel(date: Date): number | undefined {
  return lookupBundledSensexOnOrBefore(date);
}

/**
 * Historical underlying level for marking an expired product at a desk date.
 * Custom equity/commodity underlyings use dedicated series — never Nifty bluff.
 */
export function resolveHistoricalIndexLevel(product: ProductRecord, date: Date): number | undefined {
  const kind = getUnderlyingKind(product);
  if (kind === "sensex") return resolveHistoricalSensexLevel(date);
  if (kind === "custom") return resolveCustomUnderlyingLevel(product, date);
  return resolveHistoricalNiftyLevel(date);
}

/** Valuation at a historical desk date for an expired product. */
export function computeExpiredMarkAtDate(
  product: ProductRecord,
  deskDateRaw: string,
): ValuationResult | null {
  if (!product.formulaText?.trim()) return null;
  const markDate = parseExcelishDate(deskDateRaw);
  if (!markDate) return null;

  const level = resolveHistoricalIndexLevel(product, markDate);
  if (level == null || !(level > 0)) return null;

  return computeValuation(product, {
    valuationDate: formatDeskDate(markDate),
    currentLevel: level,
    debentures: inferDebentureCount(product),
  });
}

/** Valuation frozen at the product's final observation date using bundled history. */
const expiredMarkMemo = new WeakMap<ProductRecord, ValuationResult | null>();

export function computeExpiredMark(product: ProductRecord): ValuationResult | null {
  if (expiredMarkMemo.has(product)) return expiredMarkMemo.get(product) ?? null;
  const finalObs = getProductFinalObservationDate(product);
  if (!finalObs) {
    expiredMarkMemo.set(product, null);
    return null;
  }
  const mark = computeExpiredMarkAtDate(product, formatDeskDate(finalObs));
  expiredMarkMemo.set(product, mark);
  return mark;
}
