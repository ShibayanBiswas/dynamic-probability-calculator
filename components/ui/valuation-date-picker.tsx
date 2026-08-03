"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  getMonth,
  getYear,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  setMonth,
  setYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { parseDeskDateInput } from "@/lib/product-data-guards";
import { formatDeskDate } from "@/lib/market-data";
import {
  clampValuationDateToPhaseWindow,
  formatPhaseValuationWindowHint,
  getPhaseValuationDateBounds,
} from "@/lib/product-lifecycle";
import type { ProductRecord } from "@/lib/types";
import { formatDisplayDate } from "@/lib/workbook/dates";
import { useClientMounted } from "@/lib/hooks/use-client-mounted";
import { usePropsSync } from "@/lib/hooks/use-props-sync";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: new Date(2000, index, 1).toLocaleString("en-GB", { month: "long" }),
}));

type MenuRect = { left: number; top: number; width: number };

function clampViewMonth(view: Date, minDate?: Date, maxDate?: Date) {
  let next = startOfMonth(view);
  if (minDate && isBefore(next, startOfMonth(minDate))) {
    next = startOfMonth(minDate);
  }
  if (maxDate && isAfter(next, startOfMonth(maxDate))) {
    next = startOfMonth(maxDate);
  }
  return next;
}

/** DD-MM-YYYY text field with calendar — days limited to the product phase window. */
export function ValuationDatePicker({
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
  const bounds = useMemo(
    () =>
      product
        ? getPhaseValuationDateBounds(product)
        : {
            minDate: undefined,
            maxDate: startOfDay(new Date()),
            startFieldLabel: "Allotment Date" as const,
            endFieldLabel: "maturity" as const,
          },
    [product],
  );
  const minDate = bounds.minDate;
  const maxDate = bounds.maxDate;
  const startFieldLabel = bounds.startFieldLabel;
  const minDateMs = minDate?.getTime();
  const maxDateMs = maxDate.getTime();

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const mounted = useClientMounted();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const selected = useMemo(() => parseDeskDateInput(value), [value]);
  const displayValue = selected ? formatDisplayDate(selected) : value;
  const [text, setText] = usePropsSync(displayValue, value);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(selected ?? maxDate));
  const [viewMonthKey, setViewMonthKey] = useState(value);

  if (selected && value !== viewMonthKey) {
    setViewMonthKey(value);
    setViewMonth(startOfMonth(selected));
  }

  // Keep selection inside the phase window when product / bounds change.
  useEffect(() => {
    if (!product || !value) return;
    const clamped = clampValuationDateToPhaseWindow(product, value);
    if (clamped !== value) onChange(clamped);
  }, [product, value, onChange, minDateMs, maxDateMs]);

  const yearOptions = useMemo(() => {
    const minYear = minDate ? getYear(minDate) : getYear(maxDate) - 30;
    const maxYear = getYear(maxDate);
    return Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => minYear + i);
  }, [minDate, maxDate]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const node = triggerRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const width = Math.min(22 * 16, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const approxHeight = Math.min(28 * 16, window.innerHeight * 0.75);
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const openUp = spaceBelow < Math.min(approxHeight, 340) && r.top > spaceBelow;
      const top = openUp
        ? Math.max(8, r.top - approxHeight - 8)
        : Math.min(r.bottom + 8, window.innerHeight - Math.min(approxHeight, spaceBelow) - 8);
      setRect({ left, top, width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-valuation-calendar]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isDisabled = (day: Date) =>
    (minDate != null && isBefore(day, minDate)) || isAfter(day, maxDate);

  const commit = (picked: Date) => {
    if (minDate && isBefore(picked, minDate)) {
      setInlineError(
        `Valuation date must be on or after ${startFieldLabel} ${formatDisplayDate(minDate)}.`,
      );
      return;
    }
    if (isAfter(picked, maxDate)) {
      setInlineError(
        bounds.phaseEnd && isSameDay(maxDate, bounds.phaseEnd)
          ? `Valuation date must be on or before phase end ${formatDisplayDate(maxDate)}.`
          : "Valuation date cannot be after today.",
      );
      return;
    }
    setInlineError(null);
    onChange(formatDeskDate(picked));
    setOpen(false);
  };

  const commitText = (raw: string) => {
    const picked = parseDeskDateInput(raw);
    if (!picked) {
      setInlineError("Enter a valid date as DD-MM-YYYY.");
      return;
    }
    commit(startOfDay(picked));
  };

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const canPrev = !minDate || isAfter(startOfMonth(viewMonth), startOfMonth(minDate));
  const canNext = isBefore(startOfMonth(viewMonth), startOfMonth(maxDate));
  const today = startOfDay(new Date());
  const todaySelectable = !isDisabled(today);
  const jumpToToday = () => {
    const target = todaySelectable ? today : maxDate;
    setViewMonth(clampViewMonth(startOfMonth(target), minDate, maxDate));
    commit(target);
  };

  const setMonthAndYear = (month: number, year: number) => {
    setViewMonth(clampViewMonth(setYear(setMonth(viewMonth, month), year), minDate, maxDate));
  };

  const rangeHint = product
    ? formatPhaseValuationWindowHint(product)
    : `Through ${formatDisplayDate(maxDate)}`;

  const calendarPanel =
    mounted && open && rect
      ? createPortal(
          <div
            className="dropdown-panel fixed z-[400] flex max-h-[min(28rem,75vh)] flex-col overflow-hidden p-3 shadow-xl"
            data-valuation-calendar
            id="valuation-date-calendar"
            role="dialog"
            aria-label="Valuation date calendar"
            style={{ left: rect.left, top: rect.top, width: rect.width }}
          >
            <div className="shrink-0">
              <div className="flex items-center gap-1.5 px-1 pb-2">
                <button
                  aria-label="Previous month"
                  className="rounded-lg p-1.5 text-ink/70 transition enabled:hover:bg-gold/10 disabled:opacity-30 dark:enabled:hover:bg-gold/5"
                  disabled={!canPrev}
                  type="button"
                  onClick={() => setViewMonth((m) => clampViewMonth(addMonths(m, -1), minDate, maxDate))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <select
                  aria-label="Month"
                  className="min-w-0 flex-1 rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-maroon/40 dark:bg-stone-900"
                  value={getMonth(viewMonth)}
                  onChange={(e) => setMonthAndYear(Number(e.target.value), getYear(viewMonth))}
                >
                  {MONTH_OPTIONS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Year"
                  className="w-[4.5rem] rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-xs font-semibold text-ink outline-none focus:border-maroon/40 dark:bg-stone-900"
                  value={getYear(viewMonth)}
                  onChange={(e) => setMonthAndYear(getMonth(viewMonth), Number(e.target.value))}
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>

                <button
                  aria-label="Next month"
                  className="rounded-lg p-1.5 text-ink/70 transition enabled:hover:bg-gold/10 disabled:opacity-30 dark:enabled:hover:bg-gold/5"
                  disabled={!canNext}
                  type="button"
                  onClick={() => setViewMonth((m) => clampViewMonth(addMonths(m, 1), minDate, maxDate))}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
              <div className="grid grid-cols-7 gap-1 pb-1">
                {WEEKDAYS.map((d, i) => (
                  <span
                    key={`${d}-${i}`}
                    className="text-center text-[10px] font-bold uppercase tracking-wide text-stone-400"
                  >
                    {d}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {gridDays.map((day) => {
                  const disabled = isDisabled(day);
                  const isSel = selected != null && isSameDay(day, selected);
                  const isTodayCell = isSameDay(day, today);
                  const dim = !isSameMonth(day, viewMonth);
                  return (
                    <button
                      key={day.toISOString()}
                      aria-current={isTodayCell ? "date" : undefined}
                      aria-label={formatDisplayDate(day)}
                      aria-pressed={isSel}
                      className={cn(
                        "desk-calendar-day",
                        disabled && "cursor-not-allowed text-stone-300 dark:text-stone-600",
                        !disabled && !isSel && "text-ink",
                        isSel && "desk-calendar-day-selected",
                        !isSel && isTodayCell && !disabled && "ring-1 ring-maroon/50",
                        dim && !isSel && "text-stone-400",
                      )}
                      disabled={disabled}
                      type="button"
                      onClick={() => commit(startOfDay(day))}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 flex shrink-0 justify-between border-t border-gold/20 bg-[color:var(--ar-surface)] px-1 pt-2">
              <button
                aria-label="Jump to today"
                className="desk-calendar-action font-semibold text-maroon dark:text-[#a89860]"
                type="button"
                onClick={jumpToToday}
              >
                {todaySelectable ? "Today" : "Latest"}
              </button>
              <button className="desk-calendar-action font-medium" type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className={cn("relative space-y-1", className)}>
      <div ref={triggerRef} className="relative">
        <input
          className="input-glow w-full rounded-2xl px-4 py-3 pr-11 text-sm font-semibold text-ink outline-none"
          inputMode="numeric"
          placeholder="DD-MM-YYYY"
          value={text}
          onBlur={(e) => commitText(e.target.value)}
          onChange={(e) => {
            setInlineError(null);
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText((e.target as HTMLInputElement).value);
          }}
        />
        <button
          aria-controls="valuation-date-calendar"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Open calendar"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gold-dark/70 transition hover:bg-gold/10 dark:text-[#a89860]/80 dark:hover:bg-gold/5"
          type="button"
          onClick={() => setOpen((v) => !v)}
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>
      <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">{rangeHint}</p>
      {inlineError ? (
        <div className="desk-alert" role="alert">
          {inlineError}
        </div>
      ) : null}
      {calendarPanel}
    </div>
  );
}
