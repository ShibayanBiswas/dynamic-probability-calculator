import type { CompactMasterSheetPayload, MasterSheetTab } from "@/lib/master-sheet-table";
import { compactWorkbookSheetRaw } from "@/lib/master-sheet-table";
import { COLLECTIONS, ensureMongoIndexes, getMongoDb, isMongoConfigured } from "@/lib/db/mongo";
import type { DashboardDataset, WorkbookSheetRecord } from "@/lib/types";

export type MasterSheetName = MasterSheetTab;

export type MongoMasterSheetDoc = CompactMasterSheetPayload & {
  sheetName: MasterSheetName;
  workbookName: string;
  updatedAt: Date;
};

const SHEET_CACHE_TTL_MS = 5 * 60 * 1000;
let sheetsCache: {
  payload: {
    workbookName: string;
    loadedAt: string;
    sheets: {
      primary: CompactMasterSheetPayload | null;
      rollover: CompactMasterSheetPayload | null;
      newPrimary: CompactMasterSheetPayload | null;
    };
  };
  expiresAt: number;
} | null = null;

export function invalidateMasterSheetsCache() {
  sheetsCache = null;
}

function docToPayload(doc: MongoMasterSheetDoc): CompactMasterSheetPayload {
  return {
    name: doc.name,
    headers: doc.headers,
    rowCount: doc.rowCount,
    columnCount: doc.columnCount,
    rows: doc.rows,
  };
}

export async function syncMasterSheetsToMongo(dataset: DashboardDataset): Promise<{
  synced: MasterSheetName[];
}> {
  if (!isMongoConfigured()) return { synced: [] };

  const db = await getMongoDb();
  if (!db) return { synced: [] };

  await ensureMongoIndexes();
  const col = db.collection<MongoMasterSheetDoc>(COLLECTIONS.masterSheets);
  const now = new Date();
  const synced: MasterSheetName[] = [];

  for (const sheetName of ["Primary", "Rollover", "NEW PRIMARY"] as const) {
    const sheet = dataset.sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet) continue;

    const compact = compactWorkbookSheetRaw(sheet);
    await col.updateOne(
      { sheetName },
      {
        $set: {
          ...compact,
          sheetName,
          workbookName: dataset.workbookName,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    synced.push(sheetName);
  }

  if (synced.length > 0) {
    invalidateMasterSheetsCache();
    console.info(`[master-sync] ${synced.join(" + ")} sheet grids stored in MongoDB`);
  }

  return { synced };
}

export async function loadMasterSheetTabFromMongo(
  sheetName: MasterSheetName,
): Promise<{ payload: CompactMasterSheetPayload; workbookName: string; loadedAt: string } | null> {
  if (!isMongoConfigured()) return null;

  try {
    const db = await getMongoDb();
    if (!db) return null;

    const doc = await db
      .collection<MongoMasterSheetDoc>(COLLECTIONS.masterSheets)
      .findOne({ sheetName });

    if (!doc) return null;

    return {
      payload: docToPayload(doc),
      workbookName: doc.workbookName,
      loadedAt: doc.updatedAt.toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mongo sheet load failed";
    console.warn(`[master-sheets] ${sheetName}: ${message}`);
    return null;
  }
}

export async function loadMasterSheetsFromMongo(): Promise<{
  workbookName: string;
  loadedAt: string;
  sheets: {
    primary: CompactMasterSheetPayload | null;
    rollover: CompactMasterSheetPayload | null;
    newPrimary: CompactMasterSheetPayload | null;
  };
} | null> {
  if (!isMongoConfigured()) return null;

  if (sheetsCache && sheetsCache.expiresAt > Date.now()) {
    return sheetsCache.payload;
  }

  try {
    const db = await getMongoDb();
    if (!db) return null;

    const docs = await db
      .collection<MongoMasterSheetDoc>(COLLECTIONS.masterSheets)
      .find({ sheetName: { $in: ["Primary", "Rollover", "NEW PRIMARY"] } })
      .toArray();

    if (docs.length === 0) return null;

    const primaryDoc = docs.find((doc) => doc.sheetName === "Primary");
    const rolloverDoc = docs.find((doc) => doc.sheetName === "Rollover");
    const newPrimaryDoc = docs.find((doc) => doc.sheetName === "NEW PRIMARY");
    if (!primaryDoc && !rolloverDoc && !newPrimaryDoc) return null;

    const workbookName = primaryDoc?.workbookName ?? rolloverDoc?.workbookName ?? "MongoDB · New Product Master";
    const latest = docs.reduce(
      (max, doc) => (doc.updatedAt > max ? doc.updatedAt : max),
      docs[0]!.updatedAt,
    );

    const payload = {
      workbookName,
      loadedAt: latest.toISOString(),
      sheets: {
        primary: primaryDoc ? docToPayload(primaryDoc) : null,
        rollover: rolloverDoc ? docToPayload(rolloverDoc) : null,
        newPrimary: newPrimaryDoc ? docToPayload(newPrimaryDoc) : null,
      },
    };

    sheetsCache = { payload, expiresAt: Date.now() + SHEET_CACHE_TTL_MS };
    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mongo sheet load failed";
    console.warn(`[master-sheets] ${message}`);
    return null;
  }
}

/** Build compact payloads from an in-memory workbook when pushing to Mongo. */
export function compactSheetsFromDataset(dataset: DashboardDataset): {
  primary: CompactMasterSheetPayload | null;
  rollover: CompactMasterSheetPayload | null;
  newPrimary: CompactMasterSheetPayload | null;
} {
  const pick = (sheet?: WorkbookSheetRecord) => (sheet ? compactWorkbookSheetRaw(sheet) : null);

  return {
    primary: pick(dataset.sheets.find((sheet) => sheet.name === "Primary")),
    rollover: pick(dataset.sheets.find((sheet) => sheet.name === "Rollover")),
    newPrimary: pick(dataset.sheets.find((sheet) => sheet.name === "NEW PRIMARY")),
  };
}
