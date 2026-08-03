/**
 * Verify observation-due lifecycle tabs use calendar-day horizons on upcoming obs dates.
 * Usage: npx tsx scripts/verify-observation-due-filters.ts
 */
import { differenceInCalendarDays, startOfDay } from "date-fns";

import {
  filterProductsByLifecycle,
  OBS_DUE_1M_DAYS,
  OBS_DUE_2M_DAYS,
  OBS_DUE_3M_DAYS,
  productHasObservationDueWithin,
  type LifecycleFilter,
} from "../lib/product-lifecycle";
import { getProductObservationDates } from "../lib/product-dates";
import type { ProductRecord } from "../lib/types";
import {
  loadCanonicalProducts,
  warnIfWorkbookDriftsFromSeed,
} from "./lib/load-canonical-dataset";

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

const HORIZONS: Array<{ filter: LifecycleFilter; days: number }> = [
  { filter: "obs-due-1m", days: OBS_DUE_1M_DAYS },
  { filter: "obs-due-2m", days: OBS_DUE_2M_DAYS },
  { filter: "obs-due-3m", days: OBS_DUE_3M_DAYS },
];

function validatePool(pool: ProductRecord[], horizonDays: number, asOf: Date): number {
  const deskDay = startOfDay(asOf);
  let mismatches = 0;

  for (const product of pool) {
    const matches = productHasObservationDueWithin(product, horizonDays, asOf);
    const upcoming = getProductObservationDates(product).filter((date) => {
      const daysUntil = differenceInCalendarDays(startOfDay(date), deskDay);
      return daysUntil >= 0 && daysUntil <= horizonDays;
    });

    if (matches !== upcoming.length > 0) {
      mismatches += 1;
      console.warn(
        `  mismatch ${product.isin ?? product.name}: filter=${matches} manual=${upcoming.length > 0}`,
      );
    }
  }

  return mismatches;
}

const asOf = new Date();
warnIfWorkbookDriftsFromSeed(asOf);
const products = loadCanonicalProducts(asOf);

console.log(`As of: ${asOf.toLocaleString("en-IN")}\n`);

for (const { filter, days } of HORIZONS) {
  const pool = filterProductsByLifecycle(products, filter, asOf);
  const mismatches = validatePool(pool, days, asOf);
  console.log(`${filter}: ${pool.length} products · horizon ${days}d · mismatches ${mismatches}`);

  const sample = pool[0];
  if (sample) {
    const deskDay = startOfDay(asOf);
    const upcoming = getProductObservationDates(sample)
      .map((d) => ({ d, days: differenceInCalendarDays(startOfDay(d), deskDay) }))
      .filter((row) => row.days >= 0 && row.days <= days);
    console.log(
      `  sample ${sample.isin}: ${upcoming.map((row) => `${fmt(row.d)} (+${row.days}d)`).join(", ") || "(none)"}`,
    );
  }
}

const nested1m = filterProductsByLifecycle(products, "obs-due-1m", asOf).length;
const nested2m = filterProductsByLifecycle(products, "obs-due-2m", asOf).length;
const nested3m = filterProductsByLifecycle(products, "obs-due-3m", asOf).length;
console.log(`\nNested check: 1M(${nested1m}) ≤ 2M(${nested2m}) ≤ 3M(${nested3m})`);

if (nested1m > nested2m || nested2m > nested3m) {
  console.error("Horizon nesting violated");
  process.exit(1);
}

console.log("\nObservation-due filters OK.");
