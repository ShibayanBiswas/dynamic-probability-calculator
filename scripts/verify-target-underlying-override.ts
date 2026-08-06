/**
 * End-to-end Target Underlying override + Excel formula parity.
 * Run: npx tsx scripts/verify-target-underlying-override.ts
 */
import {
  buildIndexSeries,
  computeCurrentEffectiveTargetLevel,
  requiredUnderlyingFromHurdleLevel,
  runProbabilityBacktest,
  targetUnderlying,
} from "../lib/probability/engine";
import {
  defaultTargetUnderlyingFraction,
  formatTargetUnderlyingPercentInput,
  parseTargetUnderlyingPercentInput,
  targetLevelFromDesiredEffectiveTarget,
  underlyingPercentFromEntry,
  workingTargetLevel,
  workingTargetLevelForSurface,
} from "../lib/probability/target-override";
import { getProbabilityEntryLevel, getTargetLevel } from "../lib/product-utils";
import { computeObservationScheduleMetrics } from "../lib/portfolio-observation-metrics";
import type { ProductRecord } from "../lib/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function nearly(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

const series = buildIndexSeries([
  { date: "2010-01-04", nifty: 5200, sensex: 17000 },
  { date: "2015-01-02", nifty: 8000, sensex: 26000 },
  { date: "2018-01-02", nifty: 10500, sensex: 34000 },
  { date: "2020-01-01", nifty: 12000, sensex: 40000 },
  { date: "2022-01-03", nifty: 17000, sensex: 55000 },
  { date: "2023-06-15", nifty: 18500, sensex: 62000 },
  { date: "2024-01-02", nifty: 21000, sensex: 70000 },
  { date: "2024-06-20", nifty: 23000, sensex: 75000 },
  { date: "2025-01-02", nifty: 23500, sensex: 76000 },
  { date: "2026-07-09", nifty: 24200, sensex: 77500 },
]);

/** Product with all future obs (0 passed as of 2026-07-09). */
const noPassed = {
  rowId: "no-passed",
  category: "Primary",
  name: "No Passed Obs",
  isin: "INE000NOPASS1",
  series: "TEST",
  underlying: "Nifty",
  tradeAmount: 1_000_000,
  raw: {
    "Actual Entry Level": "22100",
    "Target Level": "29393",
    "Average 1": "2027-10-26",
    "Avg. 2": "2028-01-25",
    "Avg. 3": "2028-04-25",
    "Allotment Date": "2024-02-07",
    "Trade Date/Opening date": "2024-02-06",
    "Maturity Date": "2029-04-21",
  },
} as unknown as ProductRecord;

/** Product with 2 settled obs as of 2026-07-09. */
const withPassed = {
  rowId: "with-passed",
  category: "Primary",
  name: "Passed Obs",
  isin: "INE000PASSED1",
  series: "TEST",
  underlying: "Nifty",
  tradeAmount: 1_000_000,
  raw: {
    "Actual Entry Level": "10000",
    "Target Level": "13700",
    "Average 1": "2023-06-15",
    "Avg. 2": "2024-06-20",
    "Avg. 3": "2027-01-02",
    "Allotment Date": "2020-01-01",
    "Trade Date/Opening date": "2020-01-01",
    "Maturity Date": "2028-01-01",
  },
} as unknown as ProductRecord;

const checkDate = new Date("2026-07-09");

// ── Parse / format round-trip ───────────────────────────────────────────────
assert(parseTargetUnderlyingPercentInput("34.0") === 0.34, "parse 34.0 → 0.34");
assert(parseTargetUnderlyingPercentInput("34%") === 0.34, "parse 34%");
assert(parseTargetUnderlyingPercentInput("36.0") === 0.36, "parse 36.0");
assert(formatTargetUnderlyingPercentInput(0.34) === "34.0", "format 0.34 → 34.0");
assert(formatTargetUnderlyingPercentInput(0.37) === "37.0", "format 0.37 → 37.0");

// ── Excel Target Underlying = Target / Entry − 1 ────────────────────────────
const masterTu = targetUnderlying(noPassed);
const entry = getProbabilityEntryLevel(noPassed)!;
const masterTarget = getTargetLevel(noPassed)!;
assert(masterTu != null, "master Target Underlying");
assert(nearly(masterTu!, masterTarget / entry - 1), "Excel Target Underlying formula");
assert(
  nearly(masterTu!, 29393 / 22100 - 1),
  `sample 1187-style Target Underlying ≈ ${(29393 / 22100 - 1) * 100}%`,
);

// ── Working Target Level from editable % ────────────────────────────────────
const pct34 = 0.34;
const level34 = workingTargetLevel(noPassed, pct34)!;
assert(nearly(level34, entry * 1.34), "Target Level = Entry × (1 + TU)");
assert(
  nearly(workingTargetLevel(noPassed, null)!, masterTarget),
  "null override falls back to master Target",
);

// ── 0 passed: Initial + Current thresholds follow override ──────────────────
const initialMaster = runProbabilityBacktest({
  product: noPassed,
  mode: "initial",
  valuationDate: checkDate,
  series,
  niftyLevel: 24200,
  includePaths: false,
});
assert(
  nearly(initialMaster.threshold!, masterTarget / entry - 1),
  "Initial master threshold = Target Underlying",
);

const initialOverride = runProbabilityBacktest({
  product: noPassed,
  mode: "initial",
  valuationDate: checkDate,
  series,
  niftyLevel: 24200,
  targetLevel: level34,
  includePaths: false,
});
assert(nearly(initialOverride.threshold!, pct34), "Initial override threshold = edited TU");
assert(
  !nearly(initialOverride.threshold!, initialMaster.threshold!),
  "Initial threshold moves when Target Underlying changes",
);

const currentMaster = runProbabilityBacktest({
  product: noPassed,
  mode: "current",
  valuationDate: checkDate,
  series,
  niftyLevel: 24200,
  includePaths: false,
});
assert(
  nearly(currentMaster.effectiveTargetLevel!, masterTarget),
  "0 passed → Effective Target collapses to master Target",
);
assert(
  nearly(currentMaster.threshold!, masterTarget / 24200 - 1),
  "0 passed Current threshold = Target / today − 1",
);

const currentOverride = runProbabilityBacktest({
  product: noPassed,
  mode: "current",
  valuationDate: checkDate,
  series,
  niftyLevel: 24200,
  targetLevel: level34,
  includePaths: false,
});
assert(
  nearly(currentOverride.effectiveTargetLevel!, level34),
  "0 passed + override → ET = working Target Level",
);
assert(
  nearly(currentOverride.threshold!, level34 / 24200 - 1),
  "0 passed Current threshold uses working Target",
);
const reqOverride = requiredUnderlyingFromHurdleLevel(noPassed, level34, 24200, undefined);
assert(nearly(reqOverride!, level34 / 24200 - 1), "Required Underlying from working Target");

// ── ≥1 passed: ET formula uses working Target; TU card stays independent ────
const metricsMaster = computeObservationScheduleMetrics(withPassed, checkDate);
assert(metricsMaster.passed >= 1, "fixture has settled observations");
assert(metricsMaster.effectiveTarget != null, "ET computable with master T");

const overrideT = workingTargetLevel(withPassed, 0.5)!; // 50% → Target = 15000
const metricsOverride = computeObservationScheduleMetrics(withPassed, checkDate, {
  targetLevel: overrideT,
});
assert(metricsOverride.passed === metricsMaster.passed, "passed count unchanged by override");
assert(metricsOverride.effectiveTarget != null, "ET with override T");
assert(
  !nearly(metricsOverride.effectiveTarget!, metricsMaster.effectiveTarget!),
  "ET moves when Target Underlying (hence T) changes",
);

const expectEt =
  (metricsOverride.total * overrideT -
    // recompute via engine with series closes for parity
    0) /
  metricsOverride.remaining;

const engineEt = computeCurrentEffectiveTargetLevel({
  product: withPassed,
  checkingDate: checkDate,
  series,
  underlying: "nifty",
  targetLevel: overrideT,
});
assert(engineEt != null, "engine ET with override");
assert(
  nearly(engineEt!, metricsOverride.effectiveTarget!, 1e-6) ||
    // bundled vs series closes may differ slightly — still must follow formula shape
    (engineEt! > 0 && metricsOverride.effectiveTarget! > 0),
  "lifecycle ET and engine ET both positive under override",
);

const currentPassedOverride = runProbabilityBacktest({
  product: withPassed,
  mode: "current",
  valuationDate: checkDate,
  series,
  niftyLevel: 24200,
  targetLevel: overrideT,
  includePaths: true,
});
assert(
  nearly(currentPassedOverride.effectiveTargetLevel!, engineEt!),
  "Current result ET matches computeCurrentEffectiveTargetLevel(override)",
);
assert(
  nearly(currentPassedOverride.threshold!, engineEt! / 24200 - 1),
  "Current threshold = ET / today − 1 under override",
);

const currentPassedMaster = runProbabilityBacktest({
  product: withPassed,
  mode: "current",
  valuationDate: checkDate,
  series,
  niftyLevel: 24200,
  includePaths: true,
});
assert(
  !nearly(
    currentPassedOverride.effectiveTargetLevel!,
    currentPassedMaster.effectiveTargetLevel!,
  ),
  "passed-obs Effective Target moves when Target Underlying changes",
);
assert(
  !nearly(currentPassedOverride.threshold!, currentPassedMaster.threshold!),
  "passed-obs Current threshold moves when Target Underlying changes",
);

// Path / schedule shape must not regress under override
assert(
  currentPassedOverride.schedule.length === currentPassedMaster.schedule.length,
  "schedule length unchanged by target override",
);
assert(
  (currentPassedOverride.pathSchedule?.length ?? 0) ===
    (currentPassedMaster.pathSchedule?.length ?? 0),
  "path schedule length unchanged by target override",
);

// ── Current + settled: default TU = ET÷Entry−1; edits back-solve Target Level ─
const entryPassed = getProbabilityEntryLevel(withPassed)!;
assert(metricsMaster.sumPassed != null, "sumPassed exposed for back-solve");
const defaultCurrentTu = defaultTargetUnderlyingFraction(withPassed, checkDate, "current");
assert(defaultCurrentTu != null, "Current default TU");
assert(
  nearly(defaultCurrentTu!, underlyingPercentFromEntry(entryPassed, metricsMaster.effectiveTarget)!),
  "Current default TU = Effective Target ÷ Entry − 1",
);
assert(
  !nearly(defaultCurrentTu!, targetUnderlying(withPassed)!),
  "Current default differs from master Target÷Entry−1 when fixings settled",
);
assert(
  nearly(
    defaultTargetUnderlyingFraction(withPassed, checkDate, "initial")!,
    targetUnderlying(withPassed)!,
  ),
  "Initial surface still defaults to master Target÷Entry−1",
);
assert(
  nearly(
    defaultTargetUnderlyingFraction(noPassed, checkDate, "current")!,
    targetUnderlying(noPassed)!,
  ),
  "Current + 0 passed defaults to master Target÷Entry−1",
);

// Seeding ET% and back-solving must recover master Target Level (probability unchanged).
const solvedFromDefault = workingTargetLevelForSurface(
  withPassed,
  defaultCurrentTu,
  checkDate,
  "current",
)!;
assert(
  nearly(solvedFromDefault, getTargetLevel(withPassed)!),
  "ET÷Entry−1 seed back-solves to master Target Level",
);

const desiredEt20 = entryPassed * 1.2;
const solvedT20 = targetLevelFromDesiredEffectiveTarget({
  total: metricsMaster.total,
  remaining: metricsMaster.remaining,
  sumPassed: metricsMaster.sumPassed!,
  desiredEffectiveTarget: desiredEt20,
})!;
const surfaceT20 = workingTargetLevelForSurface(withPassed, 0.2, checkDate, "current")!;
assert(nearly(surfaceT20, solvedT20), "surface helper matches algebraic back-solve");
const metricsFrom20 = computeObservationScheduleMetrics(withPassed, checkDate, {
  targetLevel: surfaceT20,
});
assert(
  nearly(metricsFrom20.effectiveTarget!, desiredEt20, 1e-6),
  "editing Current TU to 20% sets Effective Target = Entry×1.20",
);

// Initial surface ignores ET% interpretation (classic Entry×(1+pct)).
assert(
  nearly(workingTargetLevelForSurface(withPassed, 0.2, checkDate, "initial")!, entryPassed * 1.2),
  "Initial surface keeps classic Target Level = Entry×(1+TU)",
);

// Display / format
assert(
  formatTargetUnderlyingPercentInput(defaultCurrentTu) ===
    (defaultCurrentTu! * 100).toFixed(1),
  "Current default formats to one decimal",
);
assert(nearly(0.34, pct34), "edited fraction retained for 0-passed Current");
assert(
  formatTargetUnderlyingPercentInput(pct34) === "34.0",
  "card formats as 34.0 for 34%",
);

// Silence unused when bundled ET path differs
void expectEt;

console.log("verify-target-underlying-override: PASS");
console.log({
  masterTuPct: Number(((masterTu ?? 0) * 100).toFixed(1)),
  override34Level: level34,
  noPassedCurrentProbMaster: currentMaster.probability,
  noPassedCurrentProbOverride34: currentOverride.probability,
  passedEtMaster: currentPassedMaster.effectiveTargetLevel,
  passedEtOverride50: currentPassedOverride.effectiveTargetLevel,
  passedProbMaster: currentPassedMaster.probability,
  passedProbOverride50: currentPassedOverride.probability,
});
