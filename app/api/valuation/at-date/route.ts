import { NextResponse } from "next/server";

import { getIndexPriceOn } from "@/lib/db/index-prices";
import { isSensexLinked } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { parseExcelishDate, toLocalDateKey } from "@/lib/workbook/dates";
import { computeValuation } from "@/lib/workbook/valuation-engine";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      product: ProductRecord;
      valuationDate: string;
      debentures?: number;
    };

    if (!body.product || !body.valuationDate) {
      return NextResponse.json({ error: "product and valuationDate required." }, { status: 400 });
    }

    const parsed = parseExcelishDate(body.valuationDate);
    const iso = parsed ? toLocalDateKey(parsed) : undefined;
    const stored = iso ? await getIndexPriceOn(iso) : null;

    const sensex = isSensexLinked(body.product);
    const currentLevel = stored ? (sensex ? stored.sensex : stored.nifty) : undefined;

    const result = computeValuation(body.product, {
      valuationDate: body.valuationDate,
      currentLevel,
      debentures: body.debentures ?? 100,
    });

    return NextResponse.json({
      valuation: result,
      indexSource: stored ? "mongodb" : "fallback_entry",
      indexDate: iso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historical valuation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
