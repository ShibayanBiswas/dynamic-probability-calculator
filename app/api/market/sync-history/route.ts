import { NextResponse } from "next/server";

import { syncIndexPricesFromYahoo } from "@/lib/db/index-prices";

export async function POST() {
  try {
    const result = await syncIndexPricesFromYahoo();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Index sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
