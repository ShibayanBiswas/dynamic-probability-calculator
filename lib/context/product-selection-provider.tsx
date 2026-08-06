"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useClientMounted } from "@/lib/hooks/use-client-mounted";
import { formatDeskDate } from "@/lib/market-data";
import { isDeskToday } from "@/lib/workbook/dates";
import { DESK_DEFAULTS } from "@/lib/desk-defaults";
import { primeIndexAtDateCache } from "@/lib/client/index-at-date-client";
import {
  formatDeskIndexLevel,
  hasCompleteIndexLevels,
  indexLevelDrift,
  indexLevelStringsEqual,
  INDEX_LEVEL_COMMIT_EPSILON,
  mergeIndexLevelStrings,
} from "@/lib/desk-index-state";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { useMarketSync, type MarketRefreshOptions } from "@/lib/hooks/use-market-sync";
import type { MarketLevels } from "@/lib/market-data";
import { getExpiredMarkDeskDate } from "@/lib/expired-mark";
import { getWorkingAllotmentDate } from "@/lib/product-dates";
import {
  clampValuationDateToPhaseWindow,
  getProductLifecycleStatus,
} from "@/lib/product-lifecycle";
import { resolveProduct, getDebenturePrice, getIndexEntryLevel, inferDebentureCount, rawField, resolveLiveIndexLevel } from "@/lib/product-utils";
import { getProductSelectBlockerAlert } from "@/lib/product-data-guards";
import { deskAlert } from "@/lib/desk-alert";
import { useDataset } from "@/lib/context/dataset-provider";
import { targetUnderlying } from "@/lib/probability/engine";
import { formatTargetUnderlyingPercentInput } from "@/lib/probability/target-override";
import type { ProductCategory, ProductRecord } from "@/lib/types";

const STORAGE_KEY = "sp-dashboard-product-selection-v3";
/** Hold live level commits briefly so Yahoo micro-moves don't flicker the inputs. */
const LIVE_INDEX_COMMIT_HOLD_MS = 5_000;

export interface ProductSelectionState {
  isin: string;
  productCode: string;
  productName: string;
  category?: ProductCategory;
  valuationDate: string;
  currentLevel: string;
  niftyLevel: string;
  sensexLevel: string;
  debentures: string;
  purchaseDate: string;
  pricePerDebenture: string;
  /**
   * Target Underlying as percent points for the probability desk (e.g. "36.0" = 36%).
   * Drives working Target Level = Entry × (1 + pct/100). Not persisted across sessions.
   */
  targetUnderlyingPct: string;
}

const DEFAULT_STATE: ProductSelectionState = {
  isin: "",
  productCode: "",
  productName: "",
  valuationDate: DESK_DEFAULTS.valuationDate,
  currentLevel: "",
  niftyLevel: DESK_DEFAULTS.niftyLevel,
  sensexLevel: DESK_DEFAULTS.sensexLevel,
  debentures: DESK_DEFAULTS.debentures,
  purchaseDate: "",
  pricePerDebenture: "",
  targetUnderlyingPct: "",
};

function loadCachedSelection(): ProductSelectionState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (!cached) return DEFAULT_STATE;
    const parsed = JSON.parse(cached) as ProductSelectionState;
    return {
      ...DEFAULT_STATE,
      isin: parsed.isin,
      productCode: parsed.productCode,
      productName: parsed.productName,
      category: parsed.category,
      debentures: parsed.debentures,
      purchaseDate: parsed.purchaseDate,
      pricePerDebenture: parsed.pricePerDebenture,
      // Always open as of today with fresh index slots — live Yahoo fills levels.
      valuationDate: formatDeskDate(new Date()),
      niftyLevel: DESK_DEFAULTS.niftyLevel,
      sensexLevel: DESK_DEFAULTS.sensexLevel,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

type ProductSelectionContextValue = ProductSelectionState & {
  resolvedProduct: ProductRecord | undefined;
  marketStatus: "idle" | "loading" | "ready" | "error";
  marketLevels: MarketLevels | null;
  /** True while historical index levels are being resolved for a non-today valuation date. */
  indexSyncLoading: boolean;
  setIndexSyncLoading: (loading: boolean) => void;
  refreshMarket: (opts?: MarketRefreshOptions) => Promise<MarketLevels | null>;
  setField: <K extends keyof ProductSelectionState>(key: K, value: ProductSelectionState[K]) => void;
  /** Atomically set Nifty/Sensex (and underlying current level) for a valuation date. */
  setValuationIndexLevels: (
    levels: { niftyLevel?: number | null; sensexLevel?: number | null },
    product?: ProductRecord,
    options?: { replaceEmpty?: boolean },
  ) => void;
  selectProduct: (product: ProductRecord, options?: { silent?: boolean; resetValuationDate?: boolean }) => void;
  setCategory: (category: ProductCategory | undefined) => void;
};

const ProductSelectionContext = createContext<ProductSelectionContextValue | null>(null);

export function ProductSelectionProvider({ children }: { children: ReactNode }) {
  const { dataset, isLoading: datasetLoading } = useDataset();
  const { asOf } = usePortfolioClock();
  const [state, setState] = useState<ProductSelectionState>(loadCachedSelection);
  const [indexSyncLoading, setIndexSyncLoading] = useState(false);
  const mounted = useClientMounted();
  const firstProductName = dataset.products[0]?.name;
  const pendingLiveLevelsRef = useRef<MarketLevels | null>(null);
  const liveCommitTimerRef = useRef<number | null>(null);
  const forceLiveCommitRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Cold start: ongoing book always opens on today's valuation date with fresh index slots.
  const didSnapTodayRef = useRef(false);
  useEffect(() => {
    if (!mounted || didSnapTodayRef.current) return;
    didSnapTodayRef.current = true;
    setState((current) => {
      const product = resolveProduct(dataset.products, {
        isin: current.isin,
        productCode: current.productCode,
        productName: current.productName,
        category: current.category,
      });
      if (product && getProductLifecycleStatus(product, asOf) === "expired") {
        return current;
      }
      return {
        ...current,
        valuationDate: formatDeskDate(new Date()),
        niftyLevel: DESK_DEFAULTS.niftyLevel,
        sensexLevel: DESK_DEFAULTS.sensexLevel,
      };
    });
  }, [mounted, asOf, dataset.products]);

  const resolvedState = useMemo((): ProductSelectionState => {
    if (!mounted) return state;
    let next = state;
    if (!next.productName && firstProductName) {
      next = { ...next, productName: firstProductName };
    }
    if (!next.valuationDate?.trim()) {
      next = { ...next, valuationDate: formatDeskDate(new Date()) };
    }
    return next;
  }, [mounted, state, firstProductName]);

  const clearLiveCommitTimer = useCallback(() => {
    if (liveCommitTimerRef.current != null) {
      window.clearTimeout(liveCommitTimerRef.current);
      liveCommitTimerRef.current = null;
    }
  }, []);

  const commitLiveMarketLevels = useCallback(
    (levels: MarketLevels) => {
      if (!hasCompleteIndexLevels(levels)) return;
      setState((current) => {
        const product = resolveProduct(dataset.products, {
          isin: current.isin,
          productCode: current.productCode,
          productName: current.productName,
          category: current.category,
        });
        if (product && getProductLifecycleStatus(product, asOf) === "expired") {
          return current;
        }
        if (!isDeskToday(current.valuationDate)) {
          return current;
        }
        const merged = mergeIndexLevelStrings(current, levels);
        if (indexLevelStringsEqual(current, merged)) {
          return current;
        }
        if (
          !forceLiveCommitRef.current &&
          hasCompleteIndexLevels(current) &&
          indexLevelDrift(current, merged) < INDEX_LEVEL_COMMIT_EPSILON
        ) {
          return current;
        }
        primeIndexAtDateCache(levels.valuationDate, {
          valuationDate: levels.valuationDate,
          niftyLevel: levels.niftyLevel,
          sensexLevel: levels.sensexLevel,
        });
        return {
          ...current,
          niftyLevel: merged.niftyLevel,
          sensexLevel: merged.sensexLevel,
        };
      });
      forceLiveCommitRef.current = false;
    },
    [dataset.products, asOf],
  );

  const applyMarket = useCallback(
    (levels: MarketLevels) => {
      if (!hasCompleteIndexLevels(levels)) {
        forceLiveCommitRef.current = false;
        return;
      }

      const current = stateRef.current;
      const product = resolveProduct(dataset.products, {
        isin: current.isin,
        productCode: current.productCode,
        productName: current.productName,
        category: current.category,
      });
      if (product && getProductLifecycleStatus(product, asOf) === "expired") {
        forceLiveCommitRef.current = false;
        return;
      }
      if (!isDeskToday(current.valuationDate)) {
        forceLiveCommitRef.current = false;
        return;
      }

      const force = forceLiveCommitRef.current;
      const merged = mergeIndexLevelStrings(current, levels);
      if (!force && indexLevelStringsEqual(current, merged)) {
        forceLiveCommitRef.current = false;
        return;
      }
      if (
        !force &&
        hasCompleteIndexLevels(current) &&
        indexLevelDrift(current, merged) < INDEX_LEVEL_COMMIT_EPSILON
      ) {
        forceLiveCommitRef.current = false;
        return;
      }

      // Empty desk or explicit Refresh → commit now.
      if (force || !hasCompleteIndexLevels(current)) {
        clearLiveCommitTimer();
        pendingLiveLevelsRef.current = null;
        commitLiveMarketLevels(levels);
        return;
      }

      // Soft updates — hold ~5s and ship the latest pending mark once.
      pendingLiveLevelsRef.current = levels;
      if (liveCommitTimerRef.current == null) {
        liveCommitTimerRef.current = window.setTimeout(() => {
          liveCommitTimerRef.current = null;
          const pending = pendingLiveLevelsRef.current;
          pendingLiveLevelsRef.current = null;
          if (pending) commitLiveMarketLevels(pending);
        }, LIVE_INDEX_COMMIT_HOLD_MS);
      }
    },
    [asOf, clearLiveCommitTimer, commitLiveMarketLevels, dataset.products],
  );

  useEffect(() => () => clearLiveCommitTimer(), [clearLiveCommitTimer]);

  const { status: marketStatus, levels: marketLevels, refresh: syncRefreshMarket } = useMarketSync(
    applyMarket,
    {
      enabled: !datasetLoading && dataset.products.length > 0,
    },
  );

  const refreshMarket = useCallback(
    async (opts?: MarketRefreshOptions) => {
      if (opts?.force) forceLiveCommitRef.current = true;
      return syncRefreshMarket(opts);
    },
    [syncRefreshMarket],
  );

  const effectiveState = useMemo(() => {
    if (!mounted || !marketLevels) return resolvedState;
    const product = resolveProduct(dataset.products, {
      isin: resolvedState.isin,
      productCode: resolvedState.productCode,
      productName: resolvedState.productName,
      category: resolvedState.category,
    });
    if (product && getProductLifecycleStatus(product, asOf) === "expired") {
      return resolvedState;
    }
    if (!isDeskToday(resolvedState.valuationDate)) {
      return resolvedState;
    }
    const liveLevel = product
      ? resolveLiveIndexLevel(product, {
          niftyLevel: Number(resolvedState.niftyLevel) || marketLevels.niftyLevel,
          sensexLevel: Number(resolvedState.sensexLevel) || marketLevels.sensexLevel,
        })
      : 0;
    // Overlay live Yahoo/desk marks on both index legs so Valuation + Payoff cards
    // never stick on stale localStorage while market sync is still committing.
    return {
      ...resolvedState,
      niftyLevel:
        marketLevels.niftyLevel > 0
          ? formatDeskIndexLevel(marketLevels.niftyLevel)
          : resolvedState.niftyLevel,
      sensexLevel:
        marketLevels.sensexLevel > 0
          ? formatDeskIndexLevel(marketLevels.sensexLevel)
          : resolvedState.sensexLevel,
      currentLevel: liveLevel > 0 ? String(liveLevel) : resolvedState.currentLevel,
    };
  }, [dataset.products, marketLevels, mounted, resolvedState, asOf]);

  useEffect(() => {
    if (!mounted) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(resolvedState));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mounted, resolvedState]);

  const resolvedProduct = useMemo(
    () =>
      resolveProduct(dataset.products, {
        isin: effectiveState.isin,
        productCode: effectiveState.productCode,
        productName: effectiveState.productName,
        category: effectiveState.category,
      }),
    [dataset.products, effectiveState.category, effectiveState.isin, effectiveState.productCode, effectiveState.productName],
  );

  const value = useMemo<ProductSelectionContextValue>(
    () => ({
      ...effectiveState,
      resolvedProduct,
      marketStatus,
      marketLevels,
      indexSyncLoading,
      setIndexSyncLoading,
      refreshMarket,
      setField(key, value) {
        setState((current) => ({ ...current, [key]: value }));
      },
      setValuationIndexLevels(levels, productOverride, options) {
        const replaceEmpty = options?.replaceEmpty === true;
        setState((current) => {
          const product =
            productOverride ??
            resolveProduct(dataset.products, {
              isin: current.isin,
              productCode: current.productCode,
              productName: current.productName,
              category: current.category,
            });
          const merged = mergeIndexLevelStrings(current, levels, { replaceEmpty });
          if (indexLevelStringsEqual(current, merged)) {
            return current;
          }
          // Keep a settled mark when the patch is incomplete or noisy —
          // unless this is an explicit date swap that must clear stale legs.
          if (
            !replaceEmpty &&
            hasCompleteIndexLevels(current) &&
            (!hasCompleteIndexLevels(merged) ||
              indexLevelDrift(current, merged) < INDEX_LEVEL_COMMIT_EPSILON)
          ) {
            return current;
          }
          const expired = product ? getProductLifecycleStatus(product, asOf) === "expired" : false;
          const picked =
            product && !expired
              ? resolveLiveIndexLevel(product, {
                  niftyLevel: Number(merged.niftyLevel) || undefined,
                  sensexLevel: Number(merged.sensexLevel) || undefined,
                })
              : 0;

          return {
            ...current,
            niftyLevel: merged.niftyLevel,
            sensexLevel: merged.sensexLevel,
            currentLevel: picked > 0 ? String(picked) : current.currentLevel,
          };
        });
      },
      selectProduct(product, options) {
        const silent = options?.silent === true;
        const resetValuationDate = options?.resetValuationDate === true;
        const expired = getProductLifecycleStatus(product, asOf) === "expired";
        if (!silent) {
          const alert = getProductSelectBlockerAlert(product);
          if (alert) {
            deskAlert(alert.message, { title: alert.title, variant: alert.variant });
          }
        }
        setState((current) => {
          const indexEntry = getIndexEntryLevel(product);
          const price = getDebenturePrice(product);
          const phaseStart = getWorkingAllotmentDate(product, asOf);
          const purchaseDesk = phaseStart
            ? formatDeskDate(phaseStart)
            : (rawField(product, "Allotment Date", "Trade Date/Opening date", "Trade Date") ?? "");
          const liveLevel = resolveLiveIndexLevel(product, {
            niftyLevel: Number(current.niftyLevel) || marketLevels?.niftyLevel,
            sensexLevel: Number(current.sensexLevel) || marketLevels?.sensexLevel,
          });
          const rawValuationDate = resetValuationDate
            ? expired
              ? getExpiredMarkDeskDate(product) ?? current.valuationDate
              : formatDeskDate(new Date())
            : expired
              ? getExpiredMarkDeskDate(product) ?? current.valuationDate
              : // Keep the user's date when set; otherwise default to today.
                // Never prefer marketLevels.valuationDate — it can pin a stale historical day.
                current.valuationDate?.trim() || formatDeskDate(new Date());
          const valuationDate = expired
            ? rawValuationDate
            : clampValuationDateToPhaseWindow(product, rawValuationDate, asOf);
          const useLiveLevels = !expired && isDeskToday(valuationDate);
          return {
            ...current,
            productName: product.name,
            isin: product.isin ?? "",
            productCode: product.series ?? "",
            category: product.category,
            valuationDate,
            niftyLevel: useLiveLevels
              ? marketLevels?.niftyLevel
                ? String(marketLevels.niftyLevel)
                : current.niftyLevel
              : current.niftyLevel,
            sensexLevel: useLiveLevels
              ? marketLevels?.sensexLevel
                ? String(marketLevels.sensexLevel)
                : current.sensexLevel
              : current.sensexLevel,
            currentLevel: expired
              ? String(getIndexEntryLevel(product))
              : liveLevel > 0
                ? String(liveLevel)
                : String(indexEntry),
            purchaseDate: purchaseDesk || current.purchaseDate,
            // Always from master — Payoff shows Initial Price / Debenture as read-only.
            pricePerDebenture: String(price),
            debentures: String(inferDebentureCount(product)),
            targetUnderlyingPct: formatTargetUnderlyingPercentInput(targetUnderlying(product)),
          };
        });
      },
      setCategory(category) {
        setState((current) => ({ ...current, category }));
      },
    }),
    [effectiveState, resolvedProduct, marketStatus, marketLevels, indexSyncLoading, refreshMarket, dataset.products, asOf],
  );

  return <ProductSelectionContext.Provider value={value}>{children}</ProductSelectionContext.Provider>;
}

export function useProductSelection() {
  const context = useContext(ProductSelectionContext);
  if (!context) {
    throw new Error("useProductSelection must be used within ProductSelectionProvider");
  }
  return context;
}
