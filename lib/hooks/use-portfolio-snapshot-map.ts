"use client";

import { useEffect, useMemo, useState } from "react";

import {
  loadPortfolioSnapshotMap,
  peekPortfolioSnapshotComplete,
  peekPortfolioSnapshotMap,
  portfolioUniverseCacheKey,
  prefetchPortfolioUniverse,
  subscribePortfolioSnapshotProgress,
  type PortfolioSnapshotMap,
} from "@/lib/portfolio-snapshot-store";
import type { LifecycleFilter } from "@/lib/product-lifecycle";
import type { ProductRecord } from "@/lib/types";
import type { PortfolioLevelInputs } from "@/lib/workbook/portfolio-valuation-batch";

const EMPTY_SNAPSHOTS: PortfolioSnapshotMap = new Map();

/**
 * Live portfolio marks — computes the full book once (active tab first), then every
 * lifecycle pill reuses the same cache for instant switches.
 */
export function usePortfolioSnapshotMap(
  snapshotPool: ProductRecord[],
  lifecycle: LifecycleFilter,
  inputs: PortfolioLevelInputs,
  bookRevision?: string,
  /** Full desk book — when provided, all tabs share one valuation pass. */
  universe?: ProductRecord[],
) {
  const { asOf, niftyLevel, sensexLevel } = inputs;
  const book = universe && universe.length > 0 ? universe : snapshotPool;

  const snapshotKey = useMemo(
    () => portfolioUniverseCacheKey({ asOf, niftyLevel, sensexLevel }, bookRevision, book.length),
    [asOf, niftyLevel, sensexLevel, bookRevision, book.length],
  );

  const cachedMap = peekPortfolioSnapshotMap(snapshotKey);
  const cachedComplete = peekPortfolioSnapshotComplete(snapshotKey);
  const [liveMap, setLiveMap] = useState<PortfolioSnapshotMap | null>(null);
  const [complete, setComplete] = useState(cachedComplete);

  useEffect(() => {
    const existing = peekPortfolioSnapshotMap(snapshotKey);
    setLiveMap(existing);
    setComplete(peekPortfolioSnapshotComplete(snapshotKey));

    const unsubscribe = subscribePortfolioSnapshotProgress(snapshotKey, (map, done) => {
      setLiveMap(new Map(map));
      setComplete(done);
    });

    void loadPortfolioSnapshotMap(snapshotPool, lifecycle, { asOf, niftyLevel, sensexLevel }, {
      universe: book,
      bookRevision,
    }).then((map) => {
      setLiveMap(map);
      setComplete(true);
    });

    return unsubscribe;
    // snapshotKey encodes desk day, levels, and book size. Lifecycle only affects
    // priority order while the cache is still filling — do not remount when complete.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotKey]);

  // After the active tab is warm, finish the rest of the book in the background.
  useEffect(() => {
    if (!universe || universe.length === 0) return;
    if (peekPortfolioSnapshotComplete(snapshotKey)) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) {
        void prefetchPortfolioUniverse(universe, { asOf, niftyLevel, sensexLevel }, bookRevision);
      }
    };

    let idleId: number | undefined;
    let timeoutId: number | undefined;
    if (typeof requestIdleCallback !== "undefined") {
      idleId = requestIdleCallback(run, { timeout: 400 });
    } else {
      timeoutId = window.setTimeout(run, 120);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof cancelIdleCallback !== "undefined") {
        cancelIdleCallback(idleId);
      }
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [snapshotKey, universe, asOf, niftyLevel, sensexLevel, bookRevision]);

  const snapshotByRowId = cachedMap ?? liveMap ?? EMPTY_SNAPSHOTS;
  const poolReady =
    snapshotPool.length === 0 ||
    snapshotPool.every((p) => snapshotByRowId.has(p.rowId));
  const isLoading = !poolReady && !complete;

  return { snapshotByRowId, isLoading, snapshotKey, complete };
}
