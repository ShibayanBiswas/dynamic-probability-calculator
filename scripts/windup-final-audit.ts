/**
 * Final wind-up audit — Accelerator 689 + Current passed-obs Target Underlying
 * vs Excel formulas / desk SSOT. Exit 0 only when every assertion passes.
 *
 * Run: npx tsx scripts/windup-final-audit.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import sensexHistory from "../lib/data/sensex-index-history.json";
import {
  buildObservationSchedule,
  computeCurrentEffectiveTargetLevel,
  daysLeftToLastObservation,
  requiredUnderlyingFromHurdleLevel,
  runProbabilityBacktest,
  targetUnderlying,
  type IndexBar,
} from "../lib/probability/engine";
import { mergeForwardFilledSeries, SERIES_FLOOR } from "../lib/probability/index-series";
import { computeObservationScheduleMetrics } from "../lib/portfolio-observation-metrics";
import { getWorkingAllotmentDate } from "../lib/product-dates";
import { getProbabilityEntryLevel, getTargetLevel } from "../lib/product-utils";
import {
  defaultTargetUnderlyingFraction,
  formatTargetUnderlyingPercentInput,
  workingTargetLevelForSurface,
} from "../lib/probability/target-override";
import { excelSerialToDate, toLocalDateKey } from "../lib/workbook/dates";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

const ROOT = process.cwd();
const fails: string[] = [];

function assert(cond: unknown, msg: string) {
  if (!cond) fails.push(msg);
}

function nearly(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) <= eps;
}

function loadSeries(): IndexBar[] {
  const nifty = new Map<string, number>();
  for (const line of readFileSync(join(ROOT, "lib", "data", "nifty-daily-2001.csv"), "utf8")
    .split(/\r?\n/)
    .slice(1)) {
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

function main() {
  const products = loadSeedProducts();
  const series = loadSeries();
  const asOf = new Date("2026-08-06T12:00:00");
  const today = 24624.65; // desk mark from user Current Prob screenshot

  const p689 = products.find((p) => p.isin === "INE093JA77O9");
  assert(p689, "INE093JA77O9 present");
  if (!p689) {
    console.error(fails);
    process.exit(1);
  }

  const entry = getProbabilityEntryLevel(p689)!;
  const target = getTargetLevel(p689)!;
  const actualStart = getWorkingAllotmentDate(p689, asOf)!;

  // ── Master identity / Initial Target Underlying (Excel D22) ───────────────
  assert(entry === 17400, `entry ${entry}`);
  assert(target === 23142, `target ${target}`);
  assert(toLocalDateKey(actualStart) === "2021-12-07", `allotment ${toLocalDateKey(actualStart)}`);
  assert(nearly(targetUnderlying(p689)!, 0.33, 1e-12), "master TU = Target/Entry−1 = 33%");

  // ── Observation dates (Data → schedule) ───────────────────────────────────
  const initSched = buildObservationSchedule(p689, actualStart).filter((s) => s.date);
  assert(initSched.length === 3, `initial present slots ${initSched.length}`);
  const obsKeys = initSched.map((s) =>
    typeof s.date === "string" ? s.date : toLocalDateKey(s.date as Date),
  );
  assert(obsKeys[0] === "2026-02-24", `obs1 ${obsKeys[0]}`);
  assert(obsKeys[1] === "2026-05-26", `obs2 ${obsKeys[1]}`);
  assert(obsKeys[2] === "2026-08-25", `obs3 ${obsKeys[2]}`);
  assert(initSched[0]?.daysFromBase === 1540, `days1 ${initSched[0]?.daysFromBase}`);
  assert(initSched[1]?.daysFromBase === 1631, `days2 ${initSched[1]?.daysFromBase}`);
  assert(initSched[2]?.daysFromBase === 1722, `days3 ${initSched[2]?.daysFromBase}`);

  // ── Initial Prob (Excel Initial Prob sheet KPIs) ──────────────────────────
  const initial = runProbabilityBacktest({
    product: p689,
    mode: "initial",
    valuationDate: asOf,
    series,
    includePaths: true,
  });
  assert(initial.includedCount === 4043, `initial taken ${initial.includedCount}`);
  assert(initial.successCount === 3448, `initial success ${initial.successCount}`);
  assert(nearly(initial.probability!, 3448 / 4043, 1e-12), "initial prob 85.3%");
  assert(nearly(initial.threshold!, 0.33, 1e-12), "initial threshold 33%");
  const lastYesI = [...initial.paths].reverse().find((p) => p.pathIncluded)!;
  assert(
    lastYesI.observationDates.filter(Boolean).at(-1) === "2021-12-07",
    "initial last Yes final obs = Actual Start",
  );
  assert(initial.paths.some((p) => !p.pathIncluded), "initial has Path-Taken-No (Excluded)");

  // ── Current schedule + Effective Target (lifecycle / Backtesting override) ─
  const curSched = buildObservationSchedule(p689, asOf).filter((s) => s.date);
  assert(curSched.filter((s) => s.daysFromBase <= 0).length === 2, "2 passed on Current schedule");
  assert(curSched.filter((s) => s.daysFromBase > 0).length === 1, "1 remaining on Current schedule");
  assert(curSched[2]?.daysFromBase === 19, `days left to last obs slot ${curSched[2]?.daysFromBase}`);
  assert(daysLeftToLastObservation(p689, asOf) === 19, "daysLeft helper 19");

  const metrics = computeObservationScheduleMetrics(p689, asOf);
  assert(metrics.passed === 2 && metrics.remaining === 1, "metrics 2/1");
  assert(nearly(metrics.effectiveTarget!, 20087.65, 0.02), `ET ${metrics.effectiveTarget}`);
  assert(nearly(metrics.sumPassed!, 49338.35, 0.02), `sumPassed ${metrics.sumPassed}`);

  const engineEt = computeCurrentEffectiveTargetLevel({
    product: p689,
    checkingDate: asOf,
    series,
    underlying: "nifty",
    targetLevel: target,
  });
  assert(nearly(engineEt!, 20087.65, 0.02), `engine ET ${engineEt}`);

  // ── Current desk Target Underlying default = ET ÷ Entry − 1 ───────────────
  const defaultTu = defaultTargetUnderlyingFraction(p689, asOf, "current")!;
  const expectTu = 20087.65 / 17400 - 1;
  assert(nearly(defaultTu, expectTu, 1e-9), `default Current TU ${defaultTu} vs ${expectTu}`);
  assert(formatTargetUnderlyingPercentInput(defaultTu) === "15.4", "formats as 15.4%");
  assert(
    nearly(defaultTargetUnderlyingFraction(p689, asOf, "initial")!, 0.33, 1e-12),
    "Initial surface still 33%",
  );

  // Back-solve from ET% recovers master Target — probability unchanged at default
  const solvedT = workingTargetLevelForSurface(p689, defaultTu, asOf, "current")!;
  assert(nearly(solvedT, target, 1e-6), `back-solve T ${solvedT} = master ${target}`);

  // ── Current Prob run ──────────────────────────────────────────────────────
  const current = runProbabilityBacktest({
    product: p689,
    mode: "current",
    valuationDate: asOf,
    series,
    niftyLevel: today,
    includePaths: true,
  });
  assert(current.pathSchedule.length === 1, "pathSchedule remaining-only");
  assert(nearly(current.effectiveTargetLevel!, 20087.65, 0.02), `result ET ${current.effectiveTargetLevel}`);
  const req = requiredUnderlyingFromHurdleLevel(p689, current.effectiveTargetLevel!, today, undefined)!;
  const expectReq = current.effectiveTargetLevel! / today - 1;
  assert(nearly(req, expectReq, 1e-9), `Required ${req} vs ${expectReq}`);
  assert(nearly(current.threshold!, req, 1e-9), "threshold = Required");
  assert(nearly(req, 20087.65 / today - 1, 1e-4), `Required ≈ ET/today ${req}`);
  assert(current.includedCount === 6355 || current.includedCount >= 6300, `included ${current.includedCount}`);
  assert(current.probability != null && current.probability > 0.99, `current prob ${current.probability}`);
  assert(current.paths.some((p) => !p.pathIncluded), "current has Path-Taken-No");
  const lastYesC = [...current.paths].reverse().find((p) => p.pathIncluded)!;
  const lastObsC = lastYesC.observationDates.filter(Boolean).at(-1)!;
  assert(
    current.lastIndexDate != null && lastObsC <= current.lastIndexDate,
    `last Yes obs ${lastObsC} ≤ series ${current.lastIndexDate}`,
  );

  // Passed placeholders on path rows
  const row = current.paths.find((p) => p.pathIncluded)!;
  const passedIdx = current.schedule
    .map((s, i) => (s.date && s.daysFromBase <= 0 ? i : -1))
    .filter((i) => i >= 0);
  const remIdx = current.schedule.findIndex((s) => s.date && s.daysFromBase > 0);
  for (const i of passedIdx) {
    assert(row.observationDates[i] == null && row.observationLevels[i] == null, `passed col ${i}`);
  }
  assert(row.observationLevels[remIdx] != null, "remaining level filled");

  // Edit Current TU → ET moves; Initial interpretation unchanged
  const t20 = workingTargetLevelForSurface(p689, 0.2, asOf, "current")!;
  const m20 = computeObservationScheduleMetrics(p689, asOf, { targetLevel: t20 });
  assert(nearly(m20.effectiveTarget!, entry * 1.2, 1e-6), "edit 20% → ET = Entry×1.2");
  assert(
    nearly(workingTargetLevelForSurface(p689, 0.2, asOf, "initial")!, entry * 1.2),
    "Initial classic T = Entry×1.2",
  );

  if (fails.length) {
    console.error("windup-final-audit: FAIL");
    for (const f of fails) console.error(" -", f);
    process.exit(1);
  }

  console.log("windup-final-audit: PASS");
  console.log({
    isin: "INE093JA77O9",
    initial: {
      taken: initial.includedCount,
      success: initial.successCount,
      prob: Number((initial.probability! * 100).toFixed(1)),
      tuPct: 33,
    },
    current: {
      taken: current.includedCount,
      success: current.successCount,
      prob: Number((current.probability! * 100).toFixed(1)),
      et: current.effectiveTargetLevel,
      defaultTuPct: Number((defaultTu * 100).toFixed(1)),
      requiredPct: Number((req * 100).toFixed(1)),
      lastIndex: current.lastIndexDate,
      daysLeft: daysLeftToLastObservation(p689, asOf),
    },
    intentionalExcelDeltas: [
      "Current averages remaining obs only + ET hurdle (Excel Backtesting averages all slots + master Target)",
      "Current desk TU default with settled fixings = ET/Entry−1 (Excel D22 stays Target/Entry−1)",
      "Path floor 2001-01-01",
      "Series frontier may be newer than stale NSP workbook → small pp deltas",
    ],
  });
}

main();
