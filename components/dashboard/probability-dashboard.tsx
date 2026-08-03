"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ExcelInputPanel } from "@/components/dashboard/excel-input-panel";
import { LifecycleProductList } from "@/components/dashboard/lifecycle-product-list";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import {
  AppPage,
  FieldRow,
  FieldStack,
  KpiBand,
  Output,
  OutputGlow,
  Panel,
  SectionTitle,
  SubPageTabs,
  SubTitle,
} from "@/components/layout/app-ui";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import { useDataset } from "@/lib/context/dataset-provider";
import { useMasterProducts } from "@/lib/hooks/use-master-products";
import { useLifecycleFilter } from "@/lib/hooks/use-lifecycle-filter";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import {
  pickLifecyclePoolProduct,
  useLifecycleProductPick,
  useResyncProductToLifecyclePool,
} from "@/lib/hooks/use-lifecycle-pool-product";
import {
  getLifecyclePickerPool,
  type LifecycleFilter,
  LIFECYCLE_FILTER_LABELS,
  UI_LIFECYCLE_FILTERS,
} from "@/lib/product-lifecycle";
import {
  getIndexEntryLevelRaw,
  getTargetLevel,
  rawField,
} from "@/lib/product-utils";
import {
  getProductAllotmentDate,
  getProductMaturityDate,
  getProductTenorDays,
  phasePerformanceStartLabel,
} from "@/lib/product-dates";
import {
  daysLeftToLastObservation,
  requiredPercent,
  targetPercent,
  type ProbabilityRunResult,
} from "@/lib/probability/engine";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";
import { formatNumber, formatPercent } from "@/lib/utils";
import { MasterUploadButton } from "@/components/ui/master-upload-button";

export type ProbabilitySurface = "summary" | "initial" | "current";

const TABS = [
  { id: "interface", label: "Probability Interface" },
  { id: "products", label: "Product List" },
];

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatPercent(value);
}

function formatLevel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatNumber(value, 2);
}

function ScheduleCard({
  result,
  daysRowLabel,
  baseLabel,
}: {
  result: ProbabilityRunResult | null;
  daysRowLabel: string;
  baseLabel: string;
}) {
  if (!result) {
    return (
      <Panel className="!p-4" glow="cyan">
        <SectionTitle>Observation Schedule</SectionTitle>
        <p className="mt-2 text-sm text-stone-500">Select a product to load observation dates and day offsets.</p>
      </Panel>
    );
  }
  const present = result.schedule.filter((s) => s.date);
  return (
    <Panel className="!p-4" glow="cyan">
      <SectionTitle>Observation Schedule</SectionTitle>
      <p className="mt-1 text-sm text-stone-500">
        Average slots are observation dates. {daysRowLabel} are measured from {baseLabel}.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--ar-border)] text-left text-stone-500">
              <th className="px-2 py-2 font-semibold">Average</th>
              {present.map((s) => (
                <th key={s.index} className="px-2 py-2 font-semibold">
                  {s.index}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[color:var(--ar-border)]">
              <td className="px-2 py-2 font-semibold">Dates</td>
              {present.map((s) => (
                <td key={`d-${s.index}`} className="px-2 py-2">
                  {s.date ? formatDisplayDate(s.date) : "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-2 py-2 font-semibold">{daysRowLabel}</td>
              {present.map((s) => (
                <td key={`dy-${s.index}`} className="px-2 py-2">
                  {formatNumber(s.daysFromBase, 2)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PathBacktestTable({
  result,
  showAdjustedStart,
}: {
  result: ProbabilityRunResult | null;
  showAdjustedStart: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const paths = result?.paths ?? [];
  const presentIndexes = result
    ? result.schedule.map((s, i) => (s.date ? i : -1)).filter((i) => i >= 0)
    : [];
  const displayPaths = showAll ? paths : paths.filter((p) => p.pathIncluded);
  const rowCount = displayPaths.length;
  const colCount = 3 + (showAdjustedStart ? 1 : 0) + presentIndexes.length * 2 + 3;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 24,
  });

  if (!result) {
    return (
      <Panel className="!p-4" glow="purple">
        <SectionTitle>Historical Path Backtest</SectionTitle>
        <p className="mt-2 text-sm text-stone-500">Run a product to populate daily historical paths.</p>
      </Panel>
    );
  }

  return (
    <Panel className="!p-4" glow="purple">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <SectionTitle>Historical Path Backtest</SectionTitle>
          <p className="mt-1 text-sm text-stone-500">
            Each row is one daily path. The last included path has its final observation on the latest trading day.
          </p>
        </div>
        <button
          type="button"
          className="nav-sub-pill"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show included paths only" : "Show all paths"}
        </button>
      </div>
      <div
        ref={parentRef}
        className="mt-3 max-h-[28rem] overflow-auto rounded-lg border border-[color:var(--ar-border)]"
      >
        <div className="min-w-max">
          <div
            className="sticky top-0 z-10 grid gap-2 border-b border-[color:var(--ar-border)] bg-[color:var(--ar-surface)] px-2 py-2 text-xs font-semibold text-stone-500"
            style={{
              gridTemplateColumns: `repeat(${colCount}, minmax(7rem, auto))`,
            }}
          >
            <span>Start</span>
            <span>Underlying Closing Level</span>
            {showAdjustedStart ? <span>Start Level</span> : null}
            {presentIndexes.map((idx) => (
              <span key={`od-${idx}`}>Average Date {idx + 1}</span>
            ))}
            {presentIndexes.map((idx) => (
              <span key={`ol-${idx}`}>Average Level {idx + 1}</span>
            ))}
            <span>Average Underlying Level</span>
            <span>Underlying Performance</span>
            <span>Path Taken</span>
          </div>
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = displayPaths[virtualRow.index]!;
              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 grid w-full gap-2 border-b border-[color:var(--ar-border)] px-2 py-1.5 text-xs"
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${colCount}, minmax(7rem, auto))`,
                  }}
                >
                  <span>{row.pathStartDate}</span>
                  <span>{formatLevel(row.underlyingClosingLevel)}</span>
                  {showAdjustedStart ? <span>{formatLevel(row.adjustedStartLevel)}</span> : null}
                  {presentIndexes.map((idx) => (
                    <span key={`pd-${idx}`}>{row.observationDates[idx] ?? "—"}</span>
                  ))}
                  {presentIndexes.map((idx) => (
                    <span key={`pl-${idx}`}>{formatLevel(row.observationLevels[idx])}</span>
                  ))}
                  <span>{formatLevel(row.averageObservationLevel)}</span>
                  <span>{formatPct(row.underlyingPerformance)}</span>
                  <span>{row.pathIncluded ? "Yes" : "No"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        Showing {formatNumber(rowCount, 0)} of {formatNumber(paths.length, 0)} paths · Included {formatNumber(result.includedCount, 0)} · Successes {formatNumber(result.successCount, 0)}
      </p>
    </Panel>
  );
}

export function ProbabilityDashboard({ surface }: { surface: ProbabilitySurface }) {
  const masterProducts = useMasterProducts();
  const { dataset } = useDataset();
  const selection = useProductSelection();
  const { asOf } = usePortfolioClock();
  const { filter: lifecycle, setFilter: setLifecycle } = useLifecycleFilter("ongoing");
  const [tab, setTab] = useState("interface");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialResult, setInitialResult] = useState<ProbabilityRunResult | null>(null);
  const [currentResult, setCurrentResult] = useState<ProbabilityRunResult | null>(null);

  const pool = useMemo(
    () => getLifecyclePickerPool(masterProducts, lifecycle, asOf),
    [masterProducts, lifecycle, asOf],
  );

  useResyncProductToLifecyclePool(pool, lifecycle, asOf);
  const { selectFromPool, resetToLifecycleDefaults } = useLifecycleProductPick(pool, lifecycle, asOf);
  const product = pickLifecyclePoolProduct(pool, selection.resolvedProduct, lifecycle, asOf);

  const valuationDate = useMemo(
    () => parseExcelishDate(selection.valuationDate) ?? asOf,
    [selection.valuationDate, asOf],
  );

  const niftyLevel = Number(selection.niftyLevel) || undefined;
  const sensexLevel = Number(selection.sensexLevel) || undefined;

  const runProbability = useCallback(async () => {
    if (!product?.isin) return;
    setLoading(true);
    setError(null);
    try {
      const mode =
        surface === "summary" ? "both" : surface === "initial" ? "initial" : "current";
      const res = await fetch("/api/probability/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isin: product.isin,
          mode,
          valuationDate: selection.valuationDate,
          niftyLevel,
          sensexLevel,
          includePaths: surface !== "summary",
          bookRevision: `${dataset.workbookName}:${dataset.loadedAt}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Probability run failed");
        setInitialResult(null);
        setCurrentResult(null);
        return;
      }
      setInitialResult((json.initial as ProbabilityRunResult) ?? null);
      setCurrentResult((json.current as ProbabilityRunResult) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Probability run failed");
    } finally {
      setLoading(false);
    }
  }, [
    product?.isin,
    surface,
    selection.valuationDate,
    niftyLevel,
    sensexLevel,
    dataset.workbookName,
    dataset.loadedAt,
  ]);

  useEffect(() => {
    void runProbability();
  }, [runProbability]);

  const activeResult = surface === "current" ? currentResult : initialResult;
  const startNoun = product ? phasePerformanceStartLabel(product) : "Allotment";

  const title =
    surface === "summary"
      ? "Probability"
      : surface === "initial"
        ? "Initial Probability"
        : "Current Probability";

  const tgt = product ? targetPercent(product) : null;
  const req = product ? requiredPercent(product, niftyLevel, sensexLevel) : null;
  const daysLeftObs = product ? daysLeftToLastObservation(product, valuationDate) : null;

  const kpiItems = useMemo(() => {
    if (surface === "summary") {
      return [
        { label: "Initial Probability", value: formatPct(initialResult?.probability) },
        { label: "Current Probability", value: formatPct(currentResult?.probability) },
        { label: "Target Percent", value: formatPct(tgt) },
        { label: "Percent Required", value: formatPct(req) },
        { label: "Days Left", value: daysLeftObs != null ? formatNumber(daysLeftObs, 0) : "—" },
      ];
    }
    const r = activeResult;
    return [
      { label: "Probability", value: formatPct(r?.probability) },
      { label: "Paths Taken", value: r ? formatNumber(r.includedCount, 0) : "—" },
      { label: "Successful Paths", value: r ? formatNumber(r.successCount, 0) : "—" },
      { label: "Success Threshold", value: formatPct(r?.threshold) },
      { label: "Latest Index Date", value: r?.lastIndexDate ?? "—" },
    ];
  }, [surface, initialResult, currentResult, activeResult, tgt, req, daysLeftObs]);

  return (
    <AppPage actions={<MasterUploadButton />} dense title={title}>
      <HorizontalBand>
        <SubPageTabs
          tabs={TABS}
          active={tab}
          onSelect={setTab}
        />
      </HorizontalBand>

      {tab === "products" ? (
        <HorizontalBand className="mt-4">
          <LifecycleProductList
            activeFilter={lifecycle}
            filter={lifecycle}
            products={masterProducts}
            onFilterChange={setLifecycle}
          />
        </HorizontalBand>
      ) : (
        <>
          <HorizontalBand className="mt-4">
            <Panel className="!p-4" glow="cyan">
              <div className="mb-3 flex flex-wrap gap-2">
                {UI_LIFECYCLE_FILTERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`nav-sub-pill ${lifecycle === key ? "nav-sub-pill-active" : ""}`}
                    onClick={() => setLifecycle(key as LifecycleFilter)}
                  >
                    {LIFECYCLE_FILTER_LABELS[key]}
                  </button>
                ))}
              </div>
              <ExcelInputPanel
                category="Primary"
                products={pool}
                mode="probability"
                lifecycleFilter={lifecycle}
                activeProduct={product ?? undefined}
                onPickProduct={selectFromPool}
                onResetDefaults={resetToLifecycleDefaults}
              />
            </Panel>
          </HorizontalBand>

          <HorizontalBand className="mt-4">
            <KpiBand accents={["cyan", "green", "purple", "amber", "rose"]} items={kpiItems} />
          </HorizontalBand>

          {error ? (
            <HorizontalBand className="mt-4">
              <div className="desk-alert" role="alert">
                {error}
              </div>
            </HorizontalBand>
          ) : null}

          {loading ? (
            <HorizontalBand className="mt-4">
              <p className="text-sm text-stone-500">Computing probability paths…</p>
            </HorizontalBand>
          ) : null}

          {surface === "summary" && product ? (
            <HorizontalBand className="mt-4">
              <Panel className="!p-4" glow="purple">
                <SectionTitle>Probability Results</SectionTitle>
                <SubTitle>Live results for the selected product and checking date</SubTitle>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <OutputGlow>
                    <FieldStack>
                      <FieldRow label="Name of Product">
                        <Output>{product.name}</Output>
                      </FieldRow>
                      <FieldRow label="ISIN">
                        <Output>{product.isin ?? "—"}</Output>
                      </FieldRow>
                      <FieldRow label="Allotment Date">
                        <Output>
                          {getProductAllotmentDate(product)
                            ? formatDisplayDate(getProductAllotmentDate(product)!)
                            : "—"}
                        </Output>
                      </FieldRow>
                      <FieldRow label="Maturity">
                        <Output>
                          {getProductMaturityDate(product)
                            ? formatDisplayDate(getProductMaturityDate(product)!)
                            : "—"}
                        </Output>
                      </FieldRow>
                      <FieldRow label="Tenor">
                        <Output>{formatNumber(getProductTenorDays(product) ?? 0, 0)}</Output>
                      </FieldRow>
                      <FieldRow label="Initial Entry Level">
                        <Output>{formatLevel(getIndexEntryLevelRaw(product))}</Output>
                      </FieldRow>
                      <FieldRow label="Target Level">
                        <Output>{formatLevel(getTargetLevel(product))}</Output>
                      </FieldRow>
                      <FieldRow label="Series">
                        <Output>{product.series ?? rawField(product, "Product Series") ?? "—"}</Output>
                      </FieldRow>
                    </FieldStack>
                  </OutputGlow>
                  <OutputGlow>
                    <FieldStack>
                      <FieldRow label="Initial Probability of Achieving Full Coupon">
                        <Output>{formatPct(initialResult?.probability)}</Output>
                      </FieldRow>
                      <FieldRow label="Target Percent">
                        <Output>{formatPct(tgt)}</Output>
                      </FieldRow>
                      <FieldRow label="Current Probability">
                        <Output>{formatPct(currentResult?.probability)}</Output>
                      </FieldRow>
                      <FieldRow label="Days Left">
                        <Output>{daysLeftObs != null ? formatNumber(daysLeftObs, 0) : "—"}</Output>
                      </FieldRow>
                      <FieldRow label="Percent Required">
                        <Output>{formatPct(req)}</Output>
                      </FieldRow>
                      <FieldRow label="Probability Checking Date">
                        <Output>{formatDisplayDate(valuationDate)}</Output>
                      </FieldRow>
                      <FieldRow label="Nifty Level">
                        <Output>{formatLevel(niftyLevel)}</Output>
                      </FieldRow>
                      <FieldRow label="Sensex Level">
                        <Output>{formatLevel(sensexLevel)}</Output>
                      </FieldRow>
                    </FieldStack>
                  </OutputGlow>
                </div>
                {(initialResult ?? currentResult) ? (
                  <div className="mt-4 overflow-x-auto">
                    <SubTitle>Observation Dates Average 1 to 7</SubTitle>
                    <table className="mt-2 min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--ar-border)] text-left text-stone-500">
                          <th className="px-2 py-2 font-semibold">Average</th>
                          {(initialResult ?? currentResult)!.schedule
                            .filter((s) => s.date)
                            .map((s) => (
                              <th key={s.index} className="px-2 py-2 font-semibold">
                                {s.index}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-2 py-2 font-semibold">Dates</td>
                          {(initialResult ?? currentResult)!.schedule
                            .filter((s) => s.date)
                            .map((s) => (
                              <td key={`avg-${s.index}`} className="px-2 py-2">
                                {s.date ? formatDisplayDate(s.date) : "—"}
                              </td>
                            ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </Panel>
            </HorizontalBand>
          ) : null}

          {surface !== "summary" ? (
            <>
              <HorizontalBand className="mt-4">
                <ScheduleCard
                  result={activeResult}
                  daysRowLabel={
                    surface === "initial" ? "Days from Phase Start" : "Days from Valuation Date"
                  }
                  baseLabel={
                    surface === "initial"
                      ? `the actual ${startNoun.toLowerCase()} start`
                      : "the valuation date"
                  }
                />
              </HorizontalBand>
              <HorizontalBand className="mt-4">
                <PathBacktestTable
                  result={activeResult}
                  showAdjustedStart={surface === "initial"}
                />
              </HorizontalBand>
            </>
          ) : null}
        </>
      )}
    </AppPage>
  );
}
