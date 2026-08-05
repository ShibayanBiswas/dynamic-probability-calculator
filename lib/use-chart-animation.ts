"use client";

import { useEffect, useState } from "react";

export type ChartAnimationProps = {
  isAnimationActive: boolean;
  animationBegin: number;
  animationDuration: number;
  animationEasing: "ease-out";
};

const STATIC_CHART_ANIM: ChartAnimationProps = {
  isAnimationActive: false,
  animationBegin: 0,
  animationDuration: 0,
  animationEasing: "ease-out",
};

const LIVE_CHART_ANIM: ChartAnimationProps = {
  isAnimationActive: true,
  animationBegin: 80,
  animationDuration: 900,
  animationEasing: "ease-out",
};

/** Soft bar/line entrance — respects prefers-reduced-motion. */
export function useChartAnimation(): ChartAnimationProps {
  const [anim, setAnim] = useState<ChartAnimationProps>(STATIC_CHART_ANIM);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setAnim(media.matches ? STATIC_CHART_ANIM : LIVE_CHART_ANIM);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return anim;
}

/**
 * Entrance draw that plays once per `resetKey`, then goes static.
 *
 * Interactive charts re-render on every cursor move, keystroke, or live mark, and
 * Recharts replays the draw each time the series props change — which reads as a
 * flickering line. Holding the animation to the entrance keeps updates steady.
 */
export function useEntranceChartAnimation(resetKey?: string | number): ChartAnimationProps {
  const base = useChartAnimation();
  const [entranceDone, setEntranceDone] = useState(false);

  useEffect(() => {
    if (!base.isAnimationActive) return;
    setEntranceDone(false);
    const id = window.setTimeout(
      () => setEntranceDone(true),
      base.animationBegin + base.animationDuration + 120,
    );
    return () => window.clearTimeout(id);
  }, [resetKey, base.isAnimationActive, base.animationBegin, base.animationDuration]);

  return entranceDone ? STATIC_CHART_ANIM : base;
}
