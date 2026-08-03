import { NextResponse } from "next/server";

import { buildPayoffCurve, evaluatePayoffFormula } from "@/lib/workbook/formula-engine";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { formula?: string; z?: number };
    const formula = body.formula?.trim() ?? "";

    if (!formula) {
      return NextResponse.json({ error: "Formula is required." }, { status: 400 });
    }

    const z = typeof body.z === "number" && Number.isFinite(body.z) ? body.z : 0;

    return NextResponse.json({
      payoff: evaluatePayoffFormula(formula, z),
      curve: buildPayoffCurve(formula),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payoff evaluation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
