import { buildIndexSeries, type IndexBar } from "@/lib/probability/engine";

/** Absolute floor for path backtests and index history — never start later than this. */
export const SERIES_FLOOR = "2001-01-01";

/**
 * Merge Nifty + Sensex maps into a forward-filled daily series from SERIES_FLOOR.
 * Pre-floor dates are scanned only to seed last closes so 2001-01-01 is never dropped
 * when one leg is missing that calendar day (e.g. Sensex holiday on 2001-01-01).
 */
export function mergeForwardFilledSeries(
  niftyMap: Map<string, number>,
  sensexMap: Map<string, number>,
  floor: string = SERIES_FLOOR,
): IndexBar[] {
  const dates = [...new Set([...niftyMap.keys(), ...sensexMap.keys()])].sort();
  const rows: Array<{ date: string; nifty: number; sensex: number }> = [];
  let lastNifty: number | undefined;
  let lastSensex: number | undefined;

  for (const date of dates) {
    if (niftyMap.has(date)) lastNifty = niftyMap.get(date);
    if (sensexMap.has(date)) lastSensex = sensexMap.get(date);

    // Seed forward-fill from history before the floor; do not emit those rows.
    if (date < floor) continue;

    if (lastNifty == null || lastSensex == null) continue;
    rows.push({ date, nifty: lastNifty, sensex: lastSensex });
  }

  return buildIndexSeries(rows);
}

/** Assert / document the hard requirement that the series opens on SERIES_FLOOR when Nifty has that day. */
export function seriesStartsOnFloor(series: IndexBar[], floor: string = SERIES_FLOOR): boolean {
  return series.length > 0 && series[0]!.date === floor;
}
