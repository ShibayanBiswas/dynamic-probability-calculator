import { NextResponse } from "next/server";

import { computeValuation } from "@/lib/workbook/valuation-engine";
import type { ProductRecord } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      product?: ProductRecord;
      inputs?: {
        valuationDate?: string;
        currentLevel?: number;
        debentures?: number;
        purchasePrice?: number;
      };
    };

    if (!body.product) {
      return NextResponse.json({ error: "Product payload is required." }, { status: 400 });
    }

    const inputs = body.inputs ?? {};
    const result = computeValuation(body.product, inputs);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Valuation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
