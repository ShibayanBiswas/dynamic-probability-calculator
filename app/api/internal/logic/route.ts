import { NextResponse } from "next/server";

import { logicRegistry } from "@/lib/backend/logic-registry";

/** Internal API — full Excel schema + computation registry. Not linked from UI. */
export async function GET() {
  return NextResponse.json(logicRegistry);
}
