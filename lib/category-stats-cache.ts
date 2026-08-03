import { deskDateKey } from "@/lib/market-data";
import type { LifecycleFilter } from "@/lib/product-lifecycle";
import type { LifecycleCategoryStats } from "@/lib/analytics";

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 24;

type CacheEntry = {
  at: number;
  stats: LifecycleCategoryStats;
};

const cache = new Map<string, CacheEntry>();

export function categoryStatsCacheKey(
  filter: LifecycleFilter,
  asOf: Date,
  liveLevels: { niftyLevel?: number; sensexLevel?: number },
  bookSize: number,
): string {
  const nifty = liveLevels.niftyLevel && liveLevels.niftyLevel > 0 ? Math.round(liveLevels.niftyLevel) : 0;
  const sensex = liveLevels.sensexLevel && liveLevels.sensexLevel > 0 ? Math.round(liveLevels.sensexLevel) : 0;
  return `${filter}|${deskDateKey(asOf)}|${nifty}|${sensex}|${bookSize}`;
}

export function peekCategoryStatsCache(key: string): LifecycleCategoryStats | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.stats;
}

export function setCategoryStatsCache(key: string, stats: LifecycleCategoryStats) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), stats });
}

export function invalidateCategoryStatsCache() {
  cache.clear();
}
