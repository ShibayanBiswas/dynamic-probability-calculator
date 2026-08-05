"use client";

import { memo, useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartPanel, InputGlow, OutputGlow } from "@/components/layout/app-ui";
import { ChartStage, PremiumGrid } from "@/components/charts/chart-kit";
import { useEntranceChartAnimation } from "@/lib/use-chart-animation";
import { useChartTheme } from "@/lib/use-chart-theme";
import { buildPayoffCurve, evaluatePayoffFormula } from "@/lib/workbook/formula-engine";
import { findPayoffPlotKinks } from "@/lib/workbook/payoff-kinks";
import { formatFormulaReturn, formatNumber } from "@/lib/utils";

type TooltipRow = {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
};

function formatTooltipValue(entry: TooltipRow) {
  const key = String(entry.dataKey ?? "");
  const name = String(entry.name ?? "");
  if (key === "underlyingLevel" || /underlying/i.test(name)) {
    return formatNumber(entry.value ?? 0, 2);
  }
  return formatFormulaReturn(entry.value ?? 0, 2);
}

function PayoffTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip chart-tooltip-animated whitespace-nowrap">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-dark">
        Index move {formatFormulaReturn(Number(label), 1)}
      </p>
      {payload.map((entry) => (
        <p key={`${entry.dataKey}-${entry.name}`} className="mt-1 text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {formatTooltipValue(entry)}
        </p>
      ))}
    </div>
  );
}

function moveTextFromZ(z: number) {
  return String(Number((z * 100).toFixed(2)));
}

/** Round live Z so tiny Yahoo ticks do not re-seed the draft every sync. */
function stabilizeMove(z: number) {
  if (!Number.isFinite(z)) return 0;
  return Math.round(z * 10000) / 10000;
}

type MoveDraft = {
  /** Product / formula identity this draft belongs to. */
  productKey: string;
  /** Live market move already folded into this draft. */
  seed: number;
  /** True once the desk types a move — live marks stop overwriting it. */
  edited: boolean;
  z: number;
  text: string;
};

function seedMoveDraft(productKey: string, marketMove: number): MoveDraft {
  return {
    productKey,
    seed: marketMove,
    edited: false,
    z: marketMove,
    text: moveTextFromZ(marketMove),
  };
}

function PayoffUnderlyingChartImpl({
  formula,
  title,
  entryLevel,
  marketMove = 0,
  compact,
}: {
  formula: string;
  title: string;
  entryLevel: number;
  marketMove?: number;
  compact?: boolean;
}) {
  const chartTheme = useChartTheme();
  const chartAnim = useEntranceChartAnimation(`${formula}|${entryLevel}`);

  // Gradient ids must be unique per instance — duplicate ids across payoff panels make
  // the underlying line resolve to another chart's gradient and flicker on re-render.
  const gradientScope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const payoffGradientId = `payoffGradient-${gradientScope}`;
  const underlyingStrokeId = `underlyingStroke-${gradientScope}`;

  const productKey = `${formula}|${entryLevel}`;
  // Non-finite / noisy marks would never compare equal and would re-seed forever.
  const liveMove = stabilizeMove(marketMove);
  const [draft, setDraft] = useState<MoveDraft>(() => seedMoveDraft(productKey, liveMove));

  // Re-seed on product change, and keep following the live mark until the desk types.
  if (draft.productKey !== productKey || (!draft.edited && draft.seed !== liveMove)) {
    setDraft(seedMoveDraft(productKey, liveMove));
  }

  const zInput = draft.z;
  const moveText = draft.text;

  function handleMoveChange(raw: string) {
    // Accept floating-point numbers only (optional sign, digits, single decimal point).
    if (raw !== "" && !/^-?\d*\.?\d*$/.test(raw)) return;
    const parsed = Number.parseFloat(raw);
    const nextZ = Number.isFinite(parsed) ? parsed / 100 : 0;
    setDraft((current) => ({ ...current, edited: true, text: raw, z: nextZ }));
  }

  const curve = useMemo(() => {
    const raw = buildPayoffCurve(formula);
    return raw.map((point) => ({
      ...point,
      payoff: Math.max(-1, Math.min(point.payoff, 3)),
    }));
  }, [formula]);

  const comboData = useMemo(
    () =>
      curve.map((point) => ({
        z: point.z,
        payoff: point.payoff,
        underlyingLevel: entryLevel * (1 + point.z),
      })),
    [curve, entryLevel],
  );

  const kinkDots = useMemo(
    () => findPayoffPlotKinks(formula).map((z) => ({ z, y: evaluatePayoffFormula(formula, z) })),
    [formula],
  );

  const payoffAtZ = evaluatePayoffFormula(formula, zInput);
  const underlyingAtZ = entryLevel * (1 + zInput);

  const payoffDomain = useMemo(() => {
    const values = comboData.map((p) => p.payoff).filter((v) => Number.isFinite(v));
    if (values.length === 0) return [-0.6, 0.6] as [number, number];
    const min = Math.min(...values, -0.5);
    const max = Math.max(...values, 0.5);
    const pad = Math.max((max - min) * 0.12, 0.08);
    return [min - pad, max + pad] as [number, number];
  }, [comboData]);

  const underlyingDomain = useMemo(() => {
    const levels = comboData.map((p) => p.underlyingLevel).filter((v) => Number.isFinite(v));
    // Without an initial fixing every level collapses to zero; a flat domain makes
    // Recharts scale to NaN and the underlying line drops out of the plot.
    if (!(entryLevel > 0) || levels.length === 0) return [0, 1] as [number, number];
    const min = Math.min(...levels, entryLevel * 0.6);
    const max = Math.max(...levels, entryLevel * 1.5);
    const span = max - min;
    const pad = span > 0 ? span * 0.06 : Math.max(Math.abs(max) * 0.06, 1);
    return [min - pad, max + pad] as [number, number];
  }, [comboData, entryLevel]);

  const charts = (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <p className="label-chip mb-1.5">Index move %</p>
          <div className="relative">
            <InputGlow
              inputMode="decimal"
              placeholder="Type an index move"
              type="text"
              value={moveText}
              onChange={(e) => handleMoveChange(e.target.value)}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-stone-500">
              %
            </span>
          </div>
        </div>
        <div>
          <p className="label-chip mb-1.5">Underlying level</p>
          <OutputGlow accent="purple">{formatNumber(underlyingAtZ)}</OutputGlow>
        </div>
        <div>
          <p className="label-chip mb-1.5">Product return</p>
          <OutputGlow accent="cyan">{formatFormulaReturn(payoffAtZ)}</OutputGlow>
        </div>
      </div>

      <ChartStage
        height={compact ? "chart-stage-compact" : "h-[min(52vh,420px)] min-h-[280px]"}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={comboData}
            margin={{ top: 20, right: 58, left: 58, bottom: 40 }}
          >
            <defs>
              <linearGradient id={payoffGradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={chartTheme.payoff} stopOpacity={0.55} />
                <stop offset="100%" stopColor={chartTheme.payoff} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id={underlyingStrokeId} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor={chartTheme.underlying} stopOpacity={0.75} />
                <stop offset="100%" stopColor={chartTheme.payoff} />
              </linearGradient>
            </defs>
            <PremiumGrid yAxisId="payoff" />
            <ReferenceLine stroke={chartTheme.referenceLine} strokeDasharray="4 4" y={0} yAxisId="payoff" />
            <XAxis
              axisLine={{ stroke: chartTheme.axisLine }}
              dataKey="z"
              height={40}
              label={{
                value: "Underlying performance",
                fill: chartTheme.tick,
                fontSize: 11,
                fontWeight: 600,
                position: "insideBottom",
                offset: -2,
              }}
              tick={{ fill: chartTheme.tick, fontSize: 10 }}
              tickFormatter={(v) => formatFormulaReturn(v, 0)}
            />
            <YAxis
              axisLine={{ stroke: chartTheme.payoff }}
              domain={payoffDomain}
              label={{
                value: "Product return",
                angle: -90,
                position: "insideLeft",
                fill: chartTheme.payoff,
                fontSize: 10,
                fontWeight: 600,
                offset: 8,
              }}
              tick={{ fill: chartTheme.payoff, fontSize: 10 }}
              tickFormatter={(v) => formatFormulaReturn(v, 0)}
              tickLine={{ stroke: chartTheme.payoff, strokeOpacity: 0.35 }}
              width={54}
              yAxisId="payoff"
            />
            <YAxis
              axisLine={{ stroke: chartTheme.underlying }}
              domain={underlyingDomain}
              label={{
                value: "Index level",
                angle: 90,
                position: "insideRight",
                fill: chartTheme.underlying,
                fontSize: 10,
                fontWeight: 600,
                offset: 12,
              }}
              orientation="right"
              tick={{ fill: chartTheme.underlying, fontSize: 10 }}
              tickFormatter={(v) => formatNumber(v, 0)}
              tickLine={{ stroke: chartTheme.underlying, strokeOpacity: 0.35 }}
              width={56}
              yAxisId="underlying"
            />
            <Tooltip
              content={<PayoffTooltip />}
              cursor={{ stroke: chartTheme.cursorStroke, strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <ReferenceLine stroke={chartTheme.cursorStroke} strokeDasharray="4 4" x={zInput} yAxisId="payoff" />
            {kinkDots.map((dot) => (
              <ReferenceDot
                key={dot.z}
                fill={chartTheme.payoff}
                r={6}
                stroke={chartTheme.dotStroke}
                strokeWidth={2}
                x={dot.z}
                y={dot.y}
                yAxisId="payoff"
              />
            ))}
            <Area
              {...chartAnim}
              activeDot={{ fill: chartTheme.payoff, r: 6, stroke: chartTheme.dotStroke, strokeWidth: 2 }}
              dataKey="payoff"
              fill={`url(#${payoffGradientId})`}
              name="Product return"
              stroke={chartTheme.payoff}
              strokeWidth={2.5}
              type="monotone"
              yAxisId="payoff"
            />
            <Line
              {...chartAnim}
              activeDot={{ fill: chartTheme.underlying, r: 5, stroke: chartTheme.dotStroke, strokeWidth: 2 }}
              dataKey="underlyingLevel"
              dot={false}
              name="Underlying level"
              stroke={`url(#${underlyingStrokeId})`}
              strokeWidth={2.5}
              type="monotone"
              yAxisId="underlying"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartStage>

      {!compact ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="flex flex-wrap gap-4 text-xs text-stone-600 dark:text-stone-400"
          initial={{ opacity: 0 }}
        >
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-6 rounded-full bg-gold shadow-[0_0_8px_rgba(212,178,76,0.6)]" />
            Product return · left axis
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-2 w-6 rounded-full"
              style={{
                backgroundColor: chartTheme.underlying,
                boxShadow: `0 0 8px ${chartTheme.underlyingGlow}`,
              }}
            />
            Index level · right axis
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-700 ring-2 ring-white dark:ring-stone-900" />
            Plot kinks — slope turns
          </span>
          <span className="font-serif italic text-stone-700 dark:text-stone-300">
            Initial fixing: <strong className="not-italic text-ink">{formatNumber(entryLevel)}</strong>
          </span>
        </motion.div>
      ) : null}
    </div>
  );

  if (compact) {
    return (
      <div className="chart-shell chart-stage-compact p-2">
        <div className="chart-plot-surface h-full rounded-2xl">{charts}</div>
      </div>
    );
  }

  return (
    <ChartPanel glow="cyan" className="!p-4" icon="chart" title={`Payoff & Underlying — ${title}`}>
      {charts}
    </ChartPanel>
  );
}

/** Memoised — desk clock and market-sync re-renders must not redraw the plot. */
export const PayoffUnderlyingChart = memo(PayoffUnderlyingChartImpl);
