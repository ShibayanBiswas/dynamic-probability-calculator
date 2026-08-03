/**
 * Upsert Nifty (Gift/NSP from 2001-01-01) + Sensex into Mongo `index_prices`.
 * Uses Primary SP / DPC Atlas credentials from `.env.local`.
 *
 * Usage: npx tsx scripts/sync-index-prices-from-2001.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { COLLECTIONS, closeMongoClient, getMongoDb, isMongoConfigured } from "../lib/db/mongo";
import type { IndexPriceRow } from "../lib/db/index-prices";
import { excelSerialToDate, toLocalDateKey } from "../lib/workbook/dates";

const ROOT = process.cwd();
const NIFTY_CSV = join(ROOT, "lib", "data", "nifty-daily-2001.csv");
const SENSEX_JSON = join(ROOT, "lib", "data", "sensex-index-history.json");
const FLOOR = "2001-01-01";

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

function loadNiftyCsv(): Map<string, number> {
  const map = new Map<string, number>();
  if (!existsSync(NIFTY_CSV)) throw new Error(`Missing ${NIFTY_CSV}`);
  for (const line of readFileSync(NIFTY_CSV, "utf8").split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const i = line.indexOf(",");
    if (i < 0) continue;
    const date = line.slice(0, i).trim();
    const level = Number(line.slice(i + 1).trim());
    if (!date || date < FLOOR || !Number.isFinite(level) || level <= 0) continue;
    map.set(date, Math.round(level * 100) / 100);
  }
  return map;
}

function loadSensexJson(): Map<string, number> {
  const map = new Map<string, number>();
  const raw = JSON.parse(readFileSync(SENSEX_JSON, "utf8")) as {
    entries: Array<{ dateSerial: number; level: number }>;
  };
  for (const row of raw.entries) {
    const date = toLocalDateKey(excelSerialToDate(row.dateSerial));
    if (date < FLOOR || !Number.isFinite(row.level) || row.level <= 0) continue;
    map.set(date, Math.round(row.level * 100) / 100);
  }
  return map;
}

async function main() {
  loadDotEnvLocal();
  if (!isMongoConfigured()) {
    console.error("MONGODB_URI not configured (.env.local).");
    process.exit(1);
  }

  const nifty = loadNiftyCsv();
  const sensex = loadSensexJson();
  console.log(`Loaded Nifty CSV rows: ${nifty.size} · Sensex JSON rows: ${sensex.size}`);

  const dates = [...new Set([...nifty.keys(), ...sensex.keys()])].sort();
  let lastN: number | undefined;
  let lastS: number | undefined;
  const rows: Array<{ date: string; nifty: number; sensex: number }> = [];
  for (const date of dates) {
    if (date < FLOOR) continue;
    if (nifty.has(date)) lastN = nifty.get(date);
    if (sensex.has(date)) lastS = sensex.get(date);
    const n = nifty.get(date) ?? lastN;
    const s = sensex.get(date) ?? lastS;
    if (n == null || s == null) continue;
    rows.push({ date, nifty: n, sensex: s });
  }
  console.log(`Forward-filled joint rows from ${rows[0]?.date} → ${rows.at(-1)?.date}: ${rows.length}`);

  const db = await getMongoDb();
  if (!db) throw new Error("Mongo unavailable");
  const col = db.collection<IndexPriceRow>(COLLECTIONS.indexPrices);

  const before = await col.countDocuments();
  const earliest = await col.find().sort({ date: 1 }).limit(1).toArray();
  const latest = await col.find().sort({ date: -1 }).limit(1).toArray();
  console.log(
    `Mongo before: ${before} rows · earliest=${earliest[0]?.date ?? "—"} · latest=${latest[0]?.date ?? "—"}`,
  );

  const now = new Date();
  const BATCH = 1000;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const ops = slice.map((row) => ({
      updateOne: {
        filter: { date: row.date },
        update: {
          $set: {
            date: row.date,
            nifty: row.nifty,
            sensex: row.sensex,
            source: "manual" as const,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    }));
    const result = await col.bulkWrite(ops, { ordered: false });
    upserted += result.upsertedCount + result.modifiedCount + result.matchedCount;
    process.stdout.write(`\r  batch ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");

  const after = await col.countDocuments();
  const earliest2 = await col.find().sort({ date: 1 }).limit(1).toArray();
  const latest2 = await col.find().sort({ date: -1 }).limit(1).toArray();
  const from2001 = await col.countDocuments({ date: { $gte: FLOOR } });
  console.log(
    `Mongo after: ${after} rows · earliest=${earliest2[0]?.date ?? "—"} · latest=${latest2[0]?.date ?? "—"} · from ${FLOOR}: ${from2001}`,
  );
  console.log(`Bulk ops touched ≈ ${upserted} documents.`);
  await closeMongoClient();
}

main().catch(async (err) => {
  console.error(err);
  await closeMongoClient().catch(() => undefined);
  process.exit(1);
});
