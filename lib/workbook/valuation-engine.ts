import { differenceInCalendarDays } from "date-fns";

import {
  getPhasePayoffTenorDays,
  getProductFinalObservationDate,
  getWorkingAllotmentDate,
  resolveWorkingMaturityDate,
} from "@/lib/product-dates";
import { getDebenturePrice, getIndexEntryLevel, isSensexLinked } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { parseExcelishDate, toExcelSerial } from "@/lib/workbook/dates";
import {
  computeExpectedUnderlyingLevel,
  computeUnderlyingPerformance,
  qualifiesForAnyFullCoupon,
  resolveCouponFormedReturn,
  resolveValuationExpectedLevel,
  resolveWorkingObservationDate,
} from "@/lib/workbook/valuation-performance";
import {
  computeWorkingFinalValuation,
  workingColumnY,
  type WorkingSerialDates,
} from "@/lib/workbook/valuation-serial";
import { irrFromReturn } from "@/lib/workbook/irr";

export interface ValuationInputs {
  valuationDate?: string;
  currentLevel?: number;
  debentures?: number;
  purchasePrice?: number;
  /** Optional Working-sheet row inputs for desk replay / parity tests. */
  deskRow?: {
    allotmentDate?: string | number;
    maturityDate?: string | number;
    observationDate?: string | number;
    entryLevel?: number;
    clientInvestment?: number;
    /** Working!P formula text — overrides master when replaying Excel rows. */
    formulaText?: string;
    /** Working!S (ProductReturns) — overrides formula evaluation when set. */
    formulaReturn?: number;
  };
}

export interface ValuationResult {
  productValue: number;
  absReturn: number;
  productIrr: number;
  formulaReturn: number;
  z: number;
  indexEntryLevel: number;
  currentLevel: number;
  totalAmount: number;
  remainingTenorDays: number;
  elapsedDays: number;
  clientInvestment: number;
}

function emptyValuationResult(): ValuationResult {
  return {
    productValue: 0,
    absReturn: 0,
    productIrr: 0,
    formulaReturn: 0,
    z: 0,
    indexEntryLevel: 0,
    currentLevel: 0,
    totalAmount: 0,
    remainingTenorDays: 0,
    elapsedDays: 0,
    clientInvestment: 0,
  };
}

function resolveAllotmentDate(product: ProductRecord, valuationDate: Date) {
  return getWorkingAllotmentDate(product, valuationDate) ?? valuationDate;
}

function asSerial(value: string | number | undefined, fallback: Date): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 30_000) return value;
  if (value != null) {
    const parsed = parseExcelishDate(value);
    if (parsed) return toExcelSerial(parsed);
  }
  return toExcelSerial(fallback);
}

/** Working!U — client investment per debenture (deal price), matching the Working sheet. */
export { getDebenturePrice as getWorkingClientInvestment } from "@/lib/product-utils";

type PostLastObsGrowthInput = {
  product: ProductRecord;
  clientInvestment: number;
  formula: string;
  formulaReturn: number;
  indexEntryLevel: number;
  currentLevel: number;
  allotmentDate: Date;
  valuationDate: Date;
  observationDate: Date | undefined;
  serials: WorkingSerialDates;
  serialDesk: { allotment?: number; valuation?: number; observation?: number };
  sensexLinked: boolean;
  /** Maturity or rollover C/P — growth stops here when val date is later. */
  growthAnchorDate: Date;
};

/**
 * After the final observation: lock product IRR at that fixing, then compound the debenture
 * value forward to the valuation date or maturity / rollover C/P (whichever is earlier).
 * Returns `null` when valuation is on/before the final observation.
 */
export function applyPostLastObservationGrowth(input: PostLastObsGrowthInput): number | null {
  const {
    product,
    clientInvestment,
    formula,
    indexEntryLevel,
    currentLevel,
    allotmentDate,
    valuationDate,
    observationDate: _observationDate,
    serials,
    serialDesk: _serialDesk,
    sensexLinked,
    growthAnchorDate,
  } = input;
  void _observationDate;
  void _serialDesk;

  const finalObs = getProductFinalObservationDate(product);
  if (!finalObs || valuationDate.getTime() <= finalObs.getTime()) return null;

  const obsLevel = resolveValuationExpectedLevel(
    product,
    indexEntryLevel,
    currentLevel,
    allotmentDate,
    valuationDate,
    sensexLinked,
  );
  const obsPerformance = computeUnderlyingPerformance(indexEntryLevel, currentLevel, obsLevel);
  const barrierMet = qualifiesForAnyFullCoupon(
    product,
    valuationDate,
    indexEntryLevel,
    currentLevel,
    sensexLinked,
  );
  // Lock growth at the formula payoff on the last-obs Working path (not CC1 headline).
  const obsFormulaReturn = resolveCouponFormedReturn(product, obsPerformance, formula, barrierMet);

  const obsSerials: WorkingSerialDates = {
    ...serials,
    valuation: toExcelSerial(finalObs),
  };
  const valueAtObs = computeWorkingFinalValuation(clientInvestment, obsFormulaReturn, obsSerials);
  const irrAtObs = workingColumnY(
    Math.max(valueAtObs, clientInvestment),
    clientInvestment,
    Math.max(1, obsSerials.valuation - serials.allotment),
  );

  const growthEndDate =
    valuationDate.getTime() < growthAnchorDate.getTime() ? valuationDate : growthAnchorDate;
  const growthDays = Math.max(0, differenceInCalendarDays(growthEndDate, finalObs));
  return Math.max(valueAtObs, clientInvestment) * Math.pow(1 + irrAtObs, growthDays / 365);
}

/**
 * Primary Valuation Working sheet parity:
 * N/O = expected underlying performance · S = ProductReturns(P,O) · V = IF(I≥B1,…) · X = max(V,U)
 */
export function computeValuation(product: ProductRecord, inputs: ValuationInputs): ValuationResult {
  if (!product?.formulaText && !product?.name) {
    return emptyValuationResult();
  }

  const indexEntryLevel = inputs.deskRow?.entryLevel ?? getIndexEntryLevel(product);
  const clientInvestment = inputs.deskRow?.clientInvestment ?? getDebenturePrice(product);
  const debentures = Math.max(1, Math.round(inputs.debentures ?? 100));
  const rawLevel = inputs.currentLevel;
  const currentLevel =
    rawLevel != null && Number.isFinite(rawLevel) && rawLevel > 0 ? rawLevel : indexEntryLevel;

  const valuationDate =
    (typeof inputs.valuationDate === "string" ? parseExcelishDate(inputs.valuationDate) : undefined) ??
    new Date();
  const allotmentDate =
    (inputs.deskRow?.allotmentDate != null
      ? parseExcelishDate(inputs.deskRow.allotmentDate)
      : undefined) ?? resolveAllotmentDate(product, valuationDate);

  // Schedule-end anchor (Working!H for live desk). Prefer Rollover Phase end
  // (Blank/Phase 2 Maturity · Phase 1 POED · 10Y Rollover) so Product IRR and
  // debenture growth share the same tenure. Mode B supplies Excel Working!H via deskRow.
  const maturityDate =
    (inputs.deskRow?.maturityDate != null
      ? parseExcelishDate(inputs.deskRow.maturityDate)
      : undefined) ?? resolveWorkingMaturityDate(product, valuationDate);

  const observationDate =
    (inputs.deskRow?.observationDate != null
      ? parseExcelishDate(inputs.deskRow.observationDate)
      : undefined) ?? resolveWorkingObservationDate(product, valuationDate);

  const serials: WorkingSerialDates = {
    allotment: asSerial(inputs.deskRow?.allotmentDate, allotmentDate),
    valuation: toExcelSerial(valuationDate),
    maturity: asSerial(inputs.deskRow?.maturityDate, maturityDate),
    observation:
      inputs.deskRow?.observationDate != null && observationDate
        ? asSerial(inputs.deskRow.observationDate, observationDate)
        : observationDate
          ? toExcelSerial(observationDate)
          : undefined,
  };

  const serialDesk = {
    allotment: serials.allotment,
    valuation: serials.valuation,
    observation: serials.observation,
  };

  const sensexLinked = isSensexLinked(product);
  // Excel Working-row replay keeps classic N path; live desk uses obs-average valuation path.
  const expectedLevel =
    inputs.deskRow != null
      ? computeExpectedUnderlyingLevel(
          indexEntryLevel,
          currentLevel,
          allotmentDate,
          valuationDate,
          observationDate,
          serialDesk,
          sensexLinked,
        )
      : resolveValuationExpectedLevel(
          product,
          indexEntryLevel,
          currentLevel,
          allotmentDate,
          valuationDate,
          sensexLinked,
        );
  const performance = computeUnderlyingPerformance(indexEntryLevel, currentLevel, expectedLevel);

  const formula = (inputs.deskRow?.formulaText ?? product.formulaText)?.trim() || "Z";
  let formulaReturn = inputs.deskRow?.formulaReturn;

  if (formulaReturn == null || !Number.isFinite(formulaReturn)) {
    const barrierMet = qualifiesForAnyFullCoupon(
      product,
      valuationDate,
      indexEntryLevel,
      currentLevel,
      sensexLinked,
    );
    formulaReturn = resolveCouponFormedReturn(product, performance, formula, barrierMet);
  }

  // Logic sheet I.4 / Working!V (live desk + expired marks):
  // - last obs ahead → grow U by product IRR T to valuation date
  // - last obs done, phase end ahead → discount maturity payoff @ 11%
  // - last obs + phase end done → U·(1+S)  (live only; Mode B keeps Excel V)
  // Post-obs Y compounding is not applied — matches Jun-26 Logic + 31-Jul NAVs.
  let finalValuation = computeWorkingFinalValuation(clientInvestment, formulaReturn, serials);
  if (
    inputs.deskRow == null &&
    serials.observation != null &&
    serials.observation < serials.valuation &&
    serials.maturity < serials.valuation
  ) {
    finalValuation = clientInvestment * (1 + formulaReturn);
  }

  const productValueRaw = Math.max(finalValuation, clientInvestment);
  const productValue = Math.round(productValueRaw);
  const absReturn = clientInvestment > 0 ? productValue / clientInvestment - 1 : formulaReturn;
  const totalAmount = productValue * debentures;

  const elapsedSerialDays = serials.valuation - serials.allotment;
  // Same calendar day as Working!F → 0 elapsed (do not clamp to 1 — that blows up Y/underlying IRRs)
  const elapsedDays = Math.max(0, elapsedSerialDays);
  const remainingTenorDays = Math.max(1, serials.maturity - serials.valuation);
  // Live desk: Coupon Formed IRR over actual phase tenure (Working!F → schedule end) —
  // same basis as payoff scenario XIRR (`irrFromReturn`). Mode B Excel row replay keeps Working!Y.
  const phaseTenorDays =
    getPhasePayoffTenorDays(product) ?? Math.max(0, serials.maturity - serials.allotment);
  const productIrr =
    inputs.deskRow != null
      ? workingColumnY(productValue, clientInvestment, elapsedDays)
      : irrFromReturn(formulaReturn, phaseTenorDays);

  return {
    productValue,
    absReturn,
    productIrr,
    formulaReturn,
    z: performance,
    indexEntryLevel,
    currentLevel,
    totalAmount,
    remainingTenorDays,
    elapsedDays,
    clientInvestment,
  };
}

export function computeValuationBatch(
  products: ProductRecord[],
  shared: Omit<ValuationInputs, "debentures"> & { debentures?: number },
) {
  return products.map((product) => ({
    product,
    result: computeValuation(product, {
      ...shared,
      debentures: shared.debentures ?? 100,
    }),
  }));
}
