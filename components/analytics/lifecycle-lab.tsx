"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { KpiBand, Panel, SectionTitle, DataTable } from "@/components/layout/app-ui";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import { runWhenIdle } from "@/lib/client/idle-task";
import { resolveDeskIndexLevels } from "@/lib/desk-index-levels";
import { getLifecycleCategoryStats, type LifecycleCategoryStats, type StatSummary, type UnderlyingSpreadSection } from "@/lib/analytics";
import {
  filterProductsByLifecycle,
  LIFECYCLE_FILTER_LABELS,
  type LifecycleFilter,
} from "@/lib/product-lifecycle";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { deskDateKey } from "@/lib/market-data";
import type { ProductRecord } from "@/lib/types";
import { formatKpiNotional, formatNumber, formatPercent } from "@/lib/utils";

const SPREAD_METRICS = [
  { key: "initialLevel", label: "Initial Level", accent: "level" as const, format: "level" as const },
  { key: "finalLevel", label: "Target Level", accent: "level" as const, format: "level" as const },
  { key: "fullCoupon", label: "Full Coupon", accent: "coupon" as const, format: "coupon" as const },
] as const;

const clientStatsCache = new Map<string, LifecycleCategoryStats>();

export function LifecycleAnalyticsGrid({
  products,
  filter = "ongoing",
}: {
  products: ProductRecord[];
  filter?: LifecycleFilter;
}) {
  const { asOf } = usePortfolioClock();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/25 to-transparent" />
        <p className="desk-section-label">Lifecycle Category Analytics</p>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      </div>

      <LifecycleCategoryPanel asOf={asOf} filter={filter} products={products} />
    </div>
  );
}

function formatLevel(value: number | null) {
  return value != null ? formatNumber(value) : "—";
}

function formatSpreadCoupon(stat: StatSummary, value: number | null) {
  if (stat.count === 0 || value == null) return "—";
  return formatPercent(value, 1);
}

function formatSpreadValue(stat: StatSummary, value: number | null, kind: "level" | "coupon") {
  return kind === "level" ? formatLevel(value) : formatSpreadCoupon(stat, value);
}

function AnalyticsSpreadTable({
  sections,
  filter,
}: {
  sections: UnderlyingSpreadSection[];
  filter: LifecycleFilter;
}) {
  const atLastObs = filter === "expired";

  if (sections.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-gold/25 bg-panel px-5 py-4 text-sm text-muted">
        No products with an underlying in this lifecycle bucket.
      </div>
    );
  }

  return (
    <div className="desk-surface-card mt-5">
      <div className="desk-surface-header">
        <p className="desk-surface-title">Underlying Levels and Coupon Spread</p>
        <p className="mt-1 text-xs text-muted">
          {atLastObs
            ? "One table for every underlying in the master — levels from sheet fields; absolute return not aggregated for expired book"
            : "One table for every underlying in the master — Nifty, Sensex, single names, and any new row from upload"}
        </p>
      </div>
      <DataTable
        className="rounded-none border-0 shadow-none"
        scrollClassName="max-h-[min(70vh,720px)] overflow-auto"
        tableClassName="analytics-stats-table"
      >
        <thead className="sticky top-0 z-10 bg-panel backdrop-blur-sm">
          <tr>
            <th className="min-w-[140px]">Underlying</th>
            <th className="text-right">Products</th>
            <th className="min-w-[160px]">Metric</th>
            <th className="text-right">Minimum</th>
            <th className="text-right">Maximum</th>
            <th className="text-right">Average</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => {
            const metrics = SPREAD_METRICS.map((metric) => ({
              ...metric,
              stat: section[metric.key],
            }));

            return metrics.map((metric, rowIndex) => {
              const rowAccent =
                metric.accent === "coupon"
                  ? "border-l-4 border-l-gold/50"
                  : "border-l-4 border-l-gold/30";

              return (
                <tr key={`${section.underlying}-${metric.key}`} className={rowAccent}>
                  {rowIndex === 0 ? (
                    <>
                      <td className="py-3.5 pl-4 align-top font-semibold text-gold-dark" rowSpan={metrics.length}>
                        {section.underlying}
                      </td>
                      <td className="cell-value py-3.5 text-right align-top tabular-nums" rowSpan={metrics.length}>
                        {formatNumber(section.count)}
                      </td>
                    </>
                  ) : null}
                  <td className="cell-metric py-3.5 font-semibold text-stone-800 dark:text-stone-200">{metric.label}</td>
                  <td className="cell-value py-3.5 text-right">
                    {formatSpreadValue(metric.stat, metric.stat.min, metric.format)}
                  </td>
                  <td className="cell-value py-3.5 text-right">
                    {formatSpreadValue(metric.stat, metric.stat.max, metric.format)}
                  </td>
                  <td className="cell-value-highlight py-3.5 pr-4 text-right">
                    {formatSpreadValue(metric.stat, metric.stat.avg, metric.format)}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </DataTable>
    </div>
  );
}

function LifecycleCategoryPanel({
  products,
  filter,
  asOf,
}: {
  products: ProductRecord[];
  filter: LifecycleFilter;
  asOf: Date;
}) {
  const selection = useProductSelection();
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
  const pool = useMemo(() => filterProductsByLifecycle(products, filter, asOf), [products, filter, asOf]);
  const deferredPool = useDeferredValue(pool);
  const [stats, setStats] = useState<LifecycleCategoryStats | null>(null);
  const [statsKey, setStatsKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestGen = useRef(0);

  const computeKey = useMemo(() => {
    if (deferredPool.length === 0) return null;
    const nifty = niftyLevel && niftyLevel > 0 ? Math.round(niftyLevel) : 0;
    const sensex = sensexLevel && sensexLevel > 0 ? Math.round(sensexLevel) : 0;
    return `${filter}|${deskDateKey(asOf)}|${deferredPool.length}|${nifty}|${sensex}`;
  }, [deferredPool.length, filter, niftyLevel, sensexLevel, asOf]);

  useEffect(() => {
    if (!computeKey) {
      return;
    }

    const cached = clientStatsCache.get(computeKey);
    if (cached) {
      queueMicrotask(() => {
        setStats(cached);
        setStatsKey(computeKey);
        setLoading(false);
      });
      return;
    }

    // Avoid flashing another tab's AUM under the new filter label.
    const prevFilter = statsKey?.split("|")[0];
    if (prevFilter && prevFilter !== filter) {
      queueMicrotask(() => {
        setStats(null);
        setStatsKey(null);
      });
    }

    let cancelled = false;
    const gen = ++requestGen.current;
    queueMicrotask(() => {
      if (!cancelled && gen === requestGen.current) setLoading(true);
    });

    const params = new URLSearchParams({ filter });
    if (niftyLevel != null && niftyLevel > 0) params.set("nifty", String(niftyLevel));
    if (sensexLevel != null && sensexLevel > 0) params.set("sensex", String(sensexLevel));
    const controller = new AbortController();

    void fetch(`/api/analytics/category-stats?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: LifecycleCategoryStats | null) => {
        if (cancelled || gen !== requestGen.current || !json) return;
        clientStatsCache.set(computeKey, json);
        if (clientStatsCache.size > 16) {
          const oldest = clientStatsCache.keys().next().value;
          if (oldest) clientStatsCache.delete(oldest);
        }
        setStats(json);
        setStatsKey(computeKey);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled || gen !== requestGen.current) return;
        // Fallback: light client path off the critical paint (no expired Yahoo).
        runWhenIdle(() => {
          if (cancelled || gen !== requestGen.current) return;
          const next = getLifecycleCategoryStats(deferredPool, { niftyLevel, sensexLevel }, asOf);
          clientStatsCache.set(computeKey, next);
          setStats(next);
          setStatsKey(computeKey);
          setLoading(false);
        }, 120);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [computeKey, deferredPool, filter, niftyLevel, sensexLevel, asOf, statsKey]);

  const effectiveStats = !computeKey ? null : stats;
  const effectiveLoading = !computeKey ? false : loading;
  const label = LIFECYCLE_FILTER_LABELS[filter];
  const showingStale = Boolean(effectiveStats && statsKey !== computeKey);

  if (pool.length === 0) {
    return (
      <Panel className="!p-5" glow="purple">
        <p className="text-center text-sm text-stone-600">No products in {label.toLowerCase()}.</p>
      </Panel>
    );
  }

  if (!effectiveStats) {
    return (
      <Panel className="!p-5" glow={filter === "expired" ? "purple" : "cyan"}>
        <SectionTitle>{label}</SectionTitle>
        <p className="mt-4 text-center text-sm text-stone-500">
          {filter === "expired"
            ? "Computing expired marks with historical underlying index levels…"
            : "Computing category analytics…"}
        </p>
      </Panel>
    );
  }

  return (
    <HorizontalBand>
      <Panel className="!p-4" glow={filter === "expired" ? "purple" : "cyan"}>
        <SectionTitle>{label}</SectionTitle>
        <p className="mt-1 text-sm text-stone-500">
          {formatNumber(pool.length)} products · {effectiveStats.underlyingSpreads.length} underlyings
          {effectiveLoading || showingStale ? " · refreshing…" : null}
          {filter === "expired" && effectiveStats.currentCoupon.count > 0 ? (
            <>
              {" "}
              · AUM-weighted return across {formatNumber(effectiveStats.currentCoupon.count)} marked products
            </>
          ) : null}
        </p>
        <div className="mt-4">
          <KpiBand
            accents={["cyan", "green", "purple", "amber"]}
            items={[
              { label: "AUM", value: formatKpiNotional(effectiveStats.aum) },
              { label: "Avg Full Coupon", value: formatPercent(effectiveStats.averageCoupon) },
              { label: "Products", value: formatNumber(pool.length) },
              { label: "Listed", value: formatPercent(effectiveStats.listedShare) },
            ]}
          />
        </div>

        <AnalyticsSpreadTable filter={filter} sections={effectiveStats.underlyingSpreads} />
      </Panel>
    </HorizontalBand>
  );
}
