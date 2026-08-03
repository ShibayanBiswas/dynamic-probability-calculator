"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";

import {
  Button,
  Panel,
  SectionTitle,
} from "@/components/layout/app-ui";
import { VirtualizedTableSection } from "@/components/ui/virtual-table-body";
import {
  filterProductsByLifecycle,
  getDaysToExpiry,
  getDaysToNextObservation,
  getObservationUrgency,
  getProductLifecycleStatus,
  isObservationDueFilter,
  lifecycleListBadgeLabel,
  LIFECYCLE_FILTER_LABELS,
  LIFECYCLE_FILTERS,
  UI_LIFECYCLE_FILTERS,
  type LifecycleFilter,
  type LifecycleStatus,
} from "@/lib/product-lifecycle";
import {
  formatPortfolioLifecycleValue,
  portfolioLifecycleCellValues,
  portfolioLifecycleHeaderAlign,
  portfolioLifecycleTableHeaders,
} from "@/lib/portfolio-lifecycle-columns";
import { useDataset } from "@/lib/context/dataset-provider";
import { resolveDeskIndexLevels } from "@/lib/desk-index-levels";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import {
  downloadLifecycleWorkbook,
  downloadProductsExcel,
} from "@/lib/workbook/export-products";
import { buildDeskExportFilename } from "@/lib/workbook/export-filename";
import { usePortfolioSnapshotMap } from "@/lib/hooks/use-portfolio-snapshot-map";
import { useLazyPortfolioProbabilities } from "@/lib/hooks/use-lazy-portfolio-probabilities";
import {
  lifecyclePortfolioColumnLabels,
  portfolioDaysColumnHint,
  portfolioLifecycleColumnHint,
} from "@/lib/valuation-labels";
import type { ProductRecord } from "@/lib/types";
import {
  cn,
  formatKpiNotional,
  formatNumber,
} from "@/lib/utils";

const STATUS_BADGE: Record<LifecycleStatus, string> = {
  ongoing: "status-badge status-badge-ongoing",
  perpetual: "status-badge status-badge-perpetual",
  "expiring-3m": "status-badge status-badge-expiring-3m",
  "expiring-1m": "status-badge status-badge-expiring-1m",
  expired: "status-badge status-badge-expired",
  upcoming: "status-badge status-badge-upcoming",
  unknown: "status-badge status-badge-unknown",
};

export function LifecycleProductList({
  products,
  selectedId,
  onSelect,
  defaultFilter = "ongoing",
  filter: controlledFilter,
  onFilterChange,
  showSearch = true,
  showFilterPills = true,
  compact,
  activeFilter,
}: {
  products: ProductRecord[];
  selectedId?: string;
  onSelect?: (product: ProductRecord) => void;
  defaultFilter?: LifecycleFilter;
  filter?: LifecycleFilter;
  onFilterChange?: (filter: LifecycleFilter) => void;
  showSearch?: boolean;
  showFilterPills?: boolean;
  compact?: boolean;
  /** When set, scopes snapshot / export labels to this lifecycle tab. Status badges always use true product status. */
  activeFilter?: LifecycleFilter;
}) {
  const { asOf } = usePortfolioClock();
  const { dataset } = useDataset();
  const selection = useProductSelection();
  const [internalFilter, setInternalFilter] = useState<LifecycleFilter>(defaultFilter);
  const lifecycle = controlledFilter ?? internalFilter;
  const badgeFilter = activeFilter ?? lifecycle;
  const setLifecycle = onFilterChange ?? setInternalFilter;
  const [query, setQuery] = useState("");

  const deskLevels = useMemo(
    () =>
      resolveDeskIndexLevels(
        {
          niftyLevel: Number(selection.niftyLevel) || selection.marketLevels?.niftyLevel,
          sensexLevel: Number(selection.sensexLevel) || selection.marketLevels?.sensexLevel,
        },
        asOf,
      ),
    [selection.niftyLevel, selection.sensexLevel, selection.marketLevels, asOf],
  );
  const { niftyLevel, sensexLevel } = deskLevels;
  const snapshotPool = useMemo(
    () => filterProductsByLifecycle(products, lifecycle, asOf),
    [products, lifecycle, asOf],
  );
  const snapshotInputs = useMemo(
    () => ({ asOf, niftyLevel, sensexLevel }),
    [asOf, niftyLevel, sensexLevel],
  );
  const { snapshotByRowId, isLoading: snapshotsLoading } = usePortfolioSnapshotMap(
    snapshotPool,
    lifecycle,
    snapshotInputs,
    dataset.loadedAt,
    products,
  );

  const getLiveValuation = (product: ProductRecord) =>
    snapshotByRowId.get(product.rowId) ?? {
      valuationDate: "",
      value: null,
      totalAmount: null,
      absReturn: null,
      couponFormed: null,
      productIrr: null,
    };

  const filtered = useMemo(() => {
    if (!query.trim()) return snapshotPool;
    const needle = query.toLowerCase();
    return snapshotPool.filter((p) =>
      [p.name, p.isin, p.series, p.issuer, p.underlying]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [snapshotPool, query]);

  useLazyPortfolioProbabilities(filtered);

  const columnLabels = useMemo(() => lifecyclePortfolioColumnLabels(lifecycle), [lifecycle]);
  const tableHeaders = useMemo(
    () => portfolioLifecycleTableHeaders(columnLabels, lifecycle),
    [columnLabels, lifecycle],
  );
  const tableColCount = tableHeaders.length;

  const notional = useMemo(
    () => filtered.reduce((sum, p) => sum + (p.tradeAmount ?? 0), 0),
    [filtered],
  );

  const handleDownload = () => {
    if (filtered.length === 0) return;
    void downloadProductsExcel(
      filtered,
      buildDeskExportFilename({
        screen: LIFECYCLE_FILTER_LABELS[lifecycle],
        asOf,
        extension: "xlsx",
      }),
      {
        sheetName: LIFECYCLE_FILTER_LABELS[lifecycle].slice(0, 31),
        asOf,
        niftyLevel,
        sensexLevel,
        lifecycleFilter: lifecycle,
      },
    );
  };

  const handleDownloadAll = () => {
    if (products.length === 0) return;
    void downloadLifecycleWorkbook(products, undefined, asOf, { niftyLevel, sensexLevel });
  };

  return (
    <Panel className={compact ? "!p-3" : "!p-4"} glow="cyan">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle>Portfolio by Lifecycle</SectionTitle>
          <p className="mt-1 text-sm text-stone-500">
            {products.length === 0
              ? "Upload the New Product Master file to load the portfolio."
              : `${formatNumber(filtered.length)} products · ${formatKpiNotional(notional)} notional · `}
            {products.length > 0 ? (
              <>
                {snapshotsLoading ? (
                  <span className="text-amber-800">Computing live marks from desk index levels… · </span>
                ) : null}
                <span suppressHydrationWarning>as of {asOf.toLocaleString("en-IN")}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={filtered.length === 0} variant="ghost" onClick={handleDownload}>
            <Download className="h-4 w-4" />
            Export view
          </Button>
          <Button disabled={products.length === 0} variant="accent" onClick={handleDownloadAll}>
            <Download className="h-4 w-4" />
            Full workbook
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {showFilterPills
          ? UI_LIFECYCLE_FILTERS.map((key) => (
              <Button key={key} active={lifecycle === key} variant="pill" onClick={() => setLifecycle(key)}>
                {LIFECYCLE_FILTER_LABELS[key]}
              </Button>
            ))
          : null}
      </div>

      {showSearch ? (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
          <input
            className="input-glow w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none"
            placeholder="Search name, ISIN, issuer, underlying…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}

      <VirtualizedTableSection
        colSpan={tableColCount}
        rowCount={filtered.length}
        scrollClassName={`mt-4 overflow-auto rounded-2xl border border-stone-200 [-webkit-overflow-scrolling:touch] dark:border-stone-700 ${compact ? "max-h-[min(48vh,480px)]" : "max-h-[min(72vh,720px)]"}`}
        emptyState={
          <tr>
            <td className="py-12 text-center text-stone-500" colSpan={tableColCount}>
              {products.length === 0
                ? "Upload the New Product Master file to load the portfolio."
                : `No products match this lifecycle view${query.trim() ? " or search" : ""}.`}
            </td>
          </tr>
        }
        thead={
          <tr className="whitespace-nowrap">
            {tableHeaders.map((header) => {
              const align = portfolioLifecycleHeaderAlign(header, columnLabels);
              const title =
                portfolioLifecycleColumnHint(header, lifecycle) ??
                (header === columnLabels.daysColumn ? portfolioDaysColumnHint(lifecycle) : undefined);
              return (
                <th
                  key={header}
                  className={align === "right" ? "text-right" : undefined}
                  title={title}
                >
                  {header}
                </th>
              );
            })}
          </tr>
        }
      >
        {(index) => {
          const p = filtered[index]!;
          const selected = p.rowId === selectedId;
          const live = getLiveValuation(p);
          const rowStatus = getProductLifecycleStatus(p, asOf);
          const isExpiringRow = rowStatus === "expiring-1m" || rowStatus === "expiring-3m";
          const onObsTab = isObservationDueFilter(lifecycle);
          const observationDays = onObsTab ? getDaysToNextObservation(p, asOf) : undefined;
          const observationUrgency = getObservationUrgency(observationDays);
          const rawDays = getDaysToExpiry(p, asOf);
          const statusLabel = lifecycleListBadgeLabel(rowStatus, badgeFilter);
          // Build the full row once — avoids ~40× export rebuilds per visible product.
          const values = portfolioLifecycleCellValues({
            index,
            product: p,
            snapshot: live,
            labels: columnLabels,
            asOf,
            badgeFilter,
          });
          const daysCritical =
            lifecycle !== "expired" && rawDays != null && rawDays >= 0 && rawDays <= 30;
          const daysUrgent =
            lifecycle !== "expired" &&
            !daysCritical &&
            ((rawDays != null && rawDays > 30 && rawDays <= 90) || isExpiringRow);

          return (
            <tr
              key={p.rowId}
              className={cn(
                "whitespace-nowrap",
                index % 2 === 1 && "data-table-row-alt",
                observationUrgency === "near" && "observation-row-near",
                observationUrgency === "scheduled" && "observation-row-scheduled",
                onSelect && "cursor-pointer",
                selected && "current-row",
              )}
              onClick={onSelect ? () => onSelect(p) : undefined}
            >
              {tableHeaders.map((header) => {
                const align = portfolioLifecycleHeaderAlign(header, columnLabels);
                const display =
                  header === "Status"
                    ? statusLabel
                    : formatPortfolioLifecycleValue(header, values[header], columnLabels);
                const isIndex = header === "#";
                const isName = header === "Name";
                const isIsin = header === "ISIN";
                const isStatus = header === "Status";
                const isDays = header === columnLabels.daysColumn;
                const isProb = header === "Initial Prob" || header === "Current Prob";
                const isEffectiveTarget = header === "Effective Target";
                const isDate =
                  header.includes("Date") ||
                  header.startsWith("Observation") ||
                  header === columnLabels.markDate;

                return (
                  <td
                    key={`${p.rowId}-${header}`}
                    className={cn(
                      align === "right" && "text-right tabular-nums",
                      isIndex && "font-mono text-xs text-stone-500",
                      isName && "max-w-[9.5rem] truncate font-medium text-ink sm:max-w-[240px]",
                      isIsin && "font-mono text-xs text-stone-600",
                      isStatus && "min-w-[9.5rem]",
                      isDays && "font-mono text-xs",
                      isDays && daysCritical && "status-days-critical",
                      isDays && daysUrgent && "status-days-urgent",
                      isDays && lifecycle === "expired" && "text-stone-600",
                      isDays &&
                        rawDays != null &&
                        rawDays < 0 &&
                        lifecycle !== "expired" &&
                        "text-stone-500",
                      !isName && !isIsin && !isStatus && !isDays && "text-stone-700",
                      isProb && "font-semibold text-maroon",
                      isEffectiveTarget && "font-semibold text-ink",
                      isDate && "whitespace-nowrap text-xs text-stone-600",
                    )}
                  >
                    {isStatus ? (
                      <span
                        className={cn(
                          // Observation Due tabs: red (≤7D) vs green (further) — not all red.
                          // Expiring / Ongoing tabs: true lifecycle colour (1M red, 3M amber, Ongoing green).
                          onObsTab && observationUrgency === "near"
                            ? "status-badge status-badge-observation-near"
                            : onObsTab && observationUrgency === "scheduled"
                              ? "status-badge status-badge-observation-scheduled"
                              : STATUS_BADGE[rowStatus],
                        )}
                        title={
                          observationDays != null
                            ? `Next observation ${observationDays === 0 ? "is due today" : `is due in ${observationDays} days`}`
                            : undefined
                        }
                      >
                        {display}
                        {observationDays != null ? ` · ${observationDays}D` : ""}
                      </span>
                    ) : (
                      display
                    )}
                  </td>
                );
              })}
            </tr>
          );
        }}
      </VirtualizedTableSection>
    </Panel>
  );
}
