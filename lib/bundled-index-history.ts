import indexHistory from "@/lib/data/valuation-index-history.json";
import { toExcelSerial } from "@/lib/workbook/dates";
import { lookupIndexLevelOnOrBefore, type IndexHistoryEntry } from "@/lib/workbook/index-history";

const NIFTY_ENTRIES: IndexHistoryEntry[] = [...indexHistory.entries]
  .map((row) => ({ dateSerial: row.dateSerial, level: row.level }))
  .sort((a, b) => a.dateSerial - b.dateSerial);

/** Bundled Nifty close on or before a desk date — no network required. */
export function lookupBundledNiftyOnOrBefore(date: Date): number | undefined {
  return lookupIndexLevelOnOrBefore(NIFTY_ENTRIES, toExcelSerial(date));
}
