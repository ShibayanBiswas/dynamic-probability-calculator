import { NextResponse } from "next/server";

import { syncMasterDatasetToMongo } from "@/lib/db/sync-master";
import { deskBookBlockingError, isStalePrimaryOnlyDeskBook } from "@/lib/desk-book-validation";
import type { DashboardDataset } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const dataset = (await request.json()) as DashboardDataset;

    const blocking = deskBookBlockingError(dataset);
    if (blocking) {
      return NextResponse.json({ error: blocking }, { status: 422 });
    }
    if (isStalePrimaryOnlyDeskBook(dataset)) {
      return NextResponse.json(
        {
          error:
            "Refusing to sync a pre-NEW-PRIMARY Primary-only book. Re-upload after npm run bake or include Primary + Rollover.",
        },
        { status: 422 },
      );
    }

    const result = await syncMasterDatasetToMongo(dataset);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mongo sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
