"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo } from "react";
import { motion } from "framer-motion";

import { LifecycleProductList } from "@/components/dashboard/lifecycle-product-list";
import { LifecycleAnalyticsGrid } from "@/components/analytics/lifecycle-lab";
import { LifecycleIntelligencePanel } from "@/components/analytics/lifecycle-intelligence";
import { DeferredMount } from "@/components/ui/deferred-mount";
import { HorizontalBand, HorizontalRail, RailCard } from "@/components/layout/horizontal-rail";
import { MasterUploadButton } from "@/components/ui/master-upload-button";
import {
  AppPage,
  Button,
  ChartPanel,
  KpiBand,
  Panel,
  SectionInfo,
  SectionTitle,
} from "@/components/layout/app-ui";
import { SECTION_INFO } from "@/lib/section-info";
import {
  ChartStage,
  CroreLacYAxis,
  DiagonalCategoryAxis,
  PremiumGrid,
  RechartsPremiumTooltip,
  chartMargins,
} from "@/components/charts/chart-kit";
import {
  getMaturityLadder,
  getMaturityLadderAxisTitle,
  getMaturityLadderMode,
  getMaturityLadderSubtitle,
} from "@/lib/analytics";
import { useLifecycleFilterPool, useLifecycleIndex } from "@/lib/hooks/use-lifecycle-index";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { useLifecycleFilter } from "@/lib/hooks/use-lifecycle-filter";
import { useResyncProductToLifecyclePool } from "@/lib/hooks/use-lifecycle-pool-product";
import { useHeadlineKpis } from "@/lib/hooks/use-headline-kpis";
import { formatCrores } from "@/lib/utils";
import { useChartAnimation } from "@/lib/use-chart-animation";
import { useChartTheme } from "@/lib/use-chart-theme";
import { Bar, BarChart, ResponsiveContainer } from "recharts";

const bandMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
};

export function DashboardShell() {
  const chartTheme = useChartTheme();
  const chartAnim = useChartAnimation();
  const lifecycleIndex = useLifecycleIndex();
  const { items: headlineItems, accents: headlineAccents } = useHeadlineKpis();
  const masterProducts = lifecycleIndex.validProducts;
  const { asOf } = usePortfolioClock();
  const { filter: lifecycle, setFilter: setLifecycle } = useLifecycleFilter("ongoing");
  const filteredProducts = useLifecycleFilterPool(lifecycle);

  useResyncProductToLifecyclePool(filteredProducts, lifecycle, asOf);

  const maturityLadder = useMemo(
    () => getMaturityLadder(filteredProducts, asOf),
    [filteredProducts, asOf],
  );
  const maturityLadderMode = useMemo(
    () => getMaturityLadderMode(filteredProducts, asOf),
    [filteredProducts, asOf],
  );
  const maturityLadderSubtitle = getMaturityLadderSubtitle(maturityLadderMode);
  const maturityLadderAxisTitle = getMaturityLadderAxisTitle(maturityLadderMode);

  return (
    <AppPage actions={<MasterUploadButton />} dense>
      <motion.div {...bandMotion}>
        <HorizontalBand>
          <SectionInfo {...SECTION_INFO["home-kpis"]} />
        </HorizontalBand>
      </motion.div>

      <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.05 }}>
        <HorizontalBand className="mt-1">
          <KpiBand accents={[...headlineAccents]} items={headlineItems} />
        </HorizontalBand>
      </motion.div>

      <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.1 }}>
        <HorizontalBand className="mt-4">
          <LifecycleProductList
            activeFilter={lifecycle}
            filter={lifecycle}
            products={masterProducts}
            onFilterChange={setLifecycle}
          />
        </HorizontalBand>
      </motion.div>

      <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.15 }}>
        <HorizontalBand className="mt-4">
          <DeferredMount
            fallback={
              <Panel className="!p-5" glow="cyan">
                <p className="text-center text-sm text-stone-500">Loading category analytics…</p>
              </Panel>
            }
          >
            <LifecycleAnalyticsGrid filter={lifecycle} products={masterProducts} />
          </DeferredMount>
        </HorizontalBand>
      </motion.div>

      <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.2 }}>
        <HorizontalBand className="mt-4">
          <DeferredMount
            fallback={
              <Panel className="!p-5" glow="purple">
                <p className="text-center text-sm text-stone-500">Loading lifecycle intelligence…</p>
              </Panel>
            }
          >
            <LifecycleIntelligencePanel filter={lifecycle} products={masterProducts} />
          </DeferredMount>
        </HorizontalBand>
      </motion.div>

      <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.25 }}>
        <HorizontalBand className="mt-4">
          <DeferredMount
            fallback={
              <ChartPanel glow="cyan" icon="chart" subtitle="Loading maturity ladder…" title="Maturity Ladder">
                <div className="flex h-72 items-center justify-center text-sm text-stone-500">
                  Preparing chart…
                </div>
              </ChartPanel>
            }
          >
            <ChartPanel glow="cyan" icon="chart" subtitle={maturityLadderSubtitle} title="Maturity Ladder">
              <SectionInfo {...SECTION_INFO["home-maturity"]} />
              {maturityLadder.length === 0 ? (
                <div className="flex h-72 items-center justify-center px-6 text-center text-sm text-stone-500">
                  No notional to chart for this lifecycle bucket — check trade amounts and expiration
                  dates in the master file.
                </div>
              ) : (
                <ChartStage className="chart-stage-single" height="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={maturityLadder} margin={{ ...chartMargins, bottom: 48, left: 100 }}>
                      <defs>
                        <linearGradient id="maturityGrad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={chartTheme.payoff} />
                          <stop offset="55%" stopColor={chartTheme.payoff} stopOpacity={0.88} />
                          <stop offset="100%" stopColor={chartTheme.underlying} stopOpacity={0.5} />
                        </linearGradient>
                      </defs>
                      <PremiumGrid />
                      <DiagonalCategoryAxis dataKey="bucket" title={maturityLadderAxisTitle} />
                      <CroreLacYAxis tickCount={6} tickFontSize={11} width={100} />
                      <RechartsPremiumTooltip formatter={(v) => formatCrores(Number(v))} />
                      <Bar
                        {...chartAnim}
                        dataKey="notional"
                        fill="url(#maturityGrad)"
                        maxBarSize={44}
                        name="Notional · to phase end"
                        radius={[10, 10, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartStage>
              )}
            </ChartPanel>
          </DeferredMount>
        </HorizontalBand>
      </motion.div>

      <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.3 }}>
        <HorizontalBand className="mt-4">
          <Panel className="!p-4" glow="cyan">
            <SectionInfo {...SECTION_INFO["home-modules"]} />
            <SectionTitle>Desk Modules</SectionTitle>
            <HorizontalRail className="mt-4">
              <RailCard>
                <Link href={"/probability" as Route}>
                  <Button className="w-full" variant="primary">
                    Probability
                  </Button>
                </Link>
              </RailCard>
              <RailCard>
                <Link href={"/initial-probability" as Route}>
                  <Button className="w-full" variant="primary">
                    Initial Probability
                  </Button>
                </Link>
              </RailCard>
              <RailCard>
                <Link href={"/current-probability" as Route}>
                  <Button className="w-full">Current Probability</Button>
                </Link>
              </RailCard>
              <RailCard>
                <Link href={"/portfolio/analytics" as Route}>
                  <Button className="w-full">Analytics</Button>
                </Link>
              </RailCard>
              <RailCard>
                <Link href={"/intelligence" as Route}>
                  <Button className="w-full">Intel · Logic Atlas</Button>
                </Link>
              </RailCard>
            </HorizontalRail>
          </Panel>
        </HorizontalBand>
      </motion.div>
    </AppPage>
  );
}
