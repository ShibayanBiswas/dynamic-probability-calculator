import type { PortfolioHeadlineSnapshot } from "@/lib/lifecycle-index";
import { LIFECYCLE_FILTER_LABELS } from "@/lib/product-lifecycle";
import { formatKpiCount, formatKpiNotional } from "@/lib/utils";

/** Desk headline KPI cards — live notional, lifecycle buckets, then observation-due horizons. */
export function buildHeadlineKpiItems(
  summary: PortfolioHeadlineSnapshot,
  hasBook: boolean,
  isLoading = false,
) {
  const ready = hasBook && !isLoading;
  const count = (value: number) => formatKpiCount(value, ready);

  return [
    { label: "Live Notional", value: ready ? formatKpiNotional(summary.liveNotional) : "—" },
    { label: LIFECYCLE_FILTER_LABELS.ongoing, value: count(summary.ongoingCount) },
    { label: LIFECYCLE_FILTER_LABELS["obs-due-3m"], value: count(summary.obsDue3m) },
    { label: LIFECYCLE_FILTER_LABELS["obs-due-2m"], value: count(summary.obsDue2m) },
    { label: LIFECYCLE_FILTER_LABELS["obs-due-1m"], value: count(summary.obsDue1m) },
    { label: LIFECYCLE_FILTER_LABELS["expiring-3m"], value: count(summary.maturingSoon) },
    { label: LIFECYCLE_FILTER_LABELS["expiring-1m"], value: count(summary.expiring1m) },
  ];
}

export const HEADLINE_KPI_ACCENTS = [
  "cyan",
  "green",
  "purple",
  "amber",
  "rose",
  "cyan",
  "green",
] as const;
