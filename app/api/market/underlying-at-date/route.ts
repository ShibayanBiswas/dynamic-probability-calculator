import { NextResponse } from "next/server";

import { lookupCustomUnderlyingMetaOnOrBefore } from "@/lib/custom-underlying-history";
import { formatDeskDate } from "@/lib/market-data";
import {
  normalizeUnderlyingLabel,
  resolveCustomUnderlyingSpecFromLabel,
} from "@/lib/underlying-benchmark";
import { parseExcelishDate, toLocalDateKey } from "@/lib/workbook/dates";

export const dynamic = "force-dynamic";

/** Historical / estimated close for a non-Nifty/Sensex underlying on a desk date. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawDate = searchParams.get("date");
    const underlying = searchParams.get("underlying") ?? "";
    if (!rawDate) {
      return NextResponse.json({ error: "date query param required." }, { status: 400 });
    }
    if (!underlying.trim()) {
      return NextResponse.json({ error: "underlying query param required." }, { status: 400 });
    }

    const parsed = parseExcelishDate(rawDate);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }

    const spec = resolveCustomUnderlyingSpecFromLabel(underlying);
    if (!spec) {
      return NextResponse.json({
        valuationDate: formatDeskDate(parsed),
        isoDate: toLocalDateKey(parsed),
        underlying: underlying.trim(),
        normalized: normalizeUnderlyingLabel(underlying),
        level: null,
        source: "missing",
        note: "No dedicated price series mapped for this underlying — not using Nifty.",
      });
    }

    const hit = lookupCustomUnderlyingMetaOnOrBefore(spec.key, parsed);
    return NextResponse.json(
      {
        valuationDate: formatDeskDate(parsed),
        isoDate: hit?.date ?? toLocalDateKey(parsed),
        underlying: spec.label,
        key: spec.key,
        level: hit?.level ?? null,
        source: hit ? hit.source : "missing",
        note:
          hit?.source === "estimate"
            ? "Commodity proxy estimate (futures × USDINR), not official MCX/Reliance print."
            : hit
              ? "Yahoo / baked equity close on or before the desk date."
              : "No close available on or before this date.",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Underlying lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
