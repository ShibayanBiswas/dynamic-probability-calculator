"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { cloneElement, isValidElement, useEffect, useRef, type ReactElement, type ReactNode } from "react";

/**
 * Virtualized tbody inside a scroll container — same table markup/classes as DataTable rows.
 * Only renders visible rows; format and columns stay unchanged.
 *
 * Row striping must use `data-table-row-alt` on `<tr>` (index % 2) — not CSS nth-child,
 * because spacer rows and virtualization break nth-child zebra patterns.
 */
export function VirtualizedTableSection({
  scrollClassName,
  thead,
  rowCount,
  colSpan,
  emptyState,
  estimateRowHeight = 44,
  tableClassName = "data-table w-full text-sm",
  children,
}: {
  scrollClassName?: string;
  thead: ReactNode;
  rowCount: number;
  colSpan: number;
  emptyState?: ReactNode;
  estimateRowHeight?: number;
  tableClassName?: string;
  children: (index: number) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual returns non-memoizable functions; safe for scroll virtualization only.
  // eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/react-virtual
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 4,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowCount, rowVirtualizer]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0);

  return (
    <div ref={scrollRef} className={scrollClassName}>
      <table className={tableClassName}>
        <thead className="sticky top-0 z-[2] bg-[var(--ar-surface)] shadow-[0_1px_0_0_var(--ar-border)] dark:shadow-[0_1px_0_0_rgba(168,162,158,0.2)]">{thead}</thead>
        <tbody>
          {rowCount === 0 ? emptyState : null}
          {rowCount > 0 && paddingTop > 0 ? (
            <tr aria-hidden>
              <td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {virtualRows.map((virtualRow) => {
            const row = children(virtualRow.index);
            if (isValidElement(row)) {
              return cloneElement(row as ReactElement<{ "data-virtual-index"?: number }>, {
                key: virtualRow.index,
                "data-virtual-index": virtualRow.index,
              });
            }
            return (
              <tr key={virtualRow.index} data-virtual-index={virtualRow.index}>
                {row}
              </tr>
            );
          })}
          {rowCount > 0 && paddingBottom > 0 ? (
            <tr aria-hidden>
              <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
