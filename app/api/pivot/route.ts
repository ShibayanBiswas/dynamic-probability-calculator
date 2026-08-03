import { NextResponse } from "next/server";
import { z } from "zod";

import { runPivotEngine, runPivotViaPython, type PivotAgg } from "@/lib/pivot/engine";

const bodySchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  rows: z.array(z.string()),
  columns: z.array(z.string()),
  values: z.array(z.string()).min(1),
  agg: z.enum(["sum", "count", "avg", "min", "max"]).optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.parse(json);
    const payload = {
      ...parsed,
      agg: (parsed.agg ?? "sum") as PivotAgg,
    };

    const python = await runPivotViaPython(payload);
    if (python) {
      return NextResponse.json(python);
    }

    return NextResponse.json(runPivotEngine(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pivot failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
