/**
 * Smoke bench: real-book Initial+Current summary timing + sample probs.
 * Run: npx tsx scripts/bench-probability.ts
 */
import { buildIndexSeries, runProbabilityBacktest, resolveUnderlyingKind } from "../lib/probability/engine";
import niftyHistory from "../lib/data/valuation-index-history.json";
import sensexHistory from "../lib/data/sensex-index-history.json";
import { excelSerialToDate, toLocalDateKey } from "../lib/workbook/dates";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";

function loadBundledSeries() {
  const niftyMap = new Map<string, number>();
  for (const row of niftyHistory.entries as Array<{ dateSerial: number; level: number }>) {
    niftyMap.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  const sensexMap = new Map<string, number>();
  for (const row of sensexHistory.entries as Array<{ dateSerial: number; level: number }>) {
    sensexMap.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  const dates = [...new Set([...niftyMap.keys(), ...sensexMap.keys()])].sort();
  const rows: Array<{ date: string; nifty: number; sensex: number }> = [];
  for (const date of dates) {
    const nifty = niftyMap.get(date);
    const sensex = sensexMap.get(date);
    if (nifty == null || sensex == null) continue;
    rows.push({ date, nifty, sensex });
  }
  return buildIndexSeries(rows);
}

function main() {
  const products = loadCanonicalProducts().filter((p) => resolveUnderlyingKind(p) && p.isin);
  const series = loadBundledSeries();
  const asOf = new Date();
  const sample = products.slice(0, 40);
  const last = series[series.length - 1]!;

  const t0 = performance.now();
  let ok = 0;
  let nullProb = 0;
  for (const product of sample) {
    const initial = runProbabilityBacktest({
      product,
      mode: "initial",
      valuationDate: asOf,
      series,
      niftyLevel: last.nifty,
      sensexLevel: last.sensex,
      includePaths: false,
    });
    const current = runProbabilityBacktest({
      product,
      mode: "current",
      valuationDate: asOf,
      series,
      niftyLevel: last.nifty,
      sensexLevel: last.sensex,
      includePaths: false,
    });
    if (initial.probability != null || current.probability != null) ok += 1;
    if (initial.probability == null) nullProb += 1;
  }
  const ms = performance.now() - t0;
  const perProduct = ms / sample.length;

  console.log("bench-probability:");
  console.log({
    products: sample.length,
    seriesBars: series.length,
    elapsedMs: Math.round(ms),
    msPerProductBothModes: Number(perProduct.toFixed(1)),
    withAnyProb: ok,
    initialNull: nullProb,
    sample: sample.slice(0, 3).map((p) => {
      const initial = runProbabilityBacktest({
        product: p,
        mode: "initial",
        valuationDate: asOf,
        series,
        niftyLevel: last.nifty,
        sensexLevel: last.sensex,
        includePaths: false,
      });
      const current = runProbabilityBacktest({
        product: p,
        mode: "current",
        valuationDate: asOf,
        series,
        niftyLevel: last.nifty,
        sensexLevel: last.sensex,
        includePaths: false,
      });
      return {
        isin: p.isin,
        initial: initial.probability,
        current: current.probability,
        includedI: initial.includedCount,
        includedC: current.includedCount,
      };
    }),
  });

  if (perProduct > 250) {
    throw new Error(`Too slow: ${perProduct.toFixed(1)} ms/product (both modes) exceeds 250ms budget`);
  }
  console.log("bench-probability: OK");
}

main();
