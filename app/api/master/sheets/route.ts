import { NextResponse } from "next/server";

import { loadMasterSheetsPayload } from "@/lib/server/master-sheets-api";
import { warmMasterDatasetDiskCache } from "@/lib/server/master-file";

export const maxDuration = 60;

const SHEET_TABS = new Set(["Primary", "Rollover", "NEW PRIMARY"]);

/** Primary, Rollover, and NEW PRIMARY sheet grids. Optional `?sheet=Primary|Rollover|NEW PRIMARY`. */
export async function GET(request: Request) {
  warmMasterDatasetDiskCache();
  const sheetParam = new URL(request.url).searchParams.get("sheet");
  const filter =
    sheetParam && SHEET_TABS.has(sheetParam)
      ? (sheetParam as "Primary" | "Rollover" | "NEW PRIMARY")
      : undefined;

  const payload = await loadMasterSheetsPayload(filter);
  if (!payload.ok) {
    const status =
      payload.reason === "master_not_found" || payload.reason === "mongodb_empty" ? 404 : 503;
    return NextResponse.json(payload, { status });
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
    },
  });
}
