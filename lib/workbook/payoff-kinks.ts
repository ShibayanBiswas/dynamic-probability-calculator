import { evaluatePayoffFormula } from "@/lib/workbook/formula-engine";

/**
 * Z levels where the payoff plot slope changes sharply (formula kinks only).
 * Does not include every % token from the formula text — those are not plot turns.
 */
/** Scan results are cached — the sweep runs ~900 evaluations and repeats per render. */
const kinkCache = new Map<string, number[]>();
const KINK_CACHE_LIMIT = 512;

export function findPayoffPlotKinks(formula: string, zMin = -0.55, zMax = 1.3): number[] {
  if (!formula?.trim()) return [];

  const cacheKey = `${zMin}|${zMax}|${formula}`;
  const cached = kinkCache.get(cacheKey);
  if (cached) return [...cached];

  const step = 0.002;
  const pivots: number[] = [];
  let prevSlope = 0;
  let prevPayoff = evaluatePayoffFormula(formula, zMin);

  for (let z = zMin + step; z <= zMax; z += step) {
    const payoff = evaluatePayoffFormula(formula, z);
    const slope = (payoff - prevPayoff) / step;
    if (z > zMin + step * 2 && Math.abs(slope - prevSlope) > 18) {
      const rounded = Math.round(z * 500) / 500;
      if (!pivots.some((p) => Math.abs(p - rounded) < 0.012)) {
        pivots.push(rounded);
      }
    }
    prevSlope = slope;
    prevPayoff = payoff;
  }

  const result = pivots.sort((a, b) => b - a);
  if (kinkCache.size >= KINK_CACHE_LIMIT) {
    const oldest = kinkCache.keys().next().value;
    if (oldest !== undefined) kinkCache.delete(oldest);
  }
  kinkCache.set(cacheKey, result);
  return [...result];
}

export function isPayoffPlotKink(performance: number, kinks: number[]): boolean {
  return kinks.some((p) => Math.abs(p - performance) < 0.008);
}
