import { DESK_PRODUCT_SOURCE_SHEET } from "@/lib/master-source";
import { isLegacyDemoDataset } from "@/lib/dataset-state";
import { filterValidMasterProducts } from "@/lib/product-lifecycle";
import type { DashboardDataset, ProductRecord } from "@/lib/types";

/** Pre-NEW-PRIMARY books had ~4,491 valid rows from raw Primary alone. */
export const LEGACY_PRIMARY_ONLY_MIN_PRODUCTS = 4300;

const PROVENANCE_MARKERS = [
  DESK_PRODUCT_SOURCE_SHEET,
  "pickCanonicalRowsForDesk",
  "Primary + Rollover merge",
] as const;

export function datasetHasNewPrimaryProvenance(dataset: DashboardDataset): boolean {
  return dataset.validationIssues.some((issue) =>
    PROVENANCE_MARKERS.some((marker) => issue.message.includes(marker)),
  );
}

/** Blocking error when the dataset cannot drive desk calculations. */
export function deskBookBlockingError(dataset: DashboardDataset): string | null {
  const validationBlocker = dataset.validationIssues.find(
    (issue) => issue.severity === "error" && issue.category === "Primary",
  );
  if (validationBlocker) return validationBlocker.message;

  if (dataset.products.length === 0) {
    return `Desk book is empty — upload Primary + Rollover (merged to ${DESK_PRODUCT_SOURCE_SHEET}) or run npm run bake.`;
  }

  return null;
}

/** IndexedDB / Mongo payloads from before the NEW PRIMARY pipeline. */
export function isStalePrimaryOnlyDeskBook(dataset: DashboardDataset): boolean {
  if (isLegacyDemoDataset(dataset)) return true;
  if (dataset.products.length === 0) return false;
  if (dataset.products.length >= LEGACY_PRIMARY_ONLY_MIN_PRODUCTS) return true;
  return !datasetHasNewPrimaryProvenance(dataset);
}

/** Reject pre-NEW-PRIMARY Primary-only books; accept any plausible merged desk size. */
export function isPlausibleNewPrimaryDeskBook(products: ProductRecord[], asOf = new Date()): boolean {
  if (!products.length) return false;

  const valid = filterValidMasterProducts(products, asOf);
  if (valid.length >= LEGACY_PRIMARY_ONLY_MIN_PRODUCTS) return false;

  return valid.length >= 400;
}
