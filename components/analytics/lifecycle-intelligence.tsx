"use client";

import { useMemo } from "react";

import { DynamicTable, type DynamicTableColumn } from "@/components/ui/dynamic-table";
import { Panel, SectionTitle } from "@/components/layout/app-ui";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import {
  getLiveBookLifecycleTable,
  getLifecycleTableTotals,
  type LiveBookLifecycleTableRow,
} from "@/lib/analytics";
import {
  filterProductsByLifecycle,
  LIFECYCLE_FILTER_LABELS,
  type LifecycleFilter,
} from "@/lib/product-lifecycle";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import type { ProductRecord } from "@/lib/types";
import { cn, formatCrores, formatKpiCount, formatKpiNotional, formatNumber, formatPercent } from "@/lib/utils";

export function LifecycleIntelligencePanel({
  products,
  filter = "ongoing",
}: {
  products: ProductRecord[];
  filter?: LifecycleFilter;
}) {
  const { asOf } = usePortfolioClock();
  const categoryLabel = LIFECYCLE_FILTER_LABELS[filter];
  const tabPool = useMemo(() => filterProductsByLifecycle(products, filter, asOf), [products, filter, asOf]);
  const tabTotals = useMemo(() => getLifecycleTableTotals(tabPool, asOf), [tabPool, asOf]);
  const lifecycleTable = useMemo(() => getLiveBookLifecycleTable(products, asOf), [products, asOf]);
  const bookTotals = useMemo(() => getLifecycleTableTotals(products, asOf), [products, asOf]);

  const lifecycleColumns = useMemo<DynamicTableColumn<LiveBookLifecycleTableRow>[]>(
    () => [
      {
        key: "status",
        header: "Status",
        render: (row) => {
          const inActiveTab = row.filter === filter;
          return (
            <span className="inline-flex items-center gap-2 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
              {row.label}
              {inActiveTab ? (
                <span className="rounded-full border border-gold/35 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold-dark">
                  In tab
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        key: "count",
        header: "Products",
        align: "right",
        headerClassName: "text-right",
        render: (row) => formatNumber(row.count),
      },
      {
        key: "notional",
        header: "Notional",
        align: "right",
        headerClassName: "text-right",
        render: (row) => formatCrores(row.notional),
      },
      {
        key: "avgCoupon",
        header: "Avg Coupon",
        align: "right",
        headerClassName: "text-right",
        render: (row) => formatPercent(row.avgCoupon, 1),
      },
    ],
    [filter],
  );

  if (products.length === 0) {
    return (
      <Panel className="!p-5" glow="purple">
        <p className="text-center text-sm text-stone-600">No lifecycle intelligence available.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-maroon/40 to-transparent" />
        <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-maroon">
          Lifecycle Intelligence · {categoryLabel}
        </p>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
      </div>

      <HorizontalBand>
        <Panel glow="purple">
          <SectionTitle>Lifecycle Intelligence</SectionTitle>
          <p className="mt-1 text-sm text-stone-500">
            Live book tabs · {categoryLabel}: {formatKpiCount(tabTotals.count, products.length > 0)} products ·{" "}
            {formatKpiNotional(tabTotals.notional)} AUM · updated{" "}
            <span suppressHydrationWarning>{asOf.toLocaleTimeString("en-IN")}</span>
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Observation Due 3M / 2M / 1M are subsets of Ongoing (a product can appear in Ongoing and an Obs Due row).
          </p>
          <div className="mt-4">
            <DynamicTable
              columns={lifecycleColumns}
              footer={
                <tr className="row-total">
                  <td>Total book</td>
                  <td className="text-right">{formatNumber(bookTotals.count)}</td>
                  <td className="text-right">{formatCrores(bookTotals.notional)}</td>
                  <td className="text-right">{formatPercent(bookTotals.avgCoupon, 1)}</td>
                </tr>
              }
              getRowKey={(row) => row.filter}
              rowClassName={(row) =>
                cn(row.filter === filter && "bg-gold/[0.07] ring-1 ring-inset ring-gold/25")
              }
              rows={lifecycleTable}
              virtualizeAt={999}
            />
          </div>
        </Panel>
      </HorizontalBand>
    </div>
  );
}
