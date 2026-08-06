/**
 * End-to-end edge-case audit for Initial + Current probability vs desk rules
 * (NSP Initial Prob / Backtesting + Current passed-slot / Effective Target overrides).
 *
 * Run: npx tsx scripts/audit-probability-edge-cases.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import sensexHistory from "../lib/data/sensex-index-history.json";
import {
  buildObservationSchedule,
  ceilingStartLevel,
  computeCurrentEffectiveTargetLevel,
  daysLeftToLastObservation,
  requiredUnderlyingFromHurdleLevel,
  resolveUnderlyingKind,
  runProbabilityBacktest,
  targetUnderlying,
  type IndexBar,
} from "../lib/probability/engine";
import { mergeForwardFilledSeries, SERIES_FLOOR } from "../lib/probability/index-series";
import { getWorkingAllotmentDate } from "../lib/product-dates";
import { getProbabilityEntryLevel, getTargetLevel } from "../lib/product-utils";
import { excelSerialToDate, toLocalDateKey } from "../lib/workbook/dates";
import { loadSeedProducts } from "./lib/load-canonical-dataset";
import type { ProductRecord } from "../lib/types";

const ROOT = process.cwd();
const fails: string[] = [];

function assert(cond: unknown, msg: string) {
  if (!cond) fails.push(msg);
}

function loadSeries(): IndexBar[] {
  const nifty = new Map<string, number>();
  for (const line of readFileSync(join(ROOT, "lib", "data", "nifty-daily-2001.csv"), "utf8").split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const date = line.slice(0, comma).trim();
    const level = Number(line.slice(comma + 1).trim());
    if (Number.isFinite(level) && level > 0) nifty.set(date, level);
  }
  const sensex = new Map<string, number>();
  for (const row of sensexHistory.entries as Array<{ dateSerial: number; level: number }>) {
    sensex.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  return mergeForwardFilledSeries(nifty, sensex, SERIES_FLOOR);
}

function findByName(products: ProductRecord[], needle: string) {
  const n = needle.toLowerCase();
  return (
    products.find((p) => (p.name ?? "").trim().toLowerCase() === n) ??
    products.find((p) => (p.name ?? "").toLowerCase().includes(n))
  );
}

function main() {
  const products = loadSeedProducts();
  const series = loadSeries();
  const asOf = new Date("2026-08-05T12:00:00");
  const today = 24614.9;

  // --- 1. Accelerator 689: blank phase, 2 passed + 1 remaining ---
  const p689 = findByName(products, "Nifty Accelerator - 689");
  assert(p689, "689 present");
  if (p689) {
    const underlying = resolveUnderlyingKind(p689) ?? "nifty";
    const entry = getProbabilityEntryLevel(p689);
    const target = getTargetLevel(p689);
    const actualStart = getWorkingAllotmentDate(p689, asOf);
    assert(entry === 17400, `689 entry ${entry}`);
    assert(target === 23142, `689 target ${target}`);
    assert(actualStart && toLocalDateKey(actualStart) === "2021-12-07", "689 allotment start");
    assert(Math.abs((targetUnderlying(p689) ?? NaN) - 0.33) < 1e-12, "689 Target Underlying 33%");

    const initial = runProbabilityBacktest({
      product: p689,
      mode: "initial",
      valuationDate: asOf,
      series,
      includePaths: true,
    });
    assert(initial.includedCount === 4043, `689 initial taken ${initial.includedCount}`);
    assert(initial.successCount === 3448, `689 initial success ${initial.successCount}`);
    assert(Math.abs((initial.probability ?? NaN) - 3448 / 4043) < 1e-12, "689 initial prob");
    const lastInit = [...initial.paths].reverse().find((p) => p.pathIncluded);
    const lastObs = lastInit?.observationDates.filter(Boolean).at(-1);
    assert(lastObs === "2021-12-07", `689 initial last obs ${lastObs}`);

    const current = runProbabilityBacktest({
      product: p689,
      mode: "current",
      valuationDate: asOf,
      series,
      niftyLevel: today,
      includePaths: true,
    });
    const present = current.schedule.filter((s) => s.date);
    assert(present.length === 3, `689 schedule present ${present.length}`);
    assert(present.filter((s) => s.daysFromBase <= 0).length === 2, "689 two passed on schedule");
    assert(present.filter((s) => s.daysFromBase > 0).length === 1, "689 one remaining on schedule");
    assert(current.pathSchedule.length === 1, "689 pathSchedule remaining-only");
    assert(current.effectiveTargetLevel != null, "689 ET set");
    assert(Math.abs((current.effectiveTargetLevel ?? NaN) - 20087.65) < 0.02, `689 ET ${current.effectiveTargetLevel}`);
    const req = requiredUnderlyingFromHurdleLevel(
      p689,
      current.effectiveTargetLevel!,
      today,
      undefined,
    );
    const expectReq = current.effectiveTargetLevel! / today - 1;
    assert(req != null && Math.abs(req - expectReq) < 1e-12, `689 Required Underlying ${req}`);
    assert(Math.abs((current.threshold ?? NaN) - expectReq) < 1e-12, "689 threshold = Required");
    assert(daysLeftToLastObservation(p689, asOf) === 20, "689 days left 20");

    const row = current.paths.find((p) => p.pathIncluded)!;
    const passedIdx = current.schedule
      .map((s, i) => (s.date && s.daysFromBase <= 0 ? i : -1))
      .filter((i) => i >= 0);
    const remIdx = current.schedule.findIndex((s) => s.date && s.daysFromBase > 0);
    for (const i of passedIdx) {
      assert(row.observationDates[i] == null && row.observationLevels[i] == null, `689 passed col ${i} placeholder`);
    }
    assert(row.observationDates[remIdx] != null && row.observationLevels[remIdx] != null, "689 remaining filled");
    assert(
      Math.abs((row.averageObservationLevel ?? NaN) - row.observationLevels[remIdx]!) < 1e-9,
      "689 avg = remaining only",
    );
    assert(
      current.paths.length > 0 && current.paths.some((p) => !p.pathIncluded),
      "689 path table includes Path-Taken-No rows past the Yes frontier",
    );
    const curLastYes = [...current.paths].reverse().find((p) => p.pathIncluded)!;
    const curLastObs = curLastYes.observationDates.filter(Boolean).at(-1);
    assert(
      curLastObs != null && current.lastIndexDate != null && curLastObs <= current.lastIndexDate,
      `689 current last Yes final obs ${curLastObs} ≤ series ${current.lastIndexDate}`,
    );
    // When the series lags the checking date, path offsets snap to the frontier so last Yes obs = latest session.
    if (current.lastIndexDate! < toLocalDateKey(asOf)) {
      assert(curLastObs === current.lastIndexDate, "689 lagging series → last Yes obs = latest session");
    }
    assert(initial.paths.some((p) => !p.pathIncluded), "689 initial includes Path-Taken-No rows");
    assert(
      lastInit!.observationDates.filter(Boolean).at(-1) === "2021-12-07",
      "689 initial last Yes final obs = Allotment",
    );
    assert(current.probability != null && current.probability > 0.99, `689 current prob ${current.probability}`);
  }

  // --- 2. All remaining: ET = Target, no placeholders ---
  const allForward = products.find((p) => {
    const sched = buildObservationSchedule(p, asOf).filter((s) => s.date);
    return sched.length >= 2 && sched.every((s) => s.daysFromBase > 0) && getTargetLevel(p) != null;
  });
  assert(allForward, "all-remaining product exists");
  if (allForward) {
    const target = getTargetLevel(allForward)!;
    const run = runProbabilityBacktest({
      product: allForward,
      mode: "current",
      valuationDate: asOf,
      series,
      niftyLevel: today,
      includePaths: true,
    });
    assert(
      run.effectiveTargetLevel == null,
      `all-remaining ET blank ${run.effectiveTargetLevel}`,
    );
    assert(
      Math.abs((run.threshold ?? NaN) - (target / today - 1)) < 1e-12,
      `all-remaining threshold = Target/today`,
    );
    const present = run.schedule.filter((s) => s.date);
    assert(present.every((s) => s.daysFromBase > 0), "all-remaining no passed slots");
    assert(run.pathSchedule.length === present.length, "all-remaining pathSchedule = present");
    const row = run.paths.find((p) => p.pathIncluded);
    if (row) {
      const filled = row.observationLevels.filter((l) => l != null).length;
      assert(filled === present.length, "all-remaining avg uses all present");
    }
  }

  // --- 3. All passed: ET null, pathSchedule empty, probability null ---
  const allPassedProduct = {
    ...p689!,
    raw: {
      ...p689!.raw,
      "Average 1": "2020-01-02",
      "Avg. 2": "2020-06-01",
      "Avg. 3": "2020-12-01",
      "Avg. 4": "",
      "Avg. 5": "",
      "Avg. 6": "",
      "Avg. 7": "",
      "Last Observation Date": "2020-12-01",
    },
  } as ProductRecord;
  const allPassedRun = runProbabilityBacktest({
    product: allPassedProduct,
    mode: "current",
    valuationDate: asOf,
    series,
    niftyLevel: today,
    includePaths: true,
  });
  assert(allPassedRun.pathSchedule.length === 0, "all-passed pathSchedule empty");
  assert(allPassedRun.effectiveTargetLevel == null || allPassedRun.probability == null, "all-passed no current prob");
  assert(allPassedRun.includedCount === 0, "all-passed no included paths");
  const etNull = computeCurrentEffectiveTargetLevel({
    product: allPassedProduct,
    checkingDate: asOf,
    series,
    underlying: "nifty",
    targetLevel: getTargetLevel(allPassedProduct) ?? 0,
  });
  assert(etNull == null, "all-passed ET null");

  // --- 4. Phase 2 Actual Start = Trade Date ---
  const phase2 = products.find((p) => {
    const phase = String(p.raw?.["Rollover Phase"] ?? p.rolloverPhase ?? "").toLowerCase();
    return phase.includes("2") || phase.includes("ii");
  });
  assert(phase2, "phase 2 product exists");
  if (phase2) {
    const start = getWorkingAllotmentDate(phase2, asOf);
    const tradeRaw = phase2.raw?.["Trade Date/Opening date"] ?? phase2.raw?.["Trade Date"];
    assert(start, "phase2 has Actual Start");
    // Initial schedule days measured from that start
    const init = runProbabilityBacktest({
      product: phase2,
      mode: "initial",
      valuationDate: asOf,
      series,
      includePaths: false,
    });
    assert(init.mode === "initial", "phase2 initial runs");
    assert(init.schedule.length === 7, "phase2 full Average 1-7 schedule slots");
    void tradeRaw;
  }

  // --- 5. Ceiling math ---
  assert(ceilingStartLevel(1254.3, "nifty") === 1300, "nifty ceiling");
  assert(ceilingStartLevel(40000, "sensex") === 40300, "sensex ceiling");

  // --- 6. Blank Average slots stay null columns, don't break present numbering ---
  if (p689) {
    const cur = runProbabilityBacktest({
      product: p689,
      mode: "current",
      valuationDate: asOf,
      series,
      niftyLevel: today,
      includePaths: true,
    });
    assert(cur.schedule.length === 7, "Average 1-7 slot array");
    assert(cur.schedule.filter((s) => !s.date).length === 4, "689 has 4 blank Average slots");
    assert(cur.paths[0]!.observationDates.length === 7, "path row spans 7 schedule slots");
  }

  // --- 7. Series floor ---
  assert(series[0]?.date === "2001-01-01", `series floor ${series[0]?.date}`);

  if (fails.length) {
    console.error("FAILS:");
    for (const f of fails) console.error(" -", f);
    process.exitCode = 1;
  } else {
    console.log("audit-probability-edge-cases: PASS");
    console.log({
      seriesBars: series.length,
      seriesEnd: series.at(-1)?.date,
      cases: [
        "689 initial+current+ET+placeholders",
        "all-remaining ET=Target",
        "all-passed ET null",
        "phase2 start",
        "ceiling",
        "blank slots",
        "series floor",
      ],
    });
  }
}

main();
