/** Excel-style annualized return: growth^(365/elapsedDays) − 1 with desk sanity guards. */
export function annualizedIrr(growth: number, elapsedDays: number) {
  if (!Number.isFinite(growth) || growth <= 0 || elapsedDays < 30) {
    return 0;
  }
  const exponent = 365 / elapsedDays;
  if (exponent > 200) {
    return 0;
  }
  const irr = Math.pow(growth, exponent) - 1;
  if (!Number.isFinite(irr) || Math.abs(irr) > 5) {
    return 0;
  }
  return irr;
}

/** Remaining-tenor IRR from total return — payoff scenario table. */
export function irrFromReturn(returnOnInvestment: number, tenorDays: number) {
  if (!Number.isFinite(returnOnInvestment) || returnOnInvestment <= -1 || tenorDays < 30) {
    return 0;
  }
  const growth = 1 + returnOnInvestment;
  return annualizedIrr(growth, tenorDays);
}
