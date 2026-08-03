"use client";

import { useMemo } from "react";

import { DynamicTable, type DynamicTableColumn } from "@/components/ui/dynamic-table";
import { formatDisplayDate } from "@/lib/workbook/dates";
import { formatNumber, formatPercent } from "@/lib/utils";

export type ObservationLevelRow = {
  date: Date;
  level: number | null;
  performance: number | null;
  isFuture?: boolean;
};

const OBSERVATION_COLUMNS: DynamicTableColumn<ObservationLevelRow>[] = [
  {
    key: "index",
    header: "#",
    cellClassName: "font-mono text-xs text-stone-500",
    render: (_row, index) => index + 1,
  },
  {
    key: "date",
    header: "Observation Date",
    cellClassName: "whitespace-nowrap",
    render: (row) => formatDisplayDate(row.date),
  },
  {
    key: "level",
    header: "Underlying Level",
    render: (row) =>
      row.isFuture ? (
        <span className="text-stone-400">Yet to come</span>
      ) : row.level != null ? (
        formatNumber(row.level)
      ) : (
        <span className="text-stone-400">—</span>
      ),
  },
  {
    key: "performance",
    header: "Performance vs Initial",
    render: (row) => (row.performance != null ? formatPercent(row.performance, 1) : "—"),
  },
];

export function ObservationDatesTable({
  levels,
  scrollClassName = "max-h-72 overflow-auto",
}: {
  levels: ObservationLevelRow[];
  scrollClassName?: string;
}) {
  const columns = useMemo(() => OBSERVATION_COLUMNS, []);

  return (
    <DynamicTable
      columns={columns}
      emptyMessage="No observation dates on record."
      getRowKey={(row) => String(row.date.getTime())}
      rows={levels}
      scrollClassName={scrollClassName}
      virtualizeAt={80}
    />
  );
}
