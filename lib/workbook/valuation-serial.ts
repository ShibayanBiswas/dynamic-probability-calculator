import { toExcelSerial } from "@/lib/workbook/dates";

/** Excel serial delta (H−F, B1−F, I−F, etc.) — one serial unit = one calendar day. */
export function serialDelta(later: Date | number, earlier: Date | number): number {
  const a = typeof earlier === "number" ? earlier : toExcelSerial(earlier);
  const b = typeof later === "number" ? later : toExcelSerial(later);
  return b - a;
}

/** Working!L = −K · Working!XIRR(L:M,F:G) with L=−K, M=current index. */
export function xirrEntryToCurrent(entryLevel: number, currentLevel: number, daysAllotToVal: number): number {
  if (entryLevel <= 0 || currentLevel <= 0 || daysAllotToVal <= 0) return 0;
  return Math.pow(currentLevel / entryLevel, 365 / daysAllotToVal) - 1;
}

/** Working!T = (1+S)^(365/(H−F)) − 1 */
export function workingColumnT(formulaReturn: number, daysAllotToMaturity: number): number {
  if (daysAllotToMaturity <= 0) return 0;
  return Math.pow(1 + formulaReturn, 365 / daysAllotToMaturity) - 1;
}

export type WorkingSerialDates = {
  allotment: number;
  valuation: number;
  maturity: number;
  observation?: number;
};

/**
 * Working!V — Excel branch (Mode B parity):
 * IF(I−B1≥0, U·(1+T)^((B1−F)/365), U·(1+(1+S)/((1+11%)^((H−B1)/365))−1))
 *
 * Live desk Logic sheet I.4a (last obs + phase end both done → U·(1+S)) is applied
 * in `computeValuation`, not here, so Excel row replay stays unchanged.
 */
export function computeWorkingFinalValuation(
  clientInvestment: number,
  formulaReturn: number,
  serials: WorkingSerialDates,
): number {
  const { allotment: F, valuation: B1, maturity: H, observation: I } = serials;
  const U = clientInvestment;
  const S = formulaReturn;

  const obsOnOrAfterVal = I != null ? I - B1 >= 0 : false;

  if (obsOnOrAfterVal) {
    const T = workingColumnT(S, H - F);
    return U * Math.pow(1 + T, (B1 - F) / 365);
  }

  const discountFactor = Math.pow(1.11, (H - B1) / 365);
  const adjusted = (1 + S) / discountFactor - 1;
  return U * (1 + adjusted);
}

/** Working!Y = (X/U)^(365/(G−F)) − 1 with G = valuation date. */
export function workingColumnY(productValue: number, clientInvestment: number, daysAllotToVal: number): number {
  if (clientInvestment <= 0 || daysAllotToVal <= 0) return 0;
  return Math.pow(productValue / clientInvestment, 365 / daysAllotToVal) - 1;
}
