import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { CompactMasterSheetPayload } from "@/lib/master-sheet-table";
import type { MasterSheetTab } from "@/lib/master-sheet-table";

export type MasterSheetGridsSeed = {
  workbookName: string;
  loadedAt: string;
  sheets: {
    primary: CompactMasterSheetPayload | null;
    rollover: CompactMasterSheetPayload | null;
    newPrimary: CompactMasterSheetPayload | null;
  };
};

let cachedGrids: MasterSheetGridsSeed | null | undefined;

const GRIDS_PATH = join(process.cwd(), "lib", "data", "master-sheet-grids.json");

export function isMasterSheetGridsSeedAvailable() {
  try {
    readFileSync(GRIDS_PATH, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Baked Primary/Rollover/NEW PRIMARY explorer grids shipped with the app. */
export function loadMasterSheetGridsSeed(): MasterSheetGridsSeed | null {
  if (cachedGrids !== undefined) return cachedGrids;

  try {
    const raw = readFileSync(GRIDS_PATH, "utf8");
    const parsed = JSON.parse(raw) as MasterSheetGridsSeed;
    cachedGrids = {
      ...parsed,
      sheets: {
        primary: parsed.sheets.primary ?? null,
        rollover: parsed.sheets.rollover ?? null,
        newPrimary: parsed.sheets.newPrimary ?? null,
      },
    };
    return cachedGrids;
  } catch {
    cachedGrids = null;
    return null;
  }
}

export function pickSeedSheetTab(
  seed: MasterSheetGridsSeed,
  tab: MasterSheetTab,
): CompactMasterSheetPayload | null {
  if (tab === "Rollover") return seed.sheets.rollover;
  if (tab === "NEW PRIMARY") return seed.sheets.newPrimary;
  return seed.sheets.primary;
}
