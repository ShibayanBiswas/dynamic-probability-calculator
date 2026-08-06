"use client";

import { createContext, useContext, useEffect, useMemo, useState, startTransition, type ReactNode } from "react";

import {
  clearDatasetFromBrowser,
  clearLegacyBrowserCaches,
  loadDatasetFromBrowser,
  loadDatasetMetaFromBrowser,
  migrateLegacyLocalStorageDataset,
  saveDatasetToBrowser,
} from "@/lib/client/dataset-storage";
import { parseJsonIdle } from "@/lib/client/idle-task";
import { CANONICAL_MANIFEST } from "@/lib/canonical-manifest";
import { demoDataset } from "@/lib/demo-data";
import { deskBookBlockingError, isStalePrimaryOnlyDeskBook } from "@/lib/desk-book-validation";
import { isLegacyDemoDataset } from "@/lib/dataset-state";
import { hydrateProductRolloverPhases } from "@/lib/product-dates";
import { hydrateProductDisplayNames } from "@/lib/product-display-name";
import { invalidatePortfolioSnapshotCache } from "@/lib/portfolio-snapshot-store";
import { invalidateCategoryStatsCache } from "@/lib/category-stats-cache";
import { clearProbabilityStore } from "@/lib/probability/portfolio-prob-store";
import { ACTIVE_CATEGORIES, type DashboardDataset } from "@/lib/types";

const LEGACY_LOCAL_STORAGE_KEY = "sp-dashboard-dataset-v4";
const STATIC_SEED_URL = "/data/master-seed.json";
const BOOTSTRAP_TIMEOUT_MS = 20_000;

/**
 * Restrict a parsed dataset to the categories that are currently live in the UI
 * (see ACTIVE_CATEGORIES). The dashboard is Primary-only today; this keeps the
 * pipeline defensive if a future master file carries extra sheets.
 */
function restrictToActiveCategories(dataset: DashboardDataset): DashboardDataset {
  const active = new Set(ACTIVE_CATEGORIES);
  const products = dataset.products.filter((product) => active.has(product.category));
  hydrateProductRolloverPhases(products);
  hydrateProductDisplayNames(products);
  return {
    ...dataset,
    products,
    categorySummaries: dataset.categorySummaries.filter((summary) => active.has(summary.category)),
    formulaCatalog: dataset.formulaCatalog.filter(
      (entry) => !entry.category || active.has(entry.category),
    ),
  };
}

function uploadSuccessMessage(dataset: DashboardDataset, source: string) {
  return `${source}: ${dataset.workbookName} · ${dataset.products.length} desk products. Saved on this device — reload will restore it.`;
}

async function loadCachedDeskDataset(): Promise<DashboardDataset | null> {
  const cached =
    (await loadDatasetFromBrowser()) ?? (await migrateLegacyLocalStorageDataset(LEGACY_LOCAL_STORAGE_KEY));
  if (!cached || isLegacyDemoDataset(cached) || isStalePrimaryOnlyDeskBook(cached)) return null;
  const blocking = deskBookBlockingError(cached);
  if (blocking) {
    void clearDatasetFromBrowser();
    return null;
  }
  return cached;
}

async function fetchBootstrapDataset(): Promise<DashboardDataset | null> {
  const seedVersion = CANONICAL_MANIFEST.generatedAt;
  try {
    // Honor Vercel CDN / browser cache (vercel.json Cache-Control). Version query busts on bake.
    const staticRes = await fetch(`${STATIC_SEED_URL}?v=${encodeURIComponent(seedVersion)}`, {
      cache: "force-cache",
    });
    if (staticRes.ok) {
      const raw = await staticRes.text();
      return await parseJsonIdle<DashboardDataset>(raw);
    }
  } catch {
    /* fall through to API */
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);
  try {
    const response = await fetch("/api/parse/bootstrap", { signal: controller.signal });
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as
        | { code?: string; url?: string; error?: string }
        | DashboardDataset;
      if (payload && "code" in payload && payload.code === "USE_STATIC_SEED") {
        const url =
          typeof payload.url === "string"
            ? payload.url
            : `${STATIC_SEED_URL}?v=${encodeURIComponent(seedVersion)}`;
        const retry = await fetch(url, { cache: "force-cache" });
        if (!retry.ok) return null;
        return await parseJsonIdle<DashboardDataset>(await retry.text());
      }
      // Empty / error payloads (true failures) — do not treat USE_STATIC_SEED as failure above.
      if (!response.ok) return null;
      if (payload && "products" in payload && Array.isArray(payload.products)) {
        return payload as DashboardDataset;
      }
      return null;
    }
    if (!response.ok) return null;
    const raw = await response.text();
    return await parseJsonIdle<DashboardDataset>(raw);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

type DatasetContextValue = {
  dataset: DashboardDataset;
  uploadState: string;
  isLoading: boolean;
  uploadWorkbook: (file: File) => Promise<void>;
  resetToDemo: () => void;
};

const DatasetContext = createContext<DatasetContextValue | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<DashboardDataset>(() => restrictToActiveCategories(demoDataset));
  const [uploadState, setUploadState] = useState(
    "Upload New Product Master_.xlsx — Primary and Rollover sheets merge into the desk book.",
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        void clearLegacyBrowserCaches();

        setIsLoading(true);
        setUploadState("Loading New Product Master...");

        const cached = await loadCachedDeskDataset();
        const cachedMeta = cached ? await loadDatasetMetaFromBrowser() : null;
        const manifestMs = Date.parse(CANONICAL_MANIFEST.generatedAt);

        if (cached) {
          const cachedMs = cachedMeta?.savedAt ? Date.parse(cachedMeta.savedAt) : Date.parse(cached.loadedAt);
          const preferCache =
            !Number.isFinite(manifestMs) ||
            !Number.isFinite(cachedMs) ||
            cachedMs >= manifestMs - 60_000;

          if (preferCache) {
            if (cancelled) return;
            const parsed = restrictToActiveCategories(cached);
            startTransition(() => setDataset(parsed));
            setUploadState(uploadSuccessMessage(cached, "Restored from this browser"));
            setIsLoading(false);
            return;
          }
        }

        const parsedRaw = await fetchBootstrapDataset();
        if (!parsedRaw?.products?.length) {
          if (cached) {
            if (cancelled) return;
            const parsed = restrictToActiveCategories(cached);
            startTransition(() => setDataset(parsed));
            setUploadState(uploadSuccessMessage(cached, "Restored from this browser"));
            return;
          }
          setUploadState("Upload New Product Master_.xlsx — Primary and Rollover sheets merge into the desk book.");
          return;
        }
        if (cancelled) return;
        const parsed = restrictToActiveCategories(parsedRaw);
        startTransition(() => setDataset(parsed));
        if (!cached || (cachedMeta?.savedAt && Date.parse(cachedMeta.savedAt) < Date.parse(parsedRaw.loadedAt))) {
          void saveDatasetToBrowser(parsedRaw).catch((error) => {
            const message = error instanceof Error ? error.message : "browser storage failed";
            console.warn(`[dataset] Could not cache bootstrap locally: ${message}`);
          });
        }
        setUploadState(uploadSuccessMessage(parsedRaw, "Loaded"));
      } catch {
        if (!cancelled) {
          setUploadState("Upload New Product Master_.xlsx — Primary and Rollover sheets merge into the desk book.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<DatasetContextValue>(
    () => ({
      dataset,
      uploadState,
      isLoading,
      async uploadWorkbook(file: File) {
        setIsLoading(true);
        setUploadState(`Parsing ${file.name}...`);
        try {
          const { parseWorkbookFile } = await import("@/lib/workbook/parser");
          const parsedRaw = await parseWorkbookFile(file);
          const blocking = deskBookBlockingError(parsedRaw);
          if (blocking) {
            throw new Error(blocking);
          }
          if (isStalePrimaryOnlyDeskBook(parsedRaw)) {
            throw new Error(
              "Uploaded book looks like a pre-NEW-PRIMARY Primary-only export. Include Primary + Rollover sheets or run npm run bake.",
            );
          }
          const parsed = restrictToActiveCategories(parsedRaw);
          await saveDatasetToBrowser(parsedRaw);
          invalidatePortfolioSnapshotCache();
          invalidateCategoryStatsCache();
          clearProbabilityStore();
          void fetch("/api/probability/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invalidate: true }),
          }).catch(() => {
            /* best-effort server cache bust */
          });
          startTransition(() => setDataset(parsed));

          void fetch("/api/master/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsedRaw),
          }).catch(() => {
            /* Mongo sync is best-effort in the background */
          });

          setUploadState(
            `Loaded ${file.name} — ${parsed.products.length} desk products. Formulas, descriptions, and probability engines are live immediately. Saved on this device — reload will restore it.`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown parsing error";
          setUploadState(`Upload failed: ${message}`);
        } finally {
          setIsLoading(false);
        }
      },
      resetToDemo() {
        void clearDatasetFromBrowser();
        localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
        invalidatePortfolioSnapshotCache();
        invalidateCategoryStatsCache();
        clearProbabilityStore();
        void fetch("/api/probability/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invalidate: true }),
        }).catch(() => {
          /* best-effort */
        });
        setDataset(restrictToActiveCategories(demoDataset));
        setUploadState("Upload New Product Master_.xlsx — Primary and Rollover sheets merge into the desk book.");
      },
    }),
    [dataset, isLoading, uploadState],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset() {
  const context = useContext(DatasetContext);
  if (!context) {
    throw new Error("useDataset must be used within DatasetProvider");
  }
  return context;
}
