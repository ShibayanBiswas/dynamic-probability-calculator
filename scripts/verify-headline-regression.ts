/**
 * Guards headline KPI regressions (Live Notional, book size, Protected Call series).
 * Usage: npm run verify:headline
 */
import { isSparseMasterAnnotationRow } from "../lib/master-book-filter";
import {
  assertCanonicalHeadline,
  EXPECTED_CANONICAL,
  loadSeedProducts,
  warnIfWorkbookDriftsFromSeed,
} from "./lib/load-canonical-dataset";

function main() {
  warnIfWorkbookDriftsFromSeed();

  const { products, index, notionalCr } = assertCanonicalHeadline();

  const protectedCall = products.find((p) => p.isin === EXPECTED_CANONICAL.protectedCallIsin)!;
  if (isSparseMasterAnnotationRow(protectedCall)) {
    throw new Error("Protected Call - 1 must not be classified as a sparse annotation row");
  }

  console.log("verify-headline: PASS");
  console.log(`  valid products: ${products.length}`);
  console.log(`  live notional:  ₹${notionalCr.toFixed(2)} Cr`);
  console.log(`  ongoing:        ${index.headline.ongoingCount}`);
  console.log(`  expired:        ${index.headline.expiredCount}`);
  console.log(`  obs-due 3M:     ${index.headline.obsDue3m}`);
  console.log(`  seed rows:      ${loadSeedProducts().length}`);
}

main();
