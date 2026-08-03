import type { ProbabilityRunResult } from "@/lib/probability/engine";

type CacheEntry = {
  value: ProbabilityRunResult;
  expiresAt: number;
};

const TTL_MS = 5 * 60 * 1000;
/** Portfolio warm-up can touch hundreds of ISIN×mode keys; keep headroom. */
const MAX_ENTRIES = 1024;
const store = new Map<string, CacheEntry>();

function roundLevel(level: number | undefined): string {
  if (level == null || !Number.isFinite(level)) return "";
  return String(Math.round(level * 100) / 100);
}

export function probabilityCacheKey(parts: {
  isin: string;
  mode: string;
  valuationDate: string;
  underlying: string;
  indexMaxDate: string;
  includePaths: boolean;
  bookRevision?: string;
  /** Required for Current Prob — threshold depends on desk levels. */
  niftyLevel?: number;
  sensexLevel?: number;
}): string {
  return [
    parts.isin,
    parts.mode,
    parts.valuationDate,
    parts.underlying,
    parts.indexMaxDate,
    parts.includePaths ? "paths" : "summary",
    parts.bookRevision ?? "",
    roundLevel(parts.niftyLevel),
    roundLevel(parts.sensexLevel),
  ].join("|");
}

export function getCachedProbability(key: string): ProbabilityRunResult | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  // LRU touch
  store.delete(key);
  store.set(key, hit);
  return hit.value;
}

export function setCachedProbability(key: string, value: ProbabilityRunResult): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function invalidateProbabilityCache(): void {
  store.clear();
}
