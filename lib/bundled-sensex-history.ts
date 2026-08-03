import sensexHistory from "@/lib/data/sensex-index-history.json";
import { toExcelSerial } from "@/lib/workbook/dates";
import { lookupIndexLevelOnOrBefore, type IndexHistoryEntry } from "@/lib/workbook/index-history";

const SENSEX_ENTRIES: IndexHistoryEntry[] = [...sensexHistory.entries]
  .map((row) => ({ dateSerial: row.dateSerial, level: row.level }))
  .sort((a, b) => a.dateSerial - b.dateSerial);

/** Bundled Sensex close on or before a desk date — no network required. */
export function lookupBundledSensexOnOrBefore(date: Date): number | undefined {
  return lookupIndexLevelOnOrBefore(SENSEX_ENTRIES, toExcelSerial(date));
}
