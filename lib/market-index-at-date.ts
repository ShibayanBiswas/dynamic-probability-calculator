import { lookupBundledNiftyOnOrBefore } from "@/lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import { getIndexPriceOnOrBefore } from "@/lib/db/index-prices";
import { getCachedIndexAtDate, setCachedIndexAtDate } from "@/lib/index-at-date-cache";
import { formatDeskDate } from "@/lib/market-data";
import { parseExcelishDate, toLocalDateKey } from "@/lib/workbook/dates";

const YAHOO_TIMEOUT_MS = 2_500;

async function fetchYahooClose(symbol: string, targetDate: Date): Promise<number | null> {
  const dayStart = Math.floor(targetDate.getTime() / 1000) - 86400 * 7;
  const dayEnd = Math.floor(targetDate.getTime() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${dayStart}&period2=${dayEnd}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 SP-Dashboard/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(YAHOO_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
    };
    const stamps = json.chart?.result?.[0]?.timestamp ?? [];
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const targetKey = toLocalDateKey(targetDate);
    let best: { date: string; close: number } | null = null;
    for (let i = 0; i < stamps.length; i++) {
      const close = closes[i];
      if (close == null || !Number.isFinite(close)) continue;
      const key = toLocalDateKey(new Date(stamps[i]! * 1000));
      if (key <= targetKey && (!best || key > best.date)) {
        best = { date: key, close };
      }
    }
    return best ? Math.round(best.close * 100) / 100 : null;
  } catch {
    return null;
  }
}

export type IndexAtDateResult = {
  valuationDate: string;
  isoDate: string;
  minDate: string | null;
  niftyLevel: number | null;
  sensexLevel: number | null;
  source: "mongodb" | "history" | "yahoo" | "missing";
};

/** Nifty/Sensex closes for a desk date — MongoDB first, then bundled history + Yahoo. */
export async function resolveIndexLevelsAtDate(
  deskDateRaw: string,
  minDeskDateRaw?: string,
  options?: { skipYahoo?: boolean },
): Promise<IndexAtDateResult | null> {
  const parsed = parseExcelishDate(deskDateRaw);
  if (!parsed) return null;

  const iso = toLocalDateKey(parsed);
  const minParsed = minDeskDateRaw ? parseExcelishDate(minDeskDateRaw) : undefined;
  const minIso = minParsed ? toLocalDateKey(minParsed) : undefined;

  if (minIso && iso < minIso) return null;

  const cached = getCachedIndexAtDate(iso, minIso);
  if (cached) return cached;

  const stored = await getIndexPriceOnOrBefore(iso, minIso);
  let niftyLevel = stored?.nifty ?? null;
  let sensexLevel = stored?.sensex ?? null;
  let usedYahoo = false;

  if (niftyLevel == null) {
    niftyLevel = lookupBundledNiftyOnOrBefore(parsed) ?? null;
  }
  if (sensexLevel == null) {
    sensexLevel = lookupBundledSensexOnOrBefore(parsed) ?? null;
  }

  if (!options?.skipYahoo && (niftyLevel == null || sensexLevel == null)) {
    const [niftyYahoo, sensexYahoo] = await Promise.all([
      niftyLevel == null ? fetchYahooClose("^NSEI", parsed) : Promise.resolve(null),
      sensexLevel == null ? fetchYahooClose("^BSESN", parsed) : Promise.resolve(null),
    ]);
    if (niftyYahoo != null || sensexYahoo != null) usedYahoo = true;
    niftyLevel = niftyLevel ?? niftyYahoo;
    sensexLevel = sensexLevel ?? sensexYahoo;
  }

  if (niftyLevel != null || sensexLevel != null) {
    const result: IndexAtDateResult = {
      valuationDate: formatDeskDate(parsed),
      isoDate: stored?.date ?? iso,
      minDate: minIso ?? null,
      niftyLevel,
      sensexLevel,
      source: stored ? "mongodb" : usedYahoo ? "yahoo" : "history",
    };
    setCachedIndexAtDate(iso, minIso, result);
    return result;
  }

  const missing: IndexAtDateResult = {
    valuationDate: formatDeskDate(parsed),
    isoDate: iso,
    minDate: minIso ?? null,
    niftyLevel: null,
    sensexLevel: null,
    source: "missing",
  };
  setCachedIndexAtDate(iso, minIso, missing);
  return missing;
}
