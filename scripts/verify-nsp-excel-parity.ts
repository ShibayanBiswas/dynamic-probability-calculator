/**
 * Thorough parity check vs `NSP's under Risk.xlsm` + Gift CSV / Mongo from 2001.
 * Usage: npx tsx scripts/verify-nsp-excel-parity.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import { getIndexPricesBetween } from "../lib/db/index-prices";
import { COLLECTIONS, closeMongoClient, getMongoDb, isMongoConfigured } from "../lib/db/mongo";
import {
  buildIndexSeries,
  ceilingStartLevel,
  daysLeftToLastObservation,
  requiredUnderlying,
  runProbabilityBacktest,
  targetUnderlying,
} from "../lib/probability/engine";
import { hasPassedFinalObservation } from "../lib/probability/as-of";
import { filterProductsByLifecycle, isLiveObservationBookProduct } from "../lib/product-lifecycle";
import { toLocalDateKey } from "../lib/workbook/dates";
import { excelSerialToDate } from "../lib/workbook/dates";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";

const ROOT = process.cwd();
const NSP = join(ROOT, "NSP's under Risk.xlsm");
const NIFTY_CSV = join(ROOT, "lib", "data", "nifty-daily-2001.csv");

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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function near(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

type Grid = Array<Array<unknown>>;

function sheetGrid(sheet: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as Grid;
}

function findValue(grid: Grid, label: string, opts?: { numeric?: boolean; occurrence?: number }): unknown {
  const want = label.trim().toLowerCase();
  let seen = 0;
  const occurrence = opts?.occurrence ?? 1;
  for (const row of grid) {
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim().toLowerCase();
      if (cell !== want && !cell.startsWith(want)) continue;
      const value = row[c + 1];
      if (opts?.numeric && !(typeof value === "number" && Number.isFinite(value))) continue;
      seen += 1;
      if (seen === occurrence) return value;
    }
  }
  return null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asDateKey(v: unknown): string | null {
  if (v instanceof Date) return toLocalDateKey(v);
  if (typeof v === "number") return toLocalDateKey(excelSerialToDate(v));
  return null;
}

async function loadSeries() {
  const end = toLocalDateKey(new Date());
  if (isMongoConfigured()) {
    const mongo = await getIndexPricesBetween("2001-01-01", end);
    if (mongo.length >= 1000) {
      let lastN: number | undefined;
      let lastS: number | undefined;
      const rows: Array<{ date: string; nifty: number; sensex: number }> = [];
      for (const r of mongo) {
        if (r.nifty > 0) lastN = r.nifty;
        if (r.sensex > 0) lastS = r.sensex;
        const nifty = r.nifty > 0 ? r.nifty : lastN;
        const sensex = r.sensex > 0 ? r.sensex : lastS;
        if (nifty == null || sensex == null) continue;
        rows.push({ date: r.date, nifty, sensex });
      }
      return { series: buildIndexSeries(rows), source: `mongo:${rows.length}` };
    }
  }
  throw new Error("Mongo series required for NSP parity (run npm run sync:index-2001)");
}

async function main() {
  loadDotEnvLocal();
  assert(existsSync(NSP), `Missing ${NSP}`);

  const wb = XLSX.readFile(NSP, { bookVBA: false, cellDates: true });
  const probGrid = sheetGrid(wb.Sheets.Probability!);
  const initialGrid = sheetGrid(wb.Sheets["Initial Prob"]!);

  const excelName = String(findValue(probGrid, "Name of Product") ?? "");
  const excelIsin = String(findValue(probGrid, "ISIN") ?? "");
  const excelEntry = asNumber(findValue(probGrid, "Initial Entry Level", { numeric: true }));
  const excelTarget = asNumber(findValue(probGrid, "Target Nifty Level", { numeric: true }));
  const excelInitialProb = asNumber(
    findValue(probGrid, "Initial Probability of achieving full coupon", { numeric: true }),
  );
  const excelTargetPct = asNumber(findValue(probGrid, "Target Nifty %", { numeric: true }));
  const excelCurrentProb = asNumber(findValue(probGrid, "Current Probability", { numeric: true }));
  const excelDaysLeft = asNumber(findValue(probGrid, "No. of days left", { numeric: true }));
  const excelRequired = asNumber(findValue(probGrid, "% Required", { numeric: true }));
  const excelCheckDate = asDateKey(findValue(probGrid, "Probability checking Date"));
  const excelNifty =
    asNumber(findValue(probGrid, "Nifty Level", { numeric: true })) ??
    asNumber(findValue(probGrid, "Today's Nifty Level", { numeric: true })) ??
    24200;
  const excelSensex = asNumber(findValue(probGrid, "Sensex Level", { numeric: true })) ?? 77500;

  // Initial Prob sheet: row with Probability label
  const excelInitialSheetProb = asNumber(findValue(initialGrid, "Probability", { numeric: true }));
  const excelTotalCount = asNumber(findValue(initialGrid, "Total Count", { numeric: true }));

  console.log("=== NSP Probability sample ===");
  console.log({
    excelName,
    excelIsin,
    excelEntry,
    excelTarget,
    excelInitialProb,
    excelTargetPct,
    excelCurrentProb,
    excelDaysLeft,
    excelRequired,
    excelCheckDate,
    excelInitialSheetProb,
    excelTotalCount,
  });

  assert(excelEntry && excelTarget && excelInitialProb != null && excelRequired != null, "Excel KPIs incomplete");
  assert(near(excelTargetPct!, excelTarget / excelEntry - 1, 1e-12), "Excel Target % = target/entry − 1");
  assert(near(excelRequired, excelTarget / excelNifty - 1, 1e-12), "Excel % Required = target/nifty − 1");
  assert(near(excelInitialProb, excelInitialSheetProb!, 1e-12), "Probability sheet == Initial Prob sheet");

  // Gift CSV / ceiling
  const csvLines = readFileSync(NIFTY_CSV, "utf8").trim().split(/\r?\n/).slice(1);
  const [csvFirstDate, csvFirstClose] = csvLines[0]!.split(",");
  assert(csvFirstDate === "2001-01-01", "Gift CSV starts 2001-01-01");
  assert(Number(csvFirstClose) === 1254.3, "Gift first close");
  assert(ceilingStartLevel(1254.3, "nifty") === 1300, "ceiling 1254.3");
  assert(ceilingStartLevel(1291.2, "nifty") === 1400, "ceiling 1291.2");

  // First path row in Initial Prob (after header row 7 → data ~row 10)
  const pathRow = initialGrid.find(
    (r) => r[0] instanceof Date && typeof r[1] === "number" && typeof r[2] === "number",
  );
  assert(pathRow, "Initial Prob path rows missing");
  assert(
    ceilingStartLevel(pathRow![1] as number, "nifty") === pathRow![2],
    `Excel Start Level mismatch for close ${pathRow![1]}`,
  );
  console.log("Path ceiling sample OK", { close: pathRow![1], start: pathRow![2] });

  const products = loadCanonicalProducts(new Date("2026-07-09"));
  const product = products.find((p) => (p.isin ?? "").toUpperCase() === excelIsin.toUpperCase());
  assert(product, `Master missing ${excelIsin}`);

  const { series, source } = await loadSeries();
  console.log(`Series ${source} ${series[0]?.date} → ${series.at(-1)?.date}`);
  assert(series[0]!.date.startsWith("2001"), "Series starts 2001");

  const valuationDate = excelCheckDate ? new Date(`${excelCheckDate}T12:00:00`) : new Date("2026-07-09");
  const initial = runProbabilityBacktest({
    product,
    mode: "initial",
    valuationDate,
    series,
    niftyLevel: excelNifty,
    sensexLevel: excelSensex,
    includePaths: true,
  });
  const current = runProbabilityBacktest({
    product,
    mode: "current",
    valuationDate,
    series,
    niftyLevel: excelNifty,
    sensexLevel: excelSensex,
    includePaths: true,
  });

  const targetPct = targetUnderlying(product);
  const reqPct = requiredUnderlying(product, excelNifty, excelSensex);

  const daysLeft = daysLeftToLastObservation(product, valuationDate);

  console.log("=== Engine vs Excel ===");
  console.log({
    targetUnderlying: targetPct,
    excelTargetPct,
    requiredUnderlying: reqPct,
    excelRequired,
    initialProb: initial.probability,
    excelInitialProb,
    currentProb: current.probability,
    excelCurrentProb,
    initialIncluded: initial.includedCount,
    excelTotalCount,
    daysLeft,
    excelDaysLeft,
    firstPath: initial.paths[0]?.pathStartDate,
  });

  assert(targetPct != null && near(targetPct, excelTargetPct!, 1e-9), "Target Underlying");
  assert(reqPct != null && near(reqPct, excelRequired, 1e-9), "Required Underlying");
  assert(
    daysLeft != null && Math.abs(daysLeft - excelDaysLeft!) <= 1,
    `Days Left engine=${daysLeft} excel=${excelDaysLeft} (allow ±1 for TZ/serial)`,
  );

  const initDelta = Math.abs((initial.probability ?? NaN) - excelInitialProb);
  const currDelta =
    excelCurrentProb == null ? 0 : Math.abs((current.probability ?? NaN) - excelCurrentProb);
  console.log({ initDelta, currDelta });
  assert(initial.probability != null && initial.probability > 0.5 && initial.probability < 0.95, "initial band");
  assert(initDelta < 0.02, `Initial delta ${initDelta} (expect near Excel; intentional frontier can differ slightly)`);
  if (excelCurrentProb != null) {
    assert(current.probability != null, "current prob");
    assert(currDelta < 0.02, `Current delta ${currDelta}`);
  }
  assert(initial.paths[0]?.pathStartDate?.startsWith("2001"), "paths from 2001");

  const asOf = new Date();
  const ongoing = filterProductsByLifecycle(products, "ongoing", asOf);
  assert(
    ongoing.every((p) => !hasPassedFinalObservation(p, asOf)),
    "ongoing has past-final leak",
  );
  assert(
    products.filter((p) => !isLiveObservationBookProduct(p, asOf)).every((p) => !ongoing.includes(p)),
    "live gate",
  );

  if (isMongoConfigured()) {
    const db = await getMongoDb();
    assert(db, "mongo db");
    const count = await db!.collection(COLLECTIONS.indexPrices).countDocuments({ date: { $gte: "2001-01-01" } });
    const earliest = await db!.collection(COLLECTIONS.indexPrices).find().sort({ date: 1 }).limit(1).toArray();
    console.log("Mongo", { count, earliest: earliest[0]?.date });
    assert(count >= 6000, "mongo row count");
    assert(String(earliest[0]?.date).startsWith("2001"), "mongo earliest 2001");
  }

  console.log("\nverify-nsp-excel-parity: OK");
  await closeMongoClient().catch(() => undefined);
}

main().catch(async (err) => {
  console.error(err);
  await closeMongoClient().catch(() => undefined);
  process.exit(1);
});
