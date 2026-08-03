import { NextResponse } from "next/server";

import { runInBackground } from "@/lib/async-utils";
import { syncMasterDatasetToMongo } from "@/lib/db/sync-master";
import { deskBookBlockingError, isStalePrimaryOnlyDeskBook } from "@/lib/desk-book-validation";
import { parseWorkbookBuffer } from "@/lib/workbook/parser";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No workbook file provided." }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    const allowed = [".xlsx", ".xlsm", ".xls"];
    const lowerName = file.name.toLowerCase();
    if (!allowed.some((ext) => lowerName.endsWith(ext))) {
      return NextResponse.json({ error: "Only .xlsx, .xlsm, or .xls workbooks are supported." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const dataset = parseWorkbookBuffer(buffer, file.name);

    const blocking = deskBookBlockingError(dataset);
    if (blocking) {
      return NextResponse.json({ error: blocking }, { status: 422 });
    }
    if (isStalePrimaryOnlyDeskBook(dataset)) {
      return NextResponse.json(
        {
          error:
            "Desk book appears to be a pre-NEW-PRIMARY Primary-only export. Upload Primary + Rollover or run npm run bake.",
        },
        { status: 422 },
      );
    }

    runInBackground("master-sync", syncMasterDatasetToMongo(dataset));
    return NextResponse.json(dataset);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workbook parsing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
