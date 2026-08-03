export type IndexHistoryEntry = {
  dateSerial: number;
  level: number;
};

/** Working!N VLOOKUP — largest dateSerial on or before the observation key. */
export function lookupIndexLevelOnOrBefore(entries: IndexHistoryEntry[], serial: number): number | undefined {
  if (entries.length === 0) return undefined;

  let lo = 0;
  let hi = entries.length - 1;
  let best = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = entries[mid]!;
    if (row.dateSerial <= serial) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best >= 0 ? entries[best]!.level : undefined;
}

export function mergeIndexHistoryEntries(
  existing: IndexHistoryEntry[],
  additions: IndexHistoryEntry[],
): IndexHistoryEntry[] {
  const map = new Map<number, number>();
  for (const row of existing) map.set(row.dateSerial, row.level);
  for (const row of additions) {
    if (Number.isFinite(row.dateSerial) && Number.isFinite(row.level)) {
      map.set(row.dateSerial, row.level);
    }
  }
  return [...map.entries()]
    .map(([dateSerial, level]) => ({ dateSerial, level }))
    .sort((a, b) => a.dateSerial - b.dateSerial);
}
