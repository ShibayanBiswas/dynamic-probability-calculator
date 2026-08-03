/**
 * Verify Accelerator 703: observation table includes future blank slot,
 * valuation locks on avg of passed fixings → ~₹1.47L / ~3.7% IRR.
 */
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";
import { buildObservationLevelsSnapshot } from "../lib/workbook/observation-levels-snapshot";
import { buildObservationExportTable } from "../lib/workbook/build-screen-export-payload";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { resolveValuationExpectedLevel } from "../lib/workbook/valuation-performance";
import { getProductObservationDates, getWorkingAllotmentDate } from "../lib/product-dates";
import { formatDisplayDate } from "../lib/workbook/dates";
import { formatDeskDate } from "../lib/market-data";
import { getIndexEntryLevel, rawField } from "../lib/product-utils";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const p = loadCanonicalProducts().find((x) => x.isin === "INE093JA79Q0");
if (!p) throw new Error("703 missing");

const today = new Date();
const nifty = lookupBundledNiftyOnOrBefore(today)!;
const entry = getIndexEntryLevel(p);
const allot = getWorkingAllotmentDate(p, today)!;
const obs = getProductObservationDates(p);

console.log("master", {
  avg3: rawField(p, "Avg. 3"),
  avg4: rawField(p, "Avg. 4"),
  avg5: rawField(p, "Avg. 5"),
  last: rawField(p, "Last Observation Date"),
  obs: obs.map(formatDisplayDate),
});

assert(obs.length === 3, `expected 3 obs, got ${obs.length}`);
assert(rawField(p, "Avg. 5")?.includes("Sep") || rawField(p, "Avg. 5") === "29-Sep-26", "avg5 missing");

const snap = buildObservationLevelsSnapshot(p, today);
assert(snap.length === 3, "snapshot rows");
assert(snap[0]!.level != null && snap[1]!.level != null, "first two levels filled");
assert(snap[2]!.isFuture === true, "third is future");
assert(snap[2]!.level == null, "third level blank");
assert(snap[2]!.performance == null, "third perf blank");

const exportRows = buildObservationExportTable(p, today);
assert(exportRows[2]![2] === "Yet to come", `export level col: ${exportRows[2]![2]}`);
assert(exportRows[2]![3] === "—", `export perf col: ${exportRows[2]![3]}`);

const expected = resolveValuationExpectedLevel(p, entry, nifty, allot, today, false);
assert(typeof expected === "number", "expected numeric");
const avg = (snap[0]!.level! + snap[1]!.level!) / 2;
assert(Math.abs((expected as number) - avg) < 0.01, `lock avg expected ${avg} got ${expected}`);

const r = computeValuation(p, { valuationDate: formatDeskDate(today), currentLevel: nifty });
assert(r.productValue >= 140000 && r.productValue <= 155000, `V ${r.productValue}`);
assert(r.productIrr > 0.03 && r.productIrr < 0.05, `T ${r.productIrr}`);
assert(r.formulaReturn > 0.15 && r.formulaReturn < 0.3, `S ${r.formulaReturn}`);

console.log("table", snap.map((row) => ({
  d: formatDisplayDate(row.date),
  future: row.isFuture,
  level: row.level,
  exportLevel: exportRows[snap.indexOf(row)]![2],
})));
console.log("valuation", { V: r.productValue, S: r.formulaReturn, T: r.productIrr, Z: r.z, expected });
console.log("PASS 703 observation blank + lock valuation");
