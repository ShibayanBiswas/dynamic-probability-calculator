"use client";

import { useMemo } from "react";

import { Input } from "@/components/layout/app-ui";
import { getExpiredValuationDateOptions } from "@/lib/expired-valuation-dates";
import { formatDeskDate } from "@/lib/market-data";
import { deskDateInputValue, parseDeskDateInput } from "@/lib/product-data-guards";
import { formatPhaseValuationWindowHint } from "@/lib/product-lifecycle";
import type { ProductRecord } from "@/lib/types";
import { parseExcelishDate } from "@/lib/workbook/dates";
import { cn } from "@/lib/utils";

/** Pick valuation date — expired tab: obs dates → last obs → maturity / rollover C/P. */
export function ObservationDateSelect({
  product,
  value,
  onChange,
  className,
}: {
  product?: ProductRecord;
  value: string;
  onChange: (deskDate: string) => void;
  className?: string;
}) {
  const options = useMemo(
    () => (product ? getExpiredValuationDateOptions(product) : []),
    [product],
  );
  const rangeHint = useMemo(
    () => (product ? formatPhaseValuationWindowHint(product) : null),
    [product],
  );

  const parsed = parseDeskDateInput(value);
  const selectValue = parsed ? deskDateInputValue(parsed) : "";

  if (options.length === 0) {
    return (
      <div className={cn("space-y-1", className)}>
        <Input
          className="input-glow font-semibold text-ink"
          placeholder="DD-MM-YYYY"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {rangeHint ? (
          <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">
            {rangeHint}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <select
        className="input-glow w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-ink"
        value={selectValue}
        onChange={(e) => {
          const picked = parseDeskDateInput(e.target.value);
          if (!picked) return;
          const match = options.find(
            (opt) => deskDateInputValue(parseExcelishDate(opt.desk)!) === e.target.value,
          );
          onChange(match?.desk ?? formatDeskDate(picked));
        }}
      >
        <option value="">Select valuation date…</option>
        {options.map((opt) => (
          <option key={opt.date.getTime()} value={deskDateInputValue(parseExcelishDate(opt.desk)!)}>
            {opt.label}
          </option>
        ))}
      </select>
      {rangeHint ? (
        <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">
          {rangeHint}
        </p>
      ) : null}
    </div>
  );
}
