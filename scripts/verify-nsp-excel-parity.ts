/**
 * Thorough parity check vs `NSP's under Risk.xlsm` unhidden sheets
 * (Probability / Backtesting / Initial Prob / Data) + Gift CSV / Mongo from 2001.
 *
 * Usage: npx tsx scripts/verify-nsp-excel-parity.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import * as XLSX from "xlsx";

import { getIndexPricesBetween } from "../lib/db/index-prices";
import { COLLECTIONS, closeMongoClient, getMongoDb, isMongoConfigured } from "../lib/db/mongo";
import {
  buildObservationSchedule,
  ceilingStartLevel,
  daysLeftToLastObservation,
  requiredUnderlying,
  runProbabilityBacktest,
  targetUnderlying,
} from "../lib/probability/engine";
import { mergeForwardFilledSeries, SERIES_FLOOR } from "../lib/probability/index-series";
import { hasPassedFinalObservation } from "../lib/probability/as-of";
import { filterProductsByLifecycle, isLiveObservationBookProduct } from "../lib/product-lifecycle";
import { excelSerialToDate, toLocalDateKey } from "../lib/workbook/dates";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";

const ROOT = process.cwd();
const NSP = join(ROOT, "NSP's under Risk.xlsm");
const NIFTY_CSV = join(ROOT, "lib", "data", "nifty-daily-2001.csv");
const SENSEX_JSON = join(ROOT, "lib", "data", "sensex-index-history.json");

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

/** Serial-safe — never trust SheetJS cellDates (TZ off-by-one). */
function asDateKey(v: unknown): string | null {
  if (v instanceof Date) return toLocalDateKey(v);
  if (typeof v === "number" && v > 30000) return toLocalDateKey(excelSerialToDate(v));
  return null;
}

function cellNumber(ws: XLSX.WorkSheet, addr: string): number | null {
  const v = (ws[addr] as XLSX.CellObject | undefined)?.v;
  return asNumber(v);
}

function cellDateKey(ws: XLSX.WorkSheet, addr: string): string | null {
  const v = (ws[addr] as XLSX.CellObject | undefined)?.v;
  return asDateKey(v);
}

function loadNiftyCsv(): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of readFileSync(NIFTY_CSV, "utf8").split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const i = line.indexOf(",");
    if (i < 0) continue;
    const date = line.slice(0, i).trim();
    const level = Number(line.slice(i + 1).trim());
    if (date && Number.isFinite(level) && level > 0) map.set(date, level);
  }
  return map;
}

function loadSensexJson(): Map<string, number> {
  const json = JSON.parse(readFileSync(SENSEX_JSON, "utf8")) as {
    entries: Array<{ dateSerial: number; level: number }>;
  };
  const map = new Map<string, number>();
  for (const row of json.entries) {
    map.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  return map;
}

async function loadSeries() {
  const niftyMap = loadNiftyCsv();
  const sensexMap = loadSensexJson();
  const end = toLocalDateKey(new Date());
  if (isMongoConfigured()) {
    const mongo = await getIndexPricesBetween(SERIES_FLOOR, end);
    for (const r of mongo) {
      if (r.nifty > 0) niftyMap.set(r.date, r.nifty);
      if (r.sensex > 0) sensexMap.set(r.date, r.sensex);
    }
  }
  const series = mergeForwardFilledSeries(niftyMap, sensexMap);
  assert(series[0]?.date === SERIES_FLOOR, `series must open on ${SERIES_FLOOR}, got ${series[0]?.date}`);
  return { series, source: `gift+mongo:${series.length}` };
}

async function main() {
  loadDotEnvLocal();
  assert(existsSync(NSP), `Missing ${NSP}`);

  // cellDates:false — use Excel serials via excelSerialToDate (matches desk / avoids TZ −1)
  const wb = XLSX.readFile(NSP, { bookVBA: false, cellDates: false, cellFormula: true });
  const meta = new Map((wb.Workbook?.Sheets ?? []).map((s) => [s.name, s.Hidden ?? 0]));
  const unhidden = wb.SheetNames.filter((n) => (meta.get(n) ?? 0) === 0);
  assert(unhidden.includes("Probability"), "Probability sheet visible");
  assert(unhidden.includes("Backtesting"), "Backtesting sheet visible");
  assert(unhidden.includes("Initial Prob"), "Initial Prob sheet visible");
  assert(unhidden.includes("Data"), "Data sheet visible");
  console.log("Unhidden sheets:", unhidden.join(" | "));

  const prob = wb.Sheets.Probability!;
  const bt = wb.Sheets.Backtesting!;
  const ip = wb.Sheets["Initial Prob"]!;
  const probGrid = sheetGrid(prob);
  const btGrid = sheetGrid(bt);
  const initialGrid = sheetGrid(ip);

  const excelName = String(findValue(probGrid, "Name of Product") ?? "");
  const excelIsin = String(findValue(probGrid, "ISIN") ?? "");
  const excelEntry = asNumber(findValue(probGrid, "Initial Entry Level", { numeric: true }));
  const excelTarget = asNumber(findValue(probGrid, "Target Nifty Level", { numeric: true }));
  const excelInitialProb = asNumber(
    findValue(probGrid, "Initial Probability of achieving full coupon", { numeric: true }),
  );
  const excelTargetPct = asNumber(findValue(probGrid, "Target Nifty %", { numeric: true }));
  const excelRequired = asNumber(findValue(probGrid, "% Required", { numeric: true }));
  const excelNifty =
    asNumber(findValue(probGrid, "Nifty Level", { numeric: true })) ??
    asNumber(findValue(probGrid, "Today's Nifty Level", { numeric: true })) ??
    cellNumber(prob, "D35") ??
    24200;
  const excelSensex = asNumber(findValue(probGrid, "Sensex Level", { numeric: true })) ?? cellNumber(prob, "D36") ?? 77500;

  // Serial-safe checking date (Probability!D34) — Backtesting days base
  const excelCheckDate = cellDateKey(prob, "D34") ?? asDateKey(findValue(probGrid, "Probability checking Date"));
  const excelDaysLeft = asNumber(findValue(probGrid, "No. of days left", { numeric: true }));

  // Backtesting KPI formulas: S3 Total, S4 successes, S5 probability
  const excelBtTotal = cellNumber(bt, "S3");
  const excelBtSuccess = cellNumber(bt, "S4");
  const excelBtProb = cellNumber(bt, "S5");
  const excelCurrentProb =
    asNumber(findValue(probGrid, "Current Probability", { numeric: true })) ?? excelBtProb;

  const excelInitialSheetProb = asNumber(findValue(initialGrid, "Probability", { numeric: true }));
  const excelTotalCount = asNumber(findValue(initialGrid, "Total Count", { numeric: true }));

  // Backtesting schedule Days row
  const daysRow = btGrid.find((r) => String(r[0] ?? "").trim().toLowerCase() === "days");
  const datesRow = btGrid.find((r) => String(r[0] ?? "").trim().toLowerCase() === "dates");
  assert(daysRow && datesRow, "Backtesting schedule Dates/Days missing");

  console.log("=== NSP Probability sample ===");
  console.log({
    excelName,
    excelIsin,
    excelEntry,
    excelTarget,
    excelInitialProb,
    excelTargetPct,
    excelCurrentProb,
    excelBtProb,
    excelBtTotal,
    excelBtSuccess,
    excelDaysLeft,
    excelCheckDate,
    excelRequired,
    excelInitialSheetProb,
    excelTotalCount,
  });

  assert(excelEntry && excelTarget && excelInitialProb != null && excelRequired != null, "Excel KPIs incomplete");
  assert(excelCheckDate, "Probability!D34 checking date missing");
  assert(near(excelTargetPct!, excelTarget / excelEntry - 1, 1e-12), "Excel Target % = target/entry − 1");
  assert(near(excelRequired, excelTarget / excelNifty - 1, 1e-12), "Excel % Required = target/nifty − 1");
  assert(near(excelInitialProb, excelInitialSheetProb!, 1e-12), "Probability sheet == Initial Prob sheet");
  assert(excelBtProb != null && excelBtTotal != null && excelBtSuccess != null, "Backtesting S3/S4/S5 missing");
  assert(near(excelBtProb!, excelBtSuccess! / excelBtTotal!, 1e-12), "Backtesting S5 = S4/S3");

  // Gift CSV / ceiling
  const csvLines = readFileSync(NIFTY_CSV, "utf8").trim().split(/\r?\n/).slice(1);
  const [csvFirstDate, csvFirstClose] = csvLines[0]!.split(",");
  assert(csvFirstDate === "2001-01-01", "Gift CSV starts 2001-01-01");
  assert(Number(csvFirstClose) === 1254.3, "Gift first close");
  assert(ceilingStartLevel(1254.3, "nifty") === 1300, "ceiling 1254.3");
  assert(ceilingStartLevel(1291.2, "nifty") === 1400, "ceiling 1291.2");

  // Backtesting day formula: IF(date=0,0, date − D34)
  const checking = excelSerialToDate(
    typeof (prob.D34 as XLSX.CellObject | undefined)?.v === "number"
      ? ((prob.D34 as XLSX.CellObject).v as number)
      : 0,
  );
  assert(toLocalDateKey(checking) === excelCheckDate, "D34 serial key");
  console.log("=== Backtesting Days = obs − Probability!D34 ===");
  for (let i = 1; i <= 7; i++) {
    const dateKey = asDateKey(datesRow![i]);
    const excelDays = asNumber(daysRow![i]);
    if (!dateKey) {
      assert(excelDays == null || excelDays === 0, `blank slot ${i} should have 0 days`);
      continue;
    }
    const recomputed = differenceInCalendarDays(
      startOfDay(new Date(`${dateKey}T12:00:00`)),
      startOfDay(checking),
    );
    assert(excelDays === recomputed, `Backtesting Days col ${i}: excel=${excelDays} recomputed=${recomputed}`);
    console.log(`  slot ${i}`, { dateKey, excelDays, ok: true });
  }

  // Initial Prob Start Level sample
  const pathRow = initialGrid.find(
    (r) => typeof r[0] === "number" && typeof r[1] === "number" && typeof r[2] === "number",
  );
  assert(pathRow, "Initial Prob path rows missing");
  // With cellDates:false, col0 is serial
  const close = pathRow![1] as number;
  const startLevel = pathRow![2] as number;
  assert(ceilingStartLevel(close, "nifty") === startLevel, `Excel Start Level mismatch for close ${close}`);
  console.log("Path ceiling sample OK", { close, start: startLevel });

  const products = loadCanonicalProducts(checking);
  const product = products.find((p) => (p.isin ?? "").toUpperCase() === excelIsin.toUpperCase());
  assert(product, `Master missing ${excelIsin}`);

  // Engine Current schedule must match Backtesting Days exactly
  const schedule = buildObservationSchedule(product, checking);
  const present = schedule.filter((s) => s.date);
  assert(present.length > 0, "engine schedule empty");
  console.log("=== Engine Current schedule vs Backtesting ===");
  for (let i = 0; i < present.length; i++) {
    const slot = present[i]!;
    const dateKey = toLocalDateKey(slot.date as Date);
    const excelDate = asDateKey(datesRow![i + 1]);
    const excelDays = asNumber(daysRow![i + 1]);
    assert(dateKey === excelDate, `obs date slot ${i + 1}: engine=${dateKey} excel=${excelDate}`);
    assert(slot.daysFromBase === excelDays, `days slot ${i + 1}: engine=${slot.daysFromBase} excel=${excelDays}`);
    console.log(`  ${i + 1}`, { dateKey, days: slot.daysFromBase, ok: true });
  }

  const { series, source } = await loadSeries();
  console.log(`Series ${source} ${series[0]?.date} → ${series.at(-1)?.date}`);

  const initial = runProbabilityBacktest({
    product,
    mode: "initial",
    valuationDate: checking,
    series,
    niftyLevel: excelNifty,
    sensexLevel: excelSensex,
    includePaths: true,
  });
  const current = runProbabilityBacktest({
    product,
    mode: "current",
    valuationDate: checking,
    series,
    niftyLevel: excelNifty,
    sensexLevel: excelSensex,
    includePaths: true,
  });

  const targetPct = targetUnderlying(product);
  const reqPct = requiredUnderlying(product, excelNifty, excelSensex);
  const daysLeft = daysLeftToLastObservation(product, checking);

  console.log("=== Engine vs Excel ===");
  console.log({
    targetUnderlying: targetPct,
    excelTargetPct,
    requiredUnderlying: reqPct,
    excelRequired,
    engineThreshold: current.threshold,
    initialProb: initial.probability,
    excelInitialProb,
    currentProb: current.probability,
    excelBtProb,
    currentIncluded: current.includedCount,
    excelBtTotal,
    currentSuccess: current.successCount,
    excelBtSuccess,
    daysLeft,
    excelDaysLeft,
    firstPath: current.paths[0]?.pathStartDate,
  });

  assert(targetPct != null && near(targetPct, excelTargetPct!, 1e-9), "Target Underlying");
  assert(reqPct != null && near(reqPct, excelRequired, 1e-9), "Required Underlying");
  assert(current.threshold != null && near(current.threshold, excelRequired, 1e-9), "Current threshold = % Required");
  assert(
    daysLeft != null && Math.abs(daysLeft - excelDaysLeft!) <= 1,
    `Days Left engine=${daysLeft} excel=${excelDaysLeft} (allow ±1 for TZ/serial)`,
  );

  const initDelta = Math.abs((initial.probability ?? NaN) - excelInitialProb);
  const currDelta = Math.abs((current.probability ?? NaN) - excelBtProb!);
  console.log({ initDelta, currDelta });
  assert(initial.probability != null && initial.probability > 0.5 && initial.probability < 0.95, "initial band");
  assert(initDelta < 0.02, `Initial delta ${initDelta}`);
  assert(current.probability != null, "current prob");
  // Frontier (live series end vs workbook nifty max) can shift included count slightly
  assert(currDelta < 0.02, `Current vs Backtesting S5 delta ${currDelta}`);
  assert(current.paths[0]?.pathStartDate === SERIES_FLOOR, `paths from ${SERIES_FLOOR}`);

  // Spot-check one Current path row: performance = avg/close − 1 (no start level)
  const sample = current.paths.find((p) => p.pathIncluded && p.underlyingPerformance != null);
  assert(sample, "included current path");
  assert(sample!.adjustedStartLevel == null, "Current must not use Start Level");
  if (sample!.averageObservationLevel != null) {
    const expect = sample!.averageObservationLevel / sample!.underlyingClosingLevel - 1;
    assert(near(sample!.underlyingPerformance!, expect, 1e-12), "Current perf = avg/close − 1");
  }

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

  console.log("\nverify-nsp-excel-parity: OK (Backtesting Current formulas matched)");
  await closeMongoClient().catch(() => undefined);
}

main().catch(async (err) => {
  console.error(err);
  await closeMongoClient().catch(() => undefined);
  process.exit(1);
});
