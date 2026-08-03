/**
 * Validate live desk valuations @ 31-Jul-2026 vs Desktop NAV workbook.
 *
 * Policy under test (Logic sheet + Rollover Phase tenure):
 * - Blank: Allotment → Maturity
 * - Phase 1: Allotment → POED
 * - Phase 2: Trade → Maturity
 * - 10 Years: Allotment → Rollover C/P
 * - No obs: expected Nifty via spot IRR → second-last obs; quote grows U by product IRR
 * - ≥1 obs: average realised fixings; quote uses grow / 11% discount / U·(1+S)
 *
 * Usage: npx tsx scripts/verify-31jul-nav-match.ts
 */
import * as XLSX from "xlsx";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { isSensexLinked } from "../lib/product-utils";
import { parseExcelishDate } from "../lib/workbook/dates";
import {
  getWorkingAllotmentDate,
  getPhaseScheduleEndDate,
  getRolloverPhaseKind,
  getProductAllotmentDate,
  getProductTradeOpeningDate,
  getProductMaturityDate,
  getProductPoedDate,
  getProductRolloverScheduleDate,
} from "../lib/product-dates";
import type { ProductRecord } from "../lib/types";

const NAV_PATH = "C:/Users/shiba/OneDrive/Desktop/31Jul NAVs - Live Products.xlsx";
const VAL_DATE = parseExcelishDate("31-07-2026")!;
const VAL_STR = "31-07-2026";

function phaseTenureOk(product: ProductRecord): boolean {
  const kind = getRolloverPhaseKind(product);
  const F = getWorkingAllotmentDate(product);
  const H = getPhaseScheduleEndDate(product);
  const allot = getProductAllotmentDate(product);
  const trade = getProductTradeOpeningDate(product);
  const mat = getProductMaturityDate(product);
  const poed = getProductPoedDate(product);
  const roll = getProductRolloverScheduleDate(product);
  if (!F || !H) return false;
  switch (kind) {
    case "blank":
      return !!allot && !!mat && F.getTime() === allot.getTime() && H.getTime() === mat.getTime();
    case "phase1": {
      const end = poed ?? mat;
      return !!allot && !!end && F.getTime() === allot.getTime() && H.getTime() === end.getTime();
    }
    case "phase2":
      return !!trade && !!mat && F.getTime() === trade.getTime() && H.getTime() === mat.getTime();
    case "tenYear": {
      const end = roll ?? mat;
      return !!allot && !!end && F.getTime() === allot.getTime() && H.getTime() === end.getTime();
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function main() {
  const wb = XLSX.readFile(NAV_PATH, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Sheet1!, { defval: "" });
  const products = loadCanonicalProducts();
  const byIsin = new Map(products.map((p) => [p.isin?.trim().toUpperCase(), p]));
  const nifty = lookupBundledNiftyOnOrBefore(VAL_DATE)!;
  const sensex = lookupBundledSensexOnOrBefore(VAL_DATE)!;

  let matched = 0;
  let missing = 0;
  let exact = 0;
  let within100 = 0;
  let tenureOk = 0;
  let tenureBad = 0;
  const worst: Array<{ isin: string; nav: number; app: number; err: number; navExpected?: number }> = [];

  for (const r of rows) {
    const isin = String(r["ISIN No."] ?? "").trim();
    if (!isin || isin === "ISIN No.") continue;
    const navRaw = r["Value as on 31-Jul"];
    const nav = typeof navRaw === "number" ? navRaw : Number(String(navRaw).replace(/[,\s]/g, ""));
    if (!Number.isFinite(nav)) continue;
    const p = byIsin.get(isin.toUpperCase());
    if (!p) {
      missing++;
      continue;
    }
    matched++;
    if (phaseTenureOk(p)) tenureOk++;
    else tenureBad++;

    const level = isSensexLinked(p) ? sensex : nifty;
    const app = computeValuation(p, { valuationDate: VAL_STR, currentLevel: level, debentures: 1 });
    const err = Math.abs(app.productValue - nav);
    if (err <= 1) exact++;
    if (err <= 100) within100++;
    if (err > 1) {
      const navExpected = Number(r[" Exp. Underlying Val. @ 2nd Last Obs. Date "]);
      worst.push({
        isin,
        nav: Math.round(nav),
        app: app.productValue,
        err: Math.round(err),
        navExpected: Number.isFinite(navExpected) ? Math.round(navExpected * 100) / 100 : undefined,
      });
    }
  }
  worst.sort((a, b) => b.err - a.err);

  const pct = matched ? ((exact / matched) * 100).toFixed(2) : "0";
  console.log("=== 31-Jul NAV match ===");
  console.log({
    nifty,
    sensex,
    matched,
    missing,
    exact,
    within100,
    pctExact: `${pct}%`,
    residual: worst.length,
    phaseTenureOk: tenureOk,
    phaseTenureBad: tenureBad,
  });
  if (worst.length) {
    console.log("Residuals (NAV file final value ≠ Logic-sheet quote; phase tenure still correct):");
    for (const w of worst.slice(0, 20)) console.log(w);
  }
  const pass = exact >= 2290 && matched >= 2300 && tenureBad === 0;
  console.log(pass ? "\n=== PASS ===" : "\n=== FAIL ===");
  process.exit(pass ? 0 : 1);
}

main();
