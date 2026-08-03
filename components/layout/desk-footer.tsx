"use client";

import { Activity, Database, Server } from "lucide-react";

import { useMasterProducts } from "@/lib/hooks/use-master-products";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { useDataset } from "@/lib/context/dataset-provider";
import { formatKpiCount } from "@/lib/utils";

function DeskClock({ asOf }: { asOf: Date }) {
  return (
    <span suppressHydrationWarning>
      Desk clock {asOf.toLocaleString("en-IN")}
    </span>
  );
}

export function DeskFooter() {
  const { uploadState, isLoading } = useDataset();
  const masterProducts = useMasterProducts();
  const { asOf } = usePortfolioClock();

  return (
    <footer className="relative z-10 mt-8 border-t border-stone-200 bg-white/90 font-ui backdrop-blur-xl dark:border-[var(--ar-border)] dark:bg-[color-mix(in_srgb,var(--ar-surface)_92%,transparent)]">
      <div className="mx-auto flex max-w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-[11px] text-stone-500 dark:text-stone-400 lg:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-gold" />
            Anand Rathi Wealth · SP Desk
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-gold-light" />
            {formatKpiCount(masterProducts.length, masterProducts.length > 0)} desk products
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-800" />
            <DeskClock asOf={asOf} />
          </span>
        </div>
        <p className="max-w-xl truncate text-right italic text-stone-500" suppressHydrationWarning>
          {isLoading ? "Loading master…" : uploadState}
        </p>
      </div>
    </footer>
  );
}
