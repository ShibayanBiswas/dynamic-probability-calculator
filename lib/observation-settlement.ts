/**
 * Observation fixing settlement — levels fill only after the NSE cash close
 * on the observation calendar day (0D stays blank until EOD).
 */
import { toLocalDateKey } from "@/lib/workbook/dates";

/** NSE cash equity session close (IST). */
export const NSE_CASH_CLOSE_HOUR_IST = 15;
export const NSE_CASH_CLOSE_MINUTE_IST = 30;

function istParts(date: Date): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = lookup("year");
  const month = lookup("month");
  const day = lookup("day");
  const hour = Number(lookup("hour") === "24" ? "0" : lookup("hour"));
  const minute = Number(lookup("minute"));

  return {
    dateKey: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

/** True when `asOf` is at/after the NSE cash close on its IST calendar day. */
export function isAfterNseCashClose(asOf: Date = new Date()): boolean {
  const { minutes } = istParts(asOf);
  return minutes >= NSE_CASH_CLOSE_HOUR_IST * 60 + NSE_CASH_CLOSE_MINUTE_IST;
}

/**
 * Whether an observation slot may show an underlying level.
 * - Future calendar days → no
 * - Past calendar days → yes
 * - Same calendar day (0D) → only after NSE cash close (EOD)
 */
export function isObservationFixingSettled(observationDate: Date, asOf: Date = new Date()): boolean {
  const obsKey = toLocalDateKey(observationDate);
  const asOfIst = istParts(asOf).dateKey;
  // Prefer IST desk day for "today" so late UTC evenings don't advance the desk day early.
  const asOfKey = asOfIst || toLocalDateKey(asOf);

  if (obsKey < asOfKey) return true;
  if (obsKey > asOfKey) return false;
  return isAfterNseCashClose(asOf);
}
