import { differenceInCalendarDays } from "date-fns";

import {
  getPhaseScheduleEndLabel,
  getProductExpirationDate,
  getProductFinalObservationDate,
  getProductObservationDates,
  getWorkingAllotmentDate,
} from "@/lib/product-dates";
import { formatDeskDate } from "@/lib/market-data";
import type { ProductRecord } from "@/lib/types";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";

export type ExpiredValuationDateKind = "observation" | "last-observation" | "expiration";

export type ExpiredValuationDateOption = {
  date: Date;
  desk: string;
  label: string;
  kind: ExpiredValuationDateKind;
};

/** Upper bound for expired MTM — phase schedule end, else last observation. */
export function getExpiredValuationUpperBound(product: ProductRecord): Date | undefined {
  return getProductExpirationDate(product) ?? getProductFinalObservationDate(product);
}

/**
 * Expired tab valuation dates — ascending:
 * earlier observations → last observation → phase end
 * (Blank/Phase 2 Maturity · Phase 1 POED · 10Y Rollover C/P).
 */
export function getExpiredValuationDateOptions(product: ProductRecord): ExpiredValuationDateOption[] {
  const obs = getProductObservationDates(product);
  const expiration = getProductExpirationDate(product);
  const lastObs = obs.length > 0 ? obs[obs.length - 1] : getProductFinalObservationDate(product);

  const rows: ExpiredValuationDateOption[] = [];
  const push = (date: Date, kind: ExpiredValuationDateKind) => {
    rows.push({
      date,
      desk: formatDeskDate(date),
      label: formatDisplayDate(date),
      kind,
    });
  };

  if (obs.length === 0) {
    if (lastObs) push(lastObs, "last-observation");
    if (expiration && (!lastObs || expiration.getTime() !== lastObs.getTime())) {
      push(expiration, "expiration");
    } else if (!lastObs && expiration) {
      push(expiration, "expiration");
    }
  } else {
    for (const d of obs.slice(0, -1)) {
      push(d, "observation");
    }

    if (lastObs) {
      push(lastObs, "last-observation");
    }

    if (expiration && (!lastObs || expiration.getTime() !== lastObs.getTime())) {
      push(expiration, "expiration");
    }
  }

  // Drop dates before phase start (Trade for Phase 2, Allotment otherwise).
  const phaseStart = getWorkingAllotmentDate(product);
  if (!phaseStart) return rows;
  return rows.filter((row) => differenceInCalendarDays(row.date, phaseStart) >= 0);
}

export function classifyExpiredValuationDate(
  product: ProductRecord,
  dateRaw: string,
): ExpiredValuationDateKind {
  const parsed = parseExcelishDate(dateRaw);
  if (!parsed) return "observation";
  const match = getExpiredValuationDateOptions(product).find((row) => row.date.getTime() === parsed.getTime());
  return match?.kind ?? "observation";
}

/** Desk banner for expired tabs — observation vs last obs vs phase schedule end. */
export function formatExpiredAsOfPatch(product: ProductRecord, dateRaw: string): string {
  const label = dateRaw?.trim() || "—";
  const kind = classifyExpiredValuationDate(product, dateRaw);
  switch (kind) {
    case "expiration": {
      const end = getPhaseScheduleEndLabel(product);
      if (end === "POED") return `As of POED · ${label}`;
      if (end === "rollover") return `As of rollover C/P · ${label}`;
      return `As of maturity · ${label}`;
    }
    case "last-observation":
      return `As of last observation · ${label}`;
    default:
      return `As of observation · ${label}`;
  }
}
