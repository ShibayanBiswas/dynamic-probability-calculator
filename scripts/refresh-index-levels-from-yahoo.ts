/**
 * Overwrite bundled Nifty/Sensex history with Yahoo daily closes and drop
 * fake future serials. Upserts the same rows into Mongo `index_prices`.
 *
 * Usage: npx tsx scripts/refresh-index-levels-from-yahoo.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { COLLECTIONS, closeMongoClient, getMongoDb, isMongoConfigured } from "../lib/db/mongo";
import { toExcelSerial, toLocalDateKey } from "../lib/workbook/dates";
import { mergeIndexHistoryEntries, type IndexHistoryEntry } from "../lib/workbook/index-history";

const ROOT = process.cwd();
const NIFTY_PATH = join(ROOT, "lib", "data", "valuation-index-history.json");
const SENSEX_PATH = join(ROOT, "lib", "data", "sensex-index-history.json");

type YahooRow = { date: string; dateSerial: number; close: number };

function loadDotEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function fetchYahooDaily(symbol: string, period1: number, period2: number): Promise<YahooRow[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SP-Dashboard/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
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
  const rows: YahooRow[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    const date = new Date(stamps[i]! * 1000);
    rows.push({
      date: toLocalDateKey(date),
      dateSerial: toExcelSerial(date),
      close: Math.round(close * 100) / 100,
    });
  }
  return rows;
}

function refreshBundled(
  path: string,
  sourceLabel: string,
  yahooRows: YahooRow[],
  maxSerial: number,
) {
  const existing = JSON.parse(readFileSync(path, "utf8")) as {
    source: string;
    entries: IndexHistoryEntry[];
  };
  const beforeFuture = existing.entries.filter((e) => e.dateSerial > maxSerial).length;
  const keptPast = existing.entries.filter((e) => e.dateSerial <= maxSerial);
  const yahooEntries: IndexHistoryEntry[] = yahooRows
    .filter((r) => r.dateSerial <= maxSerial)
    .map((r) => ({ dateSerial: r.dateSerial, level: r.close }));
  const merged = mergeIndexHistoryEntries(keptPast, yahooEntries).filter(
    (e) => e.dateSerial <= maxSerial,
  );
  writeFileSync(
    path,
    `${JSON.stringify({ source: sourceLabel, entries: merged }, null, 2)}\n`,
    "utf8",
  );
  const last = merged[merged.length - 1];
  return {
    before: existing.entries.length,
    after: merged.length,
    droppedFuture: beforeFuture,
    lastSerial: last?.dateSerial,
    lastLevel: last?.level,
  };
}

async function upsertMongoFromYahoo(niftyRows: YahooRow[], sensexRows: YahooRow[]) {
  const db = await getMongoDb();
  if (!db) throw new Error("Mongo unavailable");
  const sensexByDate = new Map(sensexRows.map((r) => [r.date, r.close]));
  const now = new Date();
  const ops = niftyRows
    .map((row) => {
      const sensex = sensexByDate.get(row.date);
      if (sensex == null) return null;
      return {
        updateOne: {
          filter: { date: row.date },
          update: {
            $set: {
              date: row.date,
              nifty: row.close,
              sensex,
              source: "yahoo" as const,
              updatedAt: now,
            },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean);

  if (ops.length > 0) {
    await db.collection(COLLECTIONS.indexPrices).bulkWrite(ops as never, { ordered: false });
  }
  return ops.length;
}

async function main() {
  loadDotEnvLocal();

  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const maxSerial = toExcelSerial(today);
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const period1 = Math.floor(Date.UTC(2000, 0, 1) / 1000);

  console.log(`Desk today: ${todayKey} (serial ${maxSerial})`);
  console.log("Fetching Yahoo ^NSEI / ^BSESN (single pass)…");
  const [niftyYahoo, sensexYahoo] = await Promise.all([
    fetchYahooDaily("^NSEI", period1, period2),
    fetchYahooDaily("^BSESN", period1, period2),
  ]);
  console.log(`Yahoo rows: Nifty ${niftyYahoo.length}, Sensex ${sensexYahoo.length}`);
  console.log(`Yahoo last Nifty: ${niftyYahoo.at(-1)?.date} = ${niftyYahoo.at(-1)?.close}`);
  console.log(`Yahoo last Sensex: ${sensexYahoo.at(-1)?.date} = ${sensexYahoo.at(-1)?.close}`);

  const nifty = refreshBundled(
    NIFTY_PATH,
    "Yahoo ^NSEI daily closes (refreshed) + prior workbook history",
    niftyYahoo,
    maxSerial,
  );
  const sensex = refreshBundled(
    SENSEX_PATH,
    "Yahoo ^BSESN daily closes (refreshed) + prior workbook history",
    sensexYahoo,
    maxSerial,
  );
  console.log(
    `Nifty bundled: ${nifty.before} → ${nifty.after} (dropped ${nifty.droppedFuture} future) last=${nifty.lastLevel}`,
  );
  console.log(
    `Sensex bundled: ${sensex.before} → ${sensex.after} (dropped ${sensex.droppedFuture} future) last=${sensex.lastLevel}`,
  );

  if (!isMongoConfigured()) {
    console.warn("MONGODB_URI not set — skipped Mongo sync");
    return;
  }

  console.log("Upserting Mongo index_prices from the same Yahoo rows…");
  const upserted = await upsertMongoFromYahoo(niftyYahoo, sensexYahoo);
  console.log(`Mongo upserted: ${upserted}`);

  const db = await getMongoDb();
  if (!db) throw new Error("Mongo unavailable after sync");
  const recent = await db
    .collection(COLLECTIONS.indexPrices)
    .find({ date: { $gte: "2026-07-27" } })
    .sort({ date: 1 })
    .toArray();
  console.log("\nMongo recent:");
  for (const r of recent) {
    console.log(`  ${r.date}  Nifty ${r.nifty}  Sensex ${r.sensex}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoClient();
  });
