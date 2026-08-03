"use client";

import type { ReactNode } from "react";

import { DataTable } from "@/components/layout/app-ui";
import { VirtualizedTableSection } from "@/components/ui/virtual-table-body";
import { cn } from "@/lib/utils";

/** Row counts at or above this threshold use virtual scrolling. */
export const DYNAMIC_TABLE_VIRTUALIZE_AT = 40;

export type DynamicTableColumn<T> = {
  key: string;
  header: ReactNode;
  headerClassName?: string;
  cellClassName?: string | ((row: T, index: number) => string | undefined);
  align?: "left" | "right" | "center";
  render: (row: T, index: number) => ReactNode;
};

export function DynamicTable<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage = "No rows to display.",
  virtualizeAt = DYNAMIC_TABLE_VIRTUALIZE_AT,
  scrollClassName,
  tableClassName,
  className,
  footer,
  rowClassName,
  onRowClick,
  estimateRowHeight = 44,
}: {
  columns: DynamicTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  emptyMessage?: string;
  /** Set to 0 to always render inline; set high to disable virtualization. */
  virtualizeAt?: number;
  scrollClassName?: string;
  tableClassName?: string;
  className?: string;
  footer?: ReactNode;
  rowClassName?: (row: T, index: number) => string | undefined;
  onRowClick?: (row: T, index: number) => void;
  estimateRowHeight?: number;
}) {
  const colSpan = columns.length;
  const shouldVirtualize = virtualizeAt > 0 && rows.length >= virtualizeAt;

  const thead = (
    <tr>
      {columns.map((col) => (
        <th
          key={col.key}
          className={cn(
            col.align === "right" && "text-right",
            col.align === "center" && "text-center",
            col.headerClassName,
          )}
        >
          {col.header}
        </th>
      ))}
    </tr>
  );

  const renderCells = (row: T, index: number) =>
    columns.map((col) => (
      <td
        key={col.key}
        className={cn(
          col.align === "right" && "text-right",
          col.align === "center" && "text-center",
          typeof col.cellClassName === "function" ? col.cellClassName(row, index) : col.cellClassName,
        )}
      >
        {col.render(row, index)}
      </td>
    ));

  const renderRow = (row: T, index: number) => (
    <tr
      className={cn(
        rowClassName?.(row, index),
        index % 2 === 1 && "data-table-row-alt",
        onRowClick && "cursor-pointer",
      )}
      onClick={onRowClick ? () => onRowClick(row, index) : undefined}
    >
      {renderCells(row, index)}
    </tr>
  );

  if (rows.length === 0) {
    return (
      <DataTable className={className} scrollClassName={scrollClassName} tableClassName={tableClassName}>
        <thead>{thead}</thead>
        <tbody>
          <tr>
            <td colSpan={colSpan}>{emptyMessage}</td>
          </tr>
        </tbody>
      </DataTable>
    );
  }

  if (shouldVirtualize) {
    return (
      <VirtualizedTableSection
        colSpan={colSpan}
        estimateRowHeight={estimateRowHeight}
        rowCount={rows.length}
        scrollClassName={cn("data-table-premium-wrap max-h-[min(72vh,780px)] overflow-auto", scrollClassName)}
        tableClassName={cn("data-table-premium text-sm", tableClassName)}
        thead={thead}
      >
        {(index) => {
          const row = rows[index]!;
          return renderRow(row, index);
        }}
      </VirtualizedTableSection>
    );
  }

  return (
    <DataTable className={className} scrollClassName={scrollClassName} tableClassName={tableClassName}>
      <thead>{thead}</thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={getRowKey(row, index)}
            className={cn(
              rowClassName?.(row, index),
              index % 2 === 1 && "data-table-row-alt",
              onRowClick && "cursor-pointer",
            )}
            onClick={onRowClick ? () => onRowClick(row, index) : undefined}
          >
            {renderCells(row, index)}
          </tr>
        ))}
        {footer}
      </tbody>
    </DataTable>
  );
}
