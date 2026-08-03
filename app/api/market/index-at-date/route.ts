import { NextResponse } from "next/server";

import { resolveIndexLevelsAtDate } from "@/lib/market-index-at-date";
import { formatDeskDate } from "@/lib/market-data";
import { parseExcelishDate, toLocalDateKey } from "@/lib/workbook/dates";

export const dynamic = "force-dynamic";

/** Index closes for a desk date — auto-fills Nifty and Sensex on valuation date change. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("date");
    const minRaw = searchParams.get("minDate");
    if (!raw) {
      return NextResponse.json({ error: "date query param required." }, { status: 400 });
    }

    const parsed = parseExcelishDate(raw);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }

    const result = await resolveIndexLevelsAtDate(raw, minRaw ?? undefined);
    if (!result) {
      return NextResponse.json({
        error: "Valuation date cannot be before the product phase start date.",
        valuationDate: formatDeskDate(parsed),
      }, { status: 400 });
    }

    const iso = toLocalDateKey(parsed);
    const todayIso = toLocalDateKey(new Date());

    return NextResponse.json(result, {
      headers: {
        "Cache-Control":
          iso < todayIso
            ? "public, max-age=3600, stale-while-revalidate=86400"
            : "public, max-age=120, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Index lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
