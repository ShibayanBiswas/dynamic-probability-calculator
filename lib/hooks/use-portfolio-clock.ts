"use client";

import { useEffect, useState } from "react";

import { deskDateKey } from "@/lib/market-data";
import { isAfterNseCashClose } from "@/lib/observation-settlement";

function deskClockFingerprint(date: Date) {
  // Re-render when the IST desk day flips OR when the cash session crosses EOD,
  // so 0D observation levels can fill after 15:30 IST without a full minute rebuild loop.
  return `${deskDateKey(date)}|eod=${isAfterNseCashClose(date) ? "1" : "0"}`;
}

/**
 * Portfolio clock — lifecycle buckets follow the calendar date.
 * Bumps `asOf` on desk-day change and when the NSE cash session crosses close,
 * so observation levels on 0D settle at EOD without revaluing every minute.
 */
export function usePortfolioClock() {
  const [asOf, setAsOf] = useState(() => new Date());

  useEffect(() => {
    const sync = () => {
      const now = new Date();
      setAsOf((prev) => (deskClockFingerprint(prev) === deskClockFingerprint(now) ? prev : now));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { asOf, dayKey: deskDateKey(asOf) };
}
