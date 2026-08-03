import { NextResponse } from "next/server";

import {
  DEBENTURE_PRESETS,
  getPayoffSteps,
  getValuationInputFields,
  IDENTITY_HINT,
  INPUT_HINT,
  VALUATION_DISCLAIMER,
} from "@/lib/dashboard-input-config";

/** Input field metadata, disclaimers, and step guides for React forms. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") ?? "valuation";

  return NextResponse.json({
    inputHint: INPUT_HINT,
    identityHint: IDENTITY_HINT,
    valuationDisclaimer: VALUATION_DISCLAIMER,
    debenturePresets: DEBENTURE_PRESETS,
    valuationFields: mode === "valuation" ? getValuationInputFields() : [],
    payoffSteps: mode === "payoff" ? getPayoffSteps() : [],
  });
}
