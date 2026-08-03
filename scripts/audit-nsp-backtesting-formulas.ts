/**
 * Dump unhidden NSP sheets + Backtesting/Initial Prob formulas for Current Prob parity.
 * Usage: npx tsx scripts/audit-nsp-backtesting-formulas.ts
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

const ROOT = process.cwd();
const NSP = join(ROOT, "NSP's under Risk.xlsm");

function cellAddr(r: number, c: number) {
  return XLSX.utils.encode_cell({ r, c });
}

function dumpSheetFormulas(ws: XLSX.WorkSheet, maxRows = 80, maxCols = 40) {
  const ref = ws["!ref"];
  if (!ref) return { ref: null, cells: [] as Array<Record<string, unknown>> };
  const range = XLSX.utils.decode_range(ref);
  const cells: Array<Record<string, unknown>> = [];
  const rMax = Math.min(range.e.r, maxRows - 1);
  const cMax = Math.min(range.e.c, maxCols - 1);
  for (let r = range.s.r; r <= rMax; r++) {
    for (let c = range.s.c; c <= cMax; c++) {
      const addr = cellAddr(r, c);
      const cell = ws[addr] as XLSX.CellObject | undefined;
      if (!cell) continue;
      const hasF = Boolean(cell.f);
      const v = cell.v;
      if (!hasF && (v == null || v === "")) continue;
      cells.push({
        addr,
        r: r + 1,
        c: c + 1,
        f: cell.f ?? null,
        v: v instanceof Date ? v.toISOString().slice(0, 10) : v,
        t: cell.t,
      });
    }
  }
  return { ref, cells };
}

function gridPreview(ws: XLSX.WorkSheet, rows = 35, cols = 20) {
  const data = XLSX.utils.sheet_to_json<Array<unknown>>(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as Array<Array<unknown>>;
  return data.slice(0, rows).map((row, ri) =>
    row.slice(0, cols).map((v, ci) => {
      if (v instanceof Date) return `D:${v.toISOString().slice(0, 10)}`;
      if (typeof v === "number") return v;
      if (v == null) return null;
      return String(v).slice(0, 80);
    }),
  );
}

function main() {
  if (!existsSync(NSP)) throw new Error(`Missing ${NSP}`);

  const wb = XLSX.readFile(NSP, {
    bookVBA: false,
    cellDates: true,
    cellFormula: true,
    sheetStubs: true,
  });

  const metaByName = new Map(
    (wb.Workbook?.Sheets ?? []).map((s) => [s.name, s.Hidden ?? 0]),
  );

  const sheets = wb.SheetNames.map((name) => {
    const hidden = metaByName.get(name) ?? 0;
    const ws = wb.Sheets[name]!;
    return {
      name,
      hidden, // 0 visible, 1 hidden, 2 very hidden
      visible: hidden === 0,
      ref: ws["!ref"] ?? null,
    };
  });

  const unhidden = sheets.filter((s) => s.visible).map((s) => s.name);
  const focus = ["Probability", "Initial Prob", "Backtesting", "Data", "nifty", "Working"].filter(
    (n) => wb.Sheets[n],
  );

  const out: Record<string, unknown> = {
    file: NSP,
    allSheets: sheets,
    unhiddenNames: unhidden,
    focus,
  };

  for (const name of focus) {
    const ws = wb.Sheets[name]!;
    // Broader dump for path/formula sheets
    const maxRows = name === "Backtesting" || name === "Initial Prob" ? 120 : 60;
    const maxCols = name === "Backtesting" || name === "Initial Prob" ? 30 : 25;
    out[name] = {
      preview: gridPreview(ws, name === "Backtesting" ? 45 : 35, 18),
      formulas: dumpSheetFormulas(ws, maxRows, maxCols),
    };
  }

  // Extract Backtesting schedule block (Average / Dates / Days) by scanning labels
  const bt = wb.Sheets.Backtesting;
  if (bt) {
    const data = XLSX.utils.sheet_to_json<Array<unknown>>(bt, {
      header: 1,
      defval: null,
      raw: true,
    }) as Array<Array<unknown>>;
    const scheduleRows: Array<{ row: number; label: string; values: unknown[] }> = [];
    for (let i = 0; i < data.length; i++) {
      const label = String(data[i]?.[0] ?? "").trim().toLowerCase();
      if (label === "average" || label === "dates" || label === "days" || label.startsWith("days")) {
        scheduleRows.push({
          row: i + 1,
          label: String(data[i]?.[0]),
          values: (data[i] ?? []).slice(1, 15),
        });
      }
    }
    out.backtestingScheduleBlocks = scheduleRows;

    // Collect unique formula patterns (normalized) from Backtesting
    const patterns = new Map<string, { count: number; sample: string; addrs: string[] }>();
    const range = bt["!ref"] ? XLSX.utils.decode_range(bt["!ref"]) : null;
    if (range) {
      for (let r = range.s.r; r <= Math.min(range.e.r, 200); r++) {
        for (let c = range.s.c; c <= Math.min(range.e.c, 40); c++) {
          const addr = cellAddr(r, c);
          const cell = bt[addr] as XLSX.CellObject | undefined;
          if (!cell?.f) continue;
          const norm = cell.f
            .replace(/\$?[A-Z]+\$?\d+/gi, "#")
            .replace(/\d+/g, "#");
          const entry = patterns.get(norm) ?? { count: 0, sample: cell.f, addrs: [] };
          entry.count += 1;
          if (entry.addrs.length < 5) entry.addrs.push(addr);
          patterns.set(norm, entry);
        }
      }
    }
    out.backtestingFormulaPatterns = [...patterns.entries()]
      .map(([norm, v]) => ({ norm, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 80);
  }

  // Same for Initial Prob
  const ip = wb.Sheets["Initial Prob"];
  if (ip) {
    const patterns = new Map<string, { count: number; sample: string; addrs: string[] }>();
    const range = ip["!ref"] ? XLSX.utils.decode_range(ip["!ref"]) : null;
    if (range) {
      for (let r = range.s.r; r <= Math.min(range.e.r, 200); r++) {
        for (let c = range.s.c; c <= Math.min(range.e.c, 40); c++) {
          const addr = cellAddr(r, c);
          const cell = ip[addr] as XLSX.CellObject | undefined;
          if (!cell?.f) continue;
          const norm = cell.f
            .replace(/\$?[A-Z]+\$?\d+/gi, "#")
            .replace(/\d+/g, "#");
          const entry = patterns.get(norm) ?? { count: 0, sample: cell.f, addrs: [] };
          entry.count += 1;
          if (entry.addrs.length < 5) entry.addrs.push(addr);
          patterns.set(norm, entry);
        }
      }
    }
    out.initialFormulaPatterns = [...patterns.entries()]
      .map(([norm, v]) => ({ norm, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 80);
  }

  const outPath = join(ROOT, "scripts", "nsp-backtesting-audit.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log("Unhidden:", unhidden.join(" | "));
  console.log("Focus sheets present:", focus.join(", "));
  if (Array.isArray(out.backtestingScheduleBlocks)) {
    console.log("Backtesting schedule blocks:", (out.backtestingScheduleBlocks as unknown[]).length);
  }
  if (Array.isArray(out.backtestingFormulaPatterns)) {
    console.log(
      "Top Backtesting patterns:",
      (out.backtestingFormulaPatterns as Array<{ sample: string; count: number }>)
        .slice(0, 15)
        .map((p) => `${p.count}× ${p.sample}`)
        .join("\n  "),
    );
  }
}

main();
