/**
 * Line-by-line audit of the probability KPI band for one product, traced back to the
 * unhidden NSP sheets (Probability / Initial Prob / Backtesting).
 *
 * Initial: Entry, Target, Target Underlying, Actual Start, observation offsets, then
 * Paths Taken / Successful Paths / Probability recomputed by hand from the raw series.
 *
 * Current: remaining observations, Effective Target from both code paths (path series
 * and lifecycle bundled history), Required Underlying, Days Left, and the hand-computed
 * Current Probability — each compared against the engine.
 *
 * Usage: npx tsx scripts/audit-initial-probability-kpis.ts "Nifty Accelerator - 689" [niftyLevel]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import sensexHistory from "../lib/data/sensex-index-history.json";
import { isObservationFixingSettled } from "../lib/observation-settlement";
import { computeObservationScheduleMetrics } from "../lib/portfolio-observation-metrics";
import {
  buildObservationSchedule,
  ceilingStartLevel,
  closeAt,
  computeCurrentEffectiveTargetLevel,
  daysLeftToLastObservation,
  lookupPriorBar,
  requiredUnderlying,
  requiredUnderlyingFromHurdleLevel,
  resolveUnderlyingKind,
  runProbabilityBacktest,
  targetUnderlying,
  type IndexBar,
} from "../lib/probability/engine";
import { mergeForwardFilledSeries, SERIES_FLOOR } from "../lib/probability/index-series";
import { getProductObservationDates, getWorkingAllotmentDate } from "../lib/product-dates";
import { getProbabilityEntryLevel, getTargetLevel } from "../lib/product-utils";
import { excelSerialToDate, toLocalDateKey } from "../lib/workbook/dates";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

const ROOT = process.cwd();
const NIFTY_CSV = join(ROOT, "lib", "data", "nifty-daily-2001.csv");

/** Same bundled sources the probability API uses: Gift CSV Nifty + bundled Sensex. */
function loadSeries(): IndexBar[] {
  const nifty = new Map<string, number>();
  for (const line of readFileSync(NIFTY_CSV, "utf8").split(/\r?\n/).slice(1)) {
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

function pct(v: number | null | undefined, digits = 2) {
  return v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
}

function main() {
  const wanted = (process.argv[2] ?? "Nifty Accelerator - 689").trim().toLowerCase();
  const products = loadSeedProducts();
  const product =
    products.find((p) => (p.name ?? "").trim().toLowerCase() === wanted) ??
    products.find((p) => (p.name ?? "").toLowerCase().includes(wanted));

  if (!product) {
    console.log(`Product not found: ${wanted}`);
    return;
  }

  const series = loadSeries();
  const underlying = resolveUnderlyingKind(product) ?? "nifty";
  const entry = getProbabilityEntryLevel(product);
  const target = getTargetLevel(product);
  const actualStart = getWorkingAllotmentDate(product, new Date());
  const schedule = buildObservationSchedule(product, actualStart ?? new Date());

  console.log("=== PRODUCT (Data sheet fields) ===");
  console.log({
    name: product.name,
    isin: product.isin,
    underlying,
    rolloverPhase: product.raw?.["Rollover Phase"] ?? null,
    entryLevel: entry,
    targetLevel: target,
    actualStart: actualStart ? toLocalDateKey(actualStart) : null,
  });

  console.log("\n=== Target Underlying  (Probability!D22 = D20/D19 - 1) ===");
  console.log({
    formula: "Target Level / Entry Level - 1",
    target,
    entry,
    targetUnderlying: pct(targetUnderlying(product), 1),
  });

  console.log("\n=== Observation offsets  (Initial Prob: obs date - Probability!D16) ===");
  for (const slot of schedule) {
    if (!slot.date) continue;
    const d = typeof slot.date === "string" ? new Date(slot.date) : slot.date;
    console.log(`  Average ${slot.index}: ${toLocalDateKey(d)}  days=${slot.daysFromBase}`);
  }

  const result = runProbabilityBacktest({
    product,
    mode: "initial",
    valuationDate: new Date(),
    series,
    includePaths: true,
  });

  // Hand replication of the Initial Prob sheet, independent of the engine loop.
  const startKey = actualStart ? toLocalDateKey(actualStart) : null;
  const present = schedule.filter((s) => s.date != null);
  let taken = 0;
  let success = 0;
  let firstPath: string | null = null;
  let lastPath: string | null = null;
  let lastPathFinalObs: string | null = null;
  const threshold = entry > 0 && target != null ? target / entry - 1 : null;

  for (const bar of series) {
    const startLevel = ceilingStartLevel(closeAt(bar, underlying), underlying);
    let sum = 0;
    let filled = 0;
    let maxObsKey = "";
    for (const slot of present) {
      const [y, m, d] = bar.date.split("-").map(Number);
      const projected = new Date(Date.UTC(y!, m! - 1, d!, 12));
      projected.setUTCDate(projected.getUTCDate() + slot.daysFromBase);
      const key = toLocalDateKey(projected);
      if (key > maxObsKey) maxObsKey = key;
      const obsBar = lookupPriorBar(series, Date.UTC(
        Number(key.slice(0, 4)),
        Number(key.slice(5, 7)) - 1,
        Number(key.slice(8, 10)),
        12,
      ));
      if (obsBar) {
        sum += closeAt(obsBar, underlying);
        filled += 1;
      }
    }
    // Initial Prob "To be taken": Probability!$D$16 >= MAX(path observation dates)
    if (!startKey || startKey < maxObsKey) break;
    if (filled !== present.length || !(startLevel > 0)) continue;
    taken += 1;
    if (firstPath == null) firstPath = bar.date;
    lastPath = bar.date;
    lastPathFinalObs = maxObsKey;
    const performance = sum / present.length / startLevel - 1;
    if (threshold != null && performance >= threshold) success += 1;
  }

  console.log("\n=== Paths Taken / Successful Paths / Probability ===");
  console.log({
    handTaken: taken,
    engineTaken: result.includedCount,
    handSuccess: success,
    engineSuccess: result.successCount,
    handProbability: pct(taken > 0 ? success / taken : null, 1),
    engineProbability: pct(result.probability, 1),
    engineThreshold: pct(result.threshold, 2),
    firstPathStart: firstPath,
    lastPathStart: lastPath,
    lastPathFinalObservation: lastPathFinalObs,
    actualStart: startKey,
    latestIndexDate: result.lastIndexDate,
  });

  const initialOk =
    taken === result.includedCount &&
    success === result.successCount &&
    (result.probability == null || Math.abs(result.probability - success / taken) < 1e-12);

  console.log(`\n${initialOk ? "PASS" : "FAIL"} — hand-computed Initial Prob sheet matches the engine`);

  // ---------------------------------------------------------------- CURRENT ----
  const asOf = new Date();
  const deskNifty = Number(process.argv[3]);
  const lastBar = series[series.length - 1]!;
  const todayLevel =
    Number.isFinite(deskNifty) && deskNifty > 0 ? deskNifty : closeAt(lastBar, underlying);

  console.log("\n=== Current: observation split at the checking date ===");
  const allObs = getProductObservationDates(product);
  const passedObs = allObs.filter((d) => isObservationFixingSettled(d, asOf));
  const remainingObs = allObs.filter((d) => !isObservationFixingSettled(d, asOf));
  let sumPassed = 0;
  for (const d of passedObs) {
    const bar = lookupPriorBar(
      series,
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12),
    );
    const level = bar ? closeAt(bar, underlying) : 0;
    sumPassed += level;
    console.log(`  passed    ${toLocalDateKey(d)}  level=${level.toFixed(2)}`);
  }
  for (const d of remainingObs) {
    console.log(`  remaining ${toLocalDateKey(d)}`);
  }

  // Effective Target = (Total × Target − Σ passed levels) / Remaining
  const handET =
    target != null && remainingObs.length > 0
      ? (allObs.length * target - sumPassed) / remainingObs.length
      : null;
  const engineET = computeCurrentEffectiveTargetLevel({
    product,
    checkingDate: asOf,
    series,
    underlying,
    targetLevel: target ?? 0,
  });
  const lifecycleET = computeObservationScheduleMetrics(product, asOf).effectiveTarget;

  console.log("\n=== Effective Target ===");
  console.log({
    formula: "(Total Obs × Target − Σ passed levels) ÷ Remaining Obs",
    totalObs: allObs.length,
    passedObs: passedObs.length,
    remainingObs: remainingObs.length,
    target,
    sumPassedLevels: Number(sumPassed.toFixed(2)),
    handEffectiveTarget: handET != null ? Number(handET.toFixed(2)) : null,
    engineEffectiveTarget: engineET != null ? Number(engineET.toFixed(2)) : null,
    lifecycleColumnEffectiveTarget: lifecycleET != null ? Number(lifecycleET.toFixed(2)) : null,
  });

  console.log("\n=== Required Underlying  (Probability!D33) ===");
  const handRequired = handET != null && todayLevel > 0 ? handET / todayLevel - 1 : null;
  const deskRequired =
    engineET != null
      ? requiredUnderlyingFromHurdleLevel(product, engineET, todayLevel, todayLevel)
      : requiredUnderlying(product, todayLevel, todayLevel);
  console.log({
    formula: "hurdle level ÷ today's mark − 1",
    hurdleUsed: engineET != null ? "Effective Target" : "master Target",
    hurdleLevel: engineET != null ? Number(engineET.toFixed(2)) : target,
    todayLevel,
    handRequiredUnderlying: pct(handRequired, 1),
    deskRequiredUnderlying: pct(deskRequired, 1),
    plainEnglish:
      handRequired != null && handRequired < 0
        ? `Target is already effectively secured — the index may fall ${pct(Math.abs(handRequired), 1)} and the average still lands on Target.`
        : "The index must still rise by this much for the average to land on Target.",
  });

  const current = runProbabilityBacktest({
    product,
    mode: "current",
    valuationDate: asOf,
    series,
    niftyLevel: underlying === "nifty" ? todayLevel : undefined,
    sensexLevel: underlying === "sensex" ? todayLevel : undefined,
    includePaths: true,
  });

  // Hand replication of the Backtesting sheet on remaining slots only.
  const currentSchedule = buildObservationSchedule(product, asOf).filter(
    (s) => s.date != null && s.daysFromBase > 0,
  );
  const currentThreshold =
    engineET != null && todayLevel > 0 ? engineET / todayLevel - 1 : null;
  let cTaken = 0;
  let cSuccess = 0;
  let cLastStart: string | null = null;
  let cLastFinalObs: string | null = null;
  const frontierKey = lastBar.date;

  for (const bar of series) {
    let sum = 0;
    let filled = 0;
    let maxObsKey = "";
    for (const slot of currentSchedule) {
      const [y, m, d] = bar.date.split("-").map(Number);
      const projected = new Date(Date.UTC(y!, m! - 1, d!, 12));
      projected.setUTCDate(projected.getUTCDate() + slot.daysFromBase);
      const key = toLocalDateKey(projected);
      if (key > maxObsKey) maxObsKey = key;
      const obsBar = lookupPriorBar(
        series,
        Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12),
      );
      if (obsBar) {
        sum += closeAt(obsBar, underlying);
        filled += 1;
      }
    }
    // Backtesting "To be taken": MAX(nifty dates) >= MAX(path observation dates)
    if (frontierKey < maxObsKey) break;
    if (filled !== currentSchedule.length) continue;
    const close = closeAt(bar, underlying);
    if (!(close > 0)) continue;
    cTaken += 1;
    cLastStart = bar.date;
    cLastFinalObs = maxObsKey;
    const performance = sum / currentSchedule.length / close - 1;
    if (currentThreshold != null && performance >= currentThreshold) cSuccess += 1;
  }

  console.log("\n=== Current Probability  (Backtesting sheet) ===");
  console.log({
    remainingSlotsInPathTable: currentSchedule.length,
    daysFromValuation: currentSchedule.map((s) => s.daysFromBase),
    threshold: pct(currentThreshold, 2),
    handTaken: cTaken,
    engineTaken: current.includedCount,
    handSuccess: cSuccess,
    engineSuccess: current.successCount,
    handProbability: pct(cTaken > 0 ? cSuccess / cTaken : null, 1),
    engineProbability: pct(current.probability, 1),
    lastPathStart: cLastStart,
    lastPathFinalObservation: cLastFinalObs,
    seriesFrontier: frontierKey,
    daysLeftToLastObservation: daysLeftToLastObservation(product, asOf),
  });

  const currentOk =
    cTaken === current.includedCount &&
    cSuccess === current.successCount &&
    (handET == null || (engineET != null && Math.abs(handET - engineET) < 1e-6)) &&
    (lifecycleET == null || handET == null || Math.abs(lifecycleET - handET) < 0.51) &&
    (current.threshold == null ||
      currentThreshold == null ||
      Math.abs(current.threshold - currentThreshold) < 1e-12);

  console.log(
    `\n${currentOk ? "PASS" : "FAIL"} — hand-computed Backtesting sheet + Effective Target match the engine`,
  );

  if (!initialOk || !currentOk) process.exitCode = 1;
}

main();
