import { lookupBundledNiftyOnOrBefore } from "@/lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import { resolveCustomUnderlyingLevel } from "@/lib/custom-underlying-history";
import { isObservationFixingSettled } from "@/lib/observation-settlement";
import { getProductObservationDates } from "@/lib/product-dates";
import { getIndexEntryLevel } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { getUnderlyingKind } from "@/lib/underlying-benchmark";

function levelFromBundled(product: ProductRecord, date: Date): number | null {
  const kind = getUnderlyingKind(product);
  if (kind === "sensex") return lookupBundledSensexOnOrBefore(date) ?? null;
  if (kind === "custom") return resolveCustomUnderlyingLevel(product, date) ?? null;
  return lookupBundledNiftyOnOrBefore(date) ?? null;
}

export type ObservationLevelSnapshot = {
  date: Date;
  isFuture: boolean;
  level: number | null;
  performance: number | null;
};

/** Synchronous observation levels for exports — uses bundled index / custom history (same baseline as the UI hook). */
export function buildObservationLevelsSnapshot(
  product: ProductRecord,
  asOf: Date,
): ObservationLevelSnapshot[] {
  const entry = getIndexEntryLevel(product);
  const dates = getProductObservationDates(product);

  return dates.map((date) => {
    const settled = isObservationFixingSettled(date, asOf);
    const bundled = settled ? levelFromBundled(product, date) : null;
    return {
      date,
      isFuture: !settled,
      level: bundled,
      performance: bundled != null && entry > 0 ? bundled / entry - 1 : null,
    };
  });
}
