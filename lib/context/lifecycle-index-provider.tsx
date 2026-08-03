"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { buildLifecycleIndex, type LifecycleIndex } from "@/lib/lifecycle-index";
import { resolveNewPrimaryHeadlineNotional } from "@/lib/headline-notional";
import { productsForLifecycleFilter } from "@/lib/lifecycle-index";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { useDataset } from "@/lib/context/dataset-provider";
import type { LifecycleFilter } from "@/lib/product-lifecycle";
import type { ProductRecord } from "@/lib/types";

const LifecycleIndexContext = createContext<LifecycleIndex | null>(null);

export function LifecycleIndexProvider({ children }: { children: ReactNode }) {
  const { dataset } = useDataset();
  const { asOf } = usePortfolioClock();
  const newPrimaryTabNotional = useMemo(
    () => resolveNewPrimaryHeadlineNotional(dataset),
    [dataset],
  );
  const index = useMemo(
    () => buildLifecycleIndex(dataset.products, asOf, { newPrimaryTabNotional }),
    [dataset.products, asOf, newPrimaryTabNotional],
  );
  return <LifecycleIndexContext.Provider value={index}>{children}</LifecycleIndexContext.Provider>;
}

function useLifecycleIndexContext(): LifecycleIndex {
  const context = useContext(LifecycleIndexContext);
  if (!context) {
    throw new Error("useLifecycleIndex must be used within LifecycleIndexProvider");
  }
  return context;
}

export function useLifecycleIndex(): LifecycleIndex {
  return useLifecycleIndexContext();
}

export function useMasterProducts(): ProductRecord[] {
  return useLifecycleIndexContext().validProducts;
}

export function useLifecycleFilterPool(filter: LifecycleFilter): ProductRecord[] {
  const index = useLifecycleIndexContext();
  const { asOf } = usePortfolioClock();
  return useMemo(
    () => productsForLifecycleFilter(index, filter, asOf),
    [index, filter, asOf],
  );
}
