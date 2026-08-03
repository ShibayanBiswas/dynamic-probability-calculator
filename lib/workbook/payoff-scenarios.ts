import {
  getAllotmentToLastObservationDays,
  getPhasePayoffTenorDays,
  getPhaseScheduleEndLabel,
  getProductExpirationDate,
  getProductExpiryDate,
  getProductFinalObservationDate,
  getWorkingAllotmentDate,
} from "@/lib/product-dates";
import { getFaceValue, getIndexEntryLevel, parseNumericField, rawField } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { evaluatePayoffFormula } from "@/lib/workbook/formula-engine";
import { irrFromReturn } from "@/lib/workbook/irr";
import { parseExcelishDate } from "@/lib/workbook/dates";
import { differenceInCalendarDays } from "date-fns";

export interface PayoffInputs {
  /** Optional override for scenario anchor — defaults to master Initial Fixing. */
  currentLevel?: number;
  debentures?: number;
  pricePerDebenture?: number;
  /** Override payoff XIRR tenor (days) — prefer `asOf` + `expired` for desk parity. */
  remainingTenorDays?: number;
  /** Desk / valuation date for tenor resolution. */
  asOf?: Date;
  /** Expired tab — annualise over realised allotment → final observation span. */
  expired?: boolean;
}

export interface PayoffTenorContext {
  asOf?: Date;
  expired?: boolean;
}

export interface PayoffScenarioRow {
  performance: number;
  finalFixing: number;
  z: number;
  maturityValue: number;
  maturityAmount: number;
  returnOnInvestment: number;
  irr: number;
}

/** Excel Non-PP SP Details column G — underlying performance sweep. */
export const PAYOFF_SCENARIO_OFFSETS = [
  1, 0.7, 0.5, 0.41, 0.4, 0.37, 0.34, 0.33, 0.2, 0.1, 0, -0.1, -0.15, -0.2, -0.25, -0.3, -0.35, -0.4,
];

/**
 * Payoff scenario XIRR tenor — single desk resolver for ongoing + expired.
 *
 * Always annualises over the product's actual phase tenure (Working!F → schedule end):
 *
 * | Book / Phase | Tenor |
 * |--------------|-------|
 * | Blank | Allotment → Maturity |
 * | Phase 1 | Allotment → POED |
 * | Phase 2 | Trade → Maturity |
 * | 10 Years | Allotment → Rollover C/P |
 *
 * Expired products use the same contractual phase span (not truncated to last obs).
 */
export function resolvePayoffScenarioTenorDays(
  product: ProductRecord,
  context: PayoffTenorContext = {},
): number {
  const asOf = context.asOf ?? new Date();

  const phaseTenor = getPhasePayoffTenorDays(product);
  if (phaseTenor != null && phaseTenor >= 30) return phaseTenor;

  const fromMaster =
    parseNumericField(rawField(product, "Payoff Tenor(Days)", "Payoff Tenor (Days)", "Payoff Tenor")) ??
    undefined;
  if (fromMaster && fromMaster >= 30) return fromMaster;

  const start = getWorkingAllotmentDate(product, asOf);
  const end = getProductExpirationDate(product) ?? getProductFinalObservationDate(product);
  if (start && end) {
    const span = differenceInCalendarDays(end, start);
    if (span >= 30) return span;
  }

  if (product.tenorDays && product.tenorDays >= 30) return product.tenorDays;

  return getAllotmentToLastObservationDays(product, asOf);
}

/** @deprecated alias — use `resolvePayoffScenarioTenorDays` with context when expired. */
export function getPayoffTenorDays(
  product: ProductRecord,
  asOf?: Date,
  expired?: boolean,
): number {
  return resolvePayoffScenarioTenorDays(product, { asOf, expired });
}

/** Remaining calendar days from desk date to phase schedule end. */
export function getPayoffRemainingTenorDays(product: ProductRecord, asOf: Date = new Date()): number {
  const anchor = getProductExpirationDate(product) ?? getProductExpiryDate(product);
  if (anchor) {
    const remaining = differenceInCalendarDays(anchor, asOf);
    if (remaining >= 30) return remaining;
    const start = getWorkingAllotmentDate(product, asOf) ?? asOf;
    const full = differenceInCalendarDays(anchor, start);
    if (full >= 30) return full;
  }
  return resolvePayoffScenarioTenorDays(product, { asOf });
}

/** Desk copy — maturity / POED / rollover depending on Rollover Phase. */
export function getPayoffScenarioEndLabel(product: ProductRecord): string {
  return getPhaseScheduleEndLabel(product);
}

function resolveInputsTenor(product: ProductRecord, inputs: PayoffInputs): number {
  if (inputs.remainingTenorDays != null && inputs.remainingTenorDays >= 30) {
    return inputs.remainingTenorDays;
  }
  return resolvePayoffScenarioTenorDays(product, {
    asOf: inputs.asOf,
    expired: inputs.expired,
  });
}

/**
 * Primary Payoff table parity:
 * F = InitialFixing × (1 + G) · G → Z in formula · H = ProductReturn · I = (1+H)^(365/D22)−1
 */
export function buildPayoffScenarioTable(product: ProductRecord, inputs: PayoffInputs): PayoffScenarioRow[] {
  const initialFixing = getIndexEntryLevel(product);
  const debentures = inputs.debentures ?? 100;
  const pricePerDebenture = inputs.pricePerDebenture ?? product.pricePerDebenture ?? getFaceValue(product);
  const investment = debentures * pricePerDebenture;
  const payoffTenorDays = resolveInputsTenor(product, inputs);
  const formula = product.formulaText ?? "Z";

  return PAYOFF_SCENARIO_OFFSETS.map((performance) => {
    const finalFixing = initialFixing * (1 + performance);
    const z = performance;
    const productReturn = evaluatePayoffFormula(formula, z);
    const maturityAmount = investment * (1 + productReturn);
    const irr = irrFromReturn(productReturn, payoffTenorDays);

    return {
      performance,
      finalFixing,
      z,
      maturityValue: productReturn,
      maturityAmount,
      returnOnInvestment: productReturn,
      irr,
    };
  });
}

export function payoffInputsFromDesk(
  product: ProductRecord,
  options: {
    debentures?: number;
    pricePerDebenture?: number;
    valuationDate?: string;
    expired?: boolean;
    asOf?: Date;
  },
): PayoffInputs {
  const asOf =
    options.asOf ??
    (options.valuationDate ? parseExcelishDate(options.valuationDate) : undefined) ??
    new Date();
  return {
    debentures: options.debentures,
    pricePerDebenture: options.pricePerDebenture,
    asOf,
    expired: options.expired,
  };
}
