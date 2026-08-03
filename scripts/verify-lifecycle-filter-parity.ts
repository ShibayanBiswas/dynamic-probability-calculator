/**
 * Ensures lifecycle tab filtering is consistent everywhere:
 * - Expiration tabs → phase schedule end (Blank/P2 Maturity · Phase 1 POED · 10Y Rollover C/P)
 * - Observation tabs (obs-due-1m / 2m / 3m) → upcoming Average 1 / Avg. 2–7 within horizon
 * - Picker pool === filter pool on every tab (Valuation, Payoff, Details, Home, Analytics)
 *
 * Usage: npx tsx scripts/verify-lifecycle-filter-parity.ts
 */
import { differenceInCalendarDays, startOfDay } from "date-fns";

import { buildLifecycleIndex } from "../lib/lifecycle-index";
import { getProductObservationDates } from "../lib/product-dates";
import {
  EXPIRATION_LIFECYCLE_FILTERS,
  filterProductsByLifecycle,
  getLifecyclePickerPool,
  getProductLifecycleStatus,
  isExpirationLifecycleFilter,
  isObservationDueFilter,
  LIFECYCLE_FILTERS,
  lifecycleStatusMatchesFilter,
  OBS_DUE_1M_DAYS,
  OBS_DUE_2M_DAYS,
  OBS_DUE_3M_DAYS,
  productHasObservationDueWithin,
} from "../lib/product-lifecycle";
import type { ProductRecord } from "../lib/types";
import { loadCanonicalProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

function rowIdSet(products: ProductRecord[]): Set<string> {
  return new Set(products.map((product) => product.rowId));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

const OBS_HORIZONS: Record<"obs-due-1m" | "obs-due-2m" | "obs-due-3m", number> = {
  "obs-due-1m": OBS_DUE_1M_DAYS,
  "obs-due-2m": OBS_DUE_2M_DAYS,
  "obs-due-3m": OBS_DUE_3M_DAYS,
};

const asOf = new Date();
warnIfWorkbookDriftsFromSeed(asOf);
const products = loadCanonicalProducts(asOf);
const index = buildLifecycleIndex(products, asOf);

console.log(`As of: ${asOf.toLocaleString("en-IN")}\n`);

let failed = false;

for (const filter of LIFECYCLE_FILTERS) {
  const filtered = filterProductsByLifecycle(products, filter, asOf);
  const picker = getLifecyclePickerPool(products, filter, asOf);
  const headlineCount = index.filterCounts[filter];

  const filterIds = rowIdSet(filtered);
  const pickerIds = rowIdSet(picker);

  const pickerParity = setsEqual(filterIds, pickerIds);
  const headlineParity = filtered.length === headlineCount;

  console.log(
    `${filter}: ${filtered.length} products · picker=${pickerParity ? "match" : "MISMATCH"} · headline=${headlineParity ? "match" : "MISMATCH"}`,
  );

  if (!pickerParity || !headlineParity) {
    failed = true;
  }

  if (isExpirationLifecycleFilter(filter)) {
    let statusMismatches = 0;
    for (const product of filtered) {
      const status = getProductLifecycleStatus(product, asOf);
      if (!lifecycleStatusMatchesFilter(status, filter)) {
        statusMismatches += 1;
        if (statusMismatches <= 3) {
          console.warn(`  expiration mismatch ${product.isin ?? product.name}: status=${status} filter=${filter}`);
        }
      }
    }
    if (statusMismatches > 0) {
      console.error(`  ${statusMismatches} product(s) fail expiration lifecycle filter`);
      failed = true;
    }
  }

  if (isObservationDueFilter(filter)) {
    const horizonDays = OBS_HORIZONS[filter];
    let obsMismatches = 0;
    for (const product of filtered) {
      if (!productHasObservationDueWithin(product, horizonDays, asOf)) {
        obsMismatches += 1;
      }
    }
    if (obsMismatches > 0) {
      console.error(`  ${obsMismatches} product(s) fail observation-due filter`);
      failed = true;
    }
  }
}

const ongoingOnly = filterProductsByLifecycle(products, "ongoing", asOf);
const expiredInOngoing = ongoingOnly.filter(
  (product) => getProductLifecycleStatus(product, asOf) === "expired",
);
const expiringInOngoing = ongoingOnly.filter((product) => {
  const status = getProductLifecycleStatus(product, asOf);
  return status === "expiring-1m" || status === "expiring-3m";
});
const expiring3m = filterProductsByLifecycle(products, "expiring-3m", asOf);
if (expiredInOngoing.length > 0) {
  console.error(`Ongoing tab includes ${expiredInOngoing.length} expired products`);
  failed = true;
}
if (expiringInOngoing.length !== expiring3m.length) {
  console.error(
    `Ongoing should include all expiring-3m (${expiring3m.length}); found ${expiringInOngoing.length}`,
  );
  failed = true;
} else {
  console.log(
    `\nOngoing live book: ${ongoingOnly.length} rows (includes ${expiringInOngoing.length} expiring within 3M; no expired)`,
  );
}

const obs3m = filterProductsByLifecycle(products, "obs-due-3m", asOf).length;
const obs2m = filterProductsByLifecycle(products, "obs-due-2m", asOf).length;
const obs1m = filterProductsByLifecycle(products, "obs-due-1m", asOf).length;
console.log(`Observation nesting: 1M(${obs1m}) ≤ 2M(${obs2m}) ≤ 3M(${obs3m})`);
if (obs1m > obs2m || obs2m > obs3m) {
  failed = true;
}

const deskDay = startOfDay(asOf);
const sampleObs = filterProductsByLifecycle(products, "obs-due-1m", asOf)[0];
if (sampleObs) {
  const upcoming = getProductObservationDates(sampleObs)
    .map((date) => differenceInCalendarDays(startOfDay(date), deskDay))
    .filter((days) => days >= 0 && days <= OBS_DUE_1M_DAYS);
  console.log(`Obs sample ${sampleObs.isin}: next obs in +${upcoming[0] ?? "?"}d`);
}

console.log(`\nExpiration filters audited: ${EXPIRATION_LIFECYCLE_FILTERS.join(", ")}`);

if (failed) {
  console.error("\nLifecycle filter parity FAILED.");
  process.exit(1);
}

console.log("\nLifecycle filter parity OK.");
