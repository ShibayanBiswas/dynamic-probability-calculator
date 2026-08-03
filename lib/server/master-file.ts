import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DashboardDataset } from "@/lib/types";
import { parseWorkbookBuffer } from "@/lib/workbook/parser";

export const MASTER_FILE_NAME = "New Product Master_.xlsx";

let cachedDiskDataset: DashboardDataset | null | undefined;
let diskDatasetPromise: Promise<DashboardDataset | null> | null = null;

export function getMasterFilePath() {
  return join(process.cwd(), MASTER_FILE_NAME);
}

export function isMasterFileOnDisk() {
  return existsSync(getMasterFilePath());
}

export function clearMasterDatasetDiskCache() {
  cachedDiskDataset = undefined;
  diskDatasetPromise = null;
}

function parseMasterDatasetFromDisk(): DashboardDataset | null {
  const path = getMasterFilePath();
  if (!existsSync(path)) return null;

  const file = readFileSync(path);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  return parseWorkbookBuffer(buffer, MASTER_FILE_NAME);
}

/** Master workbook on disk — desk products come from the NEW PRIMARY tab via {@link parseWorkbookBuffer}. */
export function loadMasterDatasetFromDisk(): DashboardDataset | null {
  if (cachedDiskDataset !== undefined) return cachedDiskDataset;
  cachedDiskDataset = parseMasterDatasetFromDisk();
  return cachedDiskDataset;
}

/** Async loader — dedupes concurrent parses during first Intel / bootstrap hit. */
export async function loadMasterDatasetFromDiskAsync(): Promise<DashboardDataset | null> {
  if (cachedDiskDataset !== undefined) return cachedDiskDataset;
  if (!diskDatasetPromise) {
    diskDatasetPromise = Promise.resolve().then(() => loadMasterDatasetFromDisk());
  }
  return diskDatasetPromise;
}

/** Pre-warm disk parse so Intel explorer does not time out on first request. */
export function warmMasterDatasetDiskCache(): void {
  if (cachedDiskDataset !== undefined || diskDatasetPromise) return;
  void loadMasterDatasetFromDiskAsync();
}
