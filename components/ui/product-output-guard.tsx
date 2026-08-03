"use client";

import type { ReactNode } from "react";

import { Panel } from "@/components/layout/app-ui";
import { assessProductData, type ProductDataAssessment } from "@/lib/product-data-guards";
import type { ProductRecord } from "@/lib/types";

export function ProductOutputGuard({
  product,
  mode,
  children,
}: {
  product?: ProductRecord;
  mode: "valuation" | "payoff";
  children: (ctx: { assessment: ProductDataAssessment; showValues: boolean }) => ReactNode;
}) {
  const assessment = assessProductData(product);
  const showValues = mode === "valuation" ? assessment.canValue : assessment.canPayoff;

  if (!showValues) {
    return (
      <Panel className="!p-5" glow="purple">
        <p className="text-center text-sm font-bold uppercase tracking-[0.15em] text-amber-900">
          {mode === "valuation" ? "Valuation unavailable" : "Payoff unavailable"}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-stone-700">
          {assessment.blockers.map((line) => (
            <li key={line}>• {line}</li>
          ))}
        </ul>
        {assessment.warnings.length > 0 ? (
          <>
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-stone-500">Notes</p>
            <ul className="mt-2 space-y-1 text-xs text-stone-600">
              {assessment.warnings.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="mt-4 text-center text-xs italic text-stone-500">
          Missing observation dates in the master file are flagged when output is revealed — Nifty and Sensex levels are
          fetched from market data when the valuation date is set.
        </p>
      </Panel>
    );
  }

  return (
    <>
      {assessment.warnings.length > 0 ? (
        <Panel className="!mb-4 !p-4" glow="cyan">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-900">Data disclaimer</p>
          <ul className="mt-2 space-y-1 text-xs text-stone-600">
            {assessment.warnings.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {children({ assessment, showValues: true })}
    </>
  );
}
