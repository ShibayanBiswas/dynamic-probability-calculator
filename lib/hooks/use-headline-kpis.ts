"use client";

import { useDataset } from "@/lib/context/dataset-provider";
import { useLifecycleIndex } from "@/lib/hooks/use-lifecycle-index";
import { buildHeadlineKpiItems, HEADLINE_KPI_ACCENTS } from "@/lib/headline-kpi-items";

/** Home / analytics headline band — respects bootstrap loading and empty book. */
export function useHeadlineKpis() {
  const { isLoading } = useDataset();
  const { headline, validProducts } = useLifecycleIndex();
  const hasBook = validProducts.length > 0;
  const items = buildHeadlineKpiItems(headline, hasBook, isLoading);

  return { items, accents: HEADLINE_KPI_ACCENTS, hasBook, isLoading, headline };
}
