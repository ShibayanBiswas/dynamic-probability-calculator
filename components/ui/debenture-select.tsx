"use client";

import { useState } from "react";

import { Input } from "@/components/layout/app-ui";
import { DEBENTURE_PRESETS } from "@/lib/dashboard-input-config";
import { usePropsSync } from "@/lib/hooks/use-props-sync";
import { notifyInvalidDebentureCount } from "@/lib/product-data-guards";
import type { ProductRecord } from "@/lib/types";
import { getMaxDebentures, inferDebentureCount } from "@/lib/product-utils";
import { cn } from "@/lib/utils";

export function DebentureSelect({
  value,
  onChange,
  product,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  product?: ProductRecord;
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = usePropsSync(value, product?.rowId);
  const maxDebentures = product ? getMaxDebentures(product) : 1_000_000;

  const defaultCount = product ? inferDebentureCount(product) : 100;

  const validate = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return "Enter a whole number of debentures.";
    }
    if (!/^[1-9]\d*$/.test(trimmed)) {
      return "Natural numbers only — no zero, decimals, or letters.";
    }
    const n = Number(trimmed);
    if (product && n > maxDebentures) {
      return `Cannot exceed ${maxDebentures.toLocaleString("en-IN")} debentures (master notional ÷ price per debenture).`;
    }
    return null;
  };

  const resetToDefault = (message: string) => {
    notifyInvalidDebentureCount(message);
    const normalized = String(defaultCount);
    setError(null);
    setDraft(normalized);
    onChange(normalized);
  };

  const apply = (raw: string) => {
    const message = validate(raw);
    if (message) {
      setError(message);
      resetToDefault(message);
      return;
    }
    setError(null);
    const normalized = String(Math.max(1, Math.round(Number(raw.trim()))));
    setDraft(normalized);
    onChange(normalized);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoComplete="off"
          className="input-glow min-w-[10rem] flex-1 font-semibold text-ink"
          inputMode="numeric"
          placeholder="Type debenture count"
          type="text"
          value={draft}
          onBlur={() => apply(draft)}
          onChange={(e) => {
            setError(null);
            setDraft(e.target.value.replace(/[^\d]/g, ""));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply(draft);
            }
          }}
        />
        <span className="desk-chip">
          Max{" "}
          <span className="font-bold text-maroon">{maxDebentures.toLocaleString("en-IN")}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DEBENTURE_PRESETS.filter((n) => Number(n) <= maxDebentures).map((n) => (
          <button
            key={n}
            className={cn(
              "desk-preset",
              draft === n && "desk-preset-active",
            )}
            type="button"
            onClick={() => {
              setError(null);
              setDraft(n);
              onChange(n);
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {error ? (
        <div className="desk-alert-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
