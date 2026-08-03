/**
 * Full-book: Product IRR (coupon over phase tenure) ↔ scenario XIRR parity.
 * Usage: npx tsx scripts/verify-irr-phase-tenure-parity.ts
 */
import { differenceInCalendarDays } from "date-fns";

import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { getExpiredMarkDeskDate } from "../lib/expired-mark";
import { formatDeskDate } from "../lib/market-data";
import {
  getPhasePayoffTenorDays,
  getPhaseScheduleEndDate,
  getRolloverPhaseKind,
  getWorkingAllotmentDate,
  type RolloverPhaseKind,
} from "../lib/product-dates";
import {
  filterProductsByLifecycle,
  filterValidMasterProducts,
  isValuationApplicableAt,
} from "../lib/product-lifecycle";
import { getIndexEntryLevel, inferDebentureCount, isSensexLinked, resolveLiveIndexLevel } from "../lib/product-utils";
import { parseExcelishDate } from "../lib/workbook/dates";
import { irrFromReturn } from "../lib/workbook/irr";
import {
  buildPayoffScenarioTable,
  payoffInputsFromDesk,
  resolvePayoffScenarioTenorDays,
} from "../lib/workbook/payoff-scenarios";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

const TOL = 1e-8;

function main() {
  const asOf = new Date();
  const deskToday = formatDeskDate(asOf);
  const nifty = lookupBundledNiftyOnOrBefore(asOf) ?? 25000;
  const sensex = lookupBundledSensexOnOrBefore(asOf) ?? 80000;

  const all = filterValidMasterProducts(loadSeedProducts(), asOf).filter((p) => p.formulaText?.trim());
  const ongoing = filterProductsByLifecycle(all, "ongoing", asOf).filter((p) =>
    isValuationApplicableAt(p, deskToday),
  );
  const expired = filterProductsByLifecycle(all, "expired", asOf);

  const fails: string[] = [];
  let tenureOk = 0;
  let irrMatchOk = 0;
  let checked = 0;
  const byKind: Record<RolloverPhaseKind, number> = {
    blank: 0,
    phase1: 0,
    phase2: 0,
    tenYear: 0,
  };

  const check = (p: (typeof all)[number], expiredFlag: boolean) => {
    const kind = getRolloverPhaseKind(p);
    byKind[kind] += 1;
    checked += 1;

    const start = getWorkingAllotmentDate(p, asOf);
    const end = getPhaseScheduleEndDate(p);
    const phaseTenor = getPhasePayoffTenorDays(p);
    const scenarioTenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: expiredFlag });

    if (start && end && phaseTenor != null) {
      const expect = differenceInCalendarDays(end, start);
      if (expect >= 30 && Math.abs(phaseTenor - expect) <= 1 && Math.abs(scenarioTenor - phaseTenor) <= 1) {
        tenureOk += 1;
      } else if (fails.length < 40) {
        fails.push(`tenor ${kind} ${p.isin}: phase=${phaseTenor} scenario=${scenarioTenor} expect=${expect}`);
      }
    } else {
      tenureOk += 1;
    }

    let valDate = deskToday;
    let level = resolveLiveIndexLevel(p, { niftyLevel: nifty, sensexLevel: sensex }) || getIndexEntryLevel(p);
    if (expiredFlag) {
      valDate = getExpiredMarkDeskDate(p) ?? deskToday;
      const d = parseExcelishDate(valDate);
      if (d) {
        level =
          (isSensexLinked(p) ? lookupBundledSensexOnOrBefore(d) : lookupBundledNiftyOnOrBefore(d)) ?? level;
      }
    }

    const v = computeValuation(p, {
      valuationDate: valDate,
      currentLevel: level,
      debentures: inferDebentureCount(p),
    });

    const tenor = phaseTenor ?? scenarioTenor;
    const expectedIrr = irrFromReturn(v.formulaReturn, tenor);
    if (Math.abs(v.productIrr - expectedIrr) > TOL) {
      if (fails.length < 50) {
        fails.push(
          `productIrr ${kind} ${p.isin}: got=${v.productIrr.toFixed(8)} expectT=${expectedIrr.toFixed(8)} S=${v.formulaReturn}`,
        );
      }
      return;
    }

    const recomputed = irrFromReturn(v.formulaReturn, scenarioTenor);
    if (Math.abs(recomputed - v.productIrr) > TOL) {
      if (fails.length < 50) {
        fails.push(
          `scenarioBasis ${kind} ${p.isin}: productIrr=${v.productIrr} recomputed=${recomputed} tenor=${scenarioTenor}`,
        );
      }
      return;
    }

    const rows = buildPayoffScenarioTable(
      p,
      payoffInputsFromDesk(p, {
        valuationDate: valDate,
        asOf,
        expired: expiredFlag,
        debentures: inferDebentureCount(p),
      }),
    );
    const matchRow = rows.find((r) => Math.abs(r.maturityValue - v.formulaReturn) < 1e-6);
    if (matchRow && Math.abs(matchRow.irr - v.productIrr) > TOL) {
      if (fails.length < 50) {
        fails.push(
          `rowXirr ${kind} ${p.isin}: productIrr=${v.productIrr} rowIrr=${matchRow.irr} PR=${matchRow.maturityValue}`,
        );
      }
      return;
    }

    irrMatchOk += 1;
  };

  for (const p of ongoing) check(p, false);
  for (const p of expired) check(p, true);

  console.log("=== Full-book Product IRR ↔ scenario XIRR ===");
  console.log({ checked, ongoing: ongoing.length, expired: expired.length, byKind });
  console.log(`Phase tenure SSOT: ${tenureOk}/${checked}`);
  console.log(`IRR match (coupon over phase tenure): ${irrMatchOk}/${checked}`);
  if (fails.length) {
    console.log(`FAILS (${fails.length}):`);
    for (const f of fails.slice(0, 30)) console.log(" -", f);
    process.exit(1);
  }
  console.log("=== PASS ===");
}

main();
