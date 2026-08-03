import { getDebenturePrice, getIndexEntryLevel, getTargetLevel } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { evaluatePayoffFormula } from "@/lib/workbook/formula-engine";
import { findPayoffPlotKinks } from "@/lib/workbook/payoff-kinks";
import { irrFromReturn } from "@/lib/workbook/irr";
import {
  buildPayoffScenarioTable,
  resolvePayoffScenarioTenorDays,
  type PayoffInputs,
  type PayoffScenarioRow,
  PAYOFF_SCENARIO_OFFSETS,
} from "@/lib/workbook/payoff-scenarios";

export type PayoffRowFlags = PayoffScenarioRow & {
  isPivot?: boolean;
  isCurrent?: boolean;
  isAnchor?: boolean;
  /** Final fixing equals master Initial / Entry level (Z = 0). */
  isInitialLevel?: boolean;
  /** Final fixing equals master Target Level. */
  isTargetLevel?: boolean;
};

/** Detect Z levels where payoff slope changes sharply (formula kinks / IF boundaries). */
export function findPayoffPivotZs(formula: string, zMin = -0.55, zMax = 1.3): number[] {
  return findPayoffPlotKinks(formula, zMin, zMax);
}

function perfKey(performance: number): number {
  return Math.round(performance * 10000) / 10000;
}

/**
 * Contractual Z for the master Target Level vs Initial Fixing.
 * Undefined when target/entry are missing, non-positive, or identical (then Initial covers it).
 */
export function getTargetLevelPerformance(product: ProductRecord): number | undefined {
  const entry = getIndexEntryLevel(product);
  const target = getTargetLevel(product);
  if (!(entry > 0) || target == null || !(target > 0)) return undefined;
  const z = target / entry - 1;
  if (!Number.isFinite(z)) return undefined;
  // Same level as initial — Initial row already covers it.
  if (Math.abs(z) < 1e-9) return undefined;
  return z;
}

function rowForPerformance(
  product: ProductRecord,
  performance: number,
  inputs: PayoffInputs,
): PayoffScenarioRow {
  const initialFixing = getIndexEntryLevel(product);
  const debentures = inputs.debentures ?? 100;
  const pricePerDebenture = inputs.pricePerDebenture ?? getDebenturePrice(product);
  const investment = debentures * pricePerDebenture;
  const formula = product.formulaText ?? "Z";
  const productReturn = evaluatePayoffFormula(formula, performance);
  const tenor =
    inputs.remainingTenorDays != null && inputs.remainingTenorDays >= 30
      ? inputs.remainingTenorDays
      : resolvePayoffScenarioTenorDays(product, { asOf: inputs.asOf, expired: inputs.expired });
  return {
    performance,
    finalFixing: initialFixing * (1 + performance),
    z: performance,
    maturityValue: productReturn,
    maturityAmount: investment * (1 + productReturn),
    returnOnInvestment: productReturn,
    irr: irrFromReturn(productReturn, tenor),
  };
}

function upsertScenarioRow(
  merged: Map<number, PayoffRowFlags>,
  product: ProductRecord,
  performance: number,
  inputs: PayoffInputs,
  flags: Partial<PayoffRowFlags> = {},
): void {
  const key = perfKey(performance);
  const existing = merged.get(key);
  if (existing) {
    merged.set(key, { ...existing, ...flags });
    return;
  }
  merged.set(key, { ...rowForPerformance(product, performance, inputs), ...flags });
}

/** Excel scenario rows + Initial/Target levels + formula pivots + live market-move row. */
export function buildEnhancedPayoffScenarioTable(
  product: ProductRecord,
  inputs: PayoffInputs,
  marketMove?: number,
): PayoffRowFlags[] {
  const base = buildPayoffScenarioTable(product, inputs);
  const formula = product.formulaText ?? "";
  const plotKinks = findPayoffPlotKinks(formula);
  const targetPerf = getTargetLevelPerformance(product);

  const merged = new Map<number, PayoffRowFlags>();
  for (const row of base) {
    merged.set(perfKey(row.performance), { ...row });
  }

  // Always include Initial Level (Z = 0) and Target Level (when distinct on master).
  upsertScenarioRow(merged, product, 0, inputs, { isInitialLevel: true, isAnchor: true });
  if (targetPerf != null) {
    upsertScenarioRow(merged, product, targetPerf, inputs, { isTargetLevel: true });
  }

  for (const kink of plotKinks) {
    const key = perfKey(kink);
    if (merged.has(key)) continue;
    if (PAYOFF_SCENARIO_OFFSETS.some((p) => Math.abs(p - kink) < 1e-9)) continue;
    merged.set(key, { ...rowForPerformance(product, kink, inputs), isPivot: true });
  }

  if (marketMove != null && Number.isFinite(marketMove)) {
    const key = perfKey(marketMove);
    if (!merged.has(key)) {
      merged.set(key, { ...rowForPerformance(product, marketMove, inputs), isCurrent: true });
    }
  }

  const rows = [...merged.values()].sort((a, b) => b.performance - a.performance);

  if (marketMove != null && Number.isFinite(marketMove)) {
    let closest = rows[0];
    let minDist = Infinity;
    for (const row of rows) {
      const d = Math.abs(row.performance - marketMove);
      if (d < minDist) {
        minDist = d;
        closest = row;
      }
    }
    for (const row of rows) row.isCurrent = false;
    if (closest) closest.isCurrent = true;
    if (minDist > 0.005) {
      rows.push({
        ...rowForPerformance(product, marketMove, inputs),
        isCurrent: true,
        isPivot: false,
      });
      rows.sort((a, b) => b.performance - a.performance);
    }
  }

  const anchorKeys = new Set(PAYOFF_SCENARIO_OFFSETS.map((p) => Math.round(p * 10000)));
  const entry = getIndexEntryLevel(product);
  const target = getTargetLevel(product);
  for (const row of rows) {
    const key = Math.round(row.performance * 10000);
    row.isAnchor = anchorKeys.has(key) || Math.abs(row.performance) < 1e-9;
    row.isInitialLevel = Math.abs(row.performance) < 1e-9;
    row.isTargetLevel =
      target != null &&
      target > 0 &&
      entry > 0 &&
      (Math.abs(row.finalFixing - target) < 0.51 ||
        (targetPerf != null && Math.abs(row.performance - targetPerf) < 0.0005));
    row.isPivot =
      plotKinks.some((k) => Math.abs(k - row.performance) < 0.004) &&
      !row.isAnchor &&
      !row.isInitialLevel &&
      !row.isTargetLevel;
  }

  return rows;
}
