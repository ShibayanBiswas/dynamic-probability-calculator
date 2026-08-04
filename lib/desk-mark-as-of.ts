/**
 * Probability / portfolio mark policy — underlying prices as of the last
 * completed NSE cash session until today's close (15:30 IST), then today.
 */
import { formatDisplayDate, toLocalDateKey } from "@/lib/workbook/dates";
import {
  isAfterNseCashClose,
  NSE_CASH_CLOSE_HOUR_IST,
  NSE_CASH_CLOSE_MINUTE_IST,
} from "@/lib/observation-settlement";

export { isAfterNseCashClose, NSE_CASH_CLOSE_HOUR_IST, NSE_CASH_CLOSE_MINUTE_IST };

export function getIstDeskDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${lookup("year")}-${lookup("month")}-${lookup("day")}`;
}

export type ProbabilityMarkPolicy = {
  /** True once today's NSE cash session has closed — live/today marks are eligible. */
  sessionClosed: boolean;
  /** ISO date key (YYYY-MM-DD) for the desk mark. */
  markDateKey: string;
  /** Display DD-MM-YYYY for the As of Today's Date column. */
  markDateLabel: string;
};

/**
 * Pick the mark session from available daily closes.
 * - Before 15:30 IST → nearest previous trading day (strictly before today IST)
 * - After 15:30 IST → today's bar when present, else latest available close
 */
export function resolveMarkDateFromCloses(
  closeDatesAsc: string[],
  now: Date = new Date(),
): ProbabilityMarkPolicy {
  const sessionClosed = isAfterNseCashClose(now);
  const todayKey = getIstDeskDateKey(now);
  const sorted = [...closeDatesAsc].filter(Boolean).sort();
  const prior = [...sorted].reverse().find((d) => d < todayKey) ?? sorted.at(-1) ?? todayKey;
  const todayBar = sorted.find((d) => d === todayKey);
  const markDateKey = sessionClosed && todayBar ? todayBar : prior;
  const [y, m, d] = markDateKey.split("-").map(Number);
  const markDate = new Date(y!, m! - 1, d!, 12, 0, 0);
  return {
    sessionClosed,
    markDateKey,
    markDateLabel: formatDisplayDate(markDate),
  };
}

/** Fallback when only a wall-clock is known (no Yahoo bars yet). */
export function resolveMarkDateFallback(now: Date = new Date()): ProbabilityMarkPolicy {
  const sessionClosed = isAfterNseCashClose(now);
  const todayKey = getIstDeskDateKey(now);
  if (sessionClosed) {
    const [y, m, d] = todayKey.split("-").map(Number);
    return {
      sessionClosed,
      markDateKey: todayKey,
      markDateLabel: formatDisplayDate(new Date(y!, m! - 1, d!, 12, 0, 0)),
    };
  }
  // Previous calendar day as a stand-in until Yahoo supplies the prior trading session.
  const [y, m, d] = todayKey.split("-").map(Number);
  const prior = new Date(Date.UTC(y!, m! - 1, d! - 1, 12, 0, 0));
  const markDateKey = toLocalDateKey(prior);
  return {
    sessionClosed,
    markDateKey,
    markDateLabel: formatDisplayDate(prior),
  };
}
