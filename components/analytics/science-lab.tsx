"use client";

import { useDeferredValue, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  YAxis,
} from "recharts";

import {
  CategoryAxis,
  ChartLegend,
  ChartStage,
  CroreLacYAxis,
  CrXAxis,
  CrYAxis,
  ExposureCategoryTick,
  PremiumGrid,
  RechartsPremiumTooltip,
  barChartMargins,
  chartMargins,
  horizontalBarMargins,
} from "@/components/charts/chart-kit";
import { ChartPanel, Panel, SectionInfo } from "@/components/layout/app-ui";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import { SECTION_INFO } from "@/lib/section-info";
import {
  getCouponDistribution,
  getIssuerExposure,
  getLifecycleChartData,
  getProtectionMix,
  getTenorDistribution,
  getTenorProfileSeriesName,
  getTenorProfileSubtitle,
  getUnderlyingExposure,
} from "@/lib/analytics";
import { issuerAxisWidth } from "@/lib/issuer-chart-labels";
import { useChartAnimation } from "@/lib/use-chart-animation";
import { useChartTheme } from "@/lib/use-chart-theme";
import { useTheme } from "@/lib/context/theme-provider";
import {
  filterProductsByLifecycle,
  LIFECYCLE_FILTER_LABELS,
  LIFECYCLE_STATUS_LABELS,
  type LifecycleFilter,
} from "@/lib/product-lifecycle";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import type { ProductRecord } from "@/lib/types";
import { formatCrores } from "@/lib/utils";

function exposureChartHeight(rows: number) {
  if (rows <= 4) return "h-52";
  if (rows <= 8) return "h-72";
  if (rows <= 12) return "h-96";
  return undefined;
}

function exposureChartHeightPx(rows: number) {
  if (rows <= 12) return undefined;
  const barPitch = rows > 16 ? 24 : 28;
  return Math.max(384, Math.min(720, rows * barPitch + 56));
}

function NotionalExposureBar({
  badge,
  categoryKey,
  data,
  dataKey,
  filter,
  glow,
  gradientId,
  sectionId,
  title,
  tooltipLabelKey,
  yAxisWidth,
}: {
  badge?: string;
  categoryKey: string;
  data: Array<Record<string, string | number>>;
  dataKey: string;
  filter: LifecycleFilter;
  glow: "cyan" | "purple";
  gradientId: string;
  sectionId: keyof typeof SECTION_INFO;
  title: string;
  tooltipLabelKey?: string;
  yAxisWidth?: number;
}) {
  const chartTheme = useChartTheme();
  const chartAnim = useChartAnimation();
  const rowCount = data.length;
  const compact = rowCount > 10;
  const tickFontSize = compact ? 11 : 12;
  const axisWidth = yAxisWidth ?? (filter === "expired" ? 148 : 116);
  const heightPx = exposureChartHeightPx(rowCount);

  return (
    <HorizontalBand>
      <ChartPanel badge={badge} glow={glow} icon="chart" title={title}>
        <SectionInfo {...SECTION_INFO[sectionId]} />
        <ChartStage height={exposureChartHeight(rowCount) ?? "h-72"} heightPx={heightPx}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              barCategoryGap={compact ? "18%" : "28%"}
              barGap={compact ? 4 : 8}
              data={data}
              layout="vertical"
              margin={{ ...horizontalBarMargins, left: 4, right: 28, top: 16, bottom: 16 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={chartTheme.payoff} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={chartTheme.underlying} />
                </linearGradient>
              </defs>
              <PremiumGrid vertical={false} />
              <CrXAxis tickFontSize={tickFontSize} type="number" />
              <YAxis
                axisLine={{ stroke: chartTheme.axisLine }}
                dataKey={categoryKey}
                interval={0}
                tick={<ExposureCategoryTick fontSize={tickFontSize} />}
                tickLine={{ stroke: chartTheme.axisLine }}
                tickMargin={8}
                type="category"
                width={axisWidth}
              />
              <RechartsPremiumTooltip formatter={(v) => formatCrores(Number(v))} labelKey={tooltipLabelKey} />
              <Bar
                {...chartAnim}
                dataKey={dataKey}
                fill={`url(#${gradientId})`}
                maxBarSize={compact ? 22 : 36}
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartStage>
      </ChartPanel>
    </HorizontalBand>
  );
}

export function ScienceLab({
  products,
  filter = "ongoing",
}: {
  products: ProductRecord[];
  filter?: LifecycleFilter;
}) {
  const chartTheme = useChartTheme();
  const chartAnim = useChartAnimation();
  const { theme } = useTheme();
  const { asOf } = usePortfolioClock();
  const pool = useMemo(() => filterProductsByLifecycle(products, filter, asOf), [products, filter, asOf]);
  const deferredPool = useDeferredValue(pool);
  const categoryLabel = LIFECYCLE_FILTER_LABELS[filter];

  const analytics = useMemo(
    () => ({
      lifecycle: getLifecycleChartData(deferredPool, asOf, theme),
      couponDist: getCouponDistribution(deferredPool),
      protection: getProtectionMix(deferredPool, theme),
      underlyings: getUnderlyingExposure(deferredPool),
      issuers: getIssuerExposure(deferredPool),
      tenor: getTenorDistribution(deferredPool, asOf),
      tenorSubtitle: getTenorProfileSubtitle(deferredPool, asOf),
      tenorSeriesName: getTenorProfileSeriesName(deferredPool, asOf),
    }),
    [deferredPool, asOf, theme],
  );

  const { lifecycle, couponDist, protection, underlyings, issuers, tenor, tenorSubtitle, tenorSeriesName } =
    analytics;

  if (pool.length === 0) {
    return (
      <Panel className="!p-5" glow="purple">
        <p className="text-center text-sm text-stone-600">No analytics for {categoryLabel.toLowerCase()}.</p>
      </Panel>
    );
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
      initial={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
        <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-gold-dark">
          Analytics Laboratory · {categoryLabel}
        </p>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      </div>

      <HorizontalBand>
        <ChartPanel glow="cyan" icon="chart" title="Lifecycle Universe">
          <SectionInfo {...SECTION_INFO["an-lifecycle"]} />
          <ChartStage height="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={chartMargins}>
                <Pie
                  {...chartAnim}
                  cx="50%"
                  cy="46%"
                  data={lifecycle.filter((e) => e.count > 0).map((e) => ({ ...e, name: e.status }))}
                  dataKey="notional"
                  innerRadius={52}
                  nameKey="status"
                  outerRadius={78}
                  paddingAngle={3}
                  stroke={chartTheme.dotStroke}
                  strokeWidth={2}
                >
                  {lifecycle.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} />
                  ))}
                </Pie>
                <ChartLegend
                  formatter={(value) => {
                    const entry = lifecycle.find((e) => e.status === value);
                    const label = LIFECYCLE_STATUS_LABELS[String(value) as keyof typeof LIFECYCLE_STATUS_LABELS] ?? String(value);
                    return entry ? `${label} · ${entry.count} · ${formatCrores(entry.notional)}` : label;
                  }}
                  iconType="circle"
                />
                <RechartsPremiumTooltip formatter={(v) => formatCrores(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </ChartStage>
        </ChartPanel>
      </HorizontalBand>

      <HorizontalBand>
        <ChartPanel glow="purple" icon="chart" title="Coupon Distribution">
          <SectionInfo {...SECTION_INFO["an-coupon"]} />
          <ChartStage height="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={couponDist} margin={barChartMargins}>
                <defs>
                  <linearGradient id="couponGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.payoff} />
                    <stop offset="55%" stopColor={chartTheme.payoff} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={chartTheme.underlying} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <PremiumGrid />
                <CategoryAxis dataKey="bucket" />
                <CrYAxis tickCount={5} tickFontSize={11} width={88} />
                <RechartsPremiumTooltip formatter={(v) => formatCrores(Number(v))} />
                <Bar {...chartAnim} dataKey="value" fill="url(#couponGrad)" maxBarSize={42} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartStage>
        </ChartPanel>
      </HorizontalBand>

      <HorizontalBand>
        <ChartPanel glow="cyan" icon="chart" title="Principal Protection Mix">
          <SectionInfo {...SECTION_INFO["an-protection"]} />
          <ChartStage height="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={chartMargins}>
                <Pie
                  {...chartAnim}
                  cx="50%"
                  cy="46%"
                  data={protection}
                  dataKey="value"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={4}
                  stroke={chartTheme.dotStroke}
                  strokeWidth={2}
                >
                  {protection.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <ChartLegend
                  formatter={(value) => {
                    const entry = protection.find((p) => p.name === value);
                    return entry ? `${value} · ${formatCrores(entry.value)}` : String(value);
                  }}
                  iconType="circle"
                />
                <RechartsPremiumTooltip formatter={(v) => formatCrores(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </ChartStage>
        </ChartPanel>
      </HorizontalBand>

      <NotionalExposureBar
        badge={filter === "expired" ? "Historical" : "Live"}
        categoryKey="underlying"
        data={underlyings}
        dataKey="value"
        filter={filter}
        glow="purple"
        gradientId="underlyingGrad"
        sectionId="an-underlying"
        title="Underlying Exposure"
      />

      <NotionalExposureBar
        badge={filter === "expired" ? "Historical" : "Live"}
        categoryKey="issuer"
        data={issuers}
        dataKey="value"
        filter={filter}
        glow="cyan"
        gradientId="issuerGrad"
        sectionId="an-issuer"
        title="Issuer Exposure"
        tooltipLabelKey="issuerFull"
        yAxisWidth={issuerAxisWidth(
          issuers.map((row) => String(row.issuer)),
          issuers.length,
          12,
        )}
      />

      <HorizontalBand>
        <ChartPanel glow="cyan" icon="chart" subtitle={tenorSubtitle} title="Tenor Profile">
          <SectionInfo {...SECTION_INFO["an-tenor"]} />
          <ChartStage className="chart-stage-single" height="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tenor} margin={{ ...chartMargins, bottom: 36, left: 100 }}>
                <defs>
                  <linearGradient id="tenorGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.payoff} />
                    <stop offset="55%" stopColor={chartTheme.payoff} stopOpacity={0.88} />
                    <stop offset="100%" stopColor={chartTheme.underlying} stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <PremiumGrid />
                <CategoryAxis dataKey="bucket" height={40} />
                <CroreLacYAxis tickCount={6} tickFontSize={11} width={100} />
                <RechartsPremiumTooltip formatter={(v) => formatCrores(Number(v))} />
                <Bar
                  {...chartAnim}
                  dataKey="notional"
                  fill="url(#tenorGrad)"
                  maxBarSize={44}
                  name={tenorSeriesName}
                  radius={[10, 10, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartStage>
        </ChartPanel>
      </HorizontalBand>
    </motion.div>
  );
}
