"use client";

import { useCallback, useRef } from "react";

import {
  fetchIndexAtDateCached,
  instantNiftyForDeskDate,
  instantSensexForDeskDate,
  type IndexAtDatePayload,
} from "@/lib/client/index-at-date-client";
import { formatDeskDate } from "@/lib/market-data";
import { parseExcelishDate } from "@/lib/workbook/dates";

export type { IndexAtDatePayload };

export type ResolvedIndexLevels = {
  niftyLevel: number | null;
  sensexLevel: number | null;
};

function positiveLevel(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function mergeLevels(
  base: ResolvedIndexLevels,
  patch: { niftyLevel?: number | null; sensexLevel?: number | null },
): ResolvedIndexLevels {
  return {
    niftyLevel: positiveLevel(patch.niftyLevel) ?? base.niftyLevel,
    sensexLevel: positiveLevel(patch.sensexLevel) ?? base.sensexLevel,
  };
}

/** Resolve Nifty + Sensex for a desk date — live, API, then bundled fallbacks. */
export async function resolveIndexLevelsSnapshot(
  deskDate: string,
  minDeskDate: string | undefined,
  options?: { useLiveLevels?: () => Promise<IndexAtDatePayload | null> },
): Promise<ResolvedIndexLevels> {
  let levels: ResolvedIndexLevels = { niftyLevel: null, sensexLevel: null };

  if (options?.useLiveLevels) {
    const live = await options.useLiveLevels();
    if (live) {
      levels = mergeLevels(levels, live);
    }
  }

  const api = await fetchIndexAtDateCached(deskDate, minDeskDate);
  if (api) {
    levels = options?.useLiveLevels
      ? mergeLevels(levels, api)
      : {
          niftyLevel: positiveLevel(api.niftyLevel) ?? levels.niftyLevel,
          sensexLevel: positiveLevel(api.sensexLevel) ?? levels.sensexLevel,
        };
  }

  // Bundled history fills gaps only — never overwrite Mongo/Yahoo at-date closes.
  const bundledNifty = instantNiftyForDeskDate(deskDate);
  if (levels.niftyLevel == null && bundledNifty != null) {
    levels = { ...levels, niftyLevel: bundledNifty };
  }

  const bundledSensex = instantSensexForDeskDate(deskDate);
  if (levels.sensexLevel == null && bundledSensex != null) {
    levels = { ...levels, sensexLevel: bundledSensex };
  }

  return levels;
}

export function useIndexAtDate() {
  const requestSeq = useRef(0);

  const fetchIndexAtDate = useCallback(async (deskDate: string, minDeskDate?: string) => {
    const seq = ++requestSeq.current;
    const result = await fetchIndexAtDateCached(deskDate, minDeskDate);
    if (seq !== requestSeq.current) return null;
    return result;
  }, []);

  /** Resolve levels for a desk date and apply once — avoids partial Nifty-only updates. */
  const resolveIndexLevelsForDate = useCallback(
    async (
      deskDate: string,
      minDeskDate: string | undefined,
      apply: (levels: ResolvedIndexLevels) => void,
      options?: { useLiveLevels?: () => Promise<IndexAtDatePayload | null> },
    ) => {
      const seq = ++requestSeq.current;
      const levels = await resolveIndexLevelsSnapshot(deskDate, minDeskDate, options);
      if (seq !== requestSeq.current) return null;
      apply(levels);
      return levels;
    },
    [],
  );

  const fetchForIso = useCallback(
    async (iso: string) => {
      const parsed = parseExcelishDate(iso);
      if (!parsed) return null;
      return fetchIndexAtDate(formatDeskDate(parsed));
    },
    [fetchIndexAtDate],
  );

  return { fetchIndexAtDate, fetchForIso, resolveIndexLevelsForDate, instantNiftyForDeskDate };
}
