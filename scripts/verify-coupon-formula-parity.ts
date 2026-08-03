/**
 * Full-book: Coupon Formed (S) must match payoff formula at Working!O whenever
 * the formula evaluates. Also audits CC1 coupon parsing.
 *
 * Usage: npm run verify:coupon-formula
 */
import { loadSeedProducts } from "./lib/load-canonical-dataset";
import {
  filterProductsByLifecycle,
  filterValidMasterProducts,
} from "../lib/product-lifecycle";
import { computeValuation } from "../lib/workbook/valuation-engine";
import {
  computeUnderlyingPerformance,
  resolveValuationExpectedLevel,
  resolveWorkingObservationDate,
} from "../lib/workbook/valuation-performance";
import { tryEvaluatePayoffFormula } from "../lib/workbook/formula-engine";
import {
  getCouponPercent,
  getDebenturePrice,
  getIndexEntryLevel,
  inferDebentureCount,
  isSensexLinked,
  parseCouponString,
  rawField,
} from "../lib/product-utils";
import {
  getProductFinalObservationDate,
  getRolloverPhaseKind,
  getWorkingAllotmentDate,
} from "../lib/product-dates";
import { formatDeskDate } from "../lib/market-data";
import { parseExcelishDate } from "../lib/workbook/dates";
import { resolveHistoricalIndexLevel } from "../lib/expired-mark";

function main() {
  const asOf = new Date();
  const valDesk = formatDeskDate(asOf);
  const valid = filterValidMasterProducts(loadSeedProducts(), asOf).filter((p) =>
    p.formulaText?.trim(),
  );
  const fails: string[] = [];

  let cc1Checked = 0;
  let cc1Ok = 0;
  for (const p of valid) {
    const raw = rawField(p, "Coupon (%)") ?? "";
    if (!/CC\s*1/i.test(raw)) continue;
    cc1Checked += 1;
    const got = getCouponPercent(p);
    const expect = parseCouponString(raw);
    if (got == null || expect == null || Math.abs(got - expect) > 1e-9 || got < 0.05) {
      fails.push(`cc1-parse ${p.isin}: got=${got} expect=${expect} raw=${raw}`);
    } else {
      cc1Ok += 1;
    }
  }

  let liveChecked = 0;
  let liveOk = 0;
  const ongoing = filterProductsByLifecycle(valid, "ongoing", asOf);
  for (const p of ongoing) {
    const entry = getIndexEntryLevel(p);
    if (!(entry > 0)) continue;
    const level = entry * 1.1;
    const valDate = parseExcelishDate(valDesk);
    if (!valDate) continue;
    const allotment = getWorkingAllotmentDate(p, valDate);
    const obs = resolveWorkingObservationDate(p, valDate);
    if (!allotment || !obs) continue;

    const sensex = isSensexLinked(p);
    const expected = resolveValuationExpectedLevel(
      p,
      entry,
      level,
      allotment,
      valDate,
      sensex,
    );
    const perf = computeUnderlyingPerformance(entry, level, expected);
    const evaluated = tryEvaluatePayoffFormula(p.formulaText!.trim(), perf);
    if (!evaluated.ok) continue;

    liveChecked += 1;
    const v = computeValuation(p, {
      valuationDate: valDesk,
      currentLevel: level,
      debentures: inferDebentureCount(p),
      purchasePrice: getDebenturePrice(p),
    });

    if (
      !Number.isFinite(v.productValue) ||
      !Number.isFinite(v.absReturn) ||
      !Number.isFinite(v.productIrr) ||
      !Number.isFinite(v.formulaReturn)
    ) {
      fails.push(`nonfinite-live ${p.isin} ${getRolloverPhaseKind(p)}`);
      continue;
    }

    if (Math.abs(v.formulaReturn - evaluated.value) > 1e-9) {
      if (fails.length < 40) {
        fails.push(
          `S!=formula live ${p.isin}: S=${(v.formulaReturn * 100).toFixed(4)}% formula=${(evaluated.value * 100).toFixed(4)}%`,
        );
      }
    } else {
      liveOk += 1;
    }
  }

  let expiredChecked = 0;
  let expiredOk = 0;
  const expired = filterProductsByLifecycle(valid, "expired", asOf);
  for (const p of expired) {
    const lastObs = getProductFinalObservationDate(p);
    if (!lastObs) continue;
    const level = resolveHistoricalIndexLevel(p, lastObs);
    if (level == null || !(level > 0)) continue;
    const entry = getIndexEntryLevel(p);
    if (!(entry > 0)) continue;

    const desk = formatDeskDate(lastObs);
    const valDate = parseExcelishDate(desk);
    if (!valDate) continue;
    const allotment = getWorkingAllotmentDate(p, valDate);
    const obs = resolveWorkingObservationDate(p, valDate);
    if (!allotment || !obs) continue;

    const sensex = isSensexLinked(p);
    const expected = resolveValuationExpectedLevel(
      p,
      entry,
      level,
      allotment,
      valDate,
      sensex,
    );
    const perf = computeUnderlyingPerformance(entry, level, expected);
    const evaluated = tryEvaluatePayoffFormula(p.formulaText!.trim(), perf);
    if (!evaluated.ok) continue;

    expiredChecked += 1;
    const v = computeValuation(p, {
      valuationDate: desk,
      currentLevel: level,
      debentures: inferDebentureCount(p),
      purchasePrice: getDebenturePrice(p),
    });

    if (Math.abs(v.formulaReturn - evaluated.value) > 1e-9) {
      if (fails.length < 40) {
        fails.push(
          `S!=formula expired ${p.isin}: S=${(v.formulaReturn * 100).toFixed(4)}% formula=${(evaluated.value * 100).toFixed(4)}%`,
        );
      }
    } else {
      expiredOk += 1;
    }
  }

  // Spot: Range Bound Magnifier — Coupon Formed matches obs-average projected path
  const magnifier = valid.find((p) => p.isin === "INE093JA7ZR4");
  if (magnifier) {
    const nifty = 24_187.85;
    const valDate = parseExcelishDate("15-07-2026") ?? asOf;
    const allotment = getWorkingAllotmentDate(magnifier, valDate) ?? valDate;
    const entry = getIndexEntryLevel(magnifier);
    const expected = resolveValuationExpectedLevel(
      magnifier,
      entry,
      nifty,
      allotment,
      valDate,
      isSensexLinked(magnifier),
    );
    const pathZ = computeUnderlyingPerformance(entry, nifty, expected);
    const v = computeValuation(magnifier, {
      valuationDate: "15-07-2026",
      currentLevel: nifty,
      debentures: 480,
      purchasePrice: getDebenturePrice(magnifier),
    });
    const pathPayoff = tryEvaluatePayoffFormula(magnifier.formulaText!.trim(), pathZ);
    if (!pathPayoff.ok || Math.abs(v.formulaReturn - pathPayoff.value) > 1e-9) {
      fails.push(
        `magnifier KPI vs path formula: S=${v.formulaReturn} payoff=${pathPayoff.ok ? pathPayoff.value : pathPayoff}`,
      );
    }
  }

  console.log("=== Coupon Formed ↔ formula parity ===");
  console.log(`CC1 parse: ${cc1Ok}/${cc1Checked}`);
  console.log(`Live ongoing S=formula: ${liveOk}/${liveChecked}`);
  console.log(`Expired @ last obs S=formula: ${expiredOk}/${expiredChecked}`);

  if (fails.length) {
    console.error("\n=== FAIL ===");
    for (const f of fails.slice(0, 50)) console.error(" -", f);
    if (fails.length > 50) console.error(` … +${fails.length - 50} more`);
    process.exit(1);
  }
  console.log("\n=== PASS ===");
}

main();
