import { evaluatePayoffFormula } from "@/lib/workbook/formula-engine";

/**
 * Z levels where the payoff plot slope changes sharply (formula kinks only).
 * Does not include every % token from the formula text — those are not plot turns.
 */
export function findPayoffPlotKinks(formula: string, zMin = -0.55, zMax = 1.3): number[] {
  if (!formula?.trim()) return [];

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

  return pivots.sort((a, b) => b - a);
}

export function isPayoffPlotKink(performance: number, kinks: number[]): boolean {
  return kinks.some((p) => Math.abs(p - performance) < 0.008);
}
