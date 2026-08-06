import {
  formatProductExpirationDate,
  getProductObservationSlotDates,
} from "@/lib/product-dates";
import type { ProductRecord } from "@/lib/types";
import { formatDisplayDate } from "@/lib/workbook/dates";

/** Max scheduled observation slots shown in portfolio table / exports (Observation 1–7). */
export const MAX_PORTFOLIO_OBS_COLUMNS = 7;

/** Desk table headers for observation date slots — Primary SP uses Observation 1–7 (not Average). */
export const PORTFOLIO_OBS_COLUMN_LABELS = Array.from(
  { length: MAX_PORTFOLIO_OBS_COLUMNS },
  (_, index) => `Observation ${index + 1}`,
);

/** Expiration Date column — lifecycle maturity anchor. */
export function formatLastObservationDate(product: ProductRecord): string {
  return formatProductExpirationDate(product);
}

export function observationDateCells(product: ProductRecord): string[] {
  return getProductObservationSlotDates(product).map((date) =>
    date ? formatDisplayDate(date) : "—",
  );
}
