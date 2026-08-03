export type ChartThemeTokens = {
  grid: string;
  gridMajor: string;
  gridMinor: string;
  gridFine: string;
  axis: string;
  axisLabel: string;
  axisLine: string;
  tick: string;
  legend: string;
  payoff: string;
  payoffGlow: string;
  underlying: string;
  underlyingGlow: string;
  positive: string;
  negative: string;
  plotBg: string;
  plotBorder: string;
  referenceLine: string;
  cursorFill: string;
  cursorStroke: string;
  dotStroke: string;
  tooltip: {
    background: string;
    border: string;
    borderRadius: number;
    boxShadow: string;
    color: string;
    backdropFilter: string;
  };
};

/** Shared Recharts styling — ARWL light desk palette. */
export const chartThemeLight: ChartThemeTokens = {
  grid: "rgba(120, 113, 108, 0.15)",
  gridMajor: "rgba(212, 178, 76, 0.35)",
  gridMinor: "rgba(120, 113, 108, 0.08)",
  gridFine: "rgba(122, 30, 44, 0.1)",
  axis: "#78716c",
  axisLabel: "#57534e",
  axisLine: "rgba(120, 113, 108, 0.35)",
  tick: "#57534e",
  legend: "#44403c",
  payoff: "#d4b24c",
  payoffGlow: "rgba(212, 178, 76, 0.45)",
  underlying: "#7a1e2c",
  underlyingGlow: "rgba(122, 30, 44, 0.35)",
  positive: "#16a34a",
  negative: "#c2410c",
  plotBg: "#ffffff",
  plotBorder: "rgba(120, 113, 108, 0.2)",
  referenceLine: "rgba(212, 178, 76, 0.35)",
  cursorFill: "rgba(212, 178, 76, 0.08)",
  cursorStroke: "rgba(212, 178, 76, 0.35)",
  dotStroke: "#ffffff",
  tooltip: {
    background: "rgba(255, 255, 255, 0.98)",
    border: "1px solid rgba(212, 178, 76, 0.35)",
    borderRadius: 16,
    boxShadow: "0 8px 32px -8px rgba(17, 17, 17, 0.12)",
    color: "#111111",
    backdropFilter: "blur(12px)",
  },
};

/** Vampire dark — void plot, ember gold, warm bronze secondary (no crimson text). */
export const chartThemeDark: ChartThemeTokens = {
  grid: "rgba(212, 178, 76, 0.08)",
  gridMajor: "rgba(212, 178, 76, 0.22)",
  gridMinor: "rgba(80, 70, 60, 0.16)",
  gridFine: "rgba(212, 178, 76, 0.06)",
  axis: "#e8d9a8",
  axisLabel: "#f5e6b8",
  axisLine: "rgba(212, 178, 76, 0.32)",
  tick: "#faf8f5",
  legend: "#f5f0e8",
  payoff: "#ffd95a",
  payoffGlow: "rgba(255, 217, 90, 0.45)",
  underlying: "#b8956a",
  underlyingGlow: "rgba(184, 149, 106, 0.42)",
  positive: "#6ee7a8",
  negative: "#e8a04a",
  plotBg: "#040303",
  plotBorder: "rgba(212, 178, 76, 0.28)",
  referenceLine: "rgba(212, 178, 76, 0.32)",
  cursorFill: "rgba(212, 178, 76, 0.1)",
  cursorStroke: "rgba(255, 217, 90, 0.45)",
  dotStroke: "#120c0e",
  tooltip: {
    background: "rgba(8, 5, 6, 0.96)",
    border: "1px solid rgba(212, 178, 76, 0.38)",
    borderRadius: 16,
    boxShadow: "0 12px 40px -8px rgba(0, 0, 0, 0.75), 0 0 20px -8px rgba(212, 178, 76, 0.15)",
    color: "#f5f5f4",
    backdropFilter: "blur(14px)",
  },
};

/** Static default for non-reactive imports (light). */
export const chartTheme = chartThemeLight;

export const categoryNeon: Record<string, string> = {
  Primary: "#d4b24c",
};
