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

/** Background full-book batches — keep under Vercel function budget. */
const BATCH_SIZE = 20;
/** Search / visible priority batches — smaller = faster first paint for filtered rows. */
const PRIORITY_BATCH_SIZE = 8;
const BETWEEN_BATCH_MS = 28;
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
  /** Static priority list (optional). */
  priorityIsins?: string[];
  /** Live priority reader — consulted each batch so search jumps ahead without aborting. */
  getPriorityIsins?: () => string[];
  signal?: AbortSignal;
  onProgress?: (warmed: number, total: number) => void;
};

function resolvePriority(opts: WarmOpts): string[] {
  const live = opts.getPriorityIsins?.() ?? [];
  if (live.length > 0) return live;
  return opts.priorityIsins ?? [];
}

function orderMissingQueue(missing: string[], priorityIsins: string[]): string[] {
  if (!priorityIsins.length) return missing;
  const pri = new Set(priorityIsins.filter(Boolean));
  if (pri.size === 0) return missing;
  const first: string[] = [];
  const rest: string[] = [];
  for (const isin of missing) {
    if (pri.has(isin)) first.push(isin);
    else rest.push(isin);
  }
  return [...first, ...rest];
}

/**
 * Fetch summary Initial/Current probs for missing ISINs (shared series load per batch).
 * Marks every requested ISIN in the store — even when the API returns null / failure —
 * so download gates never wait forever.
 *
 * Re-orders the queue each batch so newly prioritized (searched) ISINs jump ahead.
 */
export async function ensurePortfolioProbabilities(
  isins: string[],
  opts: WarmOpts,
): Promise<void> {
  const unique = [...new Set(isins.filter(Boolean))];
  const total = unique.length;
  if (total === 0) return;

  opts.onProgress?.(countWarmedPortfolioProbabilities(unique).warmed, total);

  while (true) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }

    const missing = missingPortfolioProbabilityIsins(unique);
    if (missing.length === 0) break;

    const priority = resolvePriority(opts);
    const prioritySet = new Set(priority);
    const queue = orderMissingQueue(missing, priority);
    const hasPriority = queue.some((isin) => prioritySet.has(isin));
    const batchSize = hasPriority ? PRIORITY_BATCH_SIZE : BATCH_SIZE;
    const batch = queue.slice(0, batchSize);

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
    if (missingPortfolioProbabilityIsins(unique).length > 0) {
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
 * Lazily fills Initial/Current Prob for the full lifecycle book.
 * Pass `priorityProducts` (e.g. search hits) so those ISINs warm first on Vercel.
 */
export function useLazyPortfolioProbabilities(
  products: ProductRecord[],
  options?: { priorityProducts?: ProductRecord[] },
) {
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

  const isinsKey = useMemo(() => collectIsins(products).join("\0"), [products]);
  const isins = useMemo(
    () => (isinsKey ? isinsKey.split("\0") : []),
    [isinsKey],
  );
  const priorityIsinsKey = useMemo(
    () => collectIsins(options?.priorityProducts ?? []).join("\0"),
    [options?.priorityProducts],
  );
  const priorityIsins = useMemo(
    () => (priorityIsinsKey ? priorityIsinsKey.split("\0") : []),
    [priorityIsinsKey],
  );
  const priorityRef = useRef(priorityIsins);
  priorityRef.current = priorityIsins;

  const { warmed, total } = countWarmedPortfolioProbabilities(isins);
  const ready = arePortfolioProbabilitiesReady(isins);

  const warmBase = useMemo(
    (): Omit<WarmOpts, "signal" | "onProgress" | "priorityIsins" | "getPriorityIsins"> => ({
      valuationDate,
      niftyLevel,
      sensexLevel,
      bookRevision,
      markAsOfLabel,
    }),
    [valuationDate, niftyLevel, sensexLevel, bookRevision, markAsOfLabel],
  );

  // Full-book warm — priority list is read live each batch (search does not abort this pass).
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
      ...warmBase,
      getPriorityIsins: () => priorityRef.current,
      signal: controller.signal,
    })
      .catch(() => {
        /* aborted / network */
      })
      .finally(() => {
        if (generationRef.current === generation) setWarming(false);
      });

    return () => {
      controller.abort();
    };
  }, [isins, warmBase, bookRevision, valuationDate, niftyLevel, sensexLevel, markAsOfLabel]);

  // Fast lane: when the user searches, warm those ISINs immediately in a small batch.
  useEffect(() => {
    if (priorityIsins.length === 0) return;
    if (arePortfolioProbabilitiesReady(priorityIsins)) return;
    const controller = new AbortController();
    void ensurePortfolioProbabilities(priorityIsins, {
      ...warmBase,
      priorityIsins,
      signal: controller.signal,
    }).catch(() => {
      /* aborted */
    });
    return () => controller.abort();
  }, [priorityIsins, warmBase]);

  const ensureWarmed = useCallback(
    async (targetProducts?: ProductRecord[]) => {
      const targetIsins = collectIsins(targetProducts ?? products);
      if (arePortfolioProbabilitiesReady(targetIsins)) return;
      setWarming(true);
      try {
        await ensurePortfolioProbabilities(targetIsins, {
          ...warmBase,
          priorityIsins: targetIsins,
        });
      } finally {
        setWarming(false);
      }
    },
    [products, warmBase],
  );

  const progress: PortfolioProbWarmProgress = {
    warmed,
    total,
    ready: ready || total === 0,
    warming,
  };

  return { progress, ensureWarmed };
}
