import { NextResponse } from "next/server";

import { withTimeout } from "@/lib/async-utils";
import { loadProductsFromMongo } from "@/lib/db/sync-master";
import { isMongoConfigured } from "@/lib/db/mongo";
import type { DashboardDataset } from "@/lib/types";

const MASTER_LOAD_TIMEOUT_MS = 4_000;

/** Load latest desk book (NEW PRIMARY) from MongoDB when configured. */
export async function GET() {
  try {
    if (!isMongoConfigured()) {
      return NextResponse.json({ ok: false, reason: "mongodb_not_configured" }, { status: 503 });
    }

    const products = await withTimeout(
      loadProductsFromMongo(),
      MASTER_LOAD_TIMEOUT_MS,
      "master load",
    );
    if (!products?.length) {
      return NextResponse.json({ ok: false, reason: "empty" }, { status: 404 });
    }

    const dataset: DashboardDataset = {
      workbookName: "MongoDB · New Product Master",
      loadedAt: new Date().toISOString(),
      products,
      sheets: [],
      hiddenDependencySheets: [],
      categorySummaries: [],
      formulaCatalog: [],
      validationIssues: [],
    };

    return NextResponse.json(
      { ok: true, dataset },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Master load failed.";
    console.warn(`[master-load] ${message}`);
    return NextResponse.json({ ok: false, reason: "error", error: message }, { status: 503 });
  }
}
