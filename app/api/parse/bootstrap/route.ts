import { NextResponse } from "next/server";

import { withTimeout } from "@/lib/async-utils";
import { CANONICAL_MANIFEST } from "@/lib/canonical-manifest";
import { isPlausibleNewPrimaryDeskBook } from "@/lib/desk-book-validation";
import { isMongoConfigured } from "@/lib/db/mongo";
import { loadProductsFromMongo } from "@/lib/db/sync-master";
import { loadMasterDatasetFromDisk, warmMasterDatasetDiskCache } from "@/lib/server/master-file";
import { loadSeedDataset } from "@/lib/server/load-seed-dataset";
import type { DashboardDataset } from "@/lib/types";

const MONGO_BOOTSTRAP_TIMEOUT_MS = 2_500;

function buildDataset(products: DashboardDataset["products"], workbookName: string): DashboardDataset {
  return {
    workbookName,
    loadedAt: new Date().toISOString(),
    products,
    sheets: [],
    hiddenDependencySheets: [],
    categorySummaries: [],
    formulaCatalog: [],
    validationIssues: [],
  };
}

function staticSeedHint() {
  const v = encodeURIComponent(CANONICAL_MANIFEST.generatedAt);
  return NextResponse.json(
    {
      error: "Load the static CDN seed instead of serializing the full book from this function.",
      code: "USE_STATIC_SEED",
      url: `/data/master-seed.json?v=${v}`,
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Fast bootstrap for API clients. Never blocks on Mongo sync or index creation.
 * The ~12 MB seed is served from `/data/master-seed.json` (static CDN) on first load;
 * this route is a fallback and for Mongo-updated books after upload sync.
 *
 * On Vercel, never JSON-serialize the full seed from the serverless function —
 * that burns cold-start memory/time; the client already loads the CDN file.
 */
export async function GET() {
  try {
    if (isMongoConfigured()) {
      try {
        const products = await withTimeout(
          loadProductsFromMongo(),
          MONGO_BOOTSTRAP_TIMEOUT_MS,
          "mongo bootstrap",
        );
        if (products?.length && isPlausibleNewPrimaryDeskBook(products)) {
          return NextResponse.json(buildDataset(products, "MongoDB · New Product Master"), {
            headers: {
              "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
            },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Mongo bootstrap failed";
        console.warn(`[bootstrap] Mongo skipped — using seed: ${message}`);
      }
    }

    const diskDataset = loadMasterDatasetFromDisk();
    if (diskDataset?.products.length && isPlausibleNewPrimaryDeskBook(diskDataset.products)) {
      warmMasterDatasetDiskCache();
      // Prefer CDN static seed on Vercel rather than pushing ~11MB through the function.
      if (process.env.VERCEL) return staticSeedHint();
      return NextResponse.json(diskDataset);
    }

    if (process.env.VERCEL) return staticSeedHint();

    const seed = loadSeedDataset();
    if (!seed.products?.length) {
      return NextResponse.json({ error: "Master seed is empty. Upload New Product Master_.xlsx" }, { status: 503 });
    }
    return NextResponse.json(seed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bootstrap parse failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
