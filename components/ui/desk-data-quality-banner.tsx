"use client";

import { AlertTriangle } from "lucide-react";

import { Panel } from "@/components/layout/app-ui";
import type { ProductDataAssessment } from "@/lib/product-data-guards";
import type { ProductRecord } from "@/lib/types";

/** Styled desk disclaimer when master data is incomplete — hard blockers on formula or entry level. */
export function DeskDataQualityBanner({
  product,
  assessment,
}: {
  product: ProductRecord;
  assessment: ProductDataAssessment;
}) {
  const missingFormula = assessment.missingFormula;
  const missingEntryLevel = assessment.missingEntryLevel;
  if (!missingFormula && !missingEntryLevel) return null;

  const headline = missingFormula
    ? "Payoff formula missing"
    : "Entry / initial fixing missing";

  return (
    <Panel className="!p-5" glow="purple">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-900 dark:text-amber-200">{headline}</p>
        <p className="max-w-xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
          <span className="font-semibold text-ink">{product.name}</span> cannot be marked on the desk because
          essential master fields are blank in NEW PRIMARY. Valuation, payoff, and exports need a complete
          payoff formula and entry level.
        </p>
        <ul className="mt-1 space-y-1 text-xs text-stone-500 dark:text-stone-400">
          {missingFormula ? <li>• Payoff formula is missing or cannot be evaluated.</li> : null}
          {missingEntryLevel ? <li>• Entry / initial fixing level is missing.</li> : null}
        </ul>
        <p className="text-xs italic text-stone-500 dark:text-stone-400">
          Selection has been reset to the default product for this lifecycle tab.
        </p>
      </div>
    </Panel>
  );
}
