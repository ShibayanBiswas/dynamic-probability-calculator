import { deskDateKey } from "@/lib/market-data";
import type { LifecycleFilter } from "@/lib/product-lifecycle";
import type { ProductRecord } from "@/lib/types";
import {
  computePortfolioValuationSnapshots,
  type PortfolioLevelInputs,
} from "@/lib/workbook/portfolio-valuation-batch";
import type { PortfolioValuationSnapshot } from "@/lib/workbook/portfolio-snapshots";

export type PortfolioSnapshotMap = Map<string, PortfolioValuationSnapshot>;

/** Priority tab fills first in small chunks so the grid paints without long main-thread stalls. */
const PRIORITY_CHUNK = 60;
const BACKGROUND_CHUNK = 120;
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 6;
/** Publish progress every N priority chunks (plus first + last) to cut React churn. */
const PRIORITY_PUBLISH_EVERY = 2;

type CacheEntry = {
  key: string;
  map: PortfolioSnapshotMap;
  at: number;
  complete: boolean;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PortfolioSnapshotMap>>();
const partialListeners = new Map<string, Set<(map: PortfolioSnapshotMap, complete: boolean) => void>>();

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    // setTimeout(0) returns control quickly; requestIdleCallback often waited ~48ms/chunk.
    window.setTimeout(resolve, 0);
  });
}

/** Universe cache key — shared across all lifecycle tabs for the same desk day + levels. */
export function portfolioUniverseCacheKey(
  inputs: PortfolioLevelInputs,
  bookRevision?: string,
  universeSize = 0,
): string {
  const day = deskDateKey(inputs.asOf ?? new Date());
  const nifty = inputs.niftyLevel ?? 0;
  const sensex = inputs.sensexLevel ?? 0;
  const revision = bookRevision ?? "";
  return `u|${day}|${nifty}|${sensex}|${universeSize}|${revision}`;
}

/** @deprecated Prefer {@link portfolioUniverseCacheKey} — kept for callers that still pass a pool. */
export function portfolioSnapshotCacheKey(
  pool: ProductRecord[],
  _lifecycle: LifecycleFilter,
  inputs: PortfolioLevelInputs,
  bookRevision?: string,
): string {
  return portfolioUniverseCacheKey(inputs, bookRevision, pool.length);
}

function touchCache(entry: CacheEntry) {
  cache.delete(entry.key);
  cache.set(entry.key, entry);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
}

export function peekPortfolioSnapshotMap(key: string): PortfolioSnapshotMap | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  touchCache(entry);
  return entry.map;
}

export function peekPortfolioSnapshotComplete(key: string): boolean {
  const entry = cache.get(key);
  if (!entry) return false;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return false;
  }
  return entry.complete;
}

export function invalidatePortfolioSnapshotCache() {
  cache.clear();
  inflight.clear();
  partialListeners.clear();
}

function publishPartial(key: string, map: PortfolioSnapshotMap, complete: boolean) {
  const entry: CacheEntry = { key, map, at: Date.now(), complete };
  touchCache(entry);
  const listeners = partialListeners.get(key);
  if (!listeners) return;
  for (const listener of listeners) listener(map, complete);
}

export function subscribePortfolioSnapshotProgress(
  key: string,
  listener: (map: PortfolioSnapshotMap, complete: boolean) => void,
): () => void {
  let set = partialListeners.get(key);
  if (!set) {
    set = new Set();
    partialListeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) partialListeners.delete(key);
  };
}

async function fillChunks(
  products: ProductRecord[],
  map: PortfolioSnapshotMap,
  inputs: PortfolioLevelInputs,
  chunkSize: number,
  key: string,
  publishEveryChunk: boolean,
): Promise<void> {
  let chunkIndex = 0;
  for (let start = 0; start < products.length; start += chunkSize) {
    const chunk = products.slice(start, start + chunkSize);
    const snapshots = computePortfolioValuationSnapshots(chunk, inputs);
    for (let i = 0; i < chunk.length; i++) {
      map.set(chunk[i]!.rowId, snapshots[i]!);
    }
    const isLast = start + chunkSize >= products.length;
    if (
      publishEveryChunk &&
      (chunkIndex === 0 || isLast || (chunkIndex + 1) % PRIORITY_PUBLISH_EVERY === 0)
    ) {
      publishPartial(key, new Map(map), false);
    }
    chunkIndex += 1;
    if (!isLast) {
      await yieldToMain();
    }
  }
}

/**
 * Compute marks for `universe`, prioritizing `priorityPool` so the active tab
 * fills first. Result is cached for every lifecycle tab on the same desk day.
 */
export function loadPortfolioSnapshotMap(
  priorityPool: ProductRecord[],
  _lifecycle: LifecycleFilter,
  inputs: PortfolioLevelInputs,
  options?: { universe?: ProductRecord[]; bookRevision?: string },
): Promise<PortfolioSnapshotMap> {
  const universe =
    options?.universe && options.universe.length > 0 ? options.universe : priorityPool;
  const key = portfolioUniverseCacheKey(inputs, options?.bookRevision, universe.length);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at <= CACHE_TTL_MS && hit.complete) {
    touchCache(hit);
    return Promise.resolve(hit.map);
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const map: PortfolioSnapshotMap = hit?.map ? new Map(hit.map) : new Map();
    const missingPriority = priorityPool.filter((p) => !map.has(p.rowId));
    const priorityIds = new Set(priorityPool.map((p) => p.rowId));
    const missingRest = universe.filter((p) => !priorityIds.has(p.rowId) && !map.has(p.rowId));

    if (missingPriority.length > 0) {
      await fillChunks(missingPriority, map, inputs, PRIORITY_CHUNK, key, true);
      publishPartial(key, new Map(map), missingRest.length === 0);
    }

    if (missingRest.length > 0) {
      await fillChunks(missingRest, map, inputs, BACKGROUND_CHUNK, key, false);
    }

    publishPartial(key, map, true);
    inflight.delete(key);
    return map;
  })();

  inflight.set(key, request);
  return request;
}

/** Warm the full-book cache so tab switches are instant after first visit. */
export function prefetchPortfolioUniverse(
  universe: ProductRecord[],
  inputs: PortfolioLevelInputs,
  bookRevision?: string,
): Promise<PortfolioSnapshotMap> {
  return loadPortfolioSnapshotMap(universe, "ongoing", inputs, { universe, bookRevision });
}
