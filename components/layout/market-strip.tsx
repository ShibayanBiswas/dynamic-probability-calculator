"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Activity, CalendarClock, TrendingUp, Zap } from "lucide-react";

import { useDataset } from "@/lib/context/dataset-provider";
import { useHeadlineKpis } from "@/lib/hooks/use-headline-kpis";
import { deskEase } from "@/lib/motion";
import { cn, formatKpiCount, formatKpiNotional } from "@/lib/utils";

export function MarketStrip() {
  const { uploadState } = useDataset();
  const { headline: stats, hasBook, isLoading } = useHeadlineKpis();
  const reduce = useReducedMotion();

  const ready = hasBook && !isLoading;
  const count = (value: number) => formatKpiCount(value, ready);

  const items = [
    { icon: Zap, label: "Live", value: ready ? formatKpiNotional(stats.liveNotional) : "—", color: "text-gold" },
    { icon: TrendingUp, label: "Active", value: count(stats.activeCount), color: "text-emerald-800" },
    { icon: CalendarClock, label: "Obs 3M", value: count(stats.obsDue3m), color: "text-violet-700" },
    { icon: CalendarClock, label: "Obs 2M", value: count(stats.obsDue2m), color: "text-violet-600" },
    { icon: CalendarClock, label: "Obs 1M", value: count(stats.obsDue1m), color: "text-violet-500" },
    { icon: Activity, label: "3M", value: count(stats.maturingSoon), color: "text-orange-400" },
    { icon: Activity, label: "1M", value: count(stats.expiring1m), color: "text-rose-400" },
  ];

  return (
    <div className="market-strip market-strip-live overflow-hidden">
      <div className="mx-auto flex max-w-full items-center justify-between gap-4 px-4 py-1.5 lg:px-6">
        <div className="flex flex-wrap items-center gap-4">
          {items.map((item, index) => (
            <motion.span
              key={item.label}
              className="inline-flex items-center gap-1.5 text-[11px]"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.35, ease: deskEase }}
              whileHover={reduce ? undefined : { y: -1, scale: 1.04 }}
            >
              <motion.span
                animate={reduce ? undefined : { scale: [1, 1.15, 1] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: index * 0.15 }}
              >
                <item.icon className={cn("h-3 w-3", item.color)} />
              </motion.span>
              <span className="text-muted">{item.label}</span>
              <span className={cn("font-semibold text-ink", item.color)}>{item.value}</span>
            </motion.span>
          ))}
        </div>
        <motion.p
          className="text-muted truncate text-[10px]"
          animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {uploadState}
        </motion.p>
      </div>
    </div>
  );
}
