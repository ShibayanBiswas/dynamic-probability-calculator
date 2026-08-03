"use client";

import { useMemo } from "react";

import { DynamicTable, type DynamicTableColumn } from "@/components/ui/dynamic-table";
import { Panel, SectionTitle } from "@/components/layout/app-ui";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import { getExpiredVsOngoingTable, getLifecycleChartData, getLifecycleTableTotals } from "@/lib/analytics";
import {
  filterProductsByLifecycle,
  LIFECYCLE_FILTER_LABELS,
  LIFECYCLE_STATUS_LABELS,
  lifecycleStatusMatchesFilter,
  type LifecycleFilter,
  type LifecycleStatus,
} from "@/lib/product-lifecycle";
import { useTheme } from "@/lib/context/theme-provider";
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
  const { theme } = useTheme();
  const { asOf } = usePortfolioClock();
  const categoryLabel = LIFECYCLE_FILTER_LABELS[filter];
  const tabPool = useMemo(() => filterProductsByLifecycle(products, filter, asOf), [products, filter, asOf]);
  const tabTotals = useMemo(() => getLifecycleTableTotals(tabPool, asOf), [tabPool, asOf]);
  const lifecycleTable = useMemo(() => getExpiredVsOngoingTable(products, asOf), [products, asOf]);
  const lifecycle = useMemo(() => getLifecycleChartData(products, asOf, theme), [products, asOf, theme]);
  const bookTotals = useMemo(() => getLifecycleTableTotals(products, asOf), [products, asOf]);

  const lifecycleColumns = useMemo<DynamicTableColumn<(typeof lifecycleTable)[number]>[]>(
    () => [
      {
        key: "status",
        header: "Status",
        render: (row) => {
          const inActiveTab = lifecycleStatusMatchesFilter(row.status as LifecycleStatus, filter);
          return (
            <span className="inline-flex items-center gap-2 font-semibold capitalize">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: lifecycle.find((e) => e.status === row.status)?.color ?? "#64748b",
                }}
              />
              {LIFECYCLE_STATUS_LABELS[row.status as keyof typeof LIFECYCLE_STATUS_LABELS] ?? row.status}
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
    [filter, lifecycle],
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
            Full book status breakdown · {categoryLabel} tab: {formatKpiCount(tabTotals.count, products.length > 0)} products ·{" "}
            {formatKpiNotional(tabTotals.notional)} AUM · updated{" "}
            <span suppressHydrationWarning>{asOf.toLocaleTimeString("en-IN")}</span>
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
              getRowKey={(row) => row.status}
              rowClassName={(row) =>
                cn(
                  lifecycleStatusMatchesFilter(row.status as LifecycleStatus, filter) &&
                    "bg-gold/[0.07] ring-1 ring-inset ring-gold/25",
                )
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
