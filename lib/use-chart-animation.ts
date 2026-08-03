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
