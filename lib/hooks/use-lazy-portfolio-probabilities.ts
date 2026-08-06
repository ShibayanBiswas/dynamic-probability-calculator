"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSyncExternalStore } from "react";

import { useDataset } from "@/lib/context/dataset-provider";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import { resolveMarkDateFallback } from "@/lib/desk-mark-as-of";
import { toLocalDateKey } from "@/lib/workbook/dates";
import {
  arePortfolioProbabilitiesReady,
  clearProbabilityStore,
  countWarmedPortfolioProbabilities,
  getProbabilityStoreSnapshot,
  missingPortfolioProbabilityIsins,
  setProbabilityPair,
  subscribeProbabilityStore,
} from "@/lib/probability/portfolio-prob-store";
import type { ProductRecord } from "@/lib/types";

const BATCH_SIZE = 20;
const BETWEEN_BATCH_MS = 40;
/** Per-batch ceiling — keep under Vercel function budget with headroom. */
const BATCH_FETCH_TIMEOUT_MS = 45_000;

/** Last inputs that invalidate stored portfolio probabilities. */
let lastInvalidateKey = "";

export type PortfolioProbWarmProgress = {
  warmed: number;
  total: number;
  ready: boolean;
  warming: boolean;
};

type WarmOpts = {
  valuationDate: string;
  niftyLevel?: number;
  sensexLevel?: number;
  bookRevision: string;
  markAsOfLabel: string;
  signal?: AbortSignal;
  onProgress?: (warmed: number, total: number) => void;
};

/**
 * Fetch summary Initial/Current probs for missing ISINs (shared series load per batch).
 * Marks every requested ISIN in the store — even when the API returns null / failure —
 * so download gates never wait forever.
 */
export async function ensurePortfolioProbabilities(
  isins: string[],
  opts: WarmOpts,
): Promise<void> {
  const unique = [...new Set(isins.filter(Boolean))];
  const total = unique.length;
  if (total === 0) return;

  let queue = missingPortfolioProbabilityIsins(unique);
  opts.onProgress?.(countWarmedPortfolioProbabilities(unique).warmed, total);

  while (queue.length > 0) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    const batch = queue.slice(0, BATCH_SIZE);
    queue = queue.slice(BATCH_SIZE);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort);
    const timer = window.setTimeout(() => controller.abort(), BATCH_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch("/api/probability/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          isins: batch,
          mode: "both",
          valuationDate: opts.valuationDate,
          niftyLevel: opts.niftyLevel,
          sensexLevel: opts.sensexLevel,
          includePaths: false,
          bookRevision: opts.bookRevision,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        results?: Array<{
          isin: string;
          ok: boolean;
          initial?: { probability?: number | null };
          current?: { probability?: number | null };
        }>;
      };
      const byIsin = new Map((json.results ?? []).map((row) => [row.isin, row]));
      for (const isin of batch) {
        const row = byIsin.get(isin);
        if (row?.ok) {
          setProbabilityPair(
            isin,
            typeof row.initial?.probability === "number" ? row.initial.probability : null,
            typeof row.current?.probability === "number" ? row.current.probability : null,
            opts.markAsOfLabel,
          );
        } else {
          // Attempted — unlock downloads with em-dash cells rather than hanging.
          setProbabilityPair(isin, null, null, opts.markAsOfLabel);
        }
      }
    } catch {
      for (const isin of batch) {
        if (!missingPortfolioProbabilityIsins([isin]).length) continue;
        setProbabilityPair(isin, null, null, opts.markAsOfLabel);
      }
    } finally {
      window.clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }

    opts.onProgress?.(countWarmedPortfolioProbabilities(unique).warmed, total);
    if (queue.length > 0) {
      await new Promise((r) => setTimeout(r, BETWEEN_BATCH_MS));
    }
  }
}

function collectIsins(products: ProductRecord[]): string[] {
  return [
    ...new Set(products.map((p) => p.isin).filter((isin): isin is string => Boolean(isin))),
  ];
}

/**
 * Lazily fills Initial/Current Prob for the full lifecycle pool (not just the search slice).
 * Exposes warm progress + ensureWarmed() so Export / Full workbook wait until every ISIN is ready.
 */
export function useLazyPortfolioProbabilities(products: ProductRecord[]) {
  useSyncExternalStore(subscribeProbabilityStore, getProbabilityStoreSnapshot, () => 0);
  const selection = useProductSelection();
  const { dataset } = useDataset();
  const generationRef = useRef(0);
  const [warming, setWarming] = useState(false);
  const valuationDate = selection.valuationDate || toLocalDateKey(new Date());
  const niftyLevel = Number(selection.niftyLevel) || undefined;
  const sensexLevel = Number(selection.sensexLevel) || undefined;
  const bookRevision = `${dataset.workbookName}:${dataset.loadedAt}`;
  const markAsOfLabel =
    selection.marketLevels?.valuationDate?.trim() ||
    resolveMarkDateFallback().markDateLabel;

  // Stabilize the ISIN set so identical books do not restart warm cycles on parent re-renders.
  const isinsKey = useMemo(() => collectIsins(products).join("\0"), [products]);
  const isins = useMemo(
    () => (isinsKey ? isinsKey.split("\0") : []),
    [isinsKey],
  );
  const { warmed, total } = countWarmedPortfolioProbabilities(isins);
  const ready = arePortfolioProbabilitiesReady(isins);

  const warmOpts = useMemo(
    (): Omit<WarmOpts, "signal" | "onProgress"> => ({
      valuationDate,
      niftyLevel,
      sensexLevel,
      bookRevision,
      markAsOfLabel,
    }),
    [valuationDate, niftyLevel, sensexLevel, bookRevision, markAsOfLabel],
  );

  useEffect(() => {
    const runKey = `${bookRevision}|${valuationDate}|${niftyLevel ?? ""}|${sensexLevel ?? ""}|${markAsOfLabel}`;
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    if (lastInvalidateKey && lastInvalidateKey !== runKey) {
      clearProbabilityStore();
    }
    lastInvalidateKey = runKey;

    if (isins.length === 0 || arePortfolioProbabilitiesReady(isins)) {
      setWarming(false);
      return;
    }

    const controller = new AbortController();
    setWarming(true);
    void ensurePortfolioProbabilities(isins, {
      ...warmOpts,
      signal: controller.signal,
    })
      .catch(() => {
        /* aborted / network — UI keeps progress */
      })
      .finally(() => {
        if (generationRef.current === generation) setWarming(false);
      });

    return () => {
      controller.abort();
    };
  }, [isins, warmOpts, bookRevision, valuationDate, niftyLevel, sensexLevel, markAsOfLabel]);

  const ensureWarmed = useCallback(
    async (targetProducts?: ProductRecord[]) => {
      const targetIsins = collectIsins(targetProducts ?? products);
      if (arePortfolioProbabilitiesReady(targetIsins)) return;
      setWarming(true);
      try {
        await ensurePortfolioProbabilities(targetIsins, warmOpts);
      } finally {
        setWarming(false);
      }
    },
    [products, warmOpts],
  );

  const progress: PortfolioProbWarmProgress = {
    warmed,
    total,
    ready: ready || total === 0,
    warming,
  };

  return { progress, ensureWarmed };
}
