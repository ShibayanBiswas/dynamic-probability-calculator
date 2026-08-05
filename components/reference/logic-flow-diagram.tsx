"use client";

import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  Database,
  LayoutDashboard,
  LineChart,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";

import type { LogicFlow, LogicModule, LogicNode, LogicNodeKind } from "@/lib/logic-atlas";
import { cn } from "@/lib/utils";

const kindIcons: Record<LogicNodeKind, typeof Database> = {
  input: Search,
  process: Cpu,
  engine: Zap,
  lookup: Database,
  output: LineChart,
};

const moduleIcons: Record<string, typeof Database> = {
  "data-foundation": Database,
  "primary-dashboard": LayoutDashboard,
  "primary-valuation": Sparkles,
  "primary-payoff": LineChart,
  "analytics-lab": BarChart3,
  "portfolio-analytics": BarChart3,
};

/** Per-kind colours so Active Pipeline cards never clone the module-rail accent above. */
const kindColorMap: Record<
  LogicNodeKind,
  { border: string; bg: string; text: string; textDark: string; ring: string; iconBg: string }
> = {
  input: {
    border: "border-sky-400/50",
    bg: "bg-gradient-to-br from-sky-50 via-white to-cyan-50/70",
    text: "text-sky-800",
    textDark: "dark:text-sky-300",
    ring: "ring-sky-400/45",
    iconBg: "bg-sky-500/12 dark:bg-sky-400/15",
  },
  process: {
    border: "border-teal-500/45",
    bg: "bg-gradient-to-br from-teal-50 via-white to-emerald-50/60",
    text: "text-teal-800",
    textDark: "dark:text-teal-300",
    ring: "ring-teal-400/45",
    iconBg: "bg-teal-500/12 dark:bg-teal-400/15",
  },
  engine: {
    border: "border-violet-500/45",
    bg: "bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/50",
    text: "text-violet-900",
    textDark: "dark:text-violet-300",
    ring: "ring-violet-400/40",
    iconBg: "bg-violet-500/12 dark:bg-violet-400/15",
  },
  lookup: {
    border: "border-indigo-500/45",
    bg: "bg-gradient-to-br from-indigo-50 via-white to-blue-50/60",
    text: "text-indigo-900",
    textDark: "dark:text-indigo-300",
    ring: "ring-indigo-400/40",
    iconBg: "bg-indigo-500/12 dark:bg-indigo-400/15",
  },
  output: {
    border: "border-emerald-500/50",
    bg: "bg-gradient-to-br from-emerald-50 via-white to-lime-50/50",
    text: "text-emerald-900",
    textDark: "dark:text-emerald-300",
    ring: "ring-emerald-400/45",
    iconBg: "bg-emerald-500/12 dark:bg-emerald-400/15",
  },
};

const arrowByKind: Record<LogicNodeKind, string> = {
  input: "text-sky-600/80 dark:text-sky-400/90",
  process: "text-teal-600/80 dark:text-teal-400/90",
  engine: "text-violet-600/80 dark:text-violet-400/90",
  lookup: "text-indigo-600/80 dark:text-indigo-400/90",
  output: "text-emerald-600/80 dark:text-emerald-400/90",
};

function FlowNode({
  node,
  index,
  active,
  onClick,
}: {
  node: LogicNode;
  index: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const Icon = kindIcons[node.kind];
  const colors = kindColorMap[node.kind];

  return (
    <motion.button
      className={cn(
        "logic-node group relative w-full overflow-hidden rounded-xl border p-3.5 text-left shadow-sm transition-all duration-200",
        `logic-node--${node.kind}`,
        colors.border,
        colors.bg,
        active && cn("ring-2 ring-offset-2 ring-offset-[var(--ar-surface)] shadow-md", colors.ring),
        onClick && "cursor-pointer hover:shadow-lg",
      )}
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.985 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: "easeOut" }}
      type="button"
      onClick={onClick}
    >
      <motion.span
        aria-hidden
        className="logic-node__orb"
        animate={{ opacity: [0.35, 0.65, 0.35], scale: [1, 1.15, 1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: index * 0.12 }}
      />
      <div className="relative z-[1] flex items-start gap-3">
        <motion.div
          className={cn("rounded-xl p-2", colors.iconBg)}
          animate={{ rotate: [0, -6, 6, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: index * 0.18 }}
        >
          <Icon className={cn("h-4 w-4", colors.text, colors.textDark)} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[10px] font-bold uppercase tracking-[0.25em]", colors.text, colors.textDark)}>
            {node.kind}
          </p>
          <p className="mt-1 font-semibold text-ink dark:text-stone-100">{node.label}</p>
          <p className="mt-1 text-xs leading-5 text-stone-600 dark:text-stone-400">{node.description}</p>
          {node.detail ? (
            <p className="mt-1 text-[11px] leading-4 text-stone-500 dark:text-stone-500">{node.detail}</p>
          ) : null}
        </div>
      </div>
    </motion.button>
  );
}

function FlowArrow({ vertical, toKind }: { vertical?: boolean; toKind?: LogicNodeKind }) {
  const Icon = vertical ? ArrowDown : ArrowRight;
  const color = toKind ? arrowByKind[toKind] : "text-gold-dark/70";
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-1"
      animate={{ opacity: [0.45, 1, 0.45], x: vertical ? 0 : [0, 3, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <Icon className={cn("h-4 w-4", color)} />
    </motion.div>
  );
}

/** Topological layout: horizontal pipeline with animated connectors. */
export function LogicFlowDiagram({
  module,
  activeNodeId,
  onNodeSelect,
  horizontal = true,
}: {
  module: LogicModule;
  activeNodeId?: string;
  onNodeSelect?: (node: LogicNode) => void;
  horizontal?: boolean;
}) {
  const ordered = orderNodes(module.nodes, module.flows);

  if (horizontal) {
    return (
      <div className="horizontal-rail -mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex min-w-min snap-x snap-mandatory items-stretch gap-2">
          {ordered.map((node, index) => {
            return (
              <div key={node.id} className="flex min-w-[300px] max-w-[440px] snap-start items-center gap-2">
                {index > 0 ? <FlowArrow toKind={node.kind} /> : null}
                <FlowNode
                  active={activeNodeId === node.id}
                  index={index}
                  node={node}
                  onClick={onNodeSelect ? () => onNodeSelect(node) : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="logic-pipeline space-y-2">
      {ordered.map((node, index) => {
        return (
          <div key={node.id}>
            {index > 0 ? <FlowArrow toKind={node.kind} vertical /> : null}
            <FlowNode
              active={activeNodeId === node.id}
              index={index}
              node={node}
              onClick={onNodeSelect ? () => onNodeSelect(node) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}

function orderNodes(nodes: LogicNode[], flows: LogicFlow[]): LogicNode[] {
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => !flows.some((f) => f.to === n.id));
  const ordered: LogicNode[] = [];
  const visited = new Set<string>();
  const queue = roots.map((r) => r.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = idToNode.get(id);
    if (node) ordered.push(node);
    for (const flow of flows) {
      if (flow.from === id && !visited.has(flow.to)) queue.push(flow.to);
    }
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) ordered.push(node);
  }

  return ordered;
}

export function LogicModuleCard({
  module,
  selected,
  pipelineComplete,
  onSelect,
}: {
  module: LogicModule;
  selected?: boolean;
  pipelineComplete?: boolean;
  onSelect: () => void;
}) {
  const Icon = moduleIcons[module.id] ?? Sparkles;

  return (
    <motion.button
      className={cn(
        "logic-module-card gap-3",
        `logic-module-card--${module.accent}`,
        selected && "logic-module-card--selected",
      )}
      type="button"
      onClick={onSelect}
      layout
      whileHover={{ y: -6, scale: 1.018 }}
      whileTap={{ scale: 0.982 }}
      animate={
        selected
          ? {
              boxShadow: [
                "0 14px 36px -16px rgba(212,178,76,0.28)",
                "0 18px 44px -14px rgba(212,178,76,0.42)",
                "0 14px 36px -16px rgba(212,178,76,0.28)",
              ],
            }
          : undefined
      }
      transition={{ type: "spring", stiffness: 360, damping: 24 }}
    >
      <span className="logic-module-card__sheen" aria-hidden />
      <motion.span
        aria-hidden
        className="logic-module-card__orb logic-module-card__orb--primary"
        animate={{ opacity: [0.25, 0.55, 0.25], scale: [1, 1.18, 1], x: [0, 8, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        aria-hidden
        className="logic-module-card__orb logic-module-card__orb--secondary"
        animate={{ opacity: [0.15, 0.4, 0.15], scale: [1, 1.22, 1], y: [0, -6, 0] }}
        transition={{ duration: 5.1, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      />

      <div className="relative z-[1] flex min-w-0 flex-1 items-start gap-3.5">
        <motion.div
          className="logic-module-card__icon h-12 w-12"
          animate={{ rotate: [0, -6, 6, 0], y: [0, -1, 0] }}
          transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon className="h-5 w-5" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <motion.p
            className="logic-module-card__kicker"
            animate={selected ? { letterSpacing: ["0.22em", "0.28em", "0.22em"] } : undefined}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          >
            {module.subtitle}
          </motion.p>
          <h3 className="logic-module-card__title mt-1.5 font-serif text-lg font-bold leading-snug text-ink md:text-xl">
            {module.title}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400 md:text-[13px]">
            {module.purpose}
          </p>
        </div>
      </div>

      <div className="logic-module-card__footer relative z-[1] flex flex-wrap items-center gap-1.5">
        {pipelineComplete ? (
          <motion.span
            className="logic-module-card__connected inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300"
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </motion.span>
        ) : null}
        {module.metrics.map((m, i) => (
          <motion.span
            key={m.label}
            className="logic-module-metric"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i, duration: 0.3 }}
            whileHover={{ y: -1, scale: 1.04 }}
          >
            <span className="logic-module-metric__label">{m.label}:</span> {m.value}
          </motion.span>
        ))}
      </div>
    </motion.button>
  );
}
