import { withTimeout } from "@/lib/async-utils";
import { isPlausibleNewPrimaryDeskBook } from "@/lib/desk-book-validation";
import { isMongoConfigured } from "@/lib/db/mongo";
import { loadProductsFromMongo } from "@/lib/db/sync-master";
import { loadMasterDatasetFromDisk } from "@/lib/server/master-file";
import { loadSeedDataset } from "@/lib/server/load-seed-dataset";
import type { ProductRecord } from "@/lib/types";

const MONGO_RESOLVE_TIMEOUT_MS = 4_000;

/**
 * Server-side product book — same resolution order as bootstrap:
 * MongoDB (after upload sync) → `New Product Master_.xlsx` on disk → baked seed.
 */
export async function resolveMasterProducts(): Promise<ProductRecord[]> {
  if (isMongoConfigured()) {
    try {
      const mongo = await withTimeout(
        loadProductsFromMongo(),
        MONGO_RESOLVE_TIMEOUT_MS,
        "mongo resolve",
      );
      if (mongo?.length && isPlausibleNewPrimaryDeskBook(mongo)) return mongo;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mongo resolve failed";
      console.warn(`[resolve-master] ${message} — using local seed`);
    }
  }

  const disk = loadMasterDatasetFromDisk();
  if (disk?.products.length && isPlausibleNewPrimaryDeskBook(disk.products)) return disk.products;

  return loadSeedDataset().products ?? [];
}
