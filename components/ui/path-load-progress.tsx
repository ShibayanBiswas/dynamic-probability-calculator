"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Inline path-load progress — Gift AIF Backtester ProgressModal bar language,
 * without the modal overlay (desk stays interactive).
 */
export function PathLoadProgress({
  active,
  label = "Computing historical paths…",
}: {
  active: boolean;
  label?: string;
}) {
  const reduce = useReducedMotion();
  const [progress, setProgress] = useState(3);

  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const elapsedSec = (Date.now() - started) / 1000;
      // Asymptote toward ~92% until the server responds, then parent unmounts this.
      const next = Math.min(92, 3 + 89 * (1 - Math.exp(-elapsedSec / 1.15)));
      setProgress(next);
    }, 80);
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
            transition={reduce ? { duration: 0 } : { ease: "easeOut", duration: 0.28 }}
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
