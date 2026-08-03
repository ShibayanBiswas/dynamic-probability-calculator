"use client";

import { useEffect, useMemo, useState } from "react";

import { lookupBundledNiftyOnOrBefore } from "@/lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import { resolveCustomUnderlyingLevel } from "@/lib/custom-underlying-history";
import { formatDeskDate } from "@/lib/market-data";
import { isObservationFixingSettled } from "@/lib/observation-settlement";
import { getProductObservationDates } from "@/lib/product-dates";
import { getIndexEntryLevel, isCustomUnderlyingProduct, isSensexLinked } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { getUnderlyingKind } from "@/lib/underlying-benchmark";

export type ObservationLevel = {
  date: Date;
  isFuture: boolean;
  level: number | null;
  performance: number | null;
};

function levelFromBundled(product: ProductRecord, date: Date): number | null {
  const kind = getUnderlyingKind(product);
  if (kind === "sensex") return lookupBundledSensexOnOrBefore(date) ?? null;
  if (kind === "custom") return resolveCustomUnderlyingLevel(product, date) ?? null;
  return lookupBundledNiftyOnOrBefore(date) ?? null;
}

async function levelFromApi(product: ProductRecord, date: Date): Promise<number | null> {
  try {
    if (isCustomUnderlyingProduct(product)) {
      const res = await fetch(
        `/api/market/underlying-at-date?date=${encodeURIComponent(formatDeskDate(date))}&underlying=${encodeURIComponent(product.underlying ?? "")}`,
        { cache: "no-store" },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { level: number | null };
      return json.level ?? null;
    }
    const sensex = isSensexLinked(product);
    const res = await fetch(
      `/api/market/index-at-date?date=${encodeURIComponent(formatDeskDate(date))}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { niftyLevel: number | null; sensexLevel: number | null };
    const level = sensex ? json.sensexLevel : json.niftyLevel;
    return level ?? null;
  } catch {
    return null;
  }
}

function buildBaselineLevels(product: ProductRecord, asOf: Date): ObservationLevel[] {
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

export function useObservationLevels(
  product: ProductRecord | undefined,
  asOf?: Date,
): { loading: boolean; levels: ObservationLevel[] } {
  const stableAsOf = useMemo(() => asOf ?? new Date(), [asOf]);

  const baselineLevels = useMemo(() => {
    if (!product) return [];
    return buildBaselineLevels(product, stableAsOf);
  }, [product, stableAsOf]);

  const levelsKey = product ? `${product.rowId}:${stableAsOf.getTime()}` : null;
  const needsRemote = useMemo(() => {
    if (!product) return false;
    return getProductObservationDates(product).some((date) =>
      isObservationFixingSettled(date, stableAsOf),
    );
  }, [product, stableAsOf]);

  const [refinedLevels, setRefinedLevels] = useState<ObservationLevel[] | null>(null);
  const [refinedKey, setRefinedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!product || !levelsKey || !needsRemote) return;

    const entry = getIndexEntryLevel(product);
    const dates = getProductObservationDates(product);
    const settledDates = dates.filter((date) => isObservationFixingSettled(date, stableAsOf));

    let cancelled = false;

    void (async () => {
      const resolved = await Promise.all(
        settledDates.map(async (date) => {
          const apiLevel = await levelFromApi(product, date);
          const bundled = levelFromBundled(product, date);
          return { date, level: apiLevel ?? bundled };
        }),
      );

      if (cancelled) return;
      const byTime = new Map(resolved.map((row) => [row.date.getTime(), row.level]));
      setRefinedLevels(
        dates.map((date) => {
          const settled = isObservationFixingSettled(date, stableAsOf);
          const level = settled ? byTime.get(date.getTime()) ?? null : null;
          return {
            date,
            isFuture: !settled,
            level,
            performance: level != null && entry > 0 ? level / entry - 1 : null,
          };
        }),
      );
      setRefinedKey(levelsKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [levelsKey, needsRemote, product, stableAsOf]);

  const levels =
    !product ? [] : refinedKey === levelsKey && refinedLevels ? refinedLevels : baselineLevels;

  return {
    loading: Boolean(levelsKey && needsRemote && refinedKey !== levelsKey),
    levels,
  };
}
