"use client";

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";

import { useDataset } from "@/lib/context/dataset-provider";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import { resolveMarkDateFallback } from "@/lib/desk-mark-as-of";
import { toLocalDateKey } from "@/lib/workbook/dates";
import {
  clearProbabilityStore,
  getProbabilityPair,
  getProbabilityStoreSnapshot,
  setProbabilityPair,
  subscribeProbabilityStore,
} from "@/lib/probability/portfolio-prob-store";
import type { ProductRecord } from "@/lib/types";

const BATCH_SIZE = 16;
const BETWEEN_BATCH_MS = 48;
/** Soft cap so very large books still warm without unbounded queue growth. */
const MAX_WARM_ISINS = 320;
/** Per-batch ceiling — keep under Vercel function budget with headroom. */
const BATCH_FETCH_TIMEOUT_MS = 45_000;

/** Last inputs that invalidate stored portfolio probabilities. */
let lastInvalidateKey = "";

/**
 * Lazily fills Initial/Current Prob for visible portfolio products via summary API.
 * Batched so one series load covers many ISINs. Re-runs when valuation date or book revision changes.
 */
export function useLazyPortfolioProbabilities(products: ProductRecord[]) {
  useSyncExternalStore(subscribeProbabilityStore, getProbabilityStoreSnapshot, () => 0);
  const selection = useProductSelection();
  const { dataset } = useDataset();
  const queueRef = useRef<string[]>([]);
  const generationRef = useRef(0);
  const valuationDate = selection.valuationDate || toLocalDateKey(new Date());
  const niftyLevel = Number(selection.niftyLevel) || undefined;
  const sensexLevel = Number(selection.sensexLevel) || undefined;
  const bookRevision = `${dataset.workbookName}:${dataset.loadedAt}`;
  const markAsOfLabel =
    selection.marketLevels?.valuationDate?.trim() ||
    resolveMarkDateFallback().markDateLabel;

  useEffect(() => {
    const runKey = `${bookRevision}|${valuationDate}|${niftyLevel ?? ""}|${sensexLevel ?? ""}|${markAsOfLabel}`;
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    if (lastInvalidateKey && lastInvalidateKey !== runKey) {
      clearProbabilityStore();
    }
    lastInvalidateKey = runKey;

    const isins = products
      .map((p) => p.isin)
      .filter((isin): isin is string => !!isin)
      .filter((isin) => !getProbabilityPair(isin));

    queueRef.current = isins.slice(0, MAX_WARM_ISINS);

    let cancelled = false;

    async function drain() {
      while (!cancelled && generationRef.current === generation && queueRef.current.length > 0) {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        const batch = queueRef.current.splice(0, BATCH_SIZE);
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), BATCH_FETCH_TIMEOUT_MS);
        try {
          const res = await fetch("/api/probability/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              isins: batch,
              mode: "both",
              valuationDate,
              niftyLevel,
              sensexLevel,
              includePaths: false,
              bookRevision,
            }),
          });
          if (!res.ok || cancelled || generationRef.current !== generation) return;
          const json = (await res.json()) as {
            results?: Array<{
              isin: string;
              ok: boolean;
              initial?: { probability?: number | null };
              current?: { probability?: number | null };
            }>;
          };
          for (const row of json.results ?? []) {
            if (!row.ok) continue;
            setProbabilityPair(
              row.isin,
              typeof row.initial?.probability === "number" ? row.initial.probability : null,
              typeof row.current?.probability === "number" ? row.current.probability : null,
              markAsOfLabel,
            );
          }
        } catch {
          /* ignore batch failures; remaining queue may retry on next effect */
        } finally {
          window.clearTimeout(timer);
        }
        if (queueRef.current.length > 0) {
          await new Promise((r) => setTimeout(r, BETWEEN_BATCH_MS));
        }
      }
    }

    void drain();
    return () => {
      cancelled = true;
    };
  }, [products, valuationDate, niftyLevel, sensexLevel, bookRevision, markAsOfLabel]);
}
