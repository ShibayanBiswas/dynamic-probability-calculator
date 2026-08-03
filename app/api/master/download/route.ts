import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { getMasterFilePath, isMasterFileOnDisk, MASTER_FILE_NAME } from "@/lib/server/master-file";

const PUBLIC_MASTER = join(process.cwd(), "public", "data", MASTER_FILE_NAME);

function resolveMasterBuffer(): Buffer | null {
  if (isMasterFileOnDisk()) {
    return readFileSync(getMasterFilePath());
  }
  if (existsSync(PUBLIC_MASTER)) {
    return readFileSync(PUBLIC_MASTER);
  }
  return null;
}

/** Serve `New Product Master_.xlsx` — repo root first, then public/data bundle. */
export async function GET() {
  const buffer = resolveMasterBuffer();
  if (!buffer) {
    return NextResponse.json(
      { ok: false, reason: "master_not_found", path: "New Product Master_.xlsx at repo root" },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${MASTER_FILE_NAME}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
