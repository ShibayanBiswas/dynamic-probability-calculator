"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useClientMounted } from "@/lib/hooks/use-client-mounted";
import {
  getLifecycleFilterServerSnapshot,
  getLifecycleFilterSnapshot,
  setStoredLifecycleFilter,
  subscribeLifecycleFilter,
} from "@/lib/lifecycle-filter-store";
import type { LifecycleFilter } from "@/lib/product-lifecycle";

/** Shared Ongoing / Expired / Expiring tab — persists while the browser tab is open. */
export function useLifecycleFilter(defaultFilter: LifecycleFilter = "ongoing") {
  const hydrated = useClientMounted();
  const filter = useSyncExternalStore(
    subscribeLifecycleFilter,
    getLifecycleFilterSnapshot,
    getLifecycleFilterServerSnapshot,
  );

  const setFilter = useCallback((next: LifecycleFilter) => {
    setStoredLifecycleFilter(next);
  }, []);

  return { filter: hydrated ? filter : defaultFilter, setFilter, hydrated };
}
