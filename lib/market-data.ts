import { formatDisplayDate } from "@/lib/workbook/dates";
import { lookupBundledNiftyOnOrBefore } from "@/lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import {
  resolveMarkDateFallback,
  resolveMarkDateFromCloses,
} from "@/lib/desk-mark-as-of";

/** Desk date format — DD-MM-YYYY for UI and inputs. */
export function formatDeskDate(date: Date = new Date()) {
  return formatDisplayDate(date);
}

export function deskDateKey(date: Date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export interface MarketLevels {
  valuationDate: string;
  /** ISO YYYY-MM-DD of the underlying mark session. */
  markDateKey: string;
  niftyLevel: number;
  sensexLevel: number;
  fetchedAt: string;
  source: "yahoo" | "fallback";
  /** True when today's NSE cash session has closed. */
  sessionClosed: boolean;
}

function bundledLiveFallback(now = new Date()): MarketLevels | null {
  const policy = resolveMarkDateFallback(now);
  const mark = new Date(`${policy.markDateKey}T12:00:00`);
  const nifty = lookupBundledNiftyOnOrBefore(mark);
  const sensex = lookupBundledSensexOnOrBefore(mark);
  if (nifty == null || sensex == null || !(nifty > 0) || !(sensex > 0)) return null;
  return {
    valuationDate: policy.markDateLabel,
    markDateKey: policy.markDateKey,
    niftyLevel: Math.round(nifty * 100) / 100,
    sensexLevel: Math.round(sensex * 100) / 100,
    fetchedAt: now.toISOString(),
    source: "fallback",
    sessionClosed: policy.sessionClosed,
  };
}

type DailyClose = { date: string; close: number };

async function fetchYahooDailyCloses(symbol: string): Promise<DailyClose[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 SP-Dashboard/1.0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: { quote?: Array<{ close?: Array<number | null> }> };
        }>;
      };
    };
    const result = json.chart?.result?.[0];
    const stamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const rows: DailyClose[] = [];
    for (let i = 0; i < stamps.length; i++) {
      const close = closes[i];
      if (close == null || !Number.isFinite(close)) continue;
      const date = new Date(stamps[i]! * 1000).toISOString().slice(0, 10);
      rows.push({ date, close });
    }
    return rows;
  } catch {
    return [];
  }
}

function closeOn(rows: DailyClose[], dateKey: string): number | null {
  const hit = [...rows].reverse().find((r) => r.date === dateKey);
  return hit && hit.close > 0 ? hit.close : null;
}

/**
 * Live Nifty / Sensex marks for the probability desk.
 * Before 15:30 IST → previous trading-day close.
 * After 15:30 IST → today's close when Yahoo has published it.
 */
export async function fetchLiveMarketLevels(): Promise<MarketLevels> {
  const now = new Date();
  const bundled = bundledLiveFallback(now);
  try {
    const [niftyRows, sensexRows] = await Promise.all([
      fetchYahooDailyCloses("^NSEI"),
      fetchYahooDailyCloses("^BSESN"),
    ]);
    if (niftyRows.length && sensexRows.length) {
      const unionDates = [
        ...new Set([...niftyRows.map((r) => r.date), ...sensexRows.map((r) => r.date)]),
      ].sort();
      const policy = resolveMarkDateFromCloses(unionDates, now);
      const niftyLevel = closeOn(niftyRows, policy.markDateKey);
      const sensexLevel = closeOn(sensexRows, policy.markDateKey);
      if (niftyLevel != null && sensexLevel != null) {
        return {
          valuationDate: policy.markDateLabel,
          markDateKey: policy.markDateKey,
          niftyLevel: Math.round(niftyLevel * 100) / 100,
          sensexLevel: Math.round(sensexLevel * 100) / 100,
          fetchedAt: now.toISOString(),
          source: "yahoo",
          sessionClosed: policy.sessionClosed,
        };
      }
    }
  } catch {
    /* use fallback */
  }
  if (bundled) return bundled;
  const policy = resolveMarkDateFallback(now);
  return {
    valuationDate: policy.markDateLabel,
    markDateKey: policy.markDateKey,
    niftyLevel: 0,
    sensexLevel: 0,
    fetchedAt: now.toISOString(),
    source: "fallback",
    sessionClosed: policy.sessionClosed,
  };
}
