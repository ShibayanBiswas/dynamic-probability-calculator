/**
 * Verify non-Nifty/Sensex expired products use dedicated underlying series — never Nifty bluff.
 * Usage: npx tsx scripts/verify-custom-underlyings.ts
 */
import { resolveHistoricalIndexLevel } from "../lib/expired-mark";
import { getCustomUnderlyingHistoryStats } from "../lib/custom-underlying-history";
import {
  getProductExpirationDate,
  getProductFinalObservationDate,
  getProductObservationDates,
} from "../lib/product-dates";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { getIndexEntryLevelRaw } from "../lib/product-utils";
import {
  getUnderlyingKind,
  isCustomUnderlyingProduct,
  resolveCustomUnderlyingSpec,
} from "../lib/underlying-benchmark";
import { resolveHistoricalNiftyLevel } from "../lib/expired-mark";
import { loadSeedProducts } from "./lib/load-canonical-dataset";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { formatDeskDate } from "../lib/market-data";

function main() {
  const asOf = new Date();
  const all = filterValidMasterProducts(loadSeedProducts(), asOf);
  const expired = filterProductsByLifecycle(all, "expired", asOf);
  const custom = expired.filter(isCustomUnderlyingProduct);
  const stats = getCustomUnderlyingHistoryStats();

  console.log("=== Custom underlying verify ===");
  console.log(`History: ${stats.instruments} instruments · ${stats.entries} entries · baked ${stats.generatedAt}`);
  console.log(`Expired custom products: ${custom.length}`);

  let mapped = 0;
  let obsOk = 0;
  let obsTotal = 0;
  let maturityOk = 0;
  let maturityTotal = 0;
  let niftyBluff = 0;
  let valued = 0;
  const samples: string[] = [];

  for (const p of custom) {
    const spec = resolveCustomUnderlyingSpec(p);
    if (spec) mapped += 1;
    else {
      console.warn(`UNMAPPED underlying: ${p.isin} · ${p.underlying}`);
      continue;
    }

    const entry = getIndexEntryLevelRaw(p) ?? 0;
    const dates = [
      ...getProductObservationDates(p),
      getProductFinalObservationDate(p),
      getProductExpirationDate(p),
    ].filter((d): d is Date => Boolean(d));

    for (const d of dates) {
      const isMaturityish =
        d.getTime() === getProductExpirationDate(p)?.getTime() ||
        d.getTime() === getProductFinalObservationDate(p)?.getTime();
      if (isMaturityish) maturityTotal += 1;
      else obsTotal += 1;

      const level = resolveHistoricalIndexLevel(p, d);
      const nifty = resolveHistoricalNiftyLevel(d);
      if (level != null && level > 0) {
        if (isMaturityish) maturityOk += 1;
        else obsOk += 1;
        // Bluff detector: custom level equal to Nifty (within 0.5) while entry is stock-scale
        if (nifty != null && entry > 0 && entry < 5000 && Math.abs(level - nifty) < 0.5) {
          niftyBluff += 1;
          samples.push(`BLUFF? ${p.isin} ${p.underlying} @ ${formatDeskDate(d)} level=${level} nifty=${nifty}`);
        }
      }
    }

    const fo = getProductFinalObservationDate(p);
    if (fo) {
      const level = resolveHistoricalIndexLevel(p, fo);
      if (level != null && level > 0 && p.formulaText?.trim()) {
        const v = computeValuation(p, {
          valuationDate: formatDeskDate(fo),
          currentLevel: level,
          debentures: 100,
        });
        if (Number.isFinite(v.productValue) && v.productValue > 0) valued += 1;
        const z = entry > 0 ? level / entry - 1 : NaN;
        if (samples.length < 8) {
          samples.push(
            `${p.isin} · ${spec.label} entry=${entry} @lastObs=${level} Z=${(z * 100).toFixed(1)}% source=${spec.estimate ? "estimate" : "yahoo"} abs=${(v.absReturn * 100).toFixed(1)}%`,
          );
        }
      }
    }
  }

  console.log(`Mapped specs: ${mapped}/${custom.length}`);
  console.log(`Obs/maturity levels resolved: obs ${obsOk}/${obsTotal} · maturity-ish ${maturityOk}/${maturityTotal}`);
  console.log(`Valued at last obs: ${valued}`);
  console.log(`Nifty-bluff suspects: ${niftyBluff}`);
  console.log("\nSamples:");
  for (const s of samples) console.log(`  ${s}`);

  // Kind sanity: no custom product should resolve as nifty kind
  const wrongKind = custom.filter((p) => getUnderlyingKind(p) !== "custom");
  if (wrongKind.length) {
    console.error(`FAIL: ${wrongKind.length} products mis-classified`);
    process.exit(1);
  }
  if (mapped < custom.length) {
    console.error("FAIL: unmapped custom underlyings");
    process.exit(1);
  }
  if (obsOk < obsTotal || maturityOk < maturityTotal) {
    console.error("FAIL: missing closes for some obs/maturity dates");
    process.exit(1);
  }
  if (niftyBluff > 0) {
    console.error("FAIL: custom levels look like Nifty bluff");
    process.exit(1);
  }

  console.log("\n=== PASS ===");
}

main();
