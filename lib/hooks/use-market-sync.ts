"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { runWhenIdle } from "@/lib/client/idle-task";
import { hasCompleteIndexLevels } from "@/lib/desk-index-state";
import type { MarketLevels } from "@/lib/market-data";
import { deskDateKey } from "@/lib/market-data";

const MARKET_FETCH_TIMEOUT_MS = 8_000;
/** First live pull waits for paint + idle so inputs don't flash mid-hydration. */
const MARKET_FIRST_IDLE_MS = 600;
/** Auto-refresh (tab focus / timer) never thrashes faster than this. */
const MARKET_MIN_AUTO_GAP_MS = 5_000;
/** Skip visibility refreshes while levels are still fresh. */
const MARKET_VISIBILITY_STALE_MS = 5 * 60_000;
const MARKET_HOURLY_MS = 60 * 60_000;
const MARKET_DAY_CHECK_MS = 60_000;

export type MarketRefreshOptions = {
  /** Bypass throttle — used by the Refresh button. */
  force?: boolean;
};

export function useMarketSync(
  onSync: (levels: MarketLevels) => void,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false;
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [levels, setLevels] = useState<MarketLevels | null>(null);
  const levelsRef = useRef<MarketLevels | null>(null);
  const lastFetchAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const onSyncRef = useRef(onSync);
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  const refresh = useCallback(async (opts?: MarketRefreshOptions) => {
    const force = opts?.force === true;
    const now = Date.now();
    if (inFlightRef.current) return levelsRef.current;
    if (!force && lastFetchAtRef.current > 0 && now - lastFetchAtRef.current < MARKET_MIN_AUTO_GAP_MS) {
      return levelsRef.current;
    }

    inFlightRef.current = true;
    setStatus((current) => (current === "ready" ? "ready" : "loading"));
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), MARKET_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/market/levels", { signal: controller.signal });
      if (!res.ok) throw new Error("market fetch failed");
      const data = (await res.json()) as MarketLevels;
      lastFetchAtRef.current = Date.now();

      const previous = levelsRef.current;
      // Never replace a good Yahoo mark with a weaker fallback on a soft refresh.
      const keepPrevious =
        !force &&
        previous != null &&
        previous.source === "yahoo" &&
        data.source === "fallback" &&
        hasCompleteIndexLevels(previous);

      const next = keepPrevious ? previous : data;
      levelsRef.current = next;
      setLevels(next);
      if (hasCompleteIndexLevels(next)) {
        onSyncRef.current(next);
      }
      setStatus("ready");
      return next;
    } catch {
      setStatus((current) => (current === "ready" ? "ready" : "error"));
      return levelsRef.current;
    } finally {
      inFlightRef.current = false;
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let intervalId: number | undefined;
    runWhenIdle(() => {
      void refresh();
      intervalId = window.setInterval(() => {
        void refresh();
      }, MARKET_HOURLY_MS);
    }, MARKET_FIRST_IDLE_MS);

    return () => {
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;

    const softRefreshIfStale = () => {
      if (document.visibilityState === "hidden") return;
      const age = Date.now() - lastFetchAtRef.current;
      if (lastFetchAtRef.current > 0 && age < MARKET_VISIBILITY_STALE_MS) return;
      void refresh();
    };

    const check = window.setInterval(() => {
      const current = levelsRef.current;
      if (current && deskDateKey() !== deskDateKey(new Date(current.fetchedAt))) {
        void refresh({ force: true });
      }
    }, MARKET_DAY_CHECK_MS);

    document.addEventListener("visibilitychange", softRefreshIfStale);
    return () => {
      window.clearInterval(check);
      document.removeEventListener("visibilitychange", softRefreshIfStale);
    };
  }, [enabled, refresh]);

  return { status, levels, refresh };
}
