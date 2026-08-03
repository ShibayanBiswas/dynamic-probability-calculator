/**
 * Probability engine correctness checks (helpers + path inclusion + thresholds).
 * Run: npx tsx scripts/verify-probability-parity.ts
 */

import {
  buildIndexSeries,
  ceilingStartLevel,
  lookupPriorBar,
  runProbabilityBacktest,
} from "../lib/probability/engine";
import type { ProductRecord } from "../lib/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const series = buildIndexSeries([
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

const current = runProbabilityBacktest({
  product,
  mode: "current",
  valuationDate: new Date("2026-07-09"),
  series,
  niftyLevel: 24200,
  includePaths: true,
});

assert(current.includedCount > 0, "current included paths");
assert(current.paths[0]?.adjustedStartLevel == null, "current has no adjusted start");
assert(Math.abs((current.threshold ?? NaN) - (13700 / 24200 - 1)) < 1e-12, "current threshold uses desk nifty");

const currentFallback = runProbabilityBacktest({
  product,
  mode: "current",
  valuationDate: new Date("2024-01-02"),
  series,
  includePaths: false,
});
assert(
  Math.abs((currentFallback.threshold ?? NaN) - (13700 / 21000 - 1)) < 1e-12,
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

const sparseSeries = buildIndexSeries([
  { date: "2026-07-09", nifty: 24200, sensex: 77500 },
]);
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
  currentProb: current.probability,
  currentIncluded: current.includedCount,
  lastIndex: initial.lastIndexDate,
  currentFallbackThreshold: currentFallback.threshold,
});
