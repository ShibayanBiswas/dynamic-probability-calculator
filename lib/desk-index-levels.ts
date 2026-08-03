import { fetchIndexAtDateCached } from "@/lib/client/index-at-date-client";
import { lookupBundledNiftyOnOrBefore } from "@/lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "@/lib/bundled-sensex-history";
import { parseExcelishDate } from "@/lib/workbook/dates";

export type DeskIndexLevels = {
  niftyLevel?: number;
  sensexLevel?: number;
};

/** Sync desk levels — bundled Nifty/Sensex history when a live leg is missing. */
export function resolveDeskIndexLevels(levels: DeskIndexLevels, asOf = new Date()): DeskIndexLevels {
  const desk = asOf;
  return {
    niftyLevel: levels.niftyLevel ?? lookupBundledNiftyOnOrBefore(desk),
    sensexLevel: levels.sensexLevel ?? lookupBundledSensexOnOrBefore(desk),
  };
}

/** Resolve levels for a historical desk date (exports). */
export function resolveDeskIndexLevelsForDate(
  levels: DeskIndexLevels,
  valuationDateRaw: string,
): DeskIndexLevels {
  const parsed = parseExcelishDate(valuationDateRaw);
  const niftyFallback = parsed ? lookupBundledNiftyOnOrBefore(parsed) : undefined;
  const sensexFallback = parsed ? lookupBundledSensexOnOrBefore(parsed) : undefined;
  return {
    niftyLevel: levels.niftyLevel ?? niftyFallback,
    sensexLevel: levels.sensexLevel ?? sensexFallback,
  };
}

/** Client-side: API index lookup with bundled Nifty/Sensex fallback. */
export async function resolveDeskIndexLevelsAsync(
  levels: DeskIndexLevels,
  valuationDateRaw: string,
): Promise<DeskIndexLevels> {
  let niftyLevel = levels.niftyLevel;
  let sensexLevel = levels.sensexLevel;
  if (niftyLevel && sensexLevel) return { niftyLevel, sensexLevel };

  try {
    const json = await fetchIndexAtDateCached(valuationDateRaw);
    if (json) {
      niftyLevel = niftyLevel ?? (json.niftyLevel != null ? json.niftyLevel : undefined);
      sensexLevel = sensexLevel ?? (json.sensexLevel != null ? json.sensexLevel : undefined);
    }
  } catch {
    /* fall through to bundled history */
  }

  return resolveDeskIndexLevelsForDate({ niftyLevel, sensexLevel }, valuationDateRaw);
}
