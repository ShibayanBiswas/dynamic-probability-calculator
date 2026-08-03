import type { IndexAtDateResult } from "@/lib/market-index-at-date";

type CacheEntry = { at: number; value: IndexAtDateResult };

const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 512;
const HISTORICAL_TTL_MS = 24 * 60 * 60 * 1000;
const LIVE_TTL_MS = 2 * 60 * 1000;

function cacheKey(iso: string, minIso?: string) {
  return `${iso}|${minIso ?? ""}`;
}

function ttlFor(iso: string) {
  const today = new Date().toISOString().slice(0, 10);
  return iso >= today ? LIVE_TTL_MS : HISTORICAL_TTL_MS;
}

export function getCachedIndexAtDate(iso: string, minIso?: string): IndexAtDateResult | null {
  const key = cacheKey(iso, minIso);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > ttlFor(iso)) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedIndexAtDate(iso: string, minIso: string | undefined, value: IndexAtDateResult) {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey(iso, minIso), { at: Date.now(), value });
}
