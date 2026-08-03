/**
 * Sync baked `lib/data/master-seed.json` + explorer grids → MongoDB Atlas (no local xlsx required).
 *
 * Usage: set MONGODB_URI in .env.local, then: npm run sync:seed
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { pingMongo, closeMongoClient } from "../lib/db/mongo";
import { syncMasterDatasetToMongo } from "../lib/db/sync-master";
import { loadMasterSheetGridsSeed } from "../lib/server/master-sheet-grids-seed";
import { loadSeedDataset } from "../lib/server/load-seed-dataset";
import type { DashboardDataset, WorkbookSheetRecord } from "../lib/types";
import type { CompactMasterSheetPayload } from "../lib/master-sheet-table";

function loadDotEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function compactToWorkbookSheet(payload: CompactMasterSheetPayload): WorkbookSheetRecord {
  return {
    name: payload.name,
    visibility: "visible",
    headers: payload.headers,
    rowCount: payload.rowCount,
    columnCount: payload.columnCount,
    formulas: [],
    rows: payload.rows.map((cells, rowIndex) => ({
      rowNumber: rowIndex + 1,
      values: cells.map((value, colIndex) => ({
        address: `${String.fromCharCode(65 + (colIndex % 26))}${rowIndex + 1}`,
        value: value as string | number | boolean | null,
        formatted: value == null ? "" : String(value),
      })),
    })),
  };
}

function mergeExplorerSheets(dataset: DashboardDataset): DashboardDataset {
  const grids = loadMasterSheetGridsSeed();
  if (!grids) return dataset;

  const sheets: WorkbookSheetRecord[] = [];
  if (grids.sheets.primary) sheets.push(compactToWorkbookSheet(grids.sheets.primary));
  if (grids.sheets.rollover) sheets.push(compactToWorkbookSheet(grids.sheets.rollover));
  if (grids.sheets.newPrimary) sheets.push(compactToWorkbookSheet(grids.sheets.newPrimary));

  return sheets.length > 0 ? { ...dataset, sheets } : dataset;
}

async function main() {
  loadDotEnvLocal();

  const ping = await pingMongo();
  if (!ping.ok) {
    console.error(`MongoDB unavailable: ${ping.reason}`);
    process.exit(1);
  }

  const dataset = mergeExplorerSheets(loadSeedDataset() as DashboardDataset);
  if (!dataset.products?.length) {
    console.error("Seed file is empty — run: npm run bake");
    process.exit(1);
  }

  const sheetTabs = dataset.sheets.map((sheet) => sheet.name).join(", ") || "none";
  console.log(`Syncing seed: ${dataset.products.length} products · explorer sheets: ${sheetTabs} → MongoDB`);
  const result = await syncMasterDatasetToMongo(dataset);
  if (!result.ok) {
    console.error(`Sync failed: ${result.reason}`);
    process.exit(1);
  }

  console.log(`OK: synced ${result.productCount} desk products + Primary/Rollover/NEW PRIMARY explorer grids to MongoDB`);
  await closeMongoClient();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await closeMongoClient();
  process.exit(1);
});
