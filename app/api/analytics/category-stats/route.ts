import { NextResponse } from "next/server";

import { getLifecycleCategoryStatsServer } from "@/lib/analytics-server";
import { resolveMasterProducts } from "@/lib/server/resolve-master-products";
import { LIFECYCLE_FILTERS, type LifecycleFilter } from "@/lib/product-lifecycle";

export const dynamic = "force-dynamic";

const VALID_FILTERS = new Set<LifecycleFilter>(LIFECYCLE_FILTERS);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = (searchParams.get("filter") ?? "ongoing") as LifecycleFilter;
    if (!VALID_FILTERS.has(filter)) {
      return NextResponse.json({ error: "Invalid lifecycle filter" }, { status: 400 });
    }

    const nifty = Number(searchParams.get("nifty"));
    const sensex = Number(searchParams.get("sensex"));
    const liveLevels = {
      niftyLevel: Number.isFinite(nifty) ? nifty : undefined,
      sensexLevel: Number.isFinite(sensex) ? sensex : undefined,
    };

    const products = await resolveMasterProducts();

    const stats = await getLifecycleCategoryStatsServer(products, filter, new Date(), liveLevels);
    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stats failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
