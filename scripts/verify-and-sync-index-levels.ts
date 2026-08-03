/**
 * Compare Yahoo vs Mongo vs bundled Nifty/Sensex (does not mutate unless --sync).
 * Usage:
 *   npx tsx scripts/verify-and-sync-index-levels.ts
 *   npx tsx scripts/verify-and-sync-index-levels.ts --sync
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { COLLECTIONS, closeMongoClient, getMongoDb, isMongoConfigured } from "../lib/db/mongo";
import { syncIndexPricesFromYahoo } from "../lib/db/index-prices";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { toLocalDateKey } from "../lib/workbook/dates";

function loadDotEnvLocal() {
  const path = join(process.cwd(), ".env.local");
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

function deskDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

async function yahooClose(symbol: string, days = 20) {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - days * 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SP-Dashboard/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`yahoo ${symbol} ${res.status}`);
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
  const rows: Array<{ date: string; close: number }> = [];
  for (let i = 0; i < stamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    rows.push({
      date: toLocalDateKey(new Date(stamps[i]! * 1000)),
      close: Math.round(close * 100) / 100,
    });
  }
  return rows;
}

async function main() {
  loadDotEnvLocal();
  const doSync = process.argv.includes("--sync");
  const todayKey = toLocalDateKey(new Date());
  console.log("mongo configured:", isMongoConfigured());
  console.log("desk today:", todayKey);

  const [niftyY, sensexY] = await Promise.all([yahooClose("^NSEI"), yahooClose("^BSESN")]);
  console.log("\nYahoo last 8 Nifty:");
  for (const r of niftyY.slice(-8)) console.log(`  ${r.date}  ${r.close}`);
  console.log("\nYahoo last 8 Sensex:");
  for (const r of sensexY.slice(-8)) console.log(`  ${r.date}  ${r.close}`);

  if (doSync) {
    console.log("\nSyncing Mongo from Yahoo (from 2018)...");
    const sync = await syncIndexPricesFromYahoo(new Date("2018-01-01"));
    console.log("sync result:", sync);
  }

  const db = await getMongoDb();
  if (!db) {
    console.error("Mongo DB unavailable");
    process.exitCode = 1;
    return;
  }
  const col = db.collection(COLLECTIONS.indexPrices);
  const recent = await col
    .find({ date: { $gte: "2026-07-20" } })
    .sort({ date: 1 })
    .toArray();
  console.log("\nMongo index_prices from 2026-07-20:");
  for (const r of recent) {
    console.log(`  ${r.date}  Nifty ${r.nifty}  Sensex ${r.sensex}  (${r.source})`);
  }

  console.log("\nParity check (settled sessions; today allowed live drift):");
  let mismatches = 0;
  for (const y of niftyY.slice(-8)) {
    const sy = sensexY.find((s) => s.date === y.date);
    const mongo = await col.findOne({ date: y.date });
    const bn = lookupBundledNiftyOnOrBefore(deskDate(y.date));
    const bs = lookupBundledSensexOnOrBefore(deskDate(y.date));
    const isToday = y.date === todayKey;
    // Live session: require Mongo ↔ bundled lockstep only (Yahoo last bar still moves).
    // Settled sessions: Yahoo ↔ Mongo ↔ bundled must match tightly.
    const mongoBundledOk =
      mongo != null &&
      bn != null &&
      bs != null &&
      Math.abs(Number(mongo.nifty) - bn) < 0.06 &&
      Math.abs(Number(mongo.sensex) - bs) < 0.06;
    const yahooOk =
      isToday ||
      (mongo != null &&
        sy != null &&
        bn != null &&
        bs != null &&
        Math.abs(Number(mongo.nifty) - y.close) < 0.06 &&
        Math.abs(Number(mongo.sensex) - sy.close) < 0.06 &&
        Math.abs(bn - y.close) < 0.06 &&
        Math.abs(bs - sy.close) < 0.06);
    const ok = mongoBundledOk && yahooOk;
    if (!ok) mismatches += 1;
    console.log(
      `  ${y.date}  Y ${y.close}/${sy?.close ?? "—"}  M ${mongo?.nifty ?? "—"}/${mongo?.sensex ?? "—"}  B ${bn ?? "—"}/${bs ?? "—"}  ${ok ? (isToday ? "OK(live)" : "OK") : "MISMATCH"}`,
    );
  }

  const jul28 = await col.findOne({ date: "2026-07-28" });
  if (jul28 && Math.abs(Number(jul28.nifty) - 24208.55) < 0.01) {
    console.error("\nFAIL: Mongo still has stale Nifty 24208.55 on 2026-07-28");
    process.exitCode = 1;
    return;
  }
  if (!jul28 || Math.abs(Number(jul28.nifty) - 23985.35) > 0.06) {
    console.error(`\nFAIL: 2026-07-28 Mongo Nifty expected 23985.35, got ${jul28?.nifty}`);
    process.exitCode = 1;
    return;
  }

  if (mismatches > 0) {
    console.error(`\nFAIL: ${mismatches} date(s) mismatched — run npm run refresh:index-levels`);
    process.exitCode = 1;
    return;
  }
  console.log("\nPASS: Yahoo ↔ Mongo ↔ Bundled aligned (Jul-28 stale guard cleared)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoClient();
  });
