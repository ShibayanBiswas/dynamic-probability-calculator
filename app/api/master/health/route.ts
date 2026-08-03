import { NextResponse } from "next/server";

import { pingMongo } from "@/lib/db/mongo";
import { isMongoConfigured } from "@/lib/db/mongo-config";

export async function GET() {
  if (!isMongoConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, reason: "MONGODB_URI not set in .env.local" },
      { status: 503 },
    );
  }

  const result = await pingMongo();
  return NextResponse.json({ configured: true, ...result }, { status: result.ok ? 200 : 503 });
}
