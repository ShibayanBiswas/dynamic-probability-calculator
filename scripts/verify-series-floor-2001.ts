/**
 * Hard check: merged index series must open on 2001-01-01 when Gift Nifty CSV is present.
 * Run: npx tsx scripts/verify-series-floor-2001.ts
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import sensexHistory from "../lib/data/sensex-index-history.json";
import { mergeForwardFilledSeries, SERIES_FLOOR, seriesStartsOnFloor } from "../lib/probability/index-series";
import { excelSerialToDate, toLocalDateKey } from "../lib/workbook/dates";

function loadNiftyFromGiftCsv(): Map<string, number> {
  const file = path.join(process.cwd(), "lib/data/nifty-daily-2001.csv");
  const map = new Map<string, number>();
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
  for (const line of readFileSync(file, "utf8").split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const date = line.slice(0, comma).trim();
    const level = Number(line.slice(comma + 1).trim());
    if (!date || !Number.isFinite(level) || level <= 0) continue;
    map.set(date, level);
  }
  return map;
}

function loadSensexBundled(): Map<string, number> {
  const sensexMap = new Map<string, number>();
  for (const row of sensexHistory.entries as Array<{ dateSerial: number; level: number }>) {
    sensexMap.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  return sensexMap;
}

const niftyMap = loadNiftyFromGiftCsv();
const sensexMap = loadSensexBundled();
const series = mergeForwardFilledSeries(niftyMap, sensexMap);

if (!niftyMap.has(SERIES_FLOOR)) {
  throw new Error(`Gift Nifty CSV missing ${SERIES_FLOOR}`);
}
if (!seriesStartsOnFloor(series)) {
  throw new Error(
    `Series must start on ${SERIES_FLOOR}, got ${series[0]?.date ?? "(empty)"} (${series.length} bars)`,
  );
}

console.log(`OK: series floor ${series[0]!.date} → ${series[series.length - 1]!.date} (${series.length} bars)`);
