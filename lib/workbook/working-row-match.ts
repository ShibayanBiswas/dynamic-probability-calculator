import type { ProductRecord } from "@/lib/types";

export type WorkingRowMatch = {
  row: number;
  name: string;
  isin: string;
  underlying: string;
  allotmentSerial: number;
  maturitySerial: number;
  observationSerial: number;
  entryLevel: number;
  currentLevel: number;
  clientInvestment: number;
  productValue: number;
  irr: number;
  absReturn: number;
  zPerf: number;
  formulaText?: string;
  formulaReturn?: number;
};

function normalizeName(value: string | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*rollover.*$/i, "")
    .trim();
}

/** Pick the Working row that matches an ongoing master product (duplicate ISIN / rollover phases). */
export function matchWorkingRowForProduct(
  product: ProductRecord,
  candidates: WorkingRowMatch[],
  valuationDateSerial: number,
): WorkingRowMatch | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  const masterBase = normalizeName(product.name);
  let best: WorkingRowMatch | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const row of candidates) {
    let score = 0;
    const rowBase = normalizeName(row.name);

    if (rowBase === masterBase) score += 40;
    else if (row.name.toLowerCase().includes(masterBase) || masterBase.includes(rowBase)) score += 25;

    if (row.maturitySerial >= valuationDateSerial) score += 20;
    else score -= 15;

    if (row.observationSerial >= valuationDateSerial) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best;
}

export function indexWorkingRowsByIsin(rows: WorkingRowMatch[]) {
  const map = new Map<string, WorkingRowMatch[]>();
  for (const row of rows) {
    const key = row.isin.toUpperCase();
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}
