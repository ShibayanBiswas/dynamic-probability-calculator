/**
 * Expand valuation-index-history.json from Working!AJ:AK, master observation dates,
 * and Yahoo Nifty closes. Also builds sensex-index-history.json for Sensex-linked marks.
 *
 * Usage: npm run backfill:index-history
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

import { getProductObservationDates } from "../lib/product-dates";
import { toExcelSerial } from "../lib/workbook/dates";
import { mergeIndexHistoryEntries, type IndexHistoryEntry } from "../lib/workbook/index-history";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALUATION_XLSM = join(
  ROOT,
  "Dashboards - 31st May 26",
  "Primary Structured Products Valuation - 31st May 26.xlsm",
);
const NIFTY_HISTORY_PATH = join(ROOT, "lib", "data", "valuation-index-history.json");
const SENSEX_HISTORY_PATH = join(ROOT, "lib", "data", "sensex-index-history.json");

async function fetchYahooDaily(symbol: string, period1: number, period2: number) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SP-Dashboard/1.0" },
  });
  if (!res.ok) return null;
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
  const bySerial = new Map<number, number>();
  const base = Date.UTC(1899, 11, 30);
  for (let i = 0; i < stamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    const d = new Date(stamps[i]! * 1000);
    const serial = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - base) / 86400000);
    bySerial.set(serial, Math.round(close * 100) / 100);
  }
  return bySerial;
}

function readAjAk(ws: XLSX.WorkSheet) {
  const entries: IndexHistoryEntry[] = [];
  for (let r = 0; r < 600; r++) {
    const dateSerial = ws[XLSX.utils.encode_cell({ r, c: 35 })]?.v;
    const level = ws[XLSX.utils.encode_cell({ r, c: 36 })]?.v;
    if (
      typeof dateSerial === "number" &&
      typeof level === "number" &&
      Number.isFinite(dateSerial) &&
      Number.isFinite(level)
    ) {
      entries.push({ dateSerial, level });
    }
  }
  return entries;
}

function collectMasterObservationSerials(): number[] {
  const products = loadCanonicalProducts(new Date());
  const serials = new Set<number>();
  for (const product of products) {
    for (const date of getProductObservationDates(product)) {
      serials.add(toExcelSerial(date));
    }
  }
  return [...serials].sort((a, b) => a - b);
}

function resolveSerialLevels(
  missingSerials: number[],
  bySerial: Map<number, number>,
): IndexHistoryEntry[] {
  const adds: IndexHistoryEntry[] = [];
  for (const serial of missingSerials) {
    const exact = bySerial.get(serial);
    if (exact != null) {
      adds.push({ dateSerial: serial, level: exact });
      continue;
    }
    let bestSerial: number | undefined;
    let bestLevel: number | undefined;
    for (const [s, level] of bySerial) {
      if (s <= serial && (bestSerial === undefined || s > bestSerial)) {
        bestSerial = s;
        bestLevel = level;
      }
    }
    if (bestSerial != null && bestLevel != null) {
      adds.push({ dateSerial: serial, level: bestLevel });
    }
  }
  return adds;
}

async function backfillHistory(options: {
  existingPath: string;
  outputPath: string;
  sourceLabel: string;
  yahooSymbol: string;
  workbookEntries: IndexHistoryEntry[];
  targetSerials: number[];
}) {
  const existing = JSON.parse(readFileSync(options.existingPath, "utf8")) as {
    source: string;
    entries: IndexHistoryEntry[];
  };

  const known = new Set([
    ...existing.entries.map((e) => e.dateSerial),
    ...options.workbookEntries.map((e) => e.dateSerial),
  ]);
  // Never invent closes for future observation serials — on-or-before lookup
  // already uses the latest real Yahoo/trading-day row.
  const todaySerial = toExcelSerial(new Date());
  const missingSerials = options.targetSerials.filter(
    (s) => !known.has(s) && s <= todaySerial,
  );

  const yahooAdds: IndexHistoryEntry[] = [];
  if (missingSerials.length > 0) {
    const min = missingSerials[0]!;
    const max = missingSerials[missingSerials.length - 1]!;
    const base = Date.UTC(1899, 11, 30);
    const period1 = Math.floor((base + min * 86400000) / 1000) - 86400 * 30;
    const period2 = Math.floor((base + max * 86400000) / 1000) + 86400 * 30;
    const bySerial = await fetchYahooDaily(options.yahooSymbol, period1, period2);
    if (bySerial) {
      yahooAdds.push(...resolveSerialLevels(missingSerials, bySerial));
    }
  }

  const merged = mergeIndexHistoryEntries(existing.entries, [...options.workbookEntries, ...yahooAdds]);
  const payload = {
    source: options.sourceLabel,
    entries: merged,
  };
  writeFileSync(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    before: existing.entries.length,
    after: merged.length,
    yahooAdds: yahooAdds.length,
    missing: missingSerials.length,
  };
}

async function main() {
  let fromWorkbook: IndexHistoryEntry[] = [];
  if (existsSync(VALUATION_XLSM)) {
    const wb = XLSX.readFile(VALUATION_XLSM, { cellDates: false });
    const ws = wb.Sheets.Working;
    if (ws) fromWorkbook = readAjAk(ws);
  }

  const masterSerials = collectMasterObservationSerials();
  console.log(`Master observation serials: ${masterSerials.length}`);

  const nifty = await backfillHistory({
    existingPath: NIFTY_HISTORY_PATH,
    outputPath: NIFTY_HISTORY_PATH,
    sourceLabel: "Working!AJ:AK + master obs dates + Yahoo ^NSEI",
    yahooSymbol: "^NSEI",
    workbookEntries: fromWorkbook,
    targetSerials: masterSerials,
  });
  console.log(`Nifty history: ${nifty.before} → ${nifty.after} (${nifty.yahooAdds} Yahoo adds, ${nifty.missing} missing)`);

  const sensexExisting = existsSync(SENSEX_HISTORY_PATH)
    ? (JSON.parse(readFileSync(SENSEX_HISTORY_PATH, "utf8")) as { entries: IndexHistoryEntry[] })
    : { entries: [] as IndexHistoryEntry[] };
  if (!existsSync(SENSEX_HISTORY_PATH)) {
    writeFileSync(SENSEX_HISTORY_PATH, JSON.stringify({ source: "init", entries: [] }, null, 2));
  }

  const sensex = await backfillHistory({
    existingPath: SENSEX_HISTORY_PATH,
    outputPath: SENSEX_HISTORY_PATH,
    sourceLabel: "Master obs dates + Yahoo ^BSESN",
    yahooSymbol: "^BSESN",
    workbookEntries: [],
    targetSerials: masterSerials,
  });
  console.log(`Sensex history: ${sensexExisting.entries.length} → ${sensex.after} (${sensex.yahooAdds} Yahoo adds)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
