import type { DashboardDataset, ProductRecord } from "@/lib/types";

import { sanitizeProductForMongo } from "@/lib/db/sanitize-for-mongo";
import { invalidateMasterSheetsCache, syncMasterSheetsToMongo } from "@/lib/db/sync-master-sheets";
import { COLLECTIONS, ensureMongoIndexes, getMongoDb, isMongoConfigured } from "@/lib/db/mongo";
import { filterValidMasterProducts } from "@/lib/product-lifecycle";

export type MongoProductDoc = ProductRecord & {
  workbookName: string;
  updatedAt: Date;
  formulaText: string;
  productExplanation: string;
  category: string;
};

/**
 * In-memory cache for the desk canonical book (NEW PRIMARY). A full Mongo scan of ~4,200
 * products (each with a large `raw` map) takes several seconds; both
 * `/api/master/load` and `/api/parse/bootstrap` read it, so we cache the result
 * per process and invalidate it whenever a new master file is synced.
 */
const PRODUCTS_CACHE_TTL_MS = 5 * 60 * 1000;
let productsCache: { products: ProductRecord[]; expiresAt: number } | null = null;

export function invalidateProductsCache() {
  productsCache = null;
  invalidateMasterSheetsCache();
}

export type MasterSyncResult =
  | { ok: true; productCount: number; skippedRows: number; purgedRows: number }
  | { ok: false; reason: "MONGODB_URI not set" | "db_unavailable" | "sync_failed"; error?: string };

export async function syncMasterDatasetToMongo(dataset: DashboardDataset): Promise<MasterSyncResult> {
  if (!isMongoConfigured()) return { ok: false, reason: "MONGODB_URI not set" };

  try {
    const db = await getMongoDb();
    if (!db) return { ok: false, reason: "db_unavailable" };

    await ensureMongoIndexes();

    const validProducts = filterValidMasterProducts(dataset.products);
    const skippedRows = Math.max(0, dataset.products.length - validProducts.length);
    const validRowIds = validProducts.map((product) => product.rowId);

    const now = new Date();
    const products = db.collection<MongoProductDoc>(COLLECTIONS.products);

    const ops = validProducts.map((product) => {
      const doc = sanitizeProductForMongo(product);
      return {
        updateOne: {
          filter: { rowId: doc.rowId },
          update: {
            $set: {
              ...doc,
              workbookName: dataset.workbookName,
              updatedAt: now,
              formulaText: doc.formulaText ?? "",
              productExplanation: String(
                doc.raw["Product Explanation"] ?? doc.raw["Product explanation"] ?? "",
              ),
            },
          },
          upsert: true,
        },
      };
    });

    if (ops.length > 0) {
      await products.bulkWrite(ops, { ordered: false });
    }

    const sheetSync = await syncMasterSheetsToMongo(dataset);

    const purge = await products.deleteMany({
      category: "Primary",
      rowId: { $nin: validRowIds },
    });

    await db.collection(COLLECTIONS.masterUploads).insertOne({
      workbookName: dataset.workbookName,
      productCount: validProducts.length,
      skippedRows,
      purgedRows: purge.deletedCount ?? 0,
      uploadedAt: now,
      formulaCount: dataset.formulaCatalog.length,
      sheetTabs: sheetSync.synced,
    });

    invalidateProductsCache();

    if (skippedRows > 0 || (purge.deletedCount ?? 0) > 0) {
      console.info(
        `[master-sync] ${validProducts.length} canonical products · skipped ${skippedRows} sparse rows · purged ${purge.deletedCount ?? 0} stale rows`,
      );
    }

    return {
      ok: true,
      productCount: validProducts.length,
      skippedRows,
      purgedRows: purge.deletedCount ?? 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mongo sync failed";
    console.warn(`[master-sync] ${message}`);
    return { ok: false, reason: "sync_failed", error: message };
  }
}

export async function loadProductsFromMongo(): Promise<ProductRecord[] | null> {
  if (!isMongoConfigured()) return null;

  if (productsCache && productsCache.expiresAt > Date.now()) {
    return productsCache.products;
  }

  try {
    const db = await getMongoDb();
    if (!db) return null;
    const docs = await db.collection<MongoProductDoc>(COLLECTIONS.products).find({}).toArray();
    const products = filterValidMasterProducts(
      docs.map((doc) => {
        const { workbookName, updatedAt, ...product } = doc;
        void workbookName;
        void updatedAt;
        return product as ProductRecord;
      }),
    );
    productsCache = { products, expiresAt: Date.now() + PRODUCTS_CACHE_TTL_MS };
    return products;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mongo load failed";
    console.warn(`[master-load] ${message}`);
    return null;
  }
}
