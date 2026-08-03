/**
 * Verify ongoing / active-book valuation: live index resolution + Working sheet parity sample.
 * Usage: npx tsx scripts/verify-ongoing-valuation.ts [ISIN] [DD-MM-YYYY]
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

import { hasProductIndexSource } from "../lib/desk-index-guards";
import {
  filterProductsByLifecycle,
  filterValidMasterProducts,
  isValuationApplicableAt,
} from "../lib/product-lifecycle";
import { resolveLiveIndexLevel, resolveValuationLevel } from "../lib/product-utils";
import { formatPercent } from "../lib/utils";
import { formatDeskDate } from "../lib/market-data";
import { parseExcelishDate } from "../lib/workbook/dates";
import { loadSeedProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";
import { computeActiveValuationSnapshots } from "../lib/workbook/portfolio-valuation-batch";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { resolveWorkingObservationDate } from "../lib/workbook/valuation-performance";
import { resolveIndexLevelsAtDate } from "../lib/market-index-at-date";
import {
  indexWorkingRowsByIsin,
  matchWorkingRowForProduct,
} from "../lib/workbook/working-row-match";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALUATION_XLSM = join(
  ROOT,
  "Dashboards - 31st May 26",
  "Primary Structured Products Valuation - 31st May 26.xlsm",
);

const SAMPLE_ISIN = process.argv[2];
const SAMPLE_DATE = process.argv[3] ?? "31-05-2026";

function fmt(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
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

function readWorkingSheet(): {
  rows: import("../lib/workbook/working-row-match").WorkingRowMatch[];
  niftyLevel: number;
  sensexLevel: number;
  valDateSerial: number;
} | null {
  if (!existsSync(VALUATION_XLSM)) return null;
  const wb = XLSX.readFile(VALUATION_XLSM, { cellDates: false, cellFormula: true });
  const ws = wb.Sheets.Working;
  if (!ws?.["!ref"]) return null;

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const niftyLevel = num(ws.D1?.v) ?? 23547.75;
  const sensexLevel = num(ws.C1?.v) ?? 74775.74;
  const valDateSerial = num(ws.B1?.v) ?? 46173;
  const rows: import("../lib/workbook/working-row-match").WorkingRowMatch[] = [];

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

async function main() {
  const asOf = parseExcelishDate(SAMPLE_DATE) ?? new Date();
  warnIfWorkbookDriftsFromSeed(asOf);
  const deskDate = formatDeskDate(asOf);
  const products = filterValidMasterProducts(loadSeedProducts(), asOf);
  const ongoing = filterProductsByLifecycle(products, "ongoing", asOf).filter(
    (p) => p.formulaText && isValuationApplicableAt(p, deskDate),
  );

  console.log(`Ongoing book (formula, applicable @ ${deskDate}): ${ongoing.length} products\n`);

  const target =
    (SAMPLE_ISIN ? ongoing.find((p) => p.isin === SAMPLE_ISIN) : undefined) ?? ongoing[0];
  if (!target) {
    console.error("No ongoing products in master pool.");
    process.exit(1);
  }

  const valDate = parseExcelishDate(deskDate);
  if (!valDate) {
    console.error("Invalid desk date");
    process.exit(1);
  }

  console.log(`=== Sample: ${target.isin} · ${target.name?.slice(0, 48)} ===`);
  console.log(`Valuation desk date: ${deskDate}`);
  console.log(
    `Working!I (last scheduled obs): ${
      resolveWorkingObservationDate(target, valDate) ? fmt(resolveWorkingObservationDate(target, valDate)!) : "—"
    }`,
  );

  const levels = await resolveIndexLevelsAtDate(deskDate);
  const working = readWorkingSheet();
  const parityLevels = working ?? levels;
  const niftyLevel = parityLevels?.niftyLevel ?? levels?.niftyLevel;
  const sensexLevel = parityLevels?.sensexLevel ?? levels?.sensexLevel;

  console.log("\nIndex at date:", {
    nifty: niftyLevel ?? null,
    sensex: sensexLevel ?? null,
    source: working ? "working-xlsm" : levels?.source ?? "missing",
  });

  if (!hasProductIndexSource(target, niftyLevel, sensexLevel)) {
    console.error("FAIL: No resolved index level for product underlying.");
    process.exit(1);
  }

  const currentLevel = resolveValuationLevel(target, { niftyLevel, sensexLevel });
  const liveLevel = resolveLiveIndexLevel(target, { niftyLevel, sensexLevel });
  console.log("Resolved valuation level:", currentLevel);
  console.log("Live index level (no entry fallback):", liveLevel);

  const valuation = computeValuation(target, {
    valuationDate: deskDate,
    currentLevel: liveLevel,
    debentures: 100,
  });

  console.log("\n--- Valuation outputs (Working parity) ---");
  console.log(`  Price / Debenture (V):     ${valuation.productValue}`);
  console.log(`  Absolute Return (X/U−1):   ${formatPercent(valuation.absReturn, 2)}`);
  console.log(`  Coupon Formed (formula):   ${formatPercent(valuation.formulaReturn, 2)}`);
  console.log(`  Product IRR (Y):         ${formatPercent(valuation.productIrr, 2)}`);
  console.log(`  Underlying perf (Z):     ${formatPercent(valuation.z, 2)}`);

  if (working) {
    const byIsin = indexWorkingRowsByIsin(working.rows);
    const candidates = byIsin.get((target.isin ?? "").toUpperCase()) ?? [];
    const match = matchWorkingRowForProduct(target, candidates, working.valDateSerial);
    if (match) {
      const tol = 0.02;
      const vOk =
        match.productValue > 0 &&
        Math.abs(valuation.productValue - match.productValue) / Math.max(match.productValue, 1) < tol;
      const aOk = Math.abs(valuation.absReturn - match.absReturn) < tol;
      console.log("\n--- Excel Working row cross-check ---");
      console.log(`  Excel V: ${match.productValue} · App V: ${valuation.productValue} · ${vOk ? "OK" : "MISMATCH"}`);
      console.log(
        `  Excel abs: ${formatPercent(match.absReturn, 2)} · App: ${formatPercent(valuation.absReturn, 2)} · ${aOk ? "OK" : "MISMATCH"}`,
      );
      if (!vOk || !aOk) {
        console.warn("\nWARN: Sample diverges from Working sheet — review formula or index levels.");
      }
    }
  }

  console.log("\n=== Batch ongoing book (first 50) ===");
  const batchProducts = ongoing.slice(0, 50);
  const batch = computeActiveValuationSnapshots(batchProducts, {
    valuationDate: deskDate,
    niftyLevel,
    sensexLevel,
  });
  let marked = 0;
  let valueSum = 0;
  let weightSum = 0;
  for (let i = 0; i < batch.length; i += 1) {
    const snap = batch[i]!;
    const p = batchProducts[i]!;
    if (snap.value != null && snap.value > 0 && snap.absReturn != null) {
      marked += 1;
      const w = p.tradeAmount ?? 0;
      weightSum += w;
      valueSum += snap.absReturn * w;
    }
  }
  console.log(
    `Marked ${marked} / 50 sampled · AUM-weighted abs return: ${
      weightSum > 0 ? formatPercent(valueSum / weightSum, 2) : "—"
    }`,
  );

  if (!(valuation.productValue > 0)) {
    console.warn("\nWARN: Product value is zero — formula or index path may be broken.");
    process.exit(1);
  }

  console.log("\nOngoing valuation checks OK.");
}

void main();
