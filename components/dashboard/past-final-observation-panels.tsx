"use client";

import { useMemo } from "react";

import { PayoffCurvePanel } from "@/components/dashboard/payoff-curve";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import { Panel, SectionTitle } from "@/components/layout/app-ui";
import { ObservationDatesTable } from "@/components/ui/observation-dates-table";
import { useObservationLevels } from "@/lib/hooks/use-observation-levels";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { getIndexEntryLevel } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";

/**
 * Probability summary reference panels after Results cards:
 * payoff plot → observation dates table (same as Primary Product Details / past-final view).
 */
export function PastFinalObservationPanels({ product }: { product: ProductRecord }) {
  const { asOf } = usePortfolioClock();
  const { levels } = useObservationLevels(product, asOf);

  const marketMove = useMemo(() => {
    const entry = getIndexEntryLevel(product);
    if (!(entry > 0) || levels.length === 0) return 0;
    const lastSettled = [...levels].reverse().find((row) => !row.isFuture && row.level != null);
    if (lastSettled?.level == null) return 0;
    return lastSettled.level / entry - 1;
  }, [product, levels]);

  return (
    <>
      {product.formulaText ? (
        <HorizontalBand className="mt-4">
          <PayoffCurvePanel
            entryLevel={getIndexEntryLevel(product)}
            formula={product.formulaText}
            marketMove={marketMove}
            title={product.name}
          />
        </HorizontalBand>
      ) : null}

      {levels.length > 0 ? (
        <HorizontalBand className="mt-4">
          <Panel className="!p-4" glow="cyan">
            <SectionTitle>Observation Dates</SectionTitle>
            <p className="mt-1 text-xs text-stone-500">
              Underlying level on each observation date and its performance versus the initial
              fixing at allotment.
            </p>
            <div className="mt-3">
              <ObservationDatesTable levels={levels} />
            </div>
          </Panel>
        </HorizontalBand>
      ) : null}
    </>
  );
}
