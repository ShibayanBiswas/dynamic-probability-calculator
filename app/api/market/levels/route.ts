import { NextResponse } from "next/server";

import { runInBackground } from "@/lib/async-utils";
import { syncIndexPricesFromYahoo } from "@/lib/db/index-prices";
import { fetchLiveMarketLevels } from "@/lib/market-data";

export const dynamic = "force-dynamic";

/** Only backfill recent trading days — full history belongs on `/api/market/sync-history`. */
function recentIndexSyncFrom() {
  const since = new Date();
  since.setDate(since.getDate() - 14);
  return since;
}

export async function GET() {
  const levels = await fetchLiveMarketLevels();
  runInBackground("index-prices", syncIndexPricesFromYahoo(recentIndexSyncFrom()));
  return NextResponse.json(levels, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
