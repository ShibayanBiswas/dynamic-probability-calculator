/**
 * Full parity audit: app valuation vs Excel Working sheet (31-May-26 workbook).
 * Usage: npx tsx scripts/verify-valuation-working-parity.ts
 * Writes: docs/valuation-audit-31-may-26.md
 */
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

import {
  filterProductsByLifecycle,
  filterValidMasterProducts,
  isValuationApplicableAt,
} from "../lib/product-lifecycle";
import { resolveValuationLevel } from "../lib/product-utils";
import type { ProductRecord } from "../lib/types";
import { formatPercent } from "../lib/utils";
import { parseExcelishDate } from "../lib/workbook/dates";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";
import {
  indexWorkingRowsByIsin,
  matchWorkingRowForProduct,
  type WorkingRowMatch,
} from "../lib/workbook/working-row-match";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALUATION_XLSM = join(
  ROOT,
  "Dashboards - 31st May 26",
  "Primary Structured Products Valuation - 31st May 26.xlsm",
);
const REPORT_PATH = join(ROOT, "docs", "valuation-audit-31-may-26.md");

const VALUATION_DATE = "31-May-26";
const AS_OF = parseExcelishDate(VALUATION_DATE) ?? new Date(2026, 4, 31);

type WorkingRow = WorkingRowMatch;

function loadProducts(): ProductRecord[] {
  return loadCanonicalProducts(AS_OF);
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && v.trim().toUpperCase() !== "NA") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function readWorkingSheet(): { rows: WorkingRow[]; niftyLevel: number; sensexLevel: number; valDateSerial: number } {
  if (!existsSync(VALUATION_XLSM)) {
    throw new Error(`Reference workbook not found: ${VALUATION_XLSM}`);
  }

  const wb = XLSX.readFile(VALUATION_XLSM, { cellDates: false, cellFormula: true });
  const ws = wb.Sheets.Working;
  if (!ws) throw new Error("Working sheet missing from reference workbook");

  const ref = ws["!ref"];
  if (!ref) throw new Error("Working sheet is empty");

  const range = XLSX.utils.decode_range(ref);
  const niftyLevel = num(ws.D1?.v) ?? 23547.75;
  const sensexLevel = num(ws.C1?.v) ?? 74775.74;
  const valDateSerial = num(ws.B1?.v) ?? 46173;

  const rows: WorkingRow[] = [];

  for (let r = 2; r <= range.e.r; r += 1) {
    const name = str(ws[XLSX.utils.encode_cell({ r, c: 1 })]?.v);
    const isin = str(ws[XLSX.utils.encode_cell({ r, c: 4 })]?.v);
    if (!name || !isin || isin === "ISIN No.") continue;

    const productValue = num(ws[XLSX.utils.encode_cell({ r, c: 23 })]?.v);
    const irr = num(ws[XLSX.utils.encode_cell({ r, c: 24 })]?.v);
    const absReturn = num(ws[XLSX.utils.encode_cell({ r, c: 25 })]?.v);
    if (productValue == null && irr == null && absReturn == null) continue;

    const formulaCell = ws[XLSX.utils.encode_cell({ r, c: 15 })];
    const formulaRaw = formulaCell?.f ?? formulaCell?.v;
    const formulaText =
      typeof formulaRaw === "string" ? formulaRaw.replace(/^=/, "").trim() : undefined;

    rows.push({
      row: r + 1,
      name,
      isin,
      underlying: str(ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v),
      allotmentSerial: num(ws[XLSX.utils.encode_cell({ r, c: 5 })]?.v) ?? 0,
      maturitySerial: num(ws[XLSX.utils.encode_cell({ r, c: 7 })]?.v) ?? 0,
      observationSerial: num(ws[XLSX.utils.encode_cell({ r, c: 8 })]?.v) ?? 0,
      entryLevel: num(ws[XLSX.utils.encode_cell({ r, c: 10 })]?.v) ?? 0,
      currentLevel: num(ws[XLSX.utils.encode_cell({ r, c: 12 })]?.v) ?? 0,
      clientInvestment: num(ws[XLSX.utils.encode_cell({ r, c: 20 })]?.v) ?? 100_000,
      productValue: productValue ?? 0,
      irr: irr ?? 0,
      absReturn: absReturn ?? 0,
      zPerf: num(ws[XLSX.utils.encode_cell({ r, c: 14 })]?.v) ?? 0,
      formulaText,
      formulaReturn: num(ws[XLSX.utils.encode_cell({ r, c: 18 })]?.v),
    });
  }

  return { rows, niftyLevel, sensexLevel, valDateSerial };
}

function indexByIsin(products: ProductRecord[]) {
  const map = new Map<string, ProductRecord>();
  for (const p of products) {
    const isin = str(p.isin ?? p.raw?.["ISIN No."]);
    if (isin) map.set(isin.toUpperCase(), p);
  }
  return map;
}

function resolveWorkingRow(
  product: ProductRecord,
  workingByIsin: Map<string, WorkingRow[]>,
  valDateSerial: number,
): WorkingRow | null {
  const isin = str(product.isin ?? product.raw?.["ISIN No."]).toUpperCase();
  const candidates = workingByIsin.get(isin) ?? [];
  return matchWorkingRowForProduct(product, candidates, valDateSerial);
}

function evaluateRow(
  product: ProductRecord,
  excel: WorkingRow | null,
  levels: { niftyLevel: number; sensexLevel: number },
  mode: "master" | "excel-row",
) {
  const currentLevel =
    mode === "excel-row" && excel
      ? excel.currentLevel
      : resolveValuationLevel(product, levels);

  const deskRow =
    mode === "excel-row" && excel
      ? {
          allotmentDate: excel.allotmentSerial,
          maturityDate: excel.maturitySerial,
          observationDate: excel.observationSerial,
          entryLevel: excel.entryLevel,
          clientInvestment: excel.clientInvestment,
          formulaText: excel.formulaText,
          formulaReturn: excel.formulaReturn,
        }
      : undefined;

  return computeValuation(product, {
    valuationDate: VALUATION_DATE,
    currentLevel,
    debentures: 100,
    deskRow,
  });
}

function tally(
  products: ProductRecord[],
  workingByIsin: Map<string, WorkingRow[]>,
  levels: { niftyLevel: number; sensexLevel: number },
  valDateSerial: number,
  mode: "master" | "excel-row",
) {
  let pass = 0;
  let fail = 0;
  let missingExcel = 0;
  const failures: Array<{ isin: string; name: string; notes: string[] }> = [];

  for (const product of products) {
    const isin = str(product.isin ?? product.raw?.["ISIN No."]).toUpperCase();
    const excel = resolveWorkingRow(product, workingByIsin, valDateSerial);
    if (!excel) {
      missingExcel += 1;
      continue;
    }

    const appResult = evaluateRow(product, excel, levels, mode);
    const pvOk = within(appResult.productValue, Math.round(excel.productValue), 1);
    const irrOk = within(appResult.productIrr, excel.irr, 0.0005);
    const absOk = within(appResult.absReturn, excel.absReturn, 0.0005);

    const notes: string[] = [];
    if (!pvOk) notes.push(`PV Δ ${appResult.productValue - Math.round(excel.productValue)}`);
    if (!irrOk) notes.push(`IRR Δ ${((appResult.productIrr - excel.irr) * 100).toFixed(3)} pp`);
    if (!absOk) notes.push(`Abs Δ ${((appResult.absReturn - excel.absReturn) * 100).toFixed(3)} pp`);

    if (pvOk && irrOk && absOk) pass += 1;
    else {
      fail += 1;
      if (failures.length < 30) failures.push({ isin, name: product.name, notes });
    }
  }

  return { pass, fail, missingExcel, failures, tested: products.length - missingExcel };
}

function rupees(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function pctDecimal(n: number) {
  return formatPercent(n);
}

function within(a: number, b: number, tol: number) {
  return Math.abs(a - b) <= tol;
}

function main() {
  console.log("Loading master products…");
  const allProducts = loadProducts();
  const master = filterValidMasterProducts(allProducts, AS_OF);
  const ongoing = filterProductsByLifecycle(master, "ongoing", AS_OF).filter(
    (p) => p.formulaText?.trim() && isValuationApplicableAt(p, VALUATION_DATE),
  );

  console.log("Reading Excel Working sheet…");
  const { rows: workingRows, niftyLevel, sensexLevel, valDateSerial } = readWorkingSheet();
  const workingByIsin = indexWorkingRowsByIsin(workingRows);
  const masterByIsin = indexByIsin(ongoing);
  const levels = { niftyLevel, sensexLevel };

  const masterTally = tally(ongoing, workingByIsin, levels, valDateSerial, "master");
  const excelRowTally = tally(ongoing, workingByIsin, levels, valDateSerial, "excel-row");

  const excelOnly = workingRows.filter((row) => !masterByIsin.has(row.isin.toUpperCase())).length;

  const lines: string[] = [
    "# Valuation parity audit — 31 May 2026",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Reference",
    "",
    `- Workbook: \`Dashboards - 31st May 26/Primary Structured Products Valuation - 31st May 26.xlsm\``,
    `- Sheet: **Working** (X = Product Value, Y = Product IRR, Z = Abs. Return)`,
    `- Valuation date: **${VALUATION_DATE}** (Excel serial ${valDateSerial})`,
    `- Nifty (D1): **${niftyLevel}** · Sensex (C1): **${sensexLevel}**`,
    `- Universe: **${ongoing.length}** ongoing desk products (NEW PRIMARY) with formula, applicable at valuation date`,
    "",
    "## Summary",
    "",
    "| Mode | Pass | Fail | Tested | Notes |",
    "| --- | ---: | ---: | ---: | --- |",
    `| **A — Current master file** | **${masterTally.pass}** | ${masterTally.fail} | ${masterTally.tested} | Uses NEW PRIMARY desk book dates & entry levels |`,
    `| **B — Excel Working row inputs** | **${excelRowTally.pass}** | ${excelRowTally.fail} | ${excelRowTally.tested} | F/H/I/K/M/U + P/S from matched Working row |`,
    "",
    `| Other | Count |`,
    `| Missing in Excel Working | ${masterTally.missingExcel} |`,
    `| Excel rows not in ongoing master | ${excelOnly} |`,
    "",
    `**Master-file overall: ${masterTally.fail === 0 && masterTally.missingExcel === 0 ? "PASS" : "PARTIAL"}**`,
    `**Formula replay (Excel row inputs): ${excelRowTally.fail === 0 ? "PASS" : excelRowTally.pass >= excelRowTally.tested * 0.99 ? "NEAR PASS" : "FAIL"}**`,
    "",
    "## Engine — Working column chain",
    "",
    "| Col | Field | Source |",
    "| --- | --- | --- |",
    "| B1 | Valuation date | Desk input |",
    "| C/D | Sensex / Nifty | Market levels |",
    "| F | Allotment date | Master / Working row |",
    "| G | Valuation date | =B$1 |",
    "| H | Maturity date | Master / Working row |",
    "| I | 2nd-last obs date | Master obs schedule |",
    "| K | Entry level | Master |",
    "| L | =−K | Cashflow for XIRR |",
    "| M | Current index | IF(Nifty,D1,C1) |",
    "| N | Exp. underlying @ obs | XIRR forward or AJ:AK VLOOKUP |",
    "| O | Underlying perf | N/K−1 or M/K if NA |",
    "| P | Payoff formula (Z) | Master / Working row |",
    "| S | ProductReturns | EVALUATE Working(2)!R (ProductReturns) |",
    "| T | IRR tenor | (1+S)^(365/(H−F))−1 |",
    "| U | Client investment | Debenture price |",
    "| V | Final valuation | IF(I−B1≥0,U(1+T)^((B1−F)/365), U(1+(1+S)/1.11^((H−B1)/365)−1)) |",
    "| X | Product value | max(V,U) |",
    "| Y | Product IRR | (X/U)^(365/(G−F))−1 |",
    "| Z | Abs. return | X/U−1 |",
    "| AJ:AK | Index history | Nifty closes for VLOOKUP |",
    "",
    "## Engine fixes in this build",
    "",
    "- **Working!I**: full-schedule 2nd-last obs when B1 is between fixings; 2nd-last on/before B1 when B1 is an observation date",
    "- **V column**: exact Excel IF branch with serial (I−B1), T=(1+S)^(365/(H−F))−1",
    "- **N column**: XIRR(L:M,F:G) forward branch with serial day fractions",
    "- **S column**: Mode B uses Working ProductReturns value; Mode A uses master P formula",
    "- **Duplicate ISIN**: match rollover phase by name + maturity ≥ B1",
    "- **U column**: client investment = debenture price (₹1L / ₹1.25L)",
    "",
    "## Mode A — failures (first 30)",
    "",
  ];

  if (masterTally.failures.length === 0) {
    lines.push("_None — all ongoing products match on current master._", "");
  } else {
    lines.push("| ISIN | Product | Notes |", "| --- | --- | --- |");
    for (const f of masterTally.failures) {
      lines.push(`| ${f.isin} | ${f.name.replace(/\|/g, "\\|")} | ${f.notes.join("; ")} |`);
    }
    lines.push("", `_Remaining master-file failures: ${masterTally.fail - masterTally.failures.length}_`, "");
  }

  lines.push("## Mode B — failures (first 30)", "");
  if (excelRowTally.failures.length === 0) {
    lines.push("_None — engine matches Working sheet row-for-row._", "");
  } else {
    lines.push("| ISIN | Product | Notes |", "| --- | --- | --- |");
    for (const f of excelRowTally.failures) {
      lines.push(`| ${f.isin} | ${f.name.replace(/\|/g, "\\|")} | ${f.notes.join("; ")} |`);
    }
    lines.push("", `_Remaining formula-replay failures: ${excelRowTally.fail - excelRowTally.failures.length}_`, "");
  }

  lines.push("## Spot checks", "", "| ISIN | Product | Excel PV | App PV (master) | App PV (excel row) | Excel IRR | App IRR (master) | Match UI? |", "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const isin of ["INE093JA70T3", "INE093JA7Q38", "INE093JA7Y79", "INE093JA7ZS2", "INE093J08047"]) {
    const product = ongoing.find((p) => str(p.isin).toUpperCase() === isin);
    if (!product) continue;
    const excel = resolveWorkingRow(product, workingByIsin, valDateSerial);
    if (!excel) continue;
    const masterRes = evaluateRow(product, excel, levels, "master");
    const rowRes = evaluateRow(product, excel, levels, "excel-row");
    const uiMatch =
      within(masterRes.productValue, Math.round(excel.productValue), 1) &&
      within(masterRes.productIrr, excel.irr, 0.0005)
        ? "Excel row"
        : within(masterRes.productValue, Math.round(excel.productValue), 1)
          ? "PV only"
          : "Master (UI)";
    lines.push(
      `| ${isin} | ${product.name.replace(/\|/g, "\\|")} | ${rupees(excel.productValue)} | ${rupees(masterRes.productValue)} | ${rupees(rowRes.productValue)} | ${pctDecimal(excel.irr)} | ${pctDecimal(masterRes.productIrr)} | ${uiMatch} |`,
    );
  }

  lines.push("", "## Method", "");
  lines.push("- Run: `npx tsx scripts/verify-valuation-working-parity.ts`");
  lines.push("- Engine: `lib/workbook/valuation-engine.ts` + `lib/workbook/valuation-performance.ts`");
  lines.push("- Index history for Working!N lookup: `lib/data/valuation-index-history.json` (from Working!AJ:AK)");
  lines.push("- Tolerances: Product Value ±₹1; IRR and Abs Return ±0.05 pp");
  lines.push("- Mode A mismatches often mean **master file drift** vs the May-26 workbook Primary snapshot (allotment/maturity/entry)");
  lines.push("");

  writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");

  console.log(`\nMode A (master): Pass ${masterTally.pass} / ${masterTally.tested}`);
  console.log(`Mode B (excel row): Pass ${excelRowTally.pass} / ${excelRowTally.tested}`);
  console.log(`Report: ${REPORT_PATH}`);

  if (excelRowTally.fail > 0) process.exitCode = 1;
}

main();
