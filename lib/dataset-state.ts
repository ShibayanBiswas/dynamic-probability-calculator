import type { DashboardDataset } from "@/lib/types";

/** Placeholder workbook shown before a master file is loaded or bootstrapped. */
export const PLACEHOLDER_WORKBOOK = "Awaiting Master Upload" as const;

const LEGACY_DEMO_ISINS = new Set(["INE000000001", "INE000000002"]);

export function isPlaceholderDataset(dataset: DashboardDataset) {
  return dataset.workbookName === PLACEHOLDER_WORKBOOK || dataset.products.length === 0;
}

/** Pre-v4 client cache shipped a 2-product ₹5 Cr demo — never restore it. */
export function isLegacyDemoDataset(dataset: DashboardDataset) {
  if (dataset.workbookName === "Demo Dataset") return true;
  return (
    dataset.products.length > 0 &&
    dataset.products.length <= 2 &&
    dataset.products.every((p) => LEGACY_DEMO_ISINS.has(p.isin ?? ""))
  );
}
