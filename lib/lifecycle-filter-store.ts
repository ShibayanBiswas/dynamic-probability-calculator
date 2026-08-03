import { UI_LIFECYCLE_FILTERS, type LifecycleFilter } from "@/lib/product-lifecycle";

const STORAGE_KEY = "dpc-lifecycle-filter-v1";

const listeners = new Set<() => void>();

export function readStoredLifecycleFilter(): LifecycleFilter {
  if (typeof window === "undefined") return "ongoing";
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw && (UI_LIFECYCLE_FILTERS as readonly string[]).includes(raw)) {
      return raw as LifecycleFilter;
    }
  } catch {
    /* ignore */
  }
  return "ongoing";
}

export function subscribeLifecycleFilter(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLifecycleFilterSnapshot(): LifecycleFilter {
  return readStoredLifecycleFilter();
}

export function getLifecycleFilterServerSnapshot(): LifecycleFilter {
  return "ongoing";
}

export function setStoredLifecycleFilter(next: LifecycleFilter) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}
