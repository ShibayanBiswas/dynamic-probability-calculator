"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Inline path-load progress — Gift AIF Backtester bar language,
 * slow and steady pace (no modal overlay).
 */
export function PathLoadProgress({
  active,
  label = "Computing historical paths…",
}: {
  active: boolean;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const [progress, setProgress] = useState(1.5);

  useEffect(() => {
    if (!active) return;
    setProgress(1.5);
    // Gift-style cadence: ~200–280ms ticks, slow climb that asymptotes near 90%.
    const id = window.setInterval(() => {
      setProgress((prev) => {
        const room = 90 - prev;
        if (room <= 0.05) return prev;
        // Slow and steady — larger steps early, then crawl toward 90%.
        const step = Math.max(0.12, room * 0.018);
        return Math.min(90, prev + step);
      });
    }, 220);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const pct = Math.min(100, Math.max(0, progress));

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[rgba(212,178,76,0.35)] bg-[color:var(--ar-surface)] shadow-[0_10px_28px_-18px_rgba(122,30,44,0.35)]">
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500">
          Live path engine
        </p>
        <h3 className="mt-1 font-serif text-xl text-[color:var(--ar-maroon)]">
          Computing historical paths
        </h3>
        <p className="mt-1.5 min-h-[1.25rem] text-sm text-stone-500">{label}</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-[var(--ar-maroon)] to-[var(--ar-gold)]"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={reduce ? { duration: 0 } : { ease: "linear", duration: 0.22 }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-stone-500">Please wait</span>
          <span className="font-semibold tabular-nums text-[color:var(--ar-maroon)]">
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
