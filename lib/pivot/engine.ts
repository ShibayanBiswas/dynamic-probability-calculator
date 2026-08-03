export type PivotAgg = "sum" | "count" | "avg" | "min" | "max";

export type PivotRequest = {
  data: Record<string, unknown>[];
  rows: string[];
  columns: string[];
  values: string[];
  agg?: PivotAgg;
};

export type PivotCell = string | number;

export type PivotResponse = {
  rowKeys: string[];
  colKeys: string[];
  matrix: PivotCell[][];
  rowTotals: PivotCell[];
  colTotals: PivotCell[];
  grandTotal: PivotCell;
  engine: "node" | "python";
};

function aggValues(nums: number[], agg: PivotAgg): number {
  if (nums.length === 0) return 0;
  switch (agg) {
    case "count":
      return nums.length;
    case "avg":
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min":
      return Math.min(...nums);
    case "max":
      return Math.max(...nums);
    default:
      return nums.reduce((a, b) => a + b, 0);
  }
}

function compositeKey(record: Record<string, unknown>, fields: string[]) {
  return fields.map((f) => String(record[f] ?? "—")).join("§");
}

export function runPivotEngine(request: PivotRequest): PivotResponse {
  const { data, rows, columns, values, agg = "sum" } = request;
  const valueField = values[0] ?? "value";

  const rowKeySet = new Map<string, string[]>();
  const colKeySet = new Map<string, string[]>();
  const bucket = new Map<string, number[]>();

  for (const row of data) {
    const rk = compositeKey(row, rows);
    const ck = compositeKey(row, columns);
    if (!rowKeySet.has(rk)) rowKeySet.set(rk, rows.map((f) => String(row[f] ?? "—")));
    if (!colKeySet.has(ck)) colKeySet.set(ck, columns.map((f) => String(row[f] ?? "—")));
    const key = `${rk}|||${ck}`;
    const raw = row[valueField];
    const num = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
    const list = bucket.get(key) ?? [];
    list.push(Number.isFinite(num) ? num : 1);
    bucket.set(key, list);
  }

  const rowKeys = [...rowKeySet.keys()].sort();
  const colKeys = [...colKeySet.keys()].sort();
  const matrix: PivotCell[][] = [];
  const rowTotals: PivotCell[] = [];
  const colTotals: PivotCell[] = colKeys.map(() => 0);
  let grandTotal = 0;

  for (const rk of rowKeys) {
    const rowCells: PivotCell[] = [];
    let rowSum = 0;
    colKeys.forEach((ck, ci) => {
      const nums = bucket.get(`${rk}|||${ck}`) ?? [];
      const cell = aggValues(nums, agg);
      rowCells.push(cell);
      rowSum += cell;
      colTotals[ci] = Number(colTotals[ci]) + cell;
    });
    matrix.push(rowCells);
    rowTotals.push(rowSum);
    grandTotal += rowSum;
  }

  return {
    rowKeys,
    colKeys,
    matrix,
    rowTotals,
    colTotals,
    grandTotal,
    engine: "node",
  };
}

export async function runPivotViaPython(request: PivotRequest): Promise<PivotResponse | null> {
  const base = process.env.PYTHON_API_URL ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${base}/pivot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PivotResponse;
    return { ...body, engine: "python" };
  } catch {
    return null;
  }
}
