/**
 * Guard: payoff XIRR tenure + lifecycle schedule ends unchanged by valuation Logic-sheet work.
 */
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";
import {
  getPhasePayoffTenorDays,
  getPhaseScheduleEndDate,
  getWorkingAllotmentDate,
  getRolloverPhaseKind,
  formatProductRolloverPhaseLabel,
} from "../lib/product-dates";
import { resolvePayoffScenarioTenorDays, buildPayoffScenarioTable, payoffInputsFromDesk } from "../lib/workbook/payoff-scenarios";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { differenceInCalendarDays } from "date-fns";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const asOf = new Date();
const all = filterValidMasterProducts(loadCanonicalProducts(), asOf);
const byKind = { blank: 0, phase1: 0, phase2: 0, tenYear: 0 };
let tenorOk = 0;
let scenarioOk = 0;
let lifecycleOk = 0;

for (const p of all) {
  const kind = getRolloverPhaseKind(p);
  byKind[kind]++;
  const start = getWorkingAllotmentDate(p, asOf);
  const end = getPhaseScheduleEndDate(p);
  const phaseTenor = getPhasePayoffTenorDays(p);
  const payoffTenor = resolvePayoffScenarioTenorDays(p, { asOf, expired: false });
  if (start && end) {
    const expect = differenceInCalendarDays(end, start);
    if (expect >= 30) {
      assert(phaseTenor != null && Math.abs(phaseTenor - expect) <= 2, `phase tenor ${p.isin}`);
      assert(Math.abs(payoffTenor - expect) <= 2, `payoff tenor ${p.isin}`);
      tenorOk++;
    } else tenorOk++;
  } else tenorOk++;

  if (p.formulaText?.trim()) {
    const rows = buildPayoffScenarioTable(p, payoffInputsFromDesk(p, { asOf, expired: false, debentures: 1 }));
    assert(rows.length === 18, `scenario rows ${p.isin}`);
    assert(rows.every((r) => Number.isFinite(r.irr) && Number.isFinite(r.maturityValue)), `scenario finite ${p.isin}`);
    scenarioOk++;
  }
}

const ongoing = filterProductsByLifecycle(all, "ongoing", asOf);
const expired = filterProductsByLifecycle(all, "expired", asOf);
lifecycleOk = ongoing.length + expired.length;
// Probability desk never surfaces phase-expired names — filter always returns [].
assert(ongoing.length > 0, "ongoing lifecycle bucket empty");
assert(expired.length === 0, "expired filter must stay empty on this desk");

// Sample labels
const samples = (["blank", "phase1", "phase2", "tenYear"] as const).map((k) => {
  const p = all.find((x) => getRolloverPhaseKind(x) === k && x.formulaText?.trim());
  if (!p) return { k, missing: true };
  return {
    k,
    name: p.name.slice(0, 40),
    label: formatProductRolloverPhaseLabel(p) ?? "(blank)",
    start: getWorkingAllotmentDate(p)?.toISOString().slice(0, 10),
    end: getPhaseScheduleEndDate(p)?.toISOString().slice(0, 10),
    tenor: getPhasePayoffTenorDays(p),
    payoffTenor: resolvePayoffScenarioTenorDays(p, { asOf }),
  };
});

console.log("=== Payoff + lifecycle conservation ===");
console.log({ byKind, tenorOk, scenarioOk, ongoing: ongoing.length, expired: expired.length });
for (const s of samples) console.log(s);
console.log("=== PASS ===");
