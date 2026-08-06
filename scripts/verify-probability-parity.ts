/**
 * Probability engine correctness checks (helpers + path inclusion + thresholds).
 * Run: npx tsx scripts/verify-probability-parity.ts
 */

import {
  buildIndexSeries,
  ceilingStartLevel,
  computeCurrentEffectiveTargetLevel,
  lookupPriorBar,
  requiredUnderlying,
  requiredUnderlyingFromHurdleLevel,
  runProbabilityBacktest,
  targetUnderlying,
} from "../lib/probability/engine";
import type { ProductRecord } from "../lib/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const series = buildIndexSeries([
  { date: "2010-01-04", nifty: 5200, sensex: 17000 },
  { date: "2012-01-03", nifty: 4800, sensex: 16000 },
  { date: "2013-06-25", nifty: 5750, sensex: 18800 },
  { date: "2013-06-26", nifty: 5800, sensex: 19000 },
  { date: "2015-01-02", nifty: 8000, sensex: 26000 },
  { date: "2016-01-04", nifty: 7500, sensex: 24000 },
  { date: "2018-01-02", nifty: 10500, sensex: 34000 },
  { date: "2020-01-01", nifty: 12000, sensex: 40000 },
  { date: "2020-01-02", nifty: 12100, sensex: 40100 },
  { date: "2020-01-03", nifty: 12200, sensex: 40200 },
  { date: "2021-01-01", nifty: 14000, sensex: 45000 },
  { date: "2022-01-03", nifty: 17000, sensex: 55000 },
  { date: "2024-01-02", nifty: 21000, sensex: 70000 },
  { date: "2026-07-09", nifty: 24200, sensex: 77500 },
]);

assert(ceilingStartLevel(1254.3, "nifty") === 1300, "Nifty ceiling start level");
assert(ceilingStartLevel(40000, "sensex") === 40300, "Sensex ceiling start level");
assert(ceilingStartLevel(12100, "nifty") === 12300, "Nifty 12100 → 12300");

const prior = lookupPriorBar(series, Date.UTC(2020, 0, 2, 12));
assert(prior?.date === "2020-01-02", "prior bar exact");
const prior2 = lookupPriorBar(series, Date.UTC(2020, 0, 4, 12));
assert(prior2?.date === "2020-01-03", "prior bar approximate");

/** Initial: allotment 2020-01-01; two obs after allotment — frontier = Actual Start. */
const product = {
  rowId: "test",
  category: "Primary",
  name: "Test Product",
  isin: "INE000TEST001",
  series: "TEST",
  underlying: "Nifty",
  tradeAmount: 1_000_000,
  raw: {
    "Actual Entry Level": "10000",
    "Target Level": "13700",
    "Average 1": "2024-01-02",
    "Avg. 2": "2026-07-09",
    "Allotment Date": "2020-01-01",
    "Trade Date/Opening date": "2020-01-01",
    "Maturity Date": "2027-01-01",
  },
} as unknown as ProductRecord;

const initial = runProbabilityBacktest({
  product,
  mode: "initial",
  valuationDate: new Date("2026-07-09"),
  series,
  niftyLevel: 24200,
  includePaths: true,
});

assert(initial.includedCount > 0, "initial included paths");
assert(initial.probability != null && initial.probability >= 0 && initial.probability <= 1, "initial prob range");
assert(Math.abs((initial.threshold ?? NaN) - (13700 / 10000 - 1)) < 1e-12, "initial threshold = target/entry − 1");
assert(
  Math.abs((targetUnderlying(product) ?? NaN) - (13700 / 10000 - 1)) < 1e-12,
  "Target Underlying equals Initial success threshold",
);
assert(
  Math.abs((requiredUnderlying(product, 24200, undefined) ?? NaN) - (13700 / 24200 - 1)) < 1e-12,
  "Required Underlying equals Current success threshold at desk level",
);
assert(initial.paths.some((p) => p.pathIncluded), "has included path");
assert(
  initial.paths.every((p) => !p.pathIncluded || p.averageObservationLevel != null),
  "included paths must average all present observation slots",
);
const lastIncluded = [...initial.paths].reverse().find((p) => p.pathIncluded);
assert(lastIncluded, "last included exists");
assert(
  lastIncluded!.observationLevels.filter((l) => l != null).length === 2,
  "last included covers both Average slots",
);
// Last Yes final observation lands on Actual Start (allotment); later rows are Path Taken = No.
const lastObsDate = lastIncluded!.observationDates.filter(Boolean).at(-1);
assert(lastObsDate === "2020-01-01", `initial last Yes final obs = allotment, got ${lastObsDate}`);
assert(
  initial.paths.some((p) => !p.pathIncluded),
  "initial path table includes Path-Taken-No rows past the Yes frontier",
);
assert(
  lastIncluded!.observationDates.filter(Boolean).at(-1) === "2020-01-01",
  "initial last Yes final obs = allotment",
);

/**
 * Current with one passed obs (2024-01-02) and one remaining (2027-01-15).
 * Observation Schedule keeps both slots; pathSchedule / probability drop the passed one
 * and hurdle with Effective Target.
 */
const currentProduct = {
  ...product,
  raw: {
    ...product.raw,
    "Average 1": "2024-01-02",
    "Avg. 2": "2027-01-15",
  },
} as unknown as ProductRecord;

const currentSeries = buildIndexSeries([
  ...series.map((b) => ({ date: b.date, nifty: b.nifty, sensex: b.sensex })),
  { date: "2027-01-15", nifty: 25000, sensex: 80000 },
]);

const current = runProbabilityBacktest({
  product: currentProduct,
  mode: "current",
  valuationDate: new Date("2026-07-09"),
  series: currentSeries,
  niftyLevel: 24200,
  includePaths: true,
});

const currentPresent = current.schedule.filter((s) => s.date);
assert(currentPresent.length === 2, "current Observation Schedule keeps all present Average slots");
assert(
  currentPresent.some((s) => s.daysFromBase <= 0),
  "passed slot retained on Observation Schedule with non-positive days",
);
assert(current.pathSchedule.length === 1, "current pathSchedule keeps only remaining positive-day obs");
assert(current.pathSchedule[0]?.daysFromBase! > 0, "remaining days positive");
assert(
  current.paths[0]?.observationDates.length === current.schedule.length,
  "path row observation columns span the full schedule",
);
// Passed slot keeps its column as a null placeholder, and is left out of the average.
const passedIdx = current.schedule.findIndex((s) => s.date != null && s.daysFromBase <= 0);
const remainingIdx = current.schedule.findIndex((s) => s.date != null && s.daysFromBase > 0);
assert(passedIdx >= 0 && remainingIdx >= 0, "fixture has one passed and one remaining slot");
const currentIncludedRow = current.paths.find((p) => p.pathIncluded)!;
assert(
  currentIncludedRow.observationDates[passedIdx] == null &&
    currentIncludedRow.observationLevels[passedIdx] == null,
  "passed slot renders as placeholder on path rows",
);
assert(
  currentIncludedRow.observationDates[remainingIdx] != null &&
    currentIncludedRow.observationLevels[remainingIdx] != null,
  "remaining slot carries date and level on path rows",
);
assert(
  Math.abs(
    (currentIncludedRow.averageObservationLevel ?? NaN) -
      currentIncludedRow.observationLevels[remainingIdx]!,
  ) < 1e-9,
  "average uses remaining slots only",
);
const currentLastYes = [...current.paths].reverse().find((p) => p.pathIncluded);
assert(currentLastYes, "current has at least one Path Taken = Yes");
assert(
  current.paths.length > 0 && current.paths.some((p) => !p.pathIncluded),
  "current path payload includes Path-Taken-No rows past the Yes frontier",
);
const tableLastObs = currentLastYes!.observationDates.filter(Boolean).at(-1);
assert(
  tableLastObs != null &&
    current.lastIndexDate != null &&
    tableLastObs <= current.lastIndexDate,
  `current last Yes final obs ≤ latest series session, got ${tableLastObs} vs ${current.lastIndexDate}`,
);
assert(current.includedCount > 0, "current included paths");
assert(current.paths[0]?.adjustedStartLevel == null, "current has no adjusted start");
assert(current.effectiveTargetLevel != null && current.effectiveTargetLevel > 0, "current sets Effective Target");

const et = computeCurrentEffectiveTargetLevel({
  product: currentProduct,
  checkingDate: new Date("2026-07-09"),
  series: currentSeries,
  underlying: "nifty",
  targetLevel: 13700,
});
assert(et != null, "ET computable");
assert(Math.abs((current.effectiveTargetLevel ?? NaN) - et!) < 1e-9, "engine ET matches helper");
assert(
  Math.abs((current.threshold ?? NaN) - (et! / 24200 - 1)) < 1e-12,
  "current threshold uses Effective Target / today",
);
assert(
  Math.abs((requiredUnderlyingFromHurdleLevel(currentProduct, et!, 24200, undefined) ?? NaN) - (et! / 24200 - 1)) <
    1e-12,
  "requiredUnderlyingFromHurdleLevel matches",
);

const currentLast = [...current.paths].reverse().find((p) => p.pathIncluded);
assert(currentLast?.pathIncluded, "current last Yes path exists");
const currentLastObs = currentLast!.observationDates.filter(Boolean).at(-1);
assert(
  currentLastObs != null &&
    current.lastIndexDate != null &&
    currentLastObs <= current.lastIndexDate,
  `current last Yes final obs ≤ latest series session, got ${currentLastObs}`,
);

/** All remaining — no passed — ET equals Target. */
const allForward = {
  ...product,
  raw: {
    ...product.raw,
    "Average 1": "2027-01-15",
    "Avg. 2": "2027-06-15",
  },
} as unknown as ProductRecord;
const forwardSeries = buildIndexSeries([
  ...currentSeries.map((b) => ({ date: b.date, nifty: b.nifty, sensex: b.sensex })),
  { date: "2027-06-15", nifty: 25500, sensex: 81000 },
]);
const allForwardRun = runProbabilityBacktest({
  product: allForward,
  mode: "current",
  valuationDate: new Date("2026-07-09"),
  series: forwardSeries,
  niftyLevel: 24200,
  includePaths: false,
});
assert(allForwardRun.schedule.filter((s) => s.date).length === 2, "two schedule slots on Observation Schedule");
assert(allForwardRun.pathSchedule.length === 2, "two remaining path slots");
assert(
  allForwardRun.effectiveTargetLevel == null,
  "no passed → Effective Target blank",
);
assert(
  Math.abs((allForwardRun.threshold ?? NaN) - (13700 / 24200 - 1)) < 1e-12,
  "no passed → threshold = Target/today",
);

const currentFallback = runProbabilityBacktest({
  product: allForward,
  mode: "current",
  valuationDate: new Date("2026-07-09"),
  series: forwardSeries,
  includePaths: false,
});
assert(
  Math.abs((currentFallback.threshold ?? NaN) - (13700 / 24200 - 1)) < 1e-12,
  "current without explicit level uses valuation-date prior close",
);

const missingEntry = {
  ...product,
  raw: { ...product.raw, "Actual Entry Level": "" },
} as unknown as ProductRecord;
const noThreshold = runProbabilityBacktest({
  product: missingEntry,
  mode: "initial",
  valuationDate: new Date("2026-07-09"),
  series,
  niftyLevel: 24200,
  includePaths: false,
});
assert(noThreshold.probability == null, "missing entry → null probability (no false 0% threshold)");
assert(noThreshold.threshold == null, "missing entry → null threshold");

const sparseSeries = buildIndexSeries([{ date: "2026-07-09", nifty: 24200, sensex: 77500 }]);
const sparse = runProbabilityBacktest({
  product,
  mode: "initial",
  valuationDate: new Date("2026-07-09"),
  series: sparseSeries,
  niftyLevel: 24200,
  includePaths: true,
});
assert(sparse.includedCount === 0, "sparse history cannot satisfy multi-obs schedule");
assert(sparse.probability == null, "no included paths → null probability");

console.log("verify-probability-parity: OK");
console.log({
  initialProb: initial.probability,
  initialIncluded: initial.includedCount,
  initialLastObs: lastObsDate,
  currentProb: current.probability,
  currentIncluded: current.includedCount,
  currentET: current.effectiveTargetLevel,
  currentScheduleLen: current.schedule.length,
  currentPathScheduleLen: current.pathSchedule.length,
  lastIndex: initial.lastIndexDate,
});
