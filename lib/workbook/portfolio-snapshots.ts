import type { ValuationResult } from "@/lib/workbook/valuation-engine";

export type PortfolioValuationSnapshot = {
  valuationDate: string;
  /** Mark per debenture (₹1L face). */
  value: number | null;
  /** Total mark = value × debenture count, in ₹. */
  totalAmount: number | null;
  absReturn: number | null;
  couponFormed: number | null;
  productIrr: number | null;
};

export function blankValuationSnapshot(valuationDate: string): PortfolioValuationSnapshot {
  return {
    valuationDate,
    value: null,
    totalAmount: null,
    absReturn: null,
    couponFormed: null,
    productIrr: null,
  };
}

export function snapshotFromValuation(result: ValuationResult, valuationDate: string): PortfolioValuationSnapshot {
  return {
    valuationDate,
    value: result.productValue,
    totalAmount: result.totalAmount,
    absReturn: result.absReturn,
    couponFormed: result.formulaReturn,
    productIrr: result.productIrr,
  };
}
