import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deterministic currency formatting — Indian desk units in Crores and Lakhs. */
export function toCrores(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  return num / 10_000_000;
}

export function toLakhs(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  return num / 100_000;
}

function indianDigits(value: number, digits: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return Math.abs(safe).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(digits, 3),
  });
}

/** Display number with up to 3 decimal places — Indian grouping. */
export function formatDecimal(value: number, maxFractionDigits = 3) {
  const num = Number.isFinite(value) ? value : 0;
  const sign = num < 0 ? "-" : "";
  return `${sign}${Math.abs(num).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(maxFractionDigits, 3),
  })}`;
}

const NBSP = "\u00a0";

/** Format rupee amounts primarily in Crores for desk analytics. */
export function formatCrores(value: number, digits = 2) {
  const cr = toCrores(value);
  const sign = cr < 0 ? "-" : "";
  return `${sign}₹${indianDigits(cr, Math.min(digits, 3))}${NBSP}Cr`;
}

export function formatCurrency(value: number, compact = true) {
  const num = Number.isFinite(value) ? value : 0;
  const sign = num < 0 ? "-" : "";
  const absolute = Math.abs(num);

  if (compact && absolute >= 10_000_000) {
    return `${sign}₹${indianDigits(absolute / 10_000_000, 2)}${NBSP}Cr`;
  }
  if (compact && absolute >= 100_000) {
    return `${sign}₹${indianDigits(absolute / 100_000, 2)}${NBSP}L`;
  }
  if (compact && absolute >= 1_000) {
    return `${sign}₹${indianDigits(absolute / 1_000, 2)}${NBSP}K`;
  }

  return `${sign}₹${absolute.toLocaleString("en-IN", { maximumFractionDigits: 3 })}`;
}

/** Short money label — Crores / Lakhs with non-breaking unit suffix. */
export function formatCroreLac(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (abs >= 10_000_000) {
    const cr = abs / 10_000_000;
    const digits = cr >= 100 ? 0 : Math.min(2, 3);
    return `${sign}₹${indianDigits(cr, digits)}${NBSP}Cr`;
  }
  if (abs >= 100_000) {
    return `${sign}₹${indianDigits(abs / 100_000, 0)}${NBSP}L`;
  }
  if (abs === 0) return "—";
  return `${sign}₹${abs.toLocaleString("en-IN", { maximumFractionDigits: 3 })}`;
}

/** Headline KPI notional — dash when the book is empty. */
export function formatKpiNotional(value: number, empty = "—") {
  const num = Number.isFinite(value) ? value : 0;
  return num > 0 ? formatCrores(num) : empty;
}

/** Headline KPI count — zero stays numeric unless the book is empty. */
export function formatKpiCount(value: number, hasProducts: boolean, empty = "—") {
  if (!hasProducts) return empty;
  return formatNumber(value);
}

/**
 * Recharts Y-axis tick — single token, no spaces (Recharts splits on spaces → line breaks).
 * Large notionals use kCr suffix: ₹13.5kCr instead of ₹13,500 Cr.
 */
export function formatChartAxisMoney(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (abs >= 10_000_000) {
    const cr = abs / 10_000_000;
    if (cr >= 1000) {
      const kCr = cr / 1000;
      const digits = kCr >= 100 ? 0 : kCr >= 10 ? 1 : 2;
      return `${sign}₹${kCr.toFixed(Math.min(digits, 3))}kCr`;
    }
    const digits = cr >= 100 ? 0 : cr >= 10 ? 1 : 2;
    return `${sign}₹${cr.toFixed(Math.min(digits, 3))}Cr`;
  }
  if (abs >= 100_000) {
    return `${sign}₹${Math.round(abs / 100_000)}L`;
  }
  if (abs === 0) return "₹0";
  if (abs >= 1000) {
    return `${sign}₹${Math.round(abs / 1000)}K`;
  }
  return `${sign}₹${Math.round(abs)}`;
}

/** @deprecated use formatChartAxisMoney for chart ticks */
export function formatAxisMoney(value: number) {
  return formatChartAxisMoney(value);
}

/** Display absolute return from formula engine (0.05 → 5%, 1 → 100%, capped for UI). */
export function formatFormulaReturn(value: number, digits = 1) {
  const num = Number.isFinite(value) ? value : 0;
  const pct = num * 100;
  const places = Math.min(Math.max(digits, 0), 3);
  if (Math.abs(pct) > 500) {
    return `${pct > 0 ? "" : "-"}500.${"0".repeat(places)}%+`;
  }
  return `${pct.toFixed(places)}%`;
}

export function formatPercent(value: number, digits = 1) {
  const num = Number.isFinite(value) ? value : 0;
  const pct = num * 100;
  const places = Math.min(Math.max(digits, 0), 3);
  if (Math.abs(pct) >= 1e6) {
    return `${pct > 0 ? "" : "-"}999.${"0".repeat(places)}%`;
  }
  return `${pct.toFixed(places)}%`;
}

/** Excel-safe currency — Indian grouping; replace ₹ for older Excel fonts / CSV paste. */
export function formatExcelCurrency(value: number, compact = true): string {
  return formatCurrency(value, compact).replace(/\u20b9/g, "Rs. ").replace(/\u00a0/g, " ");
}

/** Per-debenture desk value — whole rupees for valuation marks (Excel parity). */
export function formatProductUnitValue(value: number) {
  const num = Number.isFinite(value) ? value : 0;
  const sign = num < 0 ? "-" : "";
  return `${sign}₹${Math.round(Math.abs(num)).toLocaleString("en-IN")}`;
}

/** Excel-safe per-debenture mark. */
export function formatExcelProductUnitValue(value: number): string {
  return formatProductUnitValue(value).replace(/\u20b9/g, "Rs. ").replace(/\u00a0/g, " ");
}

/** Excel-style valuation header date */
export function formatValuationAsOf(dateRaw?: string) {
  if (!dateRaw?.trim()) return "Valuation";
  return `Product Value as on ${dateRaw.trim()}*`;
}

/** Product Details desk banner — report date without Excel asterisk. */
export function formatReportAsOf(dateRaw?: string) {
  if (!dateRaw?.trim()) return "Report";
  return `Report as of ${dateRaw.trim()}`;
}

export function formatNumber(value: number, maxFractionDigits = 3) {
  return formatDecimal(value, maxFractionDigits);
}

/** Human-readable coupon line from master — avoids raw PR/DM formula strings in UI. */
export function formatCouponDisplay(raw?: string | null) {
  if (!raw?.trim()) return undefined;
  const text = raw.trim();

  const headline = text.match(/^(\d+(?:\.\d+)?%)/);
  if (headline) return headline[1];

  const pr = text.match(/PR1:\s*(\d+(?:\.\d+)?%?)/i);
  if (pr) return `${pr[1].includes("%") ? pr[1] : `${pr[1]}%`} participation`;

  const pct = text.match(/\d+(?:\.\d+)?%/);
  if (pct) return pct[0];

  // Bare decimals like "0.38" are not display-ready — callers parse via getCouponPercent.
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return undefined;

  return text.split(/[,/]/)[0]?.trim();
}

export function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((chunk) => chunk[0]?.toUpperCase() + chunk.slice(1))
    .join(" ");
}

/** Remove parenthetical segments from user-visible labels — e.g. axis titles. */
export function stripLabelParens(label: string) {
  return label
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
