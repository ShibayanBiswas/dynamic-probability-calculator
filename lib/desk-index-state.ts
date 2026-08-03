/** Stable desk input string for Nifty / Sensex levels (2 dp). */
export function formatDeskIndexLevel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round(value * 100) / 100);
}

export function mergeIndexLevelStrings(
  current: { niftyLevel: string; sensexLevel: string },
  patch: { niftyLevel?: number | null; sensexLevel?: number | null },
  options?: { replaceEmpty?: boolean },
): { niftyLevel: string; sensexLevel: string } {
  const replaceEmpty = options?.replaceEmpty === true;
  return {
    niftyLevel:
      patch.niftyLevel != null && patch.niftyLevel > 0
        ? formatDeskIndexLevel(patch.niftyLevel)
        : replaceEmpty
          ? ""
          : current.niftyLevel,
    sensexLevel:
      patch.sensexLevel != null && patch.sensexLevel > 0
        ? formatDeskIndexLevel(patch.sensexLevel)
        : replaceEmpty
          ? ""
          : current.sensexLevel,
  };
}

export function indexLevelStringsEqual(
  a: { niftyLevel: string; sensexLevel: string },
  b: { niftyLevel: string; sensexLevel: string },
): boolean {
  return a.niftyLevel === b.niftyLevel && a.sensexLevel === b.sensexLevel;
}

/** True when both legs are usable positive marks. */
export function hasCompleteIndexLevels(levels: {
  niftyLevel?: number | null | string;
  sensexLevel?: number | null | string;
}): boolean {
  const nifty = Number(levels.niftyLevel);
  const sensex = Number(levels.sensexLevel);
  return Number.isFinite(nifty) && nifty > 0 && Number.isFinite(sensex) && sensex > 0;
}

/**
 * Absolute gap between two formatted desk levels (rupee points).
 * Used to ignore micro Yahoo jitter that would otherwise re-render the inputs.
 */
export function indexLevelDrift(
  a: { niftyLevel: string; sensexLevel: string },
  b: { niftyLevel: string; sensexLevel: string },
): number {
  const dn = Math.abs(Number(a.niftyLevel) - Number(b.niftyLevel));
  const ds = Math.abs(Number(a.sensexLevel) - Number(b.sensexLevel));
  if (!Number.isFinite(dn) || !Number.isFinite(ds)) return Number.POSITIVE_INFINITY;
  return Math.max(dn, ds);
}

/** Ignore sub-point ticker noise — desk marks are 2 dp and shouldn't bounce. */
export const INDEX_LEVEL_COMMIT_EPSILON = 0.05;
