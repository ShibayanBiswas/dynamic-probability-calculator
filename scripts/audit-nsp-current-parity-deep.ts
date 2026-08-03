/**
 * Deep Current/Backtesting formula audit vs engine for the NSP sample product.
 * Usage: npx tsx scripts/audit-nsp-current-parity-deep.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import { getIndexPricesBetween } from "../lib/db/index-prices";
import { closeMongoClient, isMongoConfigured } from "../lib/db/mongo";
import {
  buildIndexSeries,
  buildObservationSchedule,
  runProbabilityBacktest,
} from "../lib/probability/engine";
import { getProbabilityCheckingDate } from "../lib/probability/as-of";
import { toLocalDateKey, excelSerialToDate } from "../lib/workbook/dates";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";
import { differenceInCalendarDays, startOfDay } from "date-fns";

const ROOT = process.cwd();
const NSP = join(ROOT, "NSP's under Risk.xlsm");

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

type Grid = Array<Array<unknown>>;
function sheetGrid(sheet: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<Array<unknown>>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as Grid;
}

function findValue(grid: Grid, label: string, opts?: { numeric?: boolean }): unknown {
  const want = label.trim().toLowerCase();
  for (const row of grid) {
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? "").trim().toLowerCase();
      if (cell !== want && !cell.startsWith(want)) continue;
      const value = row[c + 1];
      if (opts?.numeric && !(typeof value === "number" && Number.isFinite(value))) continue;
      return value;
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

function cellFormula(ws: XLSX.WorkSheet, addr: string) {
  const cell = ws[addr] as XLSX.CellObject | undefined;
  return cell?.f ?? null;
}

async function loadSeries() {
  const end = toLocalDateKey(new Date());
  if (!isMongoConfigured()) throw new Error("Mongo required");
  const mongo = await getIndexPricesBetween("2001-01-01", end);
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
  return buildIndexSeries(rows);
}

async function main() {
  loadDotEnvLocal();
  const wb = XLSX.readFile(NSP, { bookVBA: false, cellDates: true, cellFormula: true });

  console.log("\n=== Unhidden sheets ===");
  const meta = new Map((wb.Workbook?.Sheets ?? []).map((s) => [s.name, s.Hidden ?? 0]));
  for (const name of wb.SheetNames) {
    const h = meta.get(name) ?? 0;
    if (h === 0) console.log(" VISIBLE:", name);
    else console.log(` hidden(${h}):`, name);
  }

  const prob = wb.Sheets.Probability!;
  const bt = wb.Sheets.Backtesting!;
  const ip = wb.Sheets["Initial Prob"]!;
  const probGrid = sheetGrid(prob);
  const btGrid = sheetGrid(bt);
  const ipGrid = sheetGrid(ip);

  console.log("\n=== Probability sheet key cells / formulas ===");
  const keyAddrs = [
    "D16",
    "D23",
    "D33",
    "D34",
    "D35",
    "B5",
    "S3",
    "S4",
    "S5",
    "S6",
  ];
  for (const addr of keyAddrs) {
    const cell = prob[addr] as XLSX.CellObject | undefined;
    if (!cell && !bt[addr]) continue;
  }
  // Dump formulas around known labels
  const labels = [
    "Probability checking Date",
    "% Required",
    "Current Probability",
    "Initial Probability of achieving full coupon",
    "Target Nifty %",
    "Today's Nifty Level",
    "Nifty Level",
    "Name of Product",
    "ISIN",
  ];
  for (const label of labels) {
    console.log(label, "=>", findValue(probGrid, label));
  }

  console.log("\n=== Backtesting formula samples ===");
  for (const addr of ["B5", "C5", "H5", "B6", "D12", "K12", "R12", "S12", "V12", "S3", "S4", "S5"]) {
    const c = bt[addr] as XLSX.CellObject | undefined;
    console.log(addr, { f: c?.f ?? null, v: c?.v instanceof Date ? toLocalDateKey(c.v) : c?.v });
  }

  console.log("\n=== Initial Prob formula samples ===");
  for (const addr of ["B5", "C5", "H5", "B6", "C12", "D12", "R12", "S12", "T12", "V12", "T3", "T4", "T5", "T6"]) {
    const c = ip[addr] as XLSX.CellObject | undefined;
    if (!c) continue;
    console.log(addr, { f: c?.f ?? null, v: c?.v instanceof Date ? toLocalDateKey(c.v) : c?.v });
  }

  // Schedule days from Excel Backtesting row 5
  const daysRow = btGrid.find((r) => String(r[0] ?? "").trim().toLowerCase() === "days");
  const datesRow = btGrid.find((r) => String(r[0] ?? "").trim().toLowerCase() === "dates");
  const avgRow = btGrid.find((r) => String(r[0] ?? "").trim().toLowerCase() === "average");
  console.log("\n=== Excel Backtesting schedule ===");
  console.log({
    average: avgRow?.slice(1, 8),
    dates: datesRow?.slice(1, 8).map(asDateKey),
    days: daysRow?.slice(1, 8),
  });

  const excelIsin = String(findValue(probGrid, "ISIN") ?? "");
  const excelCheck = asDateKey(findValue(probGrid, "Probability checking Date"));
  const excelNifty =
    asNumber(findValue(probGrid, "Nifty Level", { numeric: true })) ??
    asNumber(findValue(probGrid, "Today's Nifty Level", { numeric: true })) ??
    0;
  const excelSensex = asNumber(findValue(probGrid, "Sensex Level", { numeric: true })) ?? 0;
  const excelRequired = asNumber(findValue(probGrid, "% Required", { numeric: true }));
  const excelCurrent = asNumber(findValue(probGrid, "Current Probability", { numeric: true }));
  const excelEntry = asNumber(findValue(probGrid, "Initial Entry Level", { numeric: true }));
  const excelTarget =
    asNumber(findValue(probGrid, "Target Nifty Level", { numeric: true })) ??
    asNumber(findValue(probGrid, "Target Level", { numeric: true }));

  const products = loadCanonicalProducts(excelCheck ? new Date(`${excelCheck}T12:00:00`) : new Date());
  const product = products.find((p) => (p.isin ?? "").toUpperCase() === excelIsin.toUpperCase());
  if (!product) throw new Error(`Product not found ${excelIsin}`);

  const valuationDate = excelCheck ? new Date(`${excelCheck}T12:00:00`) : new Date();
  const checkingDate = getProbabilityCheckingDate(product, valuationDate);
  const series = await loadSeries();

  const schedule = buildObservationSchedule(product, checkingDate);
  console.log("\n=== Engine Current schedule vs Excel Backtesting Days ===");
  const present = schedule.filter((s) => s.date);
  console.log(
    present.map((s, i) => ({
      display: i + 1,
      excelAvgHeader: avgRow?.[i + 1],
      date: toLocalDateKey(s.date as Date),
      excelDate: asDateKey(datesRow?.[i + 1]),
      days: s.daysFromBase,
      excelDays: daysRow?.[i + 1],
      daysMatch: s.daysFromBase === daysRow?.[i + 1],
      dateMatch: toLocalDateKey(s.date as Date) === asDateKey(datesRow?.[i + 1]),
    })),
  );

  // Cross-check Excel days formula: obs - checkingDate
  if (excelCheck && datesRow) {
    const check = startOfDay(new Date(`${excelCheck}T12:00:00`));
    console.log("\n=== Recompute Excel Days = obs − checkingDate ===");
    for (let i = 1; i <= 7; i++) {
      const d = datesRow[i];
      const key = asDateKey(d);
      if (!key) {
        console.log(i, "blank");
        continue;
      }
      const recomputed = differenceInCalendarDays(startOfDay(new Date(`${key}T12:00:00`)), check);
      console.log(i, { key, excelDays: daysRow?.[i], recomputed, match: recomputed === daysRow?.[i] });
    }
  }

  const current = runProbabilityBacktest({
    product,
    mode: "current",
    valuationDate: checkingDate,
    series,
    niftyLevel: excelNifty,
    sensexLevel: excelSensex || undefined,
    includePaths: true,
  });

  // Compare first few Excel path rows (from 2001-01-01) vs engine
  const excelPaths = btGrid.filter(
    (r) => r[0] instanceof Date && typeof r[1] === "number",
  ) as Array<Array<unknown>>;

  console.log("\n=== Path start floor ===");
  console.log({
    excelFirstPath: asDateKey(excelPaths[0]?.[0]),
    excelPathCount: excelPaths.length,
    engineFirstPath: current.paths[0]?.pathStartDate,
    enginePathCount: current.paths.length,
    engineIncluded: current.includedCount,
    engineSuccess: current.successCount,
    engineProb: current.probability,
    excelCurrent,
    excelRequired,
    engineThreshold: current.threshold,
  });

  // Find Excel row for 2001-01-01 and compare
  const excel2001 = excelPaths.find((r) => asDateKey(r[0]) === "2001-01-01");
  const eng2001 = current.paths.find((p) => p.pathStartDate === "2001-01-01");
  if (excel2001 && eng2001) {
    const excelObsDates = excel2001.slice(3, 10).map(asDateKey);
    const excelObsLevels = excel2001.slice(10, 17).map(asNumber);
    const excelAvg = asNumber(excel2001[17]);
    const excelPerf = asNumber(excel2001[18]);
    // Column layout from preview: A start, B close, C empty?, D-J dates, K-Q levels, R avg, S perf, ... V taken
    // Preview row 12: Start, close, null, dates..., levels..., avg — so C is empty and dates start at index 3
    console.log("\n=== 2001-01-01 path compare ===");
    console.log({
      close: { excel: excel2001[1], engine: eng2001.underlyingClosingLevel },
      obsDates: { excel: excelObsDates, engine: eng2001.observationDates },
      obsLevels: { excel: excelObsLevels, engine: eng2001.observationLevels },
      avg: { excel: excelAvg, engine: eng2001.averageObservationLevel },
      perf: { excel: excelPerf, engine: eng2001.underlyingPerformance },
    });
  }

  // Sample 20 included paths near frontier and check Yes/No cascade vs engine
  let mismatchDates = 0;
  let mismatchLevels = 0;
  let mismatchPerf = 0;
  let mismatchInclude = 0;
  let compared = 0;
  const byDate = new Map(current.paths.map((p) => [p.pathStartDate, p]));
  for (const row of excelPaths) {
    const key = asDateKey(row[0]);
    if (!key || key < "2001-01-01") continue;
    const eng = byDate.get(key);
    if (!eng) continue;
    compared += 1;
    const excelDates = row.slice(3, 10).map(asDateKey);
    const excelLevels = row.slice(10, 17).map(asNumber);
    for (let i = 0; i < 7; i++) {
      if (excelDates[i] && eng.observationDates[i] && excelDates[i] !== eng.observationDates[i]) {
        mismatchDates += 1;
        break;
      }
    }
    for (let i = 0; i < 7; i++) {
      const el = excelLevels[i];
      const ol = eng.observationLevels[i];
      if (el != null && ol != null && Math.abs(el - ol) > 0.05) {
        mismatchLevels += 1;
        break;
      }
    }
    const excelPerf = asNumber(row[18]);
    if (
      excelPerf != null &&
      eng.underlyingPerformance != null &&
      Math.abs(excelPerf - eng.underlyingPerformance) > 1e-6
    ) {
      mismatchPerf += 1;
    }
    // Path taken column — find "Yes"/"No" in row
    const taken = row.find((v) => v === "Yes" || v === "No" || v === "yes" || v === "no");
    if (taken != null) {
      const excelYes = String(taken).toLowerCase() === "yes";
      if (excelYes !== eng.pathIncluded) mismatchInclude += 1;
    }
  }

  console.log("\n=== Path-row mismatch tallies (from 2001-01-01) ===");
  console.log({ compared, mismatchDates, mismatchLevels, mismatchPerf, mismatchInclude });

  // Excel Total Count / Probability from Backtesting
  console.log("\n=== Backtesting KPI cells ===");
  console.log({
    S3: (bt.S3 as XLSX.CellObject | undefined)?.v,
    S3f: cellFormula(bt, "S3"),
    S4: (bt.S4 as XLSX.CellObject | undefined)?.v,
    S4f: cellFormula(bt, "S4"),
    S5: (bt.S5 as XLSX.CellObject | undefined)?.v,
    S5f: cellFormula(bt, "S5"),
  });

  console.log("\n=== Product schedule raw slots ===");
  console.log({
    name: product.name,
    isin: product.isin,
    excelEntry,
    excelTarget,
    checkingDate: toLocalDateKey(checkingDate),
    presentSlots: present.length,
  });

  await closeMongoClient().catch(() => undefined);
}

main().catch(async (e) => {
  console.error(e);
  await closeMongoClient().catch(() => undefined);
  process.exit(1);
});
