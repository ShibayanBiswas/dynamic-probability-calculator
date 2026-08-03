"use client";

import { useTheme } from "@/lib/context/theme-provider";
import { chartThemeDark, chartThemeLight, type ChartThemeTokens } from "@/lib/chart-theme";

export function useChartTheme(): ChartThemeTokens {
  const { theme } = useTheme();
  return theme === "dark" ? chartThemeDark : chartThemeLight;
}
