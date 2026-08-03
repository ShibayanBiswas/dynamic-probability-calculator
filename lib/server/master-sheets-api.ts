import {
  compactWorkbookSheetRaw,
  type CompactMasterSheetPayload,
  type MasterSheetTab,
  type MasterSheetsApiPayload,
} from "@/lib/master-sheet-table";
import { loadMasterSheetTabFromMongo, loadMasterSheetsFromMongo } from "@/lib/db/sync-master-sheets";
import { isMongoConfigured } from "@/lib/db/mongo";
import {
  loadMasterSheetGridsSeed,
  pickSeedSheetTab,
} from "@/lib/server/master-sheet-grids-seed";
import {
  isMasterFileOnDisk,
  loadMasterDatasetFromDiskAsync,
  MASTER_FILE_NAME,
} from "@/lib/server/master-file";

export type { MasterSheetsApiPayload } from "@/lib/master-sheet-table";

type SheetSource = "mongodb" | "disk" | "seed";

function sheetFromDisk(
  dataset: Awaited<ReturnType<typeof loadMasterDatasetFromDiskAsync>>,
  tab: MasterSheetTab,
): CompactMasterSheetPayload | null {
  const sheet = dataset?.sheets.find((candidate) => candidate.name === tab);
  return sheet ? compactWorkbookSheetRaw(sheet) : null;
}

async function loadSheetFromDisk(tab: MasterSheetTab): Promise<{
  sheet: CompactMasterSheetPayload | null;
  workbookName: string;
  loadedAt: string;
} | null> {
  if (!isMasterFileOnDisk()) return null;

  const dataset = await loadMasterDatasetFromDiskAsync();
  if (!dataset) return null;

  return {
    sheet: sheetFromDisk(dataset, tab),
    workbookName: dataset.workbookName,
    loadedAt: dataset.loadedAt,
  };
}

function loadSheetFromSeed(tab: MasterSheetTab): {
  sheet: CompactMasterSheetPayload | null;
  workbookName: string;
  loadedAt: string;
} | null {
  const seed = loadMasterSheetGridsSeed();
  if (!seed) return null;

  return {
    sheet: pickSeedSheetTab(seed, tab),
    workbookName: seed.workbookName,
    loadedAt: seed.loadedAt,
  };
}

async function loadSheetTab(tab: MasterSheetTab): Promise<{
  sheet: CompactMasterSheetPayload | null;
  source: SheetSource;
  workbookName: string;
  loadedAt: string;
} | null> {
  const disk = await loadSheetFromDisk(tab);
  if (disk?.sheet) {
    return { ...disk, source: "disk" };
  }

  const mongo = await loadMasterSheetTabFromMongo(tab);
  if (mongo?.payload) {
    return {
      sheet: mongo.payload,
      source: "mongodb",
      workbookName: mongo.workbookName,
      loadedAt: mongo.loadedAt,
    };
  }

  const seed = loadSheetFromSeed(tab);
  if (seed?.sheet) {
    return { ...seed, source: "seed" };
  }

  return null;
}

function failureReason(): MasterSheetsApiPayload["reason"] {
  if (isMasterFileOnDisk()) return "sheets_missing";
  if (isMongoConfigured()) return "mongodb_empty";
  if (loadMasterSheetGridsSeed()) return "sheets_missing";
  return "master_not_found";
}

function payloadKeyForTab(tab: MasterSheetTab): "primary" | "rollover" | "newPrimary" {
  if (tab === "Rollover") return "rollover";
  if (tab === "NEW PRIMARY") return "newPrimary";
  return "primary";
}

export async function loadMasterSheetsPayload(filter?: MasterSheetTab): Promise<MasterSheetsApiPayload> {
  if (filter) {
    const loaded = await loadSheetTab(filter);
    if (!loaded?.sheet) {
      return { ok: false, reason: failureReason() };
    }

    const key = payloadKeyForTab(filter);
    return {
      ok: true,
      source: loaded.source,
      workbookName: loaded.workbookName,
      loadedAt: loaded.loadedAt,
      masterPath: loaded.source === "disk" ? MASTER_FILE_NAME : undefined,
      sheets: {
        primary: key === "primary" ? loaded.sheet : null,
        rollover: key === "rollover" ? loaded.sheet : null,
        newPrimary: key === "newPrimary" ? loaded.sheet : null,
      },
    };
  }

  const [diskDataset, mongo, seed] = await Promise.all([
    isMasterFileOnDisk() ? loadMasterDatasetFromDiskAsync() : Promise.resolve(null),
    loadMasterSheetsFromMongo(),
    Promise.resolve(loadMasterSheetGridsSeed()),
  ]);

  if (diskDataset) {
    const primarySheet = sheetFromDisk(diskDataset, "Primary");
    const rolloverSheet = sheetFromDisk(diskDataset, "Rollover");
    const newPrimarySheet = sheetFromDisk(diskDataset, "NEW PRIMARY");
    if (primarySheet || rolloverSheet || newPrimarySheet) {
      return {
        ok: true,
        source: "disk",
        workbookName: diskDataset.workbookName,
        loadedAt: diskDataset.loadedAt,
        masterPath: MASTER_FILE_NAME,
        sheets: {
          primary: primarySheet,
          rollover: rolloverSheet,
          newPrimary: newPrimarySheet,
        },
      };
    }
  }

  if (mongo && (mongo.sheets.primary || mongo.sheets.rollover || mongo.sheets.newPrimary)) {
    return {
      ok: true,
      source: "mongodb",
      workbookName: mongo.workbookName,
      loadedAt: mongo.loadedAt,
      sheets: mongo.sheets,
    };
  }

  if (seed && (seed.sheets.primary || seed.sheets.rollover || seed.sheets.newPrimary)) {
    return {
      ok: true,
      source: "seed",
      workbookName: seed.workbookName,
      loadedAt: seed.loadedAt,
      sheets: seed.sheets,
    };
  }

  if (!isMasterFileOnDisk() && !seed) {
    return {
      ok: false,
      reason: isMongoConfigured() ? "mongodb_empty" : "master_not_found",
    };
  }

  if (diskDataset && !diskDataset.sheets.length) {
    return { ok: false, reason: "master_parse_failed" };
  }

  return { ok: false, reason: "sheets_missing" };
}
