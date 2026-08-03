/**
 * Verify observation-date derivation (Average 1 / Avg. 2–7 / Observation Months)
 * against the desk canonical book (NEW PRIMARY seed), for ongoing and expired products.
 * Usage: npx tsx scripts/verify-observation-dates.ts
 */
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";
import { getProductObservationDates } from "../lib/product-dates";
import { parseExcelishDate } from "../lib/workbook/dates";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";

const AS_OF = parseExcelishDate("31-May-26") ?? new Date(2026, 4, 31);

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

function main() {
  const valid = filterValidMasterProducts(loadCanonicalProducts(AS_OF), AS_OF);
  const ongoing = filterProductsByLifecycle(valid, "ongoing", AS_OF);
  const expired = filterProductsByLifecycle(valid, "expired", AS_OF);

  const bucketStats = (label: string, pool: typeof valid) => {
    let withObs = 0;
    let withoutObs = 0;
    for (const p of pool) {
      const dates = getProductObservationDates(p);
      if (dates.length > 0) withObs += 1;
      else withoutObs += 1;
    }
    console.log(`${label}: ${pool.length} products · ${withObs} with obs schedule · ${withoutObs} without`);
  };

  console.log("=== Observation schedule coverage ===");
  bucketStats("Ongoing ", ongoing);
  bucketStats("Expired ", expired);

  const target = valid.find((p) => p.isin === "INE093JA77T8");
  console.log("\n=== Sample: INE093JA77T8 (user example) ===");
  if (target) {
    console.log("Name:", target.name, "· Series:", target.series);
    console.log("Observation Months raw:", JSON.stringify(target.raw["Observation Months"] ?? null));
    ["Average 1", "Avg. 2", "Avg. 3", "Avg. 4", "Avg. 5", "Avg. 6", "Avg. 7"].forEach((k) =>
      console.log(`  ${k}:`, JSON.stringify(target.raw[k] ?? null)),
    );
    console.log("Derived dates:", getProductObservationDates(target).map(fmt).join(", "));
  } else {
    console.log("Product not found in valid master pool.");
  }

  console.log("\n=== First 5 ongoing samples ===");
  for (const p of ongoing.slice(0, 5)) {
    console.log(`${p.isin ?? "—"} · ${p.name?.slice(0, 40)}: ${getProductObservationDates(p).map(fmt).join(", ") || "(none)"}`);
  }
  console.log("\n=== First 5 expired samples ===");
  for (const p of expired.slice(0, 5)) {
    console.log(`${p.isin ?? "—"} · ${p.name?.slice(0, 40)}: ${getProductObservationDates(p).map(fmt).join(", ") || "(none)"}`);
  }
}

main();
