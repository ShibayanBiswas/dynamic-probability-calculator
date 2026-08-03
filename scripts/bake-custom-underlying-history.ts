/**
 * Bake custom underlying history for non-Nifty/Sensex expired products.
 *
 * Equity: Yahoo NSE daily closes.
 * Gold / silver: COMEX futures × USDINR proxy estimates (labelled source=estimate).
 *
 * Usage: npx tsx scripts/bake-custom-underlying-history.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  estimateCommodityInrLevel,
  listKnownCustomUnderlyingSpecs,
  type CustomUnderlyingSpec,
} from "../lib/underlying-benchmark";
import { loadSeedProducts } from "./lib/load-canonical-dataset";
import {
  getProductExpirationDate,
  getProductFinalObservationDate,
  getProductObservationDates,
} from "../lib/product-dates";
import { resolveCustomUnderlyingSpec } from "../lib/underlying-benchmark";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { toLocalDateKey } from "../lib/workbook/dates";

type HistoryEntry = { date: string; level: number; source: "yahoo" | "estimate" };

async function fetchYahooRange(
  symbol: string,
  period1: Date,
  period2: Date,
): Promise<Map<string, number>> {
  const start = Math.floor(period1.getTime() / 1000) - 86400 * 5;
  const end = Math.floor(period2.getTime() / 1000) + 86400 * 2;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${start}&period2=${end}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SP-Dashboard/1.0" },
  });
  if (!res.ok) {
    console.warn(`Yahoo ${symbol}: HTTP ${res.status}`);
    return new Map();
  }
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  const stamps = json.chart?.result?.[0]?.timestamp ?? [];
  const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const out = new Map<string, number>();
  for (let i = 0; i < stamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || !(close > 0)) continue;
    const key = toLocalDateKey(new Date(stamps[i]! * 1000));
    out.set(key, Math.round(close * 100) / 100);
  }
  return out;
}

function onOrBefore(map: Map<string, number>, dateKey: string): number | undefined {
  const keys = [...map.keys()].sort();
  let best: string | undefined;
  for (const key of keys) {
    if (key <= dateKey) best = key;
    else break;
  }
  return best != null ? map.get(best) : undefined;
}

function collectDateWindow(specKey: string): { min: Date; max: Date; needed: Set<string> } {
  const asOf = new Date();
  const products = filterProductsByLifecycle(
    filterValidMasterProducts(loadSeedProducts(), asOf),
    "expired",
    asOf,
  ).filter((p) => resolveCustomUnderlyingSpec(p)?.key === specKey);

  const needed = new Set<string>();
  let minMs = Number.POSITIVE_INFINITY;
  let maxMs = 0;

  for (const p of products) {
    for (const d of getProductObservationDates(p)) {
      needed.add(toLocalDateKey(d));
      minMs = Math.min(minMs, d.getTime());
      maxMs = Math.max(maxMs, d.getTime());
    }
    const fo = getProductFinalObservationDate(p);
    const exp = getProductExpirationDate(p);
    for (const d of [fo, exp]) {
      if (!d) continue;
      needed.add(toLocalDateKey(d));
      minMs = Math.min(minMs, d.getTime());
      maxMs = Math.max(maxMs, d.getTime());
    }
  }

  if (!Number.isFinite(minMs) || maxMs <= 0) {
    // Fallback window so instrument still bakes something usable
    minMs = Date.UTC(2013, 0, 1);
    maxMs = Date.UTC(2024, 11, 31);
  }

  return {
    min: new Date(minMs - 86400_000 * 14),
    max: new Date(maxMs + 86400_000 * 14),
    needed,
  };
}

async function bakeEquity(spec: CustomUnderlyingSpec): Promise<{
  entries: HistoryEntry[];
  note?: string;
}> {
  if (!spec.yahooSymbol) return { entries: [] };
  const { min, max, needed } = collectDateWindow(spec.key);
  console.log(`  equity ${spec.key} (${spec.yahooSymbol}) ${toLocalDateKey(min)} → ${toLocalDateKey(max)}`);
  const series = await fetchYahooRange(spec.yahooSymbol, min, max);
  const entries: HistoryEntry[] = [];
  // Keep full series in window for on-or-before lookups + denser obs averages
  for (const [date, level] of [...series.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    entries.push({ date, level, source: "yahoo" });
  }
  // Ensure every needed date resolves via on-or-before
  let missing = 0;
  for (const date of needed) {
    if (onOrBefore(series, date) == null) missing += 1;
  }
  if (missing) console.warn(`  WARN ${spec.key}: ${missing}/${needed.size} needed dates have no close`);
  return { entries, note: `Yahoo ${spec.yahooSymbol} daily closes` };
}

async function bakeEstimate(spec: CustomUnderlyingSpec): Promise<{
  entries: HistoryEntry[];
  note?: string;
}> {
  if (!spec.estimate) return { entries: [] };
  const { min, max, needed } = collectDateWindow(spec.key);
  const futuresSymbol = spec.estimate === "gold-inr-g" ? "GC=F" : "SI=F";
  console.log(`  estimate ${spec.key} (${futuresSymbol} × INR=X) ${toLocalDateKey(min)} → ${toLocalDateKey(max)}`);
  const [futures, inr] = await Promise.all([
    fetchYahooRange(futuresSymbol, min, max),
    fetchYahooRange("INR=X", min, max),
  ]);
  const dates = new Set([...futures.keys(), ...inr.keys()]);
  const entries: HistoryEntry[] = [];
  for (const date of [...dates].sort()) {
    const f = onOrBefore(futures, date);
    const fx = onOrBefore(inr, date);
    if (f == null || fx == null) continue;
    const level = estimateCommodityInrLevel(spec.estimate, f, fx);
    if (level == null) continue;
    entries.push({ date, level, source: "estimate" });
  }
  let missing = 0;
  const levelMap = new Map(entries.map((e) => [e.date, e.level]));
  for (const date of needed) {
    if (onOrBefore(levelMap, date) == null) missing += 1;
  }
  if (missing) console.warn(`  WARN ${spec.key}: ${missing}/${needed.size} needed dates missing estimate`);
  const unit = spec.estimate === "gold-inr-g" ? "INR/g" : "INR/kg";
  return {
    entries,
    note: `Estimate ${unit} from ${futuresSymbol} × INR=X (not exchange MCX/Reliance official print)`,
  };
}

async function main() {
  const specs = listKnownCustomUnderlyingSpecs();
  const instruments: Record<
    string,
    {
      key: string;
      label: string;
      yahooSymbol?: string;
      estimate?: CustomUnderlyingSpec["estimate"];
      note?: string;
      entries: HistoryEntry[];
    }
  > = {};

  for (const spec of specs) {
    console.log(`Baking ${spec.label}…`);
    const baked = spec.yahooSymbol
      ? await bakeEquity(spec)
      : await bakeEstimate(spec);
    instruments[spec.key] = {
      key: spec.key,
      label: spec.label,
      yahooSymbol: spec.yahooSymbol,
      estimate: spec.estimate,
      note: baked.note,
      entries: baked.entries,
    };
    console.log(`  → ${baked.entries.length} entries`);
    // Be polite to Yahoo
    await new Promise((r) => setTimeout(r, 400));
  }

  const outPath = resolve(process.cwd(), "lib/data/custom-underlying-history.json");
  const payload = {
    generatedAt: new Date().toISOString(),
    instruments,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${outPath}`);
}

void main();
