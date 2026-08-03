import { formatDisplayDate } from "@/lib/workbook/dates";
import { lookupBundledNiftyOnOrBefore } from "@/lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";

/** Desk date format — DD-MM-YYYY for UI and inputs. */
export function formatDeskDate(date: Date = new Date()) {
  return formatDisplayDate(date);
}

export function deskDateKey(date: Date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export interface MarketLevels {
  valuationDate: string;
  niftyLevel: number;
  sensexLevel: number;
  fetchedAt: string;
  source: "yahoo" | "fallback";
}

const FALLBACK: Omit<MarketLevels, "fetchedAt"> = {
  valuationDate: formatDeskDate(new Date()),
  niftyLevel: 0,
  sensexLevel: 0,
  source: "fallback",
};

function bundledLiveFallback(now = new Date()): Omit<MarketLevels, "fetchedAt"> | null {
  const nifty = lookupBundledNiftyOnOrBefore(now);
  const sensex = lookupBundledSensexOnOrBefore(now);
  if (nifty == null || sensex == null || !(nifty > 0) || !(sensex > 0)) return null;
  return {
    valuationDate: formatDeskDate(now),
    niftyLevel: Math.round(nifty * 100) / 100,
    sensexLevel: Math.round(sensex * 100) / 100,
    source: "fallback",
  };
}

async function fetchYahooLastPrice(symbol: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 SP-Dashboard/1.0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price != null && Number.isFinite(price) ? price : null;
  } catch {
    return null;
  }
}

/** Live Nifty 50 (^NSEI) and BSE Sensex (^BSESN) from Yahoo Finance. */
export async function fetchLiveMarketLevels(): Promise<MarketLevels> {
  const now = new Date();
  const bundled = bundledLiveFallback(now);
  try {
    const [nifty, sensex] = await Promise.all([fetchYahooLastPrice("^NSEI"), fetchYahooLastPrice("^BSESN")]);
    const niftyLevel = nifty != null ? Math.round(nifty * 100) / 100 : bundled?.niftyLevel;
    const sensexLevel = sensex != null ? Math.round(sensex * 100) / 100 : bundled?.sensexLevel;
    if (niftyLevel != null && sensexLevel != null && niftyLevel > 0 && sensexLevel > 0) {
      return {
        valuationDate: formatDeskDate(now),
        niftyLevel,
        sensexLevel,
        fetchedAt: now.toISOString(),
        // Only call it Yahoo when both legs came from Yahoo; mixed is still a usable desk mark.
        source: nifty != null && sensex != null ? "yahoo" : "fallback",
      };
    }
  } catch {
    /* use fallback */
  }
  if (bundled) {
    return {
      ...bundled,
      fetchedAt: now.toISOString(),
    };
  }
  return {
    ...FALLBACK,
    valuationDate: formatDeskDate(now),
    fetchedAt: now.toISOString(),
  };
}
