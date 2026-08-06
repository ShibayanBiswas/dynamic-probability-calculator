"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Download, FileText } from "lucide-react";

import { ExcelInputPanel } from "@/components/dashboard/excel-input-panel";
import { LifecycleProductList } from "@/components/dashboard/lifecycle-product-list";
import { PastFinalObservationPanels } from "@/components/dashboard/past-final-observation-panels";
import { ProductSpecificationsPanel } from "@/components/dashboard/product-specifications-panel";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import {
  AppPage,
  Button,
  KpiBand,
  Panel,
  SectionInfo,
  SectionTitle,
  SubPageTabs,
  SubTitle,
} from "@/components/layout/app-ui";
import { PathLoadProgress } from "@/components/ui/path-load-progress";
import { RevealOutput } from "@/components/ui/reveal-output";
import { UniformSpecRail, useUniformSpecCardSize, type SpecRailCard } from "@/components/ui/spec-rail";
import { MasterUploadButton } from "@/components/ui/master-upload-button";
import { useScreenExport } from "@/lib/hooks/use-screen-excel-export";
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
  getCouponLabel,
  getIndexEntryLevelRaw,
  getProductIndexFieldLabel,
  getTargetLevel,
  isSensexLinked,
  rawField,
} from "@/lib/product-utils";
import {
  getProductAllotmentDate,
  getProductMaturityDate,
  getProductTenorDays,
  phasePerformanceStartLabel,
} from "@/lib/product-dates";
import {
  getProbabilityCheckingDate,
  hasPassedFinalObservation,
  hydrateProbabilityRunResult,
} from "@/lib/probability/as-of";
import {
  daysLeftToLastObservation,
  requiredUnderlying,
  requiredUnderlyingFromHurdleLevel,
  targetUnderlying,
  type ProbabilityRunResult,
} from "@/lib/probability/engine";
import {
  resolveHistoricalNiftyLevel,
  resolveHistoricalSensexLevel,
} from "@/lib/expired-mark";
import { SECTION_INFO } from "@/lib/section-info";
import { formatDeskDate } from "@/lib/market-data";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";
import { formatNumber, formatPercent, formatReportAsOf } from "@/lib/utils";
import type { ProductRecord } from "@/lib/types";

export type ProbabilitySurface = "summary" | "initial" | "current";

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatPercent(value);
}

function formatLevel(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatNumber(value, 2);
}

function interfaceTabLabel(surface: ProbabilitySurface): string {
  if (surface === "summary") return "Probability Interface";
  if (surface === "initial") return "Initial Probability Interface";
  return "Current Probability Interface";
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
  // Present slots only — display as 1…N regardless of master Average 1–7 column index.
  const present = result.schedule.filter((s) => s.date);
  const isCurrent = result.mode === "current";
  if (present.length === 0) {
    return (
      <Panel className="!p-4" glow="cyan">
        <SectionTitle>Observation Schedule</SectionTitle>
        <p className="mt-2 text-sm text-stone-500">No observation dates on this product.</p>
      </Panel>
    );
  }
  return (
    <Panel className="!p-4" glow="cyan">
      <SectionTitle>Observation Schedule</SectionTitle>
      <p className="mt-1 text-sm text-stone-500">
        Observation slots and day offsets. {daysRowLabel} are measured from {baseLabel}.
        {isCurrent
          ? " Passed slots stay visible here; the path average uses remaining slots only."
          : ""}
      </p>
      <div className="schedule-table-wrap mt-3 w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="schedule-table w-full min-w-full text-sm">
          <thead>
            <tr>
              <th scope="col">Observation</th>
              {present.map((_s, displayIdx) => (
                <th key={`h-${displayIdx}`} scope="col">
                  {displayIdx + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Dates</th>
              {present.map((s, displayIdx) => (
                <td key={`d-${displayIdx}`} className="whitespace-nowrap">
                  {s.date ? formatDisplayDate(s.date) : "—"}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">{daysRowLabel}</th>
              {present.map((s, displayIdx) => (
                <td key={`dy-${displayIdx}`} className="whitespace-nowrap tabular-nums">
                  {formatNumber(s.daysFromBase, 0)}
                </td>
              ))}
            </tr>
            {isCurrent ? (
              <tr>
                <th scope="row">Status</th>
                {present.map((s, displayIdx) => (
                  <td
                    key={`st-${displayIdx}`}
                    className={
                      s.daysFromBase > 0
                        ? "whitespace-nowrap text-stone-700"
                        : "whitespace-nowrap text-stone-400"
                    }
                  >
                    {s.daysFromBase > 0 ? "Remaining" : "Already passed"}
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

type PathViewFilter = "included" | "excluded" | "all";

function PathBacktestTable({
  result,
  showAdjustedStart,
  loadingPaths,
  product,
  mode = "initial",
}: {
  result: ProbabilityRunResult | null;
  showAdjustedStart: boolean;
  loadingPaths?: boolean;
  product?: ProductRecord | null;
  mode?: "initial" | "current";
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  // Default All paths — same as Excel Initial Prob / Backtesting sheets showing Yes and No.
  const [pathFilter, setPathFilter] = useState<PathViewFilter>("all");
  const [exportingPaths, setExportingPaths] = useState(false);
  const paths = result?.paths ?? [];
  // One column per present schedule slot; passed Current slots render as ALREADY PASSED.
  const presentIndexes = result
    ? result.schedule.map((s, i) => (s.date ? i : -1)).filter((i) => i >= 0)
    : [];
  const averagedIndexes = new Set(
    result
      ? result.schedule
          .map((s, i) => (s.date && (result.mode === "initial" || s.daysFromBase > 0) ? i : -1))
          .filter((i) => i >= 0)
      : [],
  );
  const displayPaths = paths.filter((p) => {
    if (pathFilter === "included") return p.pathIncluded;
    if (pathFilter === "excluded") return !p.pathIncluded;
    return true;
  });
  const rowCount = displayPaths.length;
  const colCount = 3 + (showAdjustedStart ? 1 : 0) + presentIndexes.length * 2 + 3;
  const seriesStart = paths[0]?.pathStartDate ?? null;
  const lastIncluded = [...paths].reverse().find((p) => p.pathIncluded) ?? null;
  const lastIncludedFinalObs =
    lastIncluded?.observationDates.filter((d): d is string => Boolean(d)).at(-1) ?? null;
  const isInitial = (result?.mode ?? mode) === "initial";

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 24,
  });

  const pathLoadLabel = isInitial
    ? "Building daily historical paths from 2001-01-01 — same engine as the Gift AIF Backtester."
    : "Building daily historical paths through the latest trading session — same engine as the Gift AIF Backtester.";

  if (!result || paths.length === 0) {
    return (
      <Panel className="!p-4" glow="purple">
        <SectionTitle>Historical Path Backtest</SectionTitle>
        {loadingPaths ? (
          <PathLoadProgress key="path-load" active label={pathLoadLabel} />
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            {!result
              ? "Reveal output to load the path backtest."
              : "No path rows yet — open this panel after the path run finishes."}
          </p>
        )}
      </Panel>
    );
  }

  return (
    <Panel className="!p-4" glow="purple">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <SectionTitle>Historical Path Backtest</SectionTitle>
          <p className="mt-1 text-sm text-stone-500">
            {isInitial ? (
              <>
                Daily paths from <span className="font-semibold text-stone-700">2001-01-01</span>
                {seriesStart && seriesStart !== "2001-01-01" ? (
                  <>
                    {" "}
                    · series opens <span className="font-semibold text-stone-700">{seriesStart}</span>
                  </>
                ) : null}
                . Last included path ends so its final observation lands on the product{" "}
                <span className="font-semibold text-stone-700">Actual Start</span>
                {product ? (
                  <>
                    {" "}
                    · <span className="font-semibold text-stone-700">{phasePerformanceStartLabel(product)}</span>
                  </>
                ) : null}
                {result.lastIndexDate ? (
                  <>
                    {" "}
                    · series through <span className="font-semibold text-stone-700">{result.lastIndexDate}</span>
                  </>
                ) : null}
                . Scroll horizontally for every column.
              </>
            ) : (
              <>
                Averaged on remaining observations only — passed slots show{" "}
                <span className="font-semibold text-stone-700">ALREADY PASSED</span>. Hurdle uses{" "}
                <span className="font-semibold text-stone-700">Effective Target</span> when fixings
                have settled
                {result.effectiveTargetLevel != null && result.effectiveTargetLevel > 0 ? (
                  <>
                    {" "}
                    ·{" "}
                    <span className="font-semibold text-stone-700">
                      {formatNumber(result.effectiveTargetLevel, 2)}
                    </span>
                  </>
                ) : null}
                . Last included path final observation lands on the latest trading session
                {result.lastIndexDate ? (
                  <>
                    {" "}
                    · as of <span className="font-semibold text-stone-700">{result.lastIndexDate}</span>
                  </>
                ) : null}
                . Scroll horizontally for every column.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            active={pathFilter === "included"}
            variant="pill"
            onClick={() => setPathFilter("included")}
          >
            Included
          </Button>
          <Button
            active={pathFilter === "excluded"}
            variant="pill"
            onClick={() => setPathFilter("excluded")}
          >
            Excluded
          </Button>
          <Button active={pathFilter === "all"} variant="pill" onClick={() => setPathFilter("all")}>
            All paths
          </Button>
          <Button
            disabled={exportingPaths || !product}
            variant="primary"
            onClick={() => {
              if (!product || !result) return;
              setExportingPaths(true);
              void import("@/lib/workbook/export-probability-screen")
                .then(({ downloadProbabilityPathsExcel }) =>
                  downloadProbabilityPathsExcel({ product, result, filter: pathFilter }),
                )
                .finally(() => setExportingPaths(false));
            }}
          >
            <Download className="h-4 w-4" />
            {exportingPaths ? "Building…" : "Download Paths Excel"}
          </Button>
        </div>
      </div>
      <div
        ref={parentRef}
        className="path-backtest-scroll data-table-premium-wrap mt-3 max-h-[min(70vh,720px)] overflow-auto [-webkit-overflow-scrolling:touch]"
      >
        <div className="min-w-max">
          <div
            className="path-backtest-grid sticky top-0 z-10 grid gap-2 border-b border-[color:var(--ar-border)] bg-[color:var(--ar-surface)] px-2 py-2 text-[11px] font-semibold text-stone-500 sm:text-xs"
            style={{ gridTemplateColumns: `repeat(${colCount}, minmax(7.5rem, auto))` }}
          >
            <span>Start</span>
            <span>Underlying Closing Level</span>
            {showAdjustedStart ? <span>Start Level</span> : null}
            {presentIndexes.map((idx, displayIdx) => (
              <span key={`od-${displayIdx}`}>
                Observation Date {displayIdx + 1}
                {averagedIndexes.has(idx) ? "" : " · passed"}
              </span>
            ))}
            {presentIndexes.map((idx, displayIdx) => (
              <span key={`ol-${displayIdx}`}>
                Observation Level {displayIdx + 1}
                {averagedIndexes.has(idx) ? "" : " · passed"}
              </span>
            ))}
            <span>Average Underlying Level</span>
            <span>Underlying Performance</span>
            <span>Path Taken</span>
          </div>
          {rowCount === 0 ? (
            <p className="px-2 py-6 text-sm text-stone-500">
              {pathFilter === "excluded"
                ? "No excluded rows — Path-Taken-No rows past the frontier are omitted so the last path ends on Actual Start (Initial) or the latest trading session (Current)."
                : "No paths match this filter."}
            </p>
          ) : null}
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = displayPaths[virtualRow.index]!;
              return (
                <div
                  key={virtualRow.key}
                  className="path-backtest-grid absolute left-0 grid w-full gap-2 border-b border-[color:var(--ar-border)] px-2 py-1.5 text-[11px] sm:text-xs"
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: `repeat(${colCount}, minmax(7.5rem, auto))`,
                  }}
                >
                  <span className="whitespace-nowrap">{row.pathStartDate}</span>
                  <span>{formatLevel(row.underlyingClosingLevel)}</span>
                  {showAdjustedStart ? <span>{formatLevel(row.adjustedStartLevel)}</span> : null}
                  {presentIndexes.map((idx) => (
                    <span
                      key={`pd-${idx}`}
                      className={
                        averagedIndexes.has(idx)
                          ? "whitespace-nowrap"
                          : "whitespace-nowrap text-stone-400"
                      }
                    >
                      {averagedIndexes.has(idx)
                        ? (row.observationDates[idx] ?? "—")
                        : "ALREADY PASSED"}
                    </span>
                  ))}
                  {presentIndexes.map((idx) => (
                    <span
                      key={`pl-${idx}`}
                      className={averagedIndexes.has(idx) ? "" : "text-stone-400"}
                    >
                      {averagedIndexes.has(idx)
                        ? formatLevel(row.observationLevels[idx])
                        : "—"}
                    </span>
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
        Showing {formatNumber(rowCount, 0)} of {formatNumber(paths.length, 0)} paths · Included{" "}
        {formatNumber(result.includedCount, 0)} · Successes {formatNumber(result.successCount, 0)}
        {seriesStart ? ` · Series from ${seriesStart}` : ""}
        {result.lastIndexDate ? ` · As of ${result.lastIndexDate}` : ""}
        {lastIncludedFinalObs ? ` · Last included final obs ${lastIncludedFinalObs}` : ""}
        {paths.some((p) => !p.pathIncluded)
          ? " · Path-Taken-No rows past the frontier are omitted so the last path ends on Actual Start / latest session"
          : isInitial
            ? " · Last path final observation lands on Actual Start"
            : " · Last path final observation lands on the latest trading session"}
      </p>
    </Panel>
  );
}

function ProbabilityResultsRail({
  product,
  cards,
}: {
  product: ProductRecord;
  cards: SpecRailCard[];
}) {
  const { width, height, MeasureLayer } = useUniformSpecCardSize(cards);
  return (
    <Panel className="!p-4" glow="purple">
      <SectionInfo {...SECTION_INFO["val-output"]} />
      <SectionTitle>Probability Results</SectionTitle>
      <SubTitle>Live results for {product.name}</SubTitle>
      {MeasureLayer}
      <UniformSpecRail cards={cards} className="mt-4" uniformHeight={height} uniformWidth={width} />
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
  const [loadingPaths, setLoadingPaths] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialResult, setInitialResult] = useState<ProbabilityRunResult | null>(null);
  const [currentResult, setCurrentResult] = useState<ProbabilityRunResult | null>(null);
  const [pathsUnlocked, setPathsUnlocked] = useState(false);
  // Headline and path runs abort independently — a live-mark refresh must never kill
  // an in-flight path load, or the load bar would hang with no run behind it.
  const headlineAbortRef = useRef<AbortController | null>(null);
  const pathsAbortRef = useRef<AbortController | null>(null);
  const { exporting: exportingScreen, runExport: runScreenExport, warmExport: warmScreenExport } =
    useScreenExport();

  const pool = useMemo(
    () => getLifecyclePickerPool(masterProducts, lifecycle, asOf),
    [masterProducts, lifecycle, asOf],
  );
  const product = pickLifecyclePoolProduct(pool, selection.resolvedProduct, lifecycle, asOf);

  useResyncProductToLifecyclePool(pool, lifecycle, asOf);
  const { selectFromPool, resetToLifecycleDefaults } = useLifecycleProductPick(
    pool,
    lifecycle,
    asOf,
  );

  const pastFinalObservation = useMemo(
    () => (product ? hasPassedFinalObservation(product, asOf) : false),
    [product, asOf],
  );

  // Must stay memoised — a fresh Date each render re-creates `runProbability` and
  // restarts the headline + path runs on every paint.
  const valuationParsed = useMemo(
    () => parseExcelishDate(selection.valuationDate) ?? asOf,
    [selection.valuationDate, asOf],
  );
  const checkingDate = useMemo(
    () => (product ? getProbabilityCheckingDate(product, valuationParsed) : valuationParsed),
    [product, valuationParsed],
  );

  const niftyLevel = Number(selection.niftyLevel) || 0;
  const sensexLevel = Number(selection.sensexLevel) || 0;

  const effectiveNiftyLevel = useMemo(() => {
    if (!product || !pastFinalObservation) return niftyLevel;
    return resolveHistoricalNiftyLevel(checkingDate) ?? niftyLevel;
  }, [product, pastFinalObservation, checkingDate, niftyLevel]);

  const effectiveSensexLevel = useMemo(() => {
    if (!product || !pastFinalObservation) return sensexLevel;
    return resolveHistoricalSensexLevel(checkingDate) ?? sensexLevel;
  }, [product, pastFinalObservation, checkingDate, sensexLevel]);

  // Reset path unlock when product / surface / inputs change — keep first paint light.
  useEffect(() => {
    setPathsUnlocked(false);
  }, [
    product?.rowId,
    surface,
    selection.valuationDate,
    selection.niftyLevel,
    selection.sensexLevel,
    lifecycle,
  ]);

  const runProbability = useCallback(
    async (includePaths: boolean) => {
      if (!product?.isin) {
        setInitialResult(null);
        setCurrentResult(null);
        return;
      }

      const abortRef = includePaths ? pathsAbortRef : headlineAbortRef;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (includePaths) setLoadingPaths(true);
      setError(null);

      try {
        const mode = surface === "summary" ? "both" : surface === "initial" ? "initial" : "current";
        const res = await fetch("/api/probability/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            isin: product.isin,
            mode,
            valuationDate: formatDeskDate(checkingDate),
            niftyLevel: pastFinalObservation ? undefined : niftyLevel,
            sensexLevel: pastFinalObservation ? undefined : sensexLevel,
            includePaths,
            bookRevision: `${dataset.workbookName}:${dataset.loadedAt}`,
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          initial?: ProbabilityRunResult;
          current?: ProbabilityRunResult;
        };
        if (controller.signal.aborted) return;
        if (!res.ok || json.ok === false) throw new Error(json.error || "Probability run failed");

        const nextInitial = hydrateProbabilityRunResult(json.initial);
        const nextCurrent = hydrateProbabilityRunResult(json.current);

        setInitialResult((prev) => {
          if (!nextInitial) return null;
          if (!includePaths && prev?.paths?.length) {
            return { ...nextInitial, paths: prev.paths };
          }
          return nextInitial;
        });
        setCurrentResult((prev) => {
          if (!nextCurrent) return null;
          if (!includePaths && prev?.paths?.length) {
            return { ...nextCurrent, paths: prev.paths };
          }
          return nextCurrent;
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Probability run failed");
        if (!includePaths) {
          setInitialResult(null);
          setCurrentResult(null);
        }
      } finally {
        // Clear the bar unless a newer path run has already taken over.
        if (includePaths && pathsAbortRef.current === controller) {
          pathsAbortRef.current = null;
          setLoadingPaths(false);
        }
      }
    },
    [
      product,
      surface,
      checkingDate,
      pastFinalObservation,
      niftyLevel,
      sensexLevel,
      dataset.workbookName,
      dataset.loadedAt,
    ],
  );

  // Fast headline run (no path payload) — keeps the desk responsive.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runProbability(false);
    }, 120);
    return () => {
      window.clearTimeout(timer);
      headlineAbortRef.current?.abort();
    };
  }, [runProbability]);

  // Heavy path rows only on Initial / Current after Reveal — Probability tab skips the table.
  useEffect(() => {
    if (!pathsUnlocked) return;
    if (surface === "summary") return;
    void runProbability(true);
  }, [pathsUnlocked, surface, runProbability]);

  useEffect(
    () => () => {
      pathsAbortRef.current?.abort();
      pathsAbortRef.current = null;
    },
    [],
  );

  const activeResult = surface === "current" ? currentResult : initialResult;
  const startNoun = product ? phasePerformanceStartLabel(product) : "Allotment";

  const title =
    surface === "summary"
      ? "Probability"
      : surface === "initial"
        ? "Initial Probability"
        : "Current Probability";

  const filterTitle =
    surface === "summary"
      ? "Probability · Portfolio Filter"
      : surface === "initial"
        ? "Initial Probability · Portfolio Filter"
        : "Current Probability · Portfolio Filter";

  const tabs = useMemo(
    () => [
      { id: "interface", label: interfaceTabLabel(surface) },
      { id: "products", label: "Product List" },
    ],
    [surface],
  );

  const tgt = product ? targetUnderlying(product) : null;
  const req = product
    ? currentResult?.effectiveTargetLevel != null && currentResult.effectiveTargetLevel > 0
      ? requiredUnderlyingFromHurdleLevel(
          product,
          currentResult.effectiveTargetLevel,
          effectiveNiftyLevel,
          effectiveSensexLevel,
        )
      : requiredUnderlying(product, effectiveNiftyLevel, effectiveSensexLevel)
    : null;
  const daysLeftObs = product ? daysLeftToLastObservation(product, checkingDate) : null;

  const kpiItems = useMemo(() => {
    if (surface === "summary") {
      return [
        { label: "Initial Probability", value: formatPct(initialResult?.probability) },
        { label: "Current Probability", value: formatPct(currentResult?.probability) },
        { label: "Target Underlying", value: formatPct(tgt) },
        { label: "Required Underlying", value: formatPct(req) },
        { label: "Days Left", value: daysLeftObs != null ? formatNumber(daysLeftObs, 0) : "—" },
      ];
    }
    const r = activeResult;
    return [
      { label: "Probability", value: formatPct(r?.probability) },
      { label: "Paths Taken", value: r ? formatNumber(r.includedCount, 0) : "—" },
      { label: "Successful Paths", value: r ? formatNumber(r.successCount, 0) : "—" },
      {
        label: surface === "initial" ? "Target Underlying" : "Required Underlying",
        value: formatPct(surface === "initial" ? tgt : req),
      },
      { label: "Latest Index Date", value: r?.lastIndexDate ?? "—" },
    ];
  }, [surface, initialResult, currentResult, activeResult, tgt, req, daysLeftObs]);

  const indexLabel = product ? getProductIndexFieldLabel(product) : "Nifty";
  const indexLevel = product
    ? isSensexLinked(product)
      ? pastFinalObservation
        ? effectiveSensexLevel
        : sensexLevel
      : pastFinalObservation
        ? effectiveNiftyLevel
        : niftyLevel
    : null;

  const resultCards = useMemo((): SpecRailCard[] => {
    if (!product) return [];
    return [
      { label: "Name of Product", value: product.name },
      { label: "ISIN", value: product.isin ?? "—", mono: true },
      {
        label: "Allotment Date",
        value: getProductAllotmentDate(product)
          ? formatDisplayDate(getProductAllotmentDate(product)!)
          : "—",
      },
      {
        label: "Maturity",
        value: getProductMaturityDate(product)
          ? formatDisplayDate(getProductMaturityDate(product)!)
          : "—",
      },
      { label: "Tenor", value: formatNumber(getProductTenorDays(product) ?? 0, 0) },
      { label: "Initial Entry Level", value: formatLevel(getIndexEntryLevelRaw(product)) },
      { label: "Target Level", value: formatLevel(getTargetLevel(product)) },
      { label: "Series", value: product.series ?? rawField(product, "Product Series") ?? "—" },
      { label: "Coupon", value: getCouponLabel(product) ?? "—" },
      {
        label: "Initial Probability of Achieving Full Coupon",
        value: formatPct(initialResult?.probability),
      },
      { label: "Target Underlying", value: formatPct(tgt) },
      { label: "Current Probability", value: formatPct(currentResult?.probability) },
      { label: "Days Left", value: daysLeftObs != null ? formatNumber(daysLeftObs, 0) : "—" },
      { label: "Required Underlying", value: formatPct(req) },
      {
        label: "Probability Checking Date",
        value: `${formatDisplayDate(checkingDate)}${pastFinalObservation ? " · last observation" : ""}`,
      },
      { label: `${indexLabel} Level`, value: formatLevel(indexLevel) },
    ];
  }, [
    product,
    initialResult,
    currentResult,
    tgt,
    req,
    daysLeftObs,
    checkingDate,
    pastFinalObservation,
    indexLabel,
    indexLevel,
  ]);

  const exportPayload = useMemo(() => {
    if (!product) return null;
    return {
      product,
      surface,
      checkingDate: formatDisplayDate(checkingDate),
      asOfLastObservation: pastFinalObservation,
      initial: initialResult,
      current: currentResult,
      targetPercent: tgt,
      requiredPercent: req,
      daysLeft: daysLeftObs,
      niftyLevel: pastFinalObservation ? effectiveNiftyLevel : niftyLevel,
      sensexLevel: pastFinalObservation ? effectiveSensexLevel : sensexLevel,
    };
  }, [
    product,
    surface,
    checkingDate,
    pastFinalObservation,
    initialResult,
    currentResult,
    tgt,
    req,
    daysLeftObs,
    effectiveNiftyLevel,
    effectiveSensexLevel,
    niftyLevel,
    sensexLevel,
  ]);

  const outputResetKey = useMemo(
    () =>
      [
        product?.rowId,
        surface,
        selection.valuationDate,
        selection.niftyLevel,
        selection.sensexLevel,
        lifecycle,
      ].join("|"),
    [
      product?.rowId,
      surface,
      selection.valuationDate,
      selection.niftyLevel,
      selection.sensexLevel,
      lifecycle,
    ],
  );

  // Stable footer — do not tie disabled to soft-reload KPI fetches (that caused button flicker).
  const exportFooter = useMemo(() => {
    if (exportPayload == null) return null;
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          disabled={exportingScreen}
          variant="primary"
          onMouseEnter={warmScreenExport}
          onFocus={warmScreenExport}
          onClick={() =>
            runScreenExport(async () => {
              const { downloadProbabilityScreenExcel } = await import(
                "@/lib/workbook/export-probability-screen"
              );
              await downloadProbabilityScreenExcel(exportPayload);
            }, "Excel download")
          }
        >
          <Download className="h-4 w-4" />
          {exportingScreen ? "Building…" : "Download Excel"}
        </Button>
        <Button
          disabled={exportingScreen}
          variant="accent"
          onMouseEnter={warmScreenExport}
          onFocus={warmScreenExport}
          onClick={() =>
            runScreenExport(async () => {
              const { downloadProbabilityScreenPdf } = await import(
                "@/lib/workbook/export-probability-screen"
              );
              await downloadProbabilityScreenPdf(exportPayload);
            }, "PDF download")
          }
        >
          <FileText className="h-4 w-4" />
          {exportingScreen ? "Building…" : "Download PDF"}
        </Button>
      </div>
    );
  }, [exportPayload, exportingScreen, runScreenExport, warmScreenExport]);

  const checkingDisplay = formatDeskDate(checkingDate);

  return (
    <AppPage actions={<MasterUploadButton />} dense title={title}>
      <HorizontalBand>
        <Panel className="!p-4" glow="cyan">
          <SectionInfo {...SECTION_INFO["val-filter"]} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SubTitle>{filterTitle}</SubTitle>
            <div className="flex flex-wrap gap-2">
              {UI_LIFECYCLE_FILTERS.map((key) => (
                <Button
                  key={key}
                  active={lifecycle === key}
                  variant="pill"
                  onClick={() => setLifecycle(key as LifecycleFilter)}
                >
                  {LIFECYCLE_FILTER_LABELS[key]}
                </Button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-sm text-stone-500">
            {formatNumber(pool.length)} products in {LIFECYCLE_FILTER_LABELS[lifecycle].toLowerCase()} book
          </p>
        </Panel>
      </HorizontalBand>

      <HorizontalBand className="mt-4">
        <SubPageTabs tabs={tabs} active={tab} onSelect={setTab} />
      </HorizontalBand>

      {tab === "products" ? (
        <HorizontalBand className="mt-4">
          <LifecycleProductList
            activeFilter={lifecycle}
            compact
            filter={lifecycle}
            products={masterProducts}
            selectedId={product?.rowId}
            showFilterPills={false}
            onSelect={(p) => {
              selectFromPool(p);
              setTab("interface");
            }}
          />
        </HorizontalBand>
      ) : (
        <>
          <HorizontalBand className="mt-4">
            <Panel className="!p-4" glow="purple">
              <SectionInfo {...SECTION_INFO["val-inputs"]} />
              <SectionTitle>Inputs</SectionTitle>
              <div className="mt-4">
                <ExcelInputPanel
                  category="Primary"
                  products={pool}
                  mode="probability"
                  compact
                  lifecycleFilter={lifecycle}
                  activeProduct={product ?? undefined}
                  onPickProduct={selectFromPool}
                  onResetDefaults={resetToLifecycleDefaults}
                />
              </div>
            </Panel>
          </HorizontalBand>

          {product ? (
            <HorizontalBand className="mt-4">
              <Panel className="!p-3" glow="cyan">
                <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-amber-900/90">
                  {formatReportAsOf(checkingDisplay)}
                  {pastFinalObservation ? " · last observation" : ""}
                </p>
              </Panel>
            </HorizontalBand>
          ) : null}

          {error ? (
            <HorizontalBand className="mt-4">
              <div className="desk-alert" role="alert">
                {error}
              </div>
            </HorizontalBand>
          ) : null}

          {product ? (
            <HorizontalBand className="mt-4">
              <RevealOutput
                footer={exportFooter}
                label={
                  surface === "summary"
                    ? "Click here to view probability output"
                    : surface === "initial"
                      ? "Click here to view initial probability output"
                      : "Click here to view current probability output"
                }
                resetKey={outputResetKey}
                onReveal={() => {
                  warmScreenExport();
                  setPathsUnlocked(true);
                }}
              >
                <KpiBand accents={["cyan", "green", "purple", "amber", "rose"]} items={kpiItems} />

                <HorizontalBand className="mt-4">
                  <ScheduleCard
                    result={activeResult}
                    daysRowLabel={
                      surface === "current"
                        ? "Days from Valuation Date"
                        : "Days from Phase Start"
                    }
                    baseLabel={
                      surface === "current"
                        ? "the valuation date"
                        : `the actual ${startNoun.toLowerCase()} start`
                    }
                  />
                </HorizontalBand>

                <HorizontalBand className="mt-4">
                  <ProductSpecificationsPanel product={product} />
                </HorizontalBand>

                {surface === "summary" ? (
                  <>
                    <HorizontalBand className="mt-4">
                      <ProbabilityResultsRail product={product} cards={resultCards} />
                    </HorizontalBand>
                    <PastFinalObservationPanels product={product} />
                  </>
                ) : (
                  <HorizontalBand className="mt-4">
                    <PathBacktestTable
                      result={activeResult}
                      showAdjustedStart={surface !== "current"}
                      loadingPaths={loadingPaths}
                      product={product}
                      mode={surface === "current" ? "current" : "initial"}
                    />
                  </HorizontalBand>
                )}
              </RevealOutput>
            </HorizontalBand>
          ) : null}
        </>
      )}
    </AppPage>
  );
}
