import { CANONICAL_MANIFEST } from "@/lib/canonical-manifest";
import { DESK_PRODUCT_SOURCE_SHEET } from "@/lib/master-source";
import { sumSheetTradeNotional } from "@/lib/primary-book-notional";
import type { DashboardDataset } from "@/lib/types";

/** Live Notional headline — sum of Trade Amount on the NEW PRIMARY master tab. */
export function resolveNewPrimaryHeadlineNotional(
  dataset: Pick<DashboardDataset, "categorySummaries" | "sheets">,
): number | undefined {
  const fromSummary = dataset.categorySummaries.find((summary) => summary.category === "Primary")?.liveNotional;
  if (fromSummary != null && fromSummary > 0) return fromSummary;

  const sheet = dataset.sheets.find((candidate) => candidate.name === DESK_PRODUCT_SOURCE_SHEET);
  const fromSheet = sumSheetTradeNotional(sheet);
  if (fromSheet > 0) return fromSheet;

  if (CANONICAL_MANIFEST.liveNotionalCr > 0) {
    return CANONICAL_MANIFEST.liveNotionalCr * 1e7;
  }

  return undefined;
}
