"use client";

import type { ReactNode } from "react";

import { CartesianGrid, Legend, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import type { ChartThemeTokens } from "@/lib/chart-theme";
import { useChartTheme } from "@/lib/use-chart-theme";
import { formatChartAxisMoney, formatCrores, formatPercent, stripLabelParens } from "@/lib/utils";

/** Default margins — left gutter sized for ₹ axis labels (never clip). */
export const chartMargins = { top: 18, right: 20, left: 80, bottom: 8 };

/** Bar charts with category X-axis + money Y-axis — extra left gutter for ₹ ticks. */
export const barChartMargins = { top: 22, right: 24, left: 100, bottom: 44 };

/** Dual-series bar charts with bottom legend — room for Y-axis label + legend. */
export const dualBarChartMargins = { top: 26, right: 28, left: 108, bottom: 58 };

/** Horizontal bar charts (underlying / issuer exposure). */
export const horizontalBarMargins = { top: 14, right: 28, left: 4, bottom: 14 };

export function PremiumGrid({ vertical = true, yAxisId }: { vertical?: boolean; yAxisId?: string }) {
  const theme = useChartTheme();

  return (
    <>
      <CartesianGrid stroke={theme.gridFine} strokeDasharray="3 12" vertical={vertical} horizontal yAxisId={yAxisId} />
      <CartesianGrid stroke={theme.gridMajor} strokeDasharray="1 5" vertical={vertical} horizontal yAxisId={yAxisId} />
      <CartesianGrid stroke={theme.gridMinor} strokeDasharray="6 10" vertical={vertical} horizontal yAxisId={yAxisId} />
      <ReferenceLine stroke={theme.referenceLine} strokeDasharray="5 5" y={0} yAxisId={yAxisId} />
    </>
  );
}

interface MoneyTickProps {
  x?: number;
  y?: number;
  payload?: { value: number | string };
}

/** Single-line SVG tick — Recharts default splits strings on spaces. */
function MoneyAxisTick({ x = 0, y = 0, payload, fontSize = 11 }: MoneyTickProps & { fontSize?: number }) {
  const theme = useChartTheme();
  const label = formatChartAxisMoney(Number(payload?.value ?? 0));

  return (
    <text fill={theme.tick} fontSize={fontSize} fontWeight={600} textAnchor="end" x={x} y={y} dy={4}>
      {label}
    </text>
  );
}

interface CategoryTickProps {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  fontSize?: number;
}

/** Horizontal-bar category labels (issuer / underlying exposure). */
export function ExposureCategoryTick({ x = 0, y = 0, payload, fontSize = 12 }: CategoryTickProps) {
  const theme = useChartTheme();
  const text = String(payload?.value ?? "");

  return (
    <text
      fill={theme.tick}
      fontSize={fontSize}
      fontWeight={600}
      textAnchor="end"
      x={x}
      y={y}
      dy={4}
    >
      {text}
    </text>
  );
}

export function CrYAxis({
  dataKey,
  width = 88,
  tickCount = 5,
  tickFontSize = 11,
  ...props
}: {
  dataKey?: string;
  width?: number;
  tickCount?: number;
  tickFontSize?: number;
} & React.ComponentProps<typeof YAxis>) {
  const theme = useChartTheme();
  const crAxisLabel = {
    value: "NOTIONAL ₹ CRORE",
    fill: theme.axisLabel,
    fontSize: 10,
    fontWeight: 700,
  };

  return (
    <YAxis
      {...props}
      axisLine={{ stroke: theme.axisLine }}
      {...(dataKey ? { dataKey } : {})}
      label={{ ...crAxisLabel, angle: -90, position: "insideLeft", offset: 12, dx: -4 }}
      tick={<MoneyAxisTick fontSize={tickFontSize} />}
      tickCount={tickCount}
      tickLine={{ stroke: theme.axisLine }}
      width={width}
    />
  );
}

export function CrXAxis({
  dataKey = "value",
  tickFontSize = 11,
  ...props
}: { dataKey?: string; tickFontSize?: number } & React.ComponentProps<typeof XAxis>) {
  const theme = useChartTheme();
  const crAxisLabel = {
    value: "NOTIONAL ₹ CRORE",
    fill: theme.axisLabel,
    fontSize: 10,
    fontWeight: 700,
  };

  return (
    <XAxis
      {...props}
      axisLine={{ stroke: theme.axisLine }}
      dataKey={dataKey}
      height={48}
      label={{ ...crAxisLabel, position: "insideBottom", offset: -2 }}
      tick={<MoneyAxisTick fontSize={tickFontSize} />}
      tickLine={{ stroke: theme.axisLine }}
    />
  );
}

export function CategoryAxis(props: React.ComponentProps<typeof XAxis>) {
  const theme = useChartTheme();

  return (
    <XAxis
      {...props}
      axisLine={{ stroke: theme.axisLine }}
      tick={{ fill: theme.tick, fontSize: 10, fontWeight: 600 }}
      tickLine={{ stroke: theme.axisLine }}
    />
  );
}

interface DiagonalTickProps {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  formatter?: (value: string | number) => string;
  angle?: number;
  anchorEnd?: boolean;
}

/** Renders an axis tick label rotated diagonally for dense / long labels. */
export function DiagonalTick({ x = 0, y = 0, payload, formatter, angle = -32, anchorEnd = true }: DiagonalTickProps) {
  const theme = useChartTheme();
  const raw = payload?.value ?? "";
  const text = formatter ? formatter(raw) : String(raw);

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        dx={anchorEnd ? -2 : 4}
        dy={anchorEnd ? 4 : 12}
        fill={theme.tick}
        fontSize={10}
        fontWeight={600}
        textAnchor="end"
        transform={`rotate(${angle})`}
      >
        {text}
      </text>
    </g>
  );
}

function axisTitle(theme: ChartThemeTokens, value: string, position: "insideBottom" | "insideLeft") {
  return {
    value: stripLabelParens(value),
    fill: theme.axisLabel,
    fontSize: 10,
    fontWeight: 700,
    position,
    ...(position === "insideLeft" ? { angle: -90 as const, offset: 0 } : { offset: 0 }),
  };
}

/** Category X-axis with diagonal labels and an axis title (e.g. maturity windows). */
export function DiagonalCategoryAxis({
  title,
  ...props
}: { title?: string } & React.ComponentProps<typeof XAxis>) {
  const theme = useChartTheme();

  return (
    <XAxis
      {...props}
      axisLine={{ stroke: theme.axisLine }}
      height={64}
      interval={0}
      label={title ? axisTitle(theme, title, "insideBottom") : undefined}
      tick={<DiagonalTick />}
      tickLine={{ stroke: theme.axisLine }}
    />
  );
}

/** Value Y-axis — single-line ₹ ticks (maturity ladder, tenor profile). */
export function CroreLacYAxis({
  title = "NOTIONAL ₹",
  width = 100,
  tickCount = 5,
  tickFontSize = 11,
  ...props
}: { title?: string; width?: number; tickCount?: number; tickFontSize?: number } & React.ComponentProps<typeof YAxis>) {
  const theme = useChartTheme();

  return (
    <YAxis
      {...props}
      axisLine={{ stroke: theme.axisLine }}
      interval={0}
      label={{ ...axisTitle(theme, title, "insideLeft"), offset: 14, dx: -4 }}
      tick={<MoneyAxisTick fontSize={tickFontSize} />}
      tickCount={tickCount}
      tickLine={{ stroke: theme.axisLine }}
      width={width}
    />
  );
}

export function PercentYAxis(props: React.ComponentProps<typeof YAxis>) {
  const theme = useChartTheme();

  return (
    <YAxis
      {...props}
      axisLine={{ stroke: theme.axisLine }}
      tick={{ fill: theme.tick, fontSize: 10, fontWeight: 600 }}
      tickFormatter={(v) => formatPercent(Number(v) / 100, 0)}
      tickLine={{ stroke: theme.axisLine }}
    />
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelKey,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string; payload?: Record<string, unknown> }>;
  label?: string;
  valueFormatter?: (value: number, name?: string) => string;
  /** When set, tooltip title comes from this field on the data row (e.g. full issuer name). */
  labelKey?: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  const title =
    (labelKey && row?.[labelKey] != null ? String(row[labelKey]) : undefined) ?? label;

  return (
    <div className="chart-tooltip chart-tooltip-animated">
      {title ? (
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold-dark">{title}</p>
      ) : null}
      {payload.map((entry) => {
        const raw = Number(entry.value ?? 0);
        const formatted = valueFormatter
          ? valueFormatter(raw, String(entry.name ?? entry.dataKey))
          : formatCrores(raw);
        return (
          <p key={String(entry.name)} className="mt-1 whitespace-nowrap text-sm font-semibold" style={{ color: entry.color }}>
            <span className="uppercase tracking-wide">{entry.name}</span>: {formatted}
          </p>
        );
      })}
    </div>
  );
}

export function RechartsPremiumTooltip({
  formatter,
  labelKey,
}: {
  formatter?: (value: number, name?: string) => string;
  labelKey?: string;
}) {
  const theme = useChartTheme();

  return (
    <Tooltip
      content={<ChartTooltip labelKey={labelKey} valueFormatter={formatter} />}
      cursor={{
        fill: theme.cursorFill,
        stroke: theme.cursorStroke,
        strokeWidth: 1,
        strokeDasharray: "4 4",
      }}
    />
  );
}

export function ChartLegend({
  wrapperStyle,
  ...props
}: React.ComponentProps<typeof Legend>) {
  const theme = useChartTheme();

  return (
    <Legend
      {...props}
      wrapperStyle={{
        fontSize: 10,
        paddingTop: 6,
        color: theme.legend,
        ...wrapperStyle,
      }}
    />
  );
}

export function ChartStage({
  children,
  height = "h-72",
  heightPx,
  className,
}: {
  children: ReactNode;
  height?: string;
  heightPx?: number;
  className?: string;
}) {
  return (
    <div
      className={`chart-shell relative ${heightPx ? "" : height} ${className ?? ""}`}
      style={heightPx ? { height: heightPx } : undefined}
    >
      <div className="chart-shell-inner">
        <div className="chart-shell-grid pointer-events-none absolute inset-0" />
        <div className="chart-shell-scanline" />
        <div className="chart-shell-corner chart-shell-corner-tl" />
        <div className="chart-shell-corner chart-shell-corner-br" />
        <div className="chart-plot-surface relative z-10 h-full w-full overflow-visible pl-0.5 pr-1">{children}</div>
      </div>
    </div>
  );
}
