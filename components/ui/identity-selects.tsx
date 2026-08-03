"use client";

import { useMemo } from "react";

import { SearchableSelect } from "@/components/ui/searchable-select";
import type { ProductRecord } from "@/lib/types";

function uniqueSorted(values: Array<string | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
}

export function IsinSelect({
  products,
  value,
  onChange,
}: {
  products: ProductRecord[];
  value: string;
  onChange: (isin: string, product?: ProductRecord) => void;
}) {
  const byIsin = useMemo(() => new Map(products.filter((p) => p.isin).map((p) => [p.isin!, p])), [products]);
  const options = useMemo(
    () => uniqueSorted(products.map((p) => p.isin)).map((isin) => ({ value: isin, label: isin })),
    [products],
  );

  return (
    <SearchableSelect
      options={options}
      placeholder="Search ISIN…"
      value={value || ""}
      onChange={(isin) => onChange(isin, byIsin.get(isin))}
    />
  );
}

export function ProductCodeSelect({
  products,
  value,
  onChange,
}: {
  products: ProductRecord[];
  value: string;
  onChange: (code: string, product?: ProductRecord) => void;
}) {
  const byCode = useMemo(() => {
    const map = new Map<string, ProductRecord>();
    for (const p of products) {
      const code = p.series ?? String(p.raw["Product Code"] ?? "");
      if (code) map.set(code, p);
    }
    return map;
  }, [products]);

  const options = useMemo(
    () =>
      uniqueSorted(products.map((p) => p.series ?? String(p.raw["Product Code"] ?? ""))).map((code) => ({
        value: code,
        label: code,
      })),
    [products],
  );

  return (
    <SearchableSelect
      options={options}
      placeholder="Search product code…"
      value={value || ""}
      onChange={(code) => onChange(code, byCode.get(code))}
    />
  );
}
