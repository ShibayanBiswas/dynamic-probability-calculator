import type { ProductRecord } from "@/lib/types";
import { deskAlert, type DeskAlertVariant } from "@/lib/desk-alert";
import { getProductExpiryDate, getProductMaturityDate } from "@/lib/product-dates";
import { getIndexEntryLevelRaw, getProductTradeDate, rawField } from "@/lib/product-utils";
import { formatCrores } from "@/lib/utils";
import { parseExcelishDate } from "@/lib/workbook/dates";
import { tryEvaluatePayoffFormula } from "@/lib/workbook/formula-engine";

export type ProductDataAssessment = {
  canValue: boolean;
  canPayoff: boolean;
  blockers: string[];
  warnings: string[];
  missingFormula: boolean;
  missingDescription: boolean;
  missingEntryLevel: boolean;
  missingObsSchedule: boolean;
  missingMaturityAnchor: boolean;
};

export type DataQualityAlert = {
  id: string;
  title: string;
  message: string;
  variant: DeskAlertVariant;
};

const shownAlertIds = new Set<string>();

/** Reset dedupe when switching lifecycle tabs or products intentionally. */
export function resetDataQualityAlertDedupe() {
  shownAlertIds.clear();
}

function showDataQualityAlert(alert: DataQualityAlert, options?: { force?: boolean }) {
  if (!options?.force && shownAlertIds.has(alert.id)) return;
  shownAlertIds.add(alert.id);
  deskAlert(alert.message, { title: alert.title, variant: alert.variant });
}

function hasObservationSchedule(product: ProductRecord) {
  const months = rawField(product, "Observation Months");
  if (months?.trim()) return true;
  for (const key of ["Avg. 2", "Avg. 3", "Avg. 4", "Avg. 5", "Avg. 6", "Avg. 7"]) {
    if (rawField(product, key)) return true;
  }
  if (product.lastObservationDateRaw?.trim()) return true;
  if (rawField(product, "Last Observation Date", "Final Observation Date")) return true;
  return false;
}

export function assessProductData(product: ProductRecord | undefined): ProductDataAssessment {
  const empty: ProductDataAssessment = {
    canValue: false,
    canPayoff: false,
    blockers: ["No product selected."],
    warnings: [],
    missingFormula: true,
    missingDescription: true,
    missingEntryLevel: true,
    missingObsSchedule: true,
    missingMaturityAnchor: true,
  };
  if (!product) return empty;

  const blockers: string[] = [];
  const warnings: string[] = [];

  const formula = product.formulaText?.trim();
  const missingFormula = !formula;
  if (missingFormula) {
    blockers.push("Payoff formula is missing in the master file — valuation and payoff cannot be computed.");
  } else {
    const probe = tryEvaluatePayoffFormula(formula, 0);
    if (!probe.ok) {
      blockers.push(`Payoff formula cannot be evaluated (${probe.error}).`);
    }
  }

  const description = product.productExplanation?.trim() || rawField(product, "Product Explanation", "Product explanation");
  const missingDescription = !description;
  if (missingDescription) {
    warnings.push("Product description is missing in the master file.");
  }

  const entry = getIndexEntryLevelRaw(product);
  const missingEntryLevel = entry == null || entry <= 0;
  if (missingEntryLevel) {
    blockers.push("Entry / initial fixing level is missing — cannot compute underlying performance.");
  }

  const tradeDate = getProductTradeDate(product);
  if (!tradeDate) {
    warnings.push("Trade / allotment date is missing — IRR and observation logic may be approximate.");
  }

  const missingObsSchedule = !hasObservationSchedule(product);
  if (missingObsSchedule) {
    warnings.push(
      "Observation dates are not in the master file — post-final-observation lock cannot be applied. Index levels for Nifty/Sensex are still fetched from market data where available.",
    );
  }

  const missingMaturityAnchor = !getProductMaturityDate(product) && !getProductExpiryDate(product);
  if (missingMaturityAnchor) {
    warnings.push(
      "Maturity, expiry, and final observation are not in the master file — the engine falls back to tenor.",
    );
  }

  if (!product.underlying?.trim()) {
    warnings.push("Underlying is blank — defaulting index selection may be wrong.");
  }

  const canPayoff = !missingFormula && !missingEntryLevel;
  const canValue = canPayoff;

  return {
    canValue,
    canPayoff,
    blockers,
    warnings,
    missingFormula,
    missingDescription,
    missingEntryLevel,
    missingObsSchedule,
    missingMaturityAnchor,
  };
}

/** Hard blockers only — used when resetting selection to the tab default. */
export function isHardBlockedProduct(product: ProductRecord | undefined): boolean {
  if (!product) return true;
  const assessment = assessProductData(product);
  return assessment.missingFormula || assessment.missingEntryLevel;
}

/**
 * A "clean" product has everything the desk needs to compute without any
 * data-quality prompt: formula, entry level, and product description.
 */
export function isCleanProduct(product: ProductRecord | undefined): boolean {
  if (!product) return false;
  const assessment = assessProductData(product);
  return assessment.canValue && assessment.canPayoff && !assessment.missingDescription;
}

export function buildMissingFormulaAlert(product: ProductRecord): DataQualityAlert {
  return {
    id: `missing-formula:${product.rowId}`,
    title: "Missing Payoff Formula",
    message:
      "Payoff formula is missing in the master file for this product — valuation and payoff cannot be computed. Selection has been reset to the default product for this lifecycle tab.",
    variant: "error",
  };
}

export function buildMissingEntryLevelAlert(product: ProductRecord): DataQualityAlert {
  return {
    id: `missing-entry:${product.rowId}`,
    title: "Missing Entry Level",
    message:
      "Entry / initial fixing level is missing in the master file — underlying performance cannot be computed. Selection has been reset to the default product for this lifecycle tab.",
    variant: "error",
  };
}

export function buildMissingObsScheduleAlert(product: ProductRecord): DataQualityAlert {
  return {
    id: `missing-obs:${product.rowId}`,
    title: "Missing Observation Schedule",
    message:
      "Observation dates are not in the master file for this product — post-final-observation lock cannot be applied. Index levels are still fetched from market data when a valuation date is set.",
    variant: "warning",
  };
}

export function buildMissingMaturityAlert(product: ProductRecord): DataQualityAlert {
  return {
    id: `missing-maturity:${product.rowId}`,
    title: "Missing Maturity Anchor",
    message:
      "Maturity, expiry, and final observation are not in the master file — the valuation engine will fall back to tenor.",
    variant: "warning",
  };
}

export function buildInvalidDebentureCountAlert(message: string): DataQualityAlert {
  return {
    id: `invalid-debentures:${message}`,
    title: "Invalid Debenture Count",
    message: `${message} Count has been reset to the product default.`,
    variant: "warning",
  };
}

/** Primary hard-block alert for an explicit user product pick. */
export function getProductSelectBlockerAlert(product: ProductRecord | undefined): DataQualityAlert | null {
  if (!product) return null;
  const assessment = assessProductData(product);
  if (assessment.missingFormula) return buildMissingFormulaAlert(product);
  if (assessment.missingEntryLevel) return buildMissingEntryLevelAlert(product);
  return null;
}

/** @deprecated use getProductSelectBlockerAlert */
export function getExplicitSelectAlert(product: ProductRecord | undefined): {
  message: string;
  title: string;
  variant: "error";
} | null {
  const alert = getProductSelectBlockerAlert(product);
  if (!alert) return null;
  return { message: alert.message, title: alert.title, variant: "error" };
}

/** Warning alerts surfaced when output is revealed (once per product per session). */
export function getOutputRevealWarningAlerts(product: ProductRecord): DataQualityAlert[] {
  const assessment = assessProductData(product);
  const alerts: DataQualityAlert[] = [];
  if (assessment.missingObsSchedule) alerts.push(buildMissingObsScheduleAlert(product));
  if (assessment.missingMaturityAnchor) alerts.push(buildMissingMaturityAlert(product));
  return alerts;
}

/**
 * Desk popups when the user opens valuation / payoff output.
 * Hard blockers and soft warnings are raised once per product per session.
 */
export function handleOutputReveal(product?: ProductRecord) {
  if (!product) return;

  const blocker = getProductSelectBlockerAlert(product);
  if (blocker) {
    showDataQualityAlert(blocker);
    return;
  }

  for (const alert of getOutputRevealWarningAlerts(product)) {
    showDataQualityAlert(alert);
  }
}

/** Raise blocker alert and reset dedupe when lifecycle tab changes. */
export function notifyProductBlockedAndReset(product: ProductRecord, fallbackName?: string) {
  const alert = getProductSelectBlockerAlert(product);
  if (alert) {
    showDataQualityAlert(alert, { force: true });
    return;
  }
  if (fallbackName) {
    showDataQualityAlert(
      {
        id: `reset:${product.rowId}`,
        title: "Product Reset",
        message: `Selection has been reset to ${fallbackName}.`,
        variant: "info",
      },
      { force: true },
    );
  }
}

export function notifyInvalidDebentureCount(message: string) {
  showDataQualityAlert(buildInvalidDebentureCountAlert(message), { force: true });
}

export function formatOptionalNumber(value: number | undefined | null, formatter: (n: number) => string): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatter(value);
}

export function formatOptionalCrores(value: number | undefined | null) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  return formatCrores(value);
}

export function deskDateInputValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDeskDateInput(value: string): Date | undefined {
  if (!value.trim()) return undefined;
  const parsed = parseExcelishDate(value);
  if (parsed) return parsed;
  const native = new Date(value);
  return Number.isNaN(native.getTime()) ? undefined : native;
}
