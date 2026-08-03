"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, RefreshCw, Table2 } from "lucide-react";

import { Button, Select, SubTitle } from "@/components/layout/app-ui";
import { DynamicTable, type DynamicTableColumn } from "@/components/ui/dynamic-table";
import { runPivotEngine, type PivotAgg, type PivotResponse } from "@/lib/pivot/engine";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

export type PivotFieldDef = {
  key: string;
  label: string;
  type?: "number" | "text";
};

type PivotTableProps = {
  title?: string;
  data: Record<string, unknown>[];
  fields: PivotFieldDef[];
  defaultRows?: string[];
  defaultColumns?: string[];
  defaultValues?: string[];
  defaultAgg?: PivotAgg;
  valueFormatter?: (value: number, field: string) => string;
  className?: string;
  /** Premium desk styling — fit-to-content cells, gold header, horizontal scroll. */
  variant?: "default" | "premium";
  /** @deprecated Flat view now virtualizes the full dataset; limit is ignored. */
  flatRowLimit?: number;
};

export function PivotTable({
  title = "Pivot Explorer",
  data,
  fields,
  defaultRows = [],
  defaultColumns = [],
  defaultValues,
  defaultAgg = "sum",
  valueFormatter,
  className,
  variant = "default",
}: PivotTableProps) {
  const premium = variant === "premium";
  const numericFields = useMemo(() => fields.filter((f) => f.type === "number").map((f) => f.key), [fields]);
  const [rows, setRows] = useState<string[]>(defaultRows);
  const [columns, setColumns] = useState<string[]>(defaultColumns);
  const [values, setValues] = useState<string[]>(defaultValues ?? (numericFields[0] ? [numericFields[0]] : ["value"]));
  const [agg, setAgg] = useState<PivotAgg>(defaultAgg);
  const [apiResult, setApiResult] = useState<PivotResponse | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [mode, setMode] = useState<"pivot" | "flat">("flat");

  const canCompute = data.length > 0 && values.length > 0;
  const pivotSignature = useMemo(
    () => (canCompute ? JSON.stringify({ rows, columns, values, agg, count: data.length }) : null),
    [agg, canCompute, columns, data.length, rows, values],
  );

  const syncResult = useMemo(() => {
    if (!canCompute) return null;
    return runPivotEngine({ data, rows, columns, values, agg });
  }, [agg, canCompute, columns, data, rows, values]);

  const result = apiKey === pivotSignature && apiResult ? apiResult : syncResult;
  const loading = Boolean(pivotSignature && apiKey !== pivotSignature);

  const formatCell = useCallback(
    (value: number, field: string) => {
      if (valueFormatter) return valueFormatter(value, field);
      if (field.toLowerCase().includes("notional") || field.toLowerCase().includes("amount") || field === "tradeAmount") {
        return formatCurrency(value);
      }
      return formatNumber(value);
    },
    [valueFormatter],
  );

  useEffect(() => {
    if (!pivotSignature || !canCompute) return;

    let cancelled = false;
    const payload = { data, rows, columns, values, agg };

    void (async () => {
      try {
        const res = await fetch("/api/pivot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (cancelled) return;
        if (res.ok) {
          setApiResult((await res.json()) as PivotResponse);
        } else {
          setApiResult(runPivotEngine(payload));
        }
        setApiKey(pivotSignature);
      } catch {
        if (cancelled) return;
        setApiResult(runPivotEngine(payload));
        setApiKey(pivotSignature);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agg, canCompute, columns, data, pivotSignature, refreshToken, rows, values]);

  const fieldLabel = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

  const flatColumns = useMemo<DynamicTableColumn<Record<string, unknown>>[]>(
    () =>
      fields.map((field) => ({
        key: field.key,
        header: field.label,
        align: field.type === "number" ? "right" : "left",
        headerClassName: field.type === "number" ? "text-right" : undefined,
        cellClassName: cn(
          field.type === "number" && "text-right cell-value",
          (field.key === "Name on Signup Form" || field.key === "Name") && "max-w-[320px]",
        ),
        render: (row) => {
          const raw = row[field.key];
          if (raw == null || String(raw).trim() === "") return "—";
          if (field.type === "number" && looksNumeric(raw)) {
            return formatNumber(Number(String(raw).replace(/,/g, "")));
          }
          return String(raw);
        },
      })),
    [fields],
  );
  const tableWrapClass = premium
    ? "data-table-premium-wrap max-h-[min(72vh,780px)] overflow-auto"
    : "overflow-auto rounded-2xl border border-stone-200 bg-white shadow-sm";
  const tableClass = premium ? "data-table-premium text-sm" : "data-table w-full text-sm";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {premium ? <Table2 className="h-4 w-4 text-maroon" /> : <LayoutGrid className="h-4 w-4 text-gold-dark" />}
          <SubTitle>{title}</SubTitle>
          {premium ? (
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[10px] font-semibold tabular-nums text-stone-600">
              {formatNumber(data.length)} rows · {formatNumber(fields.length)} fields
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className={cn(premium && mode === "flat" && "pivot-mode-pill-active", premium && mode !== "flat" && "pivot-mode-pill")}
            variant={premium ? "ghost" : undefined}
            onClick={() => setMode("flat")}
          >
            Flat Table
          </Button>
          <Button
            className={cn(
              premium && mode === "pivot" && "pivot-mode-pill-active",
              premium && mode !== "pivot" && "pivot-mode-pill",
              !premium && mode === "pivot" && "border-maroon/30 text-maroon",
            )}
            variant={premium ? "ghost" : undefined}
            onClick={() => setMode("pivot")}
          >
            Pivot View
          </Button>
          <Button variant={premium ? "accent" : undefined} onClick={() => setRefreshToken((token) => token + 1)}>
            <RefreshCw className={cn("mr-1 inline h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {mode === "pivot" ? (
        <>
          <div
            className={cn(
              premium
                ? "pivot-field-bar grid gap-4 lg:grid-cols-4"
                : "grid gap-3 rounded-2xl border border-stone-200 bg-stone-100 p-4 lg:grid-cols-4",
            )}
          >
            <PivotZone label="Rows" options={fields} premium={premium} selected={rows} onChange={setRows} />
            <PivotZone label="Columns" options={fields} premium={premium} selected={columns} onChange={setColumns} />
            <PivotZone
              label="Values"
              options={fields.filter((f) => f.type === "number")}
              premium={premium}
              selected={values}
              onChange={setValues}
              single
            />
            <div>
              <p className="label-chip mb-2">Aggregation</p>
              <Select value={agg} onChange={(e) => setAgg(e.target.value as PivotAgg)}>
                <option value="sum">Sum</option>
                <option value="count">Count</option>
                <option value="avg">Average</option>
                <option value="min">Minimum</option>
                <option value="max">Maximum</option>
              </Select>
              {result ? (
                <p className="mt-2 text-[10px] text-stone-500">Engine: {result.engine}</p>
              ) : null}
            </div>
          </div>

          {result && result.rowKeys.length > 0 ? (
            <div className={tableWrapClass}>
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>{rows.map(fieldLabel).join(" · ") || "Row"}</th>
                    {result.colKeys.map((ck) => (
                      <th key={ck} className={premium ? "text-right" : undefined}>
                        {ck.split("§").join(" · ")}
                      </th>
                    ))}
                    <th className={premium ? "text-right" : undefined}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rowKeys.map((rk, ri) => (
                    <tr key={rk}>
                      <td className={cn("font-medium", premium && "cell-metric")}>{rk.split("§").join(" · ")}</td>
                      {result.matrix[ri]?.map((cell, ci) => (
                        <td key={ci} className={cn(premium && "cell-value text-right")}>
                          {formatCell(Number(cell), values[0])}
                        </td>
                      ))}
                      <td className={cn(premium ? "cell-value-highlight text-right" : "font-semibold text-gold-dark")}>
                        {formatCell(Number(result.rowTotals[ri] ?? 0), values[0])}
                      </td>
                    </tr>
                  ))}
                  <tr className={cn(premium && "row-total", !premium && "bg-white/5")}>
                    <td className="font-bold">Total</td>
                    {result.colTotals.map((t, i) => (
                      <td key={i} className={cn(premium ? "cell-value text-right font-semibold" : "font-semibold")}>
                        {formatCell(Number(t), values[0])}
                      </td>
                    ))}
                    <td className={cn(premium ? "cell-value-highlight text-right" : "font-bold text-maroon")}>
                      {formatCell(Number(result.grandTotal), values[0])}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-stone-500">Add row and column fields to build a pivot.</p>
          )}
        </>
      ) : (
        <DynamicTable
          columns={flatColumns}
          getRowKey={(row, index) => String(row.isin ?? row.name ?? row.rowId ?? index)}
          rows={data}
          scrollClassName={tableWrapClass}
          tableClassName={tableClass}
          virtualizeAt={40}
        />
      )}
    </div>
  );
}

function looksNumeric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const text = value.replace(/,/g, "").trim();
  return text !== "" && Number.isFinite(Number(text));
}

function PivotZone({
  label,
  options,
  selected,
  onChange,
  single,
  premium,
}: {
  label: string;
  options: PivotFieldDef[];
  selected: string[];
  onChange: (v: string[]) => void;
  single?: boolean;
  premium?: boolean;
}) {
  return (
    <div
      className={cn(
        premium
          ? "rounded-xl border border-dashed border-gold/35 bg-white/80 p-3 shadow-sm"
          : "rounded-xl border border-dashed border-gold/30 bg-gold/5 p-3",
      )}
    >
      <p className="label-chip mb-2">{label}</p>
      <Select
        value={single ? (selected[0] ?? "") : ""}
        onChange={(e) => {
          const key = e.target.value;
          if (!key) return;
          if (single) {
            onChange([key]);
            return;
          }
          if (!selected.includes(key)) onChange([...selected, key]);
        }}
      >
        <option value="">+ Add field</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </Select>
      <div className="mt-2 flex flex-wrap gap-1">
        {selected.map((key) => (
          <button
            key={key}
            className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[10px] font-medium text-maroon hover:border-rose-500/40"
            type="button"
            onClick={() => onChange(selected.filter((k) => k !== key))}
          >
            {options.find((o) => o.key === key)?.label ?? key} ×
          </button>
        ))}
      </div>
    </div>
  );
}
