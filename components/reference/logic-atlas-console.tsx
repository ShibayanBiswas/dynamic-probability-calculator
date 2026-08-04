"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  Brain,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  LayoutDashboard,
  LineChart,
  Sparkles,
  Wallet,
} from "lucide-react";

import { LogicFlowDiagram, LogicModuleCard } from "@/components/reference/logic-flow-diagram";
import { MasterSheetPivot } from "@/components/reference/master-sheet-pivot";
import { HorizontalBand, HorizontalRail, RailCard } from "@/components/layout/horizontal-rail";
import { AppPage, KpiBand, Panel, SectionInfo, SectionTitle, SubTitle } from "@/components/layout/app-ui";
import { DynamicTable, type DynamicTableColumn } from "@/components/ui/dynamic-table";
import { useHeadlineKpis } from "@/lib/hooks/use-headline-kpis";
import { useLifecycleIndex } from "@/lib/hooks/use-lifecycle-index";
import {
  getCategoryIntelligenceMap,
  getComputationPrimitives,
  getDisconnectedNodes,
  isPipelineComplete,
  logicModules,
  type LogicNode,
  type ComputationPrimitive,
} from "@/lib/logic-atlas";
import { categoryNeon } from "@/lib/chart-theme";
import { SECTION_INFO } from "@/lib/section-info";
import { cn, formatKpiCount, formatKpiNotional, formatNumber } from "@/lib/utils";

const PRIMITIVE_COLUMNS: DynamicTableColumn<ComputationPrimitive>[] = [
  {
    key: "name",
    header: "Primitive",
    cellClassName: "font-medium text-ink",
    render: (row) => row.name,
  },
  {
    key: "category",
    header: "Category",
    render: (row) => <span className="status-badge status-badge-perpetual">{row.category}</span>,
  },
  {
    key: "count",
    header: "Uses",
    align: "right",
    headerClassName: "text-right",
    cellClassName: "font-mono text-xs tabular-nums text-maroon",
    render: (row) => formatNumber(row.count),
  },
  {
    key: "role",
    header: "Role",
    cellClassName: "text-stone-600 dark:text-stone-400",
    render: (row) => row.role,
  },
];

const DESK_LINKS: Array<{ href: Route; label: string }> = [
  { href: "/", label: "Home" },
  { href: "/portfolio/analytics", label: "Analytics Lab" },
  { href: "/probability", label: "Probability" },
  { href: "/initial-probability", label: "Initial Probability" },
  { href: "/current-probability", label: "Current Probability" },
  { href: "/upload", label: "Upload Master" },
];

const ACCENT_PANEL: Record<string, "cyan" | "purple" | "green" | "amber" | "rose"> = {
  "data-foundation": "amber",
  "primary-dashboard": "cyan",
  "initial-probability": "purple",
  "current-probability": "green",
  "primary-valuation": "purple",
  "primary-payoff": "green",
  "portfolio-analytics": "rose",
};

export function LogicAtlasConsole() {
  const { headline: stats, hasBook, isLoading } = useHeadlineKpis();
  const { validProducts: masterProducts } = useLifecycleIndex();
  const ready = hasBook && !isLoading;
  const [selectedId, setSelectedId] = useState(logicModules[0]?.id);
  const [activeNode, setActiveNode] = useState<LogicNode | null>(null);

  const selected = logicModules.find((m) => m.id === selectedId) ?? logicModules[0];
  const categoryMap = getCategoryIntelligenceMap();
  const primitives = useMemo(() => getComputationPrimitives(masterProducts), [masterProducts]);
  const disconnected = useMemo(() => getDisconnectedNodes(selected), [selected]);
  const pipelineOk = isPipelineComplete(selected);
  const panelAccent = ACCENT_PANEL[selected.id] ?? "cyan";

  const totalStages = logicModules.reduce((s, m) => s + m.nodes.length, 0);
  const completeModules = logicModules.filter(isPipelineComplete).length;

  const count = (value: number) => formatKpiCount(value, ready);

  return (
      <AppPage dense title="Intel · Logic Atlas" subtitle="Probability and portfolio analytics pipelines">
      <div className="intel-page">
        <motion.header
          className="intel-hero"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <div className="intel-hero-orb intel-hero-orb--gold" aria-hidden />
          <div className="intel-hero-orb intel-hero-orb--maroon" aria-hidden />
          <p className="intel-hero-kicker relative z-10">Anand Rathi Wealth · Desk Intelligence</p>
          <h1 className="intel-hero-title relative z-10">Intel · Logic Atlas</h1>
          <p className="intel-hero-sub relative z-10">
            Canonical map of how the NEW PRIMARY desk book flows from master data through probability engines,
            observation schedules, Effective Target, and portfolio analytics. Rollover Phase sets Blank, Phase 1,
            Phase 2, and Ten Years start and end dates for every live product.
          </p>
          <div className="intel-hero-meta relative z-10">
            <motion.span
              className="intel-hero-badge"
              animate={{
                boxShadow: [
                  "0 0 0 rgba(212,178,76,0)",
                  "0 0 18px rgba(212,178,76,0.35)",
                  "0 0 0 rgba(212,178,76,0)",
                ],
              }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {completeModules}/{logicModules.length} pipelines connected
            </motion.span>
            <span className="intel-hero-badge">
              <Wallet className="h-3.5 w-3.5" />
              {ready ? formatKpiNotional(stats.liveNotional) : "—"} live
            </span>
          </div>
        </motion.header>

        <HorizontalBand>
          <SectionInfo {...SECTION_INFO["intel-overview"]} />
        </HorizontalBand>

        <HorizontalBand>
          <KpiBand
            accents={["cyan", "purple", "green", "amber", "rose"]}
            items={[
              { label: "Logic Modules", value: formatNumber(logicModules.length) },
              { label: "Pipeline Stages", value: formatNumber(totalStages) },
              { label: "Valid Products", value: count(masterProducts.length) },
              { label: "Ongoing", value: count(stats.ongoingCount) },
              { label: "Live Notional", value: ready ? formatKpiNotional(stats.liveNotional) : "—" },
            ]}
          />
        </HorizontalBand>

        <HorizontalBand>
          <MasterSheetPivot />
        </HorizontalBand>

        <HorizontalBand>
          <Panel className="intel-panel !p-4 md:!p-5" glow="purple">
            <div className="intel-section-head">
              <div>
                <SectionTitle icon={LayoutDashboard}>Reference Logic Modules</SectionTitle>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                  Wider cards · scroll horizontally to browse all {logicModules.length} modules · {completeModules}{" "}
                  fully wired · each accent is a distinct lane colour
                </p>
              </div>
              <nav aria-label="Desk shortcuts" className="intel-desk-nav">
                {DESK_LINKS.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.25 }}
                  >
                    <Link className="intel-desk-link" href={link.href}>
                      <ExternalLink className="h-3 w-3 opacity-70" />
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
              </nav>
            </div>
            <HorizontalRail className="logic-module-rail mt-4" fillFirst={false} gap="gap-4">
              {logicModules.map((module, index) => (
                <RailCard key={module.id} className="logic-module-rail-item" fillFirst={false}>
                  <motion.div
                    className="h-full"
                    initial={{ opacity: 0, y: 18, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <LogicModuleCard
                      module={module}
                      pipelineComplete={isPipelineComplete(module)}
                      selected={selectedId === module.id}
                      onSelect={() => {
                        setSelectedId(module.id);
                        setActiveNode(null);
                      }}
                    />
                  </motion.div>
                </RailCard>
              ))}
            </HorizontalRail>
          </Panel>
        </HorizontalBand>

        <HorizontalBand>
          <SectionInfo {...SECTION_INFO["intel-pipeline"]} />
        </HorizontalBand>

        <HorizontalBand>
          <Panel
            className={cn("intel-panel intel-panel--accent !p-4 md:!p-5", `intel-panel--${panelAccent}`)}
            glow={panelAccent === "purple" || panelAccent === "rose" ? "purple" : "cyan"}
          >
            <div className="intel-section-head">
              <div>
                <SubTitle>Active pipeline</SubTitle>
                <AnimatePresence mode="wait">
                  <motion.h3
                    key={selected.id}
                    className="mt-1 font-serif text-xl font-bold tracking-tight text-ink md:text-2xl"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.28 }}
                  >
                    {selected.title}
                  </motion.h3>
                </AnimatePresence>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                  {selected.purpose}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selected.metrics.map((m) => (
                    <span key={m.label} className="logic-module-metric">
                      <span className="logic-module-metric__label">{m.label}:</span> {m.value}
                    </span>
                  ))}
                  <span className="logic-module-metric">
                    <span className="logic-module-metric__label">Stages:</span> {selected.nodes.length}
                  </span>
                  <span className="logic-module-metric">
                    <span className="logic-module-metric__label">Flows:</span> {selected.flows.length}
                  </span>
                </div>
              </div>
              <motion.span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em]",
                  pipelineOk
                    ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                    : "border-amber-400/35 bg-amber-500/10 text-amber-900 dark:text-amber-200",
                )}
                animate={pipelineOk ? { scale: [1, 1.03, 1] } : undefined}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                {pipelineOk ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Pipeline complete
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {disconnected.length} orphaned node{disconnected.length === 1 ? "" : "s"}
                  </>
                )}
              </motion.span>
            </div>
            <div className={cn("intel-pipeline-shell mt-4", `intel-pipeline-shell--${selected.accent}`)}>
              <LogicFlowDiagram
                activeNodeId={activeNode?.id}
                horizontal
                module={selected}
                onNodeSelect={setActiveNode}
              />
            </div>
          </Panel>
        </HorizontalBand>

        <HorizontalBand>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel className={cn("intel-panel !p-4 md:!p-5", `intel-panel--${panelAccent}`)} glow="purple">
              <SectionTitle icon={Brain}>{activeNode ? activeNode.label : "Module Intelligence"}</SectionTitle>
              <AnimatePresence mode="wait">
                {activeNode ? (
                  <motion.div
                    key={activeNode.id}
                    className="mt-3 space-y-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="status-badge status-badge-perpetual">{activeNode.kind}</span>
                      <span className="rounded-full border border-stone-300/70 bg-white/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-stone-600 dark:border-stone-600 dark:bg-stone-900/50 dark:text-stone-300">
                        Pipeline stage
                      </span>
                      {(activeNode.tags ?? []).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-gold-dark dark:text-gold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                      {activeNode.description}
                    </p>
                    {activeNode.detail ? (
                      <p className="rounded-lg border border-stone-200/80 bg-white/60 p-3 text-[13px] leading-relaxed text-stone-600 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-300">
                        {activeNode.detail}
                      </p>
                    ) : null}
                    {(activeNode.metrics ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(activeNode.metrics ?? []).map((m) => (
                          <span key={m.label} className="logic-module-metric">
                            <span className="logic-module-metric__label">{m.label}:</span> {m.value}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      Click another pipeline stage to compare, or clear selection by choosing a module card above.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={`insights-${selected.id}`}
                    className="mt-3 space-y-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">{selected.purpose}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.metrics.map((m) => (
                        <span key={m.label} className="logic-module-metric">
                          <span className="logic-module-metric__label">{m.label}:</span> {m.value}
                        </span>
                      ))}
                      <span className="logic-module-metric">
                        <span className="logic-module-metric__label">Stages:</span> {selected.nodes.length}
                      </span>
                    </div>
                    <ul className="intel-insight-list">
                      {selected.insights.map((insight, i) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05, duration: 0.25 }}
                        >
                          {insight}
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </Panel>

            <Panel className={cn("intel-panel !p-4 md:!p-5", `intel-panel--${panelAccent}`)} glow="cyan">
              <SectionTitle icon={LineChart}>Module Outputs</SectionTitle>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                Deliverables produced when this pipeline finishes — {selected.outputs.length} surfaces for{" "}
                {selected.title}.
              </p>
              <ul className="mt-3 space-y-2">
                {selected.outputs.map((output, i) => (
                  <motion.li
                    key={`${selected.id}-${output}`}
                    className={cn("intel-output-chip", `intel-output-chip--${selected.accent}`)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25 }}
                    whileHover={{ x: 4, scale: 1.01 }}
                  >
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-current/20 text-[10px] font-bold tabular-nums opacity-70">
                      {i + 1}
                    </span>
                    {output}
                  </motion.li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="logic-module-metric">
                  <span className="logic-module-metric__label">Accent:</span> {selected.accent}
                </span>
                <span className="logic-module-metric">
                  <span className="logic-module-metric__label">Flows:</span> {selected.flows.length}
                </span>
                {pipelineOk ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Graph connected
                  </span>
                ) : (
                  <p className="text-xs text-amber-900/90 dark:text-amber-200/90">
                    Orphaned: {disconnected.map((n) => n.label).join(", ")}
                  </p>
                )}
              </div>
            </Panel>
          </div>
        </HorizontalBand>

        <HorizontalBand>
          <Panel className="intel-panel !p-4 md:!p-5" glow="cyan">
            <SectionTitle icon={BarChart3}>Primary Portfolio Command</SectionTitle>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Category lanes — data routing into probability and analytics
            </p>
            <HorizontalRail className="category-intel-rail mt-4" gap="gap-2">
              {categoryMap.map((row, index) => (
                <RailCard key={row.category}>
                  <motion.div
                    className="intel-category-card flex h-full flex-col"
                    style={{ ["--category-accent" as string]: categoryNeon[row.category] }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08, duration: 0.35 }}
                    whileHover={{ y: -4, scale: 1.01 }}
                  >
                    <div className="flex items-center gap-2 pt-0.5">
                      <span
                        className="intel-category-dot h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          color: categoryNeon[row.category],
                          backgroundColor: categoryNeon[row.category],
                        }}
                      />
                      <p className="font-serif text-lg font-bold text-ink">{row.category}</p>
                      <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                        Connected
                      </span>
                    </div>
                    <p className="intel-category-label mt-3">Data lane</p>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{row.dataLane}</p>
                    <p className="intel-category-label mt-3">Probability routing</p>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{row.valuationPath}</p>
                    <p className="intel-category-label mt-3">Effective Target routing</p>
                    <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{row.payoffPath}</p>
                    <p className="intel-category-label mt-3">Support layers</p>
                    <div className="flex flex-wrap gap-1">
                      {row.supportLayers.map((layer) => (
                        <span key={layer} className="logic-module-metric">
                          {layer}
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1 pt-3">
                      {row.keySignals.map((signal) => (
                        <span
                          key={signal}
                          className="rounded-full border border-gold/25 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-gold-dark dark:text-gold"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                </RailCard>
              ))}
            </HorizontalRail>
          </Panel>
        </HorizontalBand>

        <HorizontalBand>
          <SectionInfo {...SECTION_INFO["intel-primitives"]} />
        </HorizontalBand>

        <HorizontalBand>
          <Panel className="intel-panel !p-4 md:!p-5" glow="purple">
            <SectionTitle icon={Sparkles}>Computation Primitives</SectionTitle>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Building blocks referenced across the live book
            </p>
            <div className="mt-4 overflow-hidden rounded-xl border border-stone-200 dark:border-stone-700">
              <DynamicTable
                columns={PRIMITIVE_COLUMNS}
                emptyMessage="Load the master book to see primitive usage counts."
                getRowKey={(row) => row.name}
                rows={primitives}
                scrollClassName="max-h-[min(56vh,520px)] overflow-auto"
                virtualizeAt={999}
              />
            </div>
          </Panel>
        </HorizontalBand>
      </div>
    </AppPage>
  );
}
