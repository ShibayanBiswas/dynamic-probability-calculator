import { DESK_PRODUCT_SOURCE_SHEET } from "@/lib/master-source";
import { resolveSourceHeadersFromDisplay } from "@/lib/master/new-primary-export";
import {
  mergePrimaryAndRolloverSheets,
  type MasterMergeReport,
} from "@/lib/master/new-primary-merge";
import type { WorkbookSheetRecord } from "@/lib/types";

export type DeskGridSource = "primary-rollover-merge" | "new-primary-tab";

/** How the desk product grid was resolved — always equivalent to NEW PRIMARY. */
export type DeskProductGrid = {
  headers: string[];
  gridRows: unknown[][];
  source: DeskGridSource;
  mergeReport?: MasterMergeReport;
  /** Row count on the NEW PRIMARY tab when present (for drift warnings). */
  tabRowCount?: number;
};

/**
 * Resolve the desk book grid for all valuation / lifecycle / analytics paths.
 * Prefers a live Primary + Rollover merge (same as `npm run bake`) over a possibly stale NEW PRIMARY tab.
 */
export function resolveDeskProductGrid(sheets: WorkbookSheetRecord[]): DeskProductGrid | null {
  const primarySheet = sheets.find((sheet) => sheet.name === "Primary");
  const rolloverSheet = sheets.find((sheet) => sheet.name === "Rollover");
  const newPrimarySheet = sheets.find((sheet) => sheet.name === DESK_PRODUCT_SOURCE_SHEET);

  if (primarySheet && rolloverSheet) {
    const { headers, rows, report } = mergePrimaryAndRolloverSheets(primarySheet, rolloverSheet);
    return {
      headers: resolveSourceHeadersFromDisplay(headers),
      gridRows: rows,
      source: "primary-rollover-merge",
      mergeReport: report,
      tabRowCount: newPrimarySheet?.rows.length,
    };
  }

  if (newPrimarySheet) {
    return {
      headers: resolveSourceHeadersFromDisplay(newPrimarySheet.headers),
      gridRows: newPrimarySheet.rows.map((row) => row.values.map((cell) => cell.value)),
      source: "new-primary-tab",
      tabRowCount: newPrimarySheet.rows.length,
    };
  }

  return null;
}
