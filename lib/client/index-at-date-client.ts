import { lookupBundledNiftyOnOrBefore } from "@/lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import { parseExcelishDate } from "@/lib/workbook/dates";

export type IndexAtDatePayload = {
  valuationDate: string;
  niftyLevel: number | null;
  sensexLevel: number | null;
  source?: "mongodb" | "history" | "yahoo" | "missing";
};

function cacheKey(deskDate: string, minDeskDate?: string) {
  return `${deskDate}|${minDeskDate ?? ""}`;
}

const responseCache = new Map<string, IndexAtDatePayload>();
const inflight = new Map<string, Promise<IndexAtDatePayload | null>>();

/** Instant Nifty from bundled desk history — no network. */
export function instantNiftyForDeskDate(deskDate: string): number | undefined {
  const parsed = parseExcelishDate(deskDate);
  if (!parsed) return undefined;
  return lookupBundledNiftyOnOrBefore(parsed);
}

/** Instant Sensex from bundled desk history — no network. */
export function instantSensexForDeskDate(deskDate: string): number | undefined {
  const parsed = parseExcelishDate(deskDate);
  if (!parsed) return undefined;
  return lookupBundledSensexOnOrBefore(parsed);
}

/** Cached index-at-date fetch — dedupes concurrent requests for the same date. */
export async function fetchIndexAtDateCached(
  deskDate: string,
  minDeskDate?: string,
  signal?: AbortSignal,
): Promise<IndexAtDatePayload | null> {
  const key = cacheKey(deskDate, minDeskDate);
  const cached = responseCache.get(key);
  if (cached) return cached;

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const params = new URLSearchParams({ date: deskDate });
      if (minDeskDate) params.set("minDate", minDeskDate);
      const res = await fetch(`/api/market/index-at-date?${params.toString()}`, { signal });
      if (!res.ok) return null;
      const json = (await res.json()) as IndexAtDatePayload;
      if (json.niftyLevel != null || json.sensexLevel != null) {
        responseCache.set(key, json);
      }
      return json;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return null;
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, request);
  return request;
}

/** Prime client cache after a successful resolve (e.g. live market sync). */
export function primeIndexAtDateCache(deskDate: string, levels: IndexAtDatePayload, minDeskDate?: string) {
  responseCache.set(cacheKey(deskDate, minDeskDate), levels);
}
