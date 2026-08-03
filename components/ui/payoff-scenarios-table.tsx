"use client";

import { memo } from "react";

import { DynamicTable, type DynamicTableColumn } from "@/components/ui/dynamic-table";
import type { PayoffRowFlags } from "@/lib/workbook/payoff-pivots";
import { cn, formatFormulaReturn, formatNumber, formatPercent } from "@/lib/utils";

const PAYOFF_COLUMNS: DynamicTableColumn<PayoffRowFlags>[] = [
  {
    key: "finalFixing",
    header: "Final Fixing",
    render: (row) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span>{formatNumber(row.finalFixing)}</span>
        {row.isInitialLevel ? (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
            Initial
          </span>
        ) : null}
        {row.isTargetLevel ? (
          <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-900 dark:bg-violet-950/50 dark:text-violet-200">
            Target
          </span>
        ) : null}
      </span>
    ),
  },
  {
    key: "performance",
    header: "Underlying's Performance",
    render: (row) => formatPercent(row.performance, 1),
  },
  {
    key: "maturityValue",
    header: "Product Returns",
    cellClassName: "font-bold text-emerald-800",
    render: (row) => formatFormulaReturn(row.maturityValue),
  },
  {
    key: "irr",
    header: "XIRR",
    render: (row) => formatPercent(row.irr, 2),
  },
];

/**
 * Payoff scenario table — rows driven by `buildEnhancedPayoffScenarioTable()` output.
 */
export const PayoffScenariosTable = memo(function PayoffScenariosTable({
  rows,
  highlightKinks = false,
}: {
  rows: PayoffRowFlags[];
  highlightKinks?: boolean;
}) {
  return (
    <DynamicTable
      columns={PAYOFF_COLUMNS}
      getRowKey={(row) =>
        `${row.performance}-${row.isPivot ? "k" : "b"}-${row.isCurrent ? "c" : "n"}-${row.isInitialLevel ? "i" : ""}${row.isTargetLevel ? "t" : ""}-${row.finalFixing}`
      }
      rowClassName={(row) =>
        cn(
          "transition-colors",
          row.isInitialLevel && "bg-sky-50/80 dark:bg-sky-950/25",
          row.isTargetLevel && "bg-violet-50/80 font-medium dark:bg-violet-950/30",
          highlightKinks &&
            row.isPivot &&
            "bg-amber-100/70 font-semibold ring-1 ring-inset ring-amber-300/60 dark:bg-amber-950/40",
        )
      }
      rows={rows}
      scrollClassName="max-h-[min(56vh,560px)] overflow-auto"
      tableClassName="payoff-scenarios-table"
      virtualizeAt={60}
    />
  );
});
