import { NextResponse } from "next/server";

import { buildAppendixPayload, buildLogicModuleDetail } from "@/lib/server/appendix-service";

/** Internal reference API — appendix data for backend / tooling only. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const moduleId = searchParams.get("module");

  if (moduleId) {
    const detail = buildLogicModuleDetail(moduleId);
    if (!detail) {
      return NextResponse.json({ error: "Module not found." }, { status: 404 });
    }
    return NextResponse.json(detail);
  }

  return NextResponse.json(buildAppendixPayload());
}
