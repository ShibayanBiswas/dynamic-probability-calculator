/**
 * Confirm desk Primary/Rollover match reference (junk removed),
 * NEW PRIMARY phase coverage, and computed formulas.
 */
import ExcelJS from "exceljs";
import { isValid } from "date-fns";
import { readFileSync } from "fs";

import { filterMasterExportGridRows } from "../lib/master-book-filter";
import { rolloverPhaseBucket } from "../lib/master/new-primary-merge";
import {
  formatMasterIssueMonth,
  formatMasterSheetDate,
  parseExcelishDate,
} from "../lib/workbook/dates";
import { parseWorkbookBuffer } from "../lib/workbook/parser";

const REF = "/home/shibayanbiswas/Downloads/New Product Master_ (1).xlsx";
const DESK = "./New Product Master_.xlsx";

function blank(v: unknown) {
  if (v == null || v === "") return true;
  const s = String(v).trim();
  return !s || s === "-" || /^n\/?a$/i.test(s);
}

function hasDate(v: unknown) {
  return !blank(v) && Boolean(parseExcelishDate(v as string | number | Date));
}

function cellAt(row: unknown[], headers: string[], name: string) {
  const i = headers.findIndex((h) => String(h).trim().toLowerCase() === name.toLowerCase());
  return i >= 0 ? row[i] : null;
}

function sanitize(v: ExcelJS.CellValue, numFmt?: string): unknown {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (!isValid(v)) return null;
    const fmt = String(numFmt ?? "").toLowerCase();
    if (/(^|[^d])mmm(-|\/)?yy/.test(fmt) && !/d-mmm|dd-mmm/.test(fmt)) {
      return formatMasterIssueMonth(v) ?? null;
    }
    return formatMasterSheetDate(v) ?? null;
  }
  if (typeof v === "object" && v && "result" in v) {
    return sanitize((v as ExcelJS.CellFormulaValue).result ?? null, numFmt);
  }
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  return String(v);
}

function cellFormula(excelCell: ExcelJS.Cell): string {
  if (excelCell.formula) return String(excelCell.formula);
  const v = excelCell.value;
  if (v && typeof v === "object" && "formula" in v) {
    return String((v as ExcelJS.CellFormulaValue).formula ?? "");
  }
  return "";
}

async function loadRef(sheetName: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(REF);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Missing ${sheetName} in reference`);

  let headerRow = 2;
  const headers: string[] = [];
  for (let r = 1; r <= 5; r++) {
    const vals: string[] = [];
    ws.getRow(r).eachCell((c, col) => {
      vals[col] = String(c.value ?? "");
    });
    if (vals.some((v) => /isin/i.test(v)) && vals.some((v) => /month|name/i.test(v))) {
      headerRow = r;
      for (let i = 0; i < vals.length; i++) headers[i] = String(vals[i] ?? "").trim();
      break;
    }
  }

  // Preserve duplicate named headers (second Trade Date / Month).
  // `headers` is 1-based (ExcelJS eachCell col index); skip empty slots.
  const named: string[] = [];
  const cols: number[] = [];
  for (let i = 1; i < headers.length; i += 1) {
    const name = String(headers[i] ?? "").trim();
    if (!name) continue;
    named.push(name);
    cols.push(i);
  }
  const rows: unknown[][] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    let has = false;
    const values: unknown[] = [];
    for (const c of cols) {
      const excelCell = row.getCell(c);
      const out = sanitize(excelCell.value, excelCell.numFmt);
      if (out != null && out !== "") has = true;
      values.push(out);
    }
    if (has) rows.push(values);
  }

  const filtered = filterMasterExportGridRows(named, rows);
  return {
    headers: named,
    rawCount: rows.length,
    rows: filtered.rows,
    junk: filtered.removedCount,
  };
}

function loadDesk(sheetName: string) {
  const buf = readFileSync(DESK);
  const ds = parseWorkbookBuffer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    DESK,
  );
  const s = ds.sheets.find((x) => x.name === sheetName);
  if (!s) throw new Error(`Missing desk sheet ${sheetName}`);
  const rows = s.rows.map((r) => r.values.map((c) => c.formatted ?? c.value ?? null));
  const filtered = filterMasterExportGridRows(s.headers, rows);
  return { headers: s.headers, rows: filtered.rows, junkLeft: filtered.removedCount };
}

function isinPhaseKeys(headers: string[], rows: unknown[][]) {
  const isinI = headers.findIndex((h) => /isin/i.test(h));
  const set = new Set<string>();
  for (const r of rows) {
    const isin = String(r[isinI] ?? "").trim().toUpperCase();
    if (isin) set.add(`${isin}|${rolloverPhaseBucket(r, headers)}`);
  }
  return set;
}

function countPhases(headers: string[], rows: unknown[][]) {
  const by = { blank: 0, phase1: 0, phase2: 0, tenyears: 0 };
  for (const r of rows) {
    const b = rolloverPhaseBucket(r, headers);
    if (b in by) by[b as keyof typeof by]++;
  }
  return by;
}

async function main() {
  const fails: string[] = [];

  console.log("=== Primary / Rollover vs reference (junk removed) ===");
  for (const name of ["Primary", "Rollover"] as const) {
    const ref = await loadRef(name);
    const desk = loadDesk(name);
    const rk = isinPhaseKeys(ref.headers, ref.rows);
    const dk = isinPhaseKeys(desk.headers, desk.rows);
    const onlyR = [...rk].filter((k) => !dk.has(k));
    const onlyD = [...dk].filter((k) => !rk.has(k));

    console.log(
      `${name}: REF raw=${ref.rawCount} junkRemoved=${ref.junk} kept=${ref.rows.length} cols=${ref.headers.length} | DESK=${desk.rows.length} cols=${desk.headers.length} junkLeft=${desk.junkLeft}`,
    );
    console.log(
      `  keys REF=${rk.size} DESK=${dk.size} onlyREF=${onlyR.length} onlyDESK=${onlyD.length}`,
    );
    console.log(`  REF phases`, countPhases(ref.headers, ref.rows));
    console.log(`  DESK phases`, countPhases(desk.headers, desk.rows));

    if (name === "Primary" && desk.headers.length !== 38) {
      fails.push(`Primary: expected 38 columns, got ${desk.headers.length}`);
    }
    if (name === "Rollover" && desk.headers.length !== 37) {
      fails.push(`Rollover: expected 37 columns (Primary layout minus C/P), got ${desk.headers.length}`);
    }
    if (!desk.headers.includes("Coupon / PR / DM")) {
      fails.push(`${name}: missing Coupon / PR / DM column`);
    }
    const tradeDateCols = desk.headers.filter((h) => h === "Trade Date/Opening date").length;
    if (tradeDateCols !== 1) {
      fails.push(`${name}: expected exactly 1 Trade Date column, found ${tradeDateCols}`);
    }

    if (onlyR.length || onlyD.length) {
      fails.push(`${name}: ISIN|phase key mismatch`);
      if (onlyR.length) console.log("  onlyREF", onlyR.slice(0, 5));
      if (onlyD.length) console.log("  onlyDESK", onlyD.slice(0, 5));
    }
    if (desk.rows.length !== ref.rows.length) {
      fails.push(`${name}: row count REF ${ref.rows.length} vs DESK ${desk.rows.length}`);
    }
    if (desk.junkLeft > 0) fails.push(`${name}: still has ${desk.junkLeft} junk rows`);
  }

  console.log("\n=== NEW PRIMARY ===");
  const np = loadDesk("NEW PRIMARY");
  const primary = loadDesk("Primary");
  const rollover = loadDesk("Rollover");
  const by = countPhases(np.headers, np.rows);
  const pBy = countPhases(primary.headers, primary.rows);
  const rBy = countPhases(rollover.headers, rollover.rows);

  let ten = 0;
  let tenFilled = 0;
  let nonTenCp = 0;
  let missP1 = 0;
  let missP2 = 0;
  let missTen = 0;

  for (const r of np.rows) {
    const b = rolloverPhaseBucket(r, np.headers);
    const allot = hasDate(cellAt(r, np.headers, "Allotment Date"));
    const trade = hasDate(cellAt(r, np.headers, "Trade Date/Opening date"));
    const mat = hasDate(cellAt(r, np.headers, "Maturity"));
    const poed = hasDate(cellAt(r, np.headers, "POED"));
    const cp = hasDate(cellAt(r, np.headers, "Rollover C/P Date"));

    if (b === "phase1" && (!allot || !poed)) missP1++;
    if (b === "phase2" && (!trade || !mat)) missP2++;
    if (b === "tenyears") {
      ten++;
      if (cp) tenFilled++;
      if (!allot || !cp) missTen++;
    } else if (cp) {
      nonTenCp++;
    }
  }

  console.log("rows", np.rows.length, "phases", by);
  console.log("Primary phases", pBy);
  console.log("Rollover phases", rBy);
  console.log(
    "C/P column?",
    np.headers.includes("Rollover C/P Date"),
    `10Y ${tenFilled}/${ten}`,
    `non-10Y filled ${nonTenCp}`,
    `miss p1/p2/ten ${missP1}/${missP2}/${missTen}`,
  );

  if (!np.headers.includes("Rollover C/P Date")) fails.push("NEW PRIMARY missing Rollover C/P Date");
  if (np.headers.length !== 38) fails.push(`NEW PRIMARY: expected 38 columns, got ${np.headers.length}`);
  if (!np.headers.includes("Coupon / PR / DM")) fails.push("NEW PRIMARY missing Coupon / PR / DM");
  if (np.headers.filter((h) => h === "Trade Date/Opening date").length !== 1) {
    fails.push("NEW PRIMARY must have exactly 1 Trade Date column");
  }
  if (by.blank !== pBy.blank) fails.push(`blank NP ${by.blank} != Primary ${pBy.blank}`);
  if (by.tenyears !== pBy.tenyears) fails.push(`10Y NP ${by.tenyears} != Primary ${pBy.tenyears}`);
  if (by.phase1 !== rBy.phase1) fails.push(`Phase1 NP ${by.phase1} != Rollover ${rBy.phase1}`);
  if (tenFilled !== ten) fails.push(`10Y C/P incomplete ${tenFilled}/${ten}`);
  if (nonTenCp > 0) fails.push(`non-10Y C/P filled ${nonTenCp}`);
  if (missP1 > 0) fails.push(`Phase1 missing Allotment/POED ${missP1}`);
  if (missP2 > 0) fails.push(`Phase2 missing Trade/Maturity ${missP2}`);
  if (missTen > 0) fails.push(`10Y missing Allotment/C/P ${missTen}`);

  console.log("\n=== Formulas (where needed) ===");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(DESK);

  for (const name of ["Primary", "Rollover", "NEW PRIMARY"] as const) {
    const ws = wb.getWorksheet(name);
    if (!ws) {
      fails.push(`Missing sheet ${name}`);
      continue;
    }
    const headers: string[] = [];
    ws.getRow(1).eachCell((c, col) => {
      headers[col] = String(c.value ?? "");
    });
    const isinCol = headers.findIndex((h) => /isin/i.test(h || ""));
    const dataRows =
      name === "Primary" ? primary.rows.length : name === "Rollover" ? rollover.rows.length : np.rows.length;

    const targets: { label: string; match: RegExp; requireAll: boolean; pctMatch?: RegExp }[] = [
      { label: "Last Observation Date", match: /^last observation/i, requireAll: true },
      { label: "Observation Months", match: /^observation months$/i, requireAll: true },
      {
        label: "Arranger Fees Amount",
        match: /arranger fees.*(amount|rs)/i,
        requireAll: false,
        pctMatch: /arranger fees.*(percentage|%)/i,
      },
      {
        label: "Upfront Fees Amount",
        match: /upfront fees.*(amount|rs)/i,
        requireAll: false,
        pctMatch: /upfront fees.*(percentage|%)/i,
      },
    ];

    console.log(`\n${name}:`);
    for (const t of targets) {
      let col = -1;
      for (let c = 1; c < headers.length; c++) {
        if (t.match.test(headers[c] ?? "")) {
          col = c;
          break;
        }
      }
      if (col < 0) {
        fails.push(`${name}: missing ${t.label}`);
        console.log(`  ${t.label}: MISSING`);
        continue;
      }

      let pctCol = -1;
      if (t.pctMatch) {
        for (let c = 1; c < headers.length; c++) {
          if (t.pctMatch.test(headers[c] ?? "")) {
            pctCol = c;
            break;
          }
        }
      }

      let withF = 0;
      let withPct = 0;
      let productRows = 0;
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const isin = isinCol > 0 ? String(row.getCell(isinCol).value ?? "").trim() : "x";
        // Skip empty rows and the sheet footer legend ("Reference: All monetary…").
        if (!isin || /^reference:/i.test(isin)) continue;
        productRows++;
        if (cellFormula(row.getCell(col))) withF++;
        if (pctCol > 0) {
          const pct = row.getCell(pctCol).value;
          if (pct != null && pct !== "" && pct !== "-" && !/^reference:/i.test(String(pct))) {
            withPct++;
          }
        }
      }

      console.log(
        `  ${t.label}: formulas=${withF}/${productRows}${pctCol > 0 ? ` (pct filled ${withPct})` : ""}`,
      );

      if (t.requireAll && productRows > 0 && withF < productRows) {
        fails.push(`${name}: ${t.label} formulas ${withF}/${productRows}`);
      }
      if (!t.requireAll && pctCol > 0 && withPct > 0 && withF < withPct) {
        fails.push(`${name}: ${t.label} formulas ${withF} < pct rows ${withPct}`);
      }
      // Soft check vs parser row count (Excel may omit a few display-only blanks).
      if (t.requireAll && Math.abs(productRows - dataRows) > 10) {
        fails.push(`${name}: product row count Excel ${productRows} vs parser ${dataRows}`);
      }
    }
  }

  console.log("\n=== VERDICT ===");
  if (fails.length) {
    console.log("FAIL");
    for (const f of fails) console.log(" -", f);
    process.exitCode = 1;
    return;
  }
  console.log(
    "PASS: Primary/Rollover match reference (junk removed); NEW PRIMARY phases + C/P OK; formulas present where needed",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
