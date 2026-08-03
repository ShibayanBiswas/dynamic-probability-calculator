/**
 * Categorize Mode A valuation failures: date drift vs entry vs formula vs logic bug.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import * as XLSX from "xlsx";

import {
  filterProductsByLifecycle,
  filterValidMasterProducts,
  isValuationApplicableAt,
} from "../lib/product-lifecycle";
import { resolveValuationLevel } from "../lib/product-utils";
import { parseExcelishDate, toExcelSerial } from "../lib/workbook/dates";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";
import { resolveWorkingObservationDate } from "../lib/workbook/valuation-performance";
import {
  indexWorkingRowsByIsin,
  matchWorkingRowForProduct,
  type WorkingRowMatch,
} from "../lib/workbook/working-row-match";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VALUATION_DATE = "31-May-26";

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function readWorking(): { rows: WorkingRowMatch[]; valSerial: number } {
  const path = join(
    ROOT,
    "Dashboards - 31st May 26",
    "Primary Structured Products Valuation - 31st May 26.xlsm",
  );
  const wb = XLSX.readFile(path, { cellDates: false });
  const ws = wb.Sheets.Working!;
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  const valSerial = num(ws.B1?.v) ?? 46173;
  const rows: WorkingRowMatch[] = [];

  for (let r = 2; r <= range.e.r; r += 1) {
    const name = str(ws[XLSX.utils.encode_cell({ r, c: 1 })]?.v);
    const isin = str(ws[XLSX.utils.encode_cell({ r, c: 4 })]?.v);
    if (!isin || isin === "ISIN No.") continue;
    const productValue = num(ws[XLSX.utils.encode_cell({ r, c: 23 })]?.v);
    if (productValue == null) continue;

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
      productValue,
      irr: num(ws[XLSX.utils.encode_cell({ r, c: 24 })]?.v) ?? 0,
      absReturn: num(ws[XLSX.utils.encode_cell({ r, c: 25 })]?.v) ?? 0,
       zPerf: num(ws[XLSX.utils.encode_cell({ r, c: 14 })]?.v) ?? 0,
      formulaReturn: num(ws[XLSX.utils.encode_cell({ r, c: 18 })]?.v),
    });
  }

  return { rows, valSerial };
}

function main() {
  const AS_OF = parseExcelishDate(VALUATION_DATE)!;
  const all = loadCanonicalProducts(AS_OF);
  const ongoing = filterProductsByLifecycle(filterValidMasterProducts(all, AS_OF), "ongoing", AS_OF).filter(
    (p) => p.formulaText?.trim() && isValuationApplicableAt(p, VALUATION_DATE),
  );

  const { rows, valSerial } = readWorking();
  const byIsin = indexWorkingRowsByIsin(rows);
  const levels = { niftyLevel: 23547.75, sensexLevel: 74775.74 };
  const valDate = parseExcelishDate(VALUATION_DATE)!;

  let totalFail = 0;
  let fixDates = 0;
  let fixEntry = 0;
  let fixObsOnly = 0;
  let logicBug = 0;
  let fMismatch = 0;
  let hMismatch = 0;
  let iMismatch = 0;

  for (const product of ongoing) {
    const isin = str(product.isin).toUpperCase();
    const excel = matchWorkingRowForProduct(product, byIsin.get(isin) ?? [], valSerial);
    if (!excel) continue;

    const masterRes = computeValuation(product, {
      valuationDate: VALUATION_DATE,
      currentLevel: resolveValuationLevel(product, levels),
      debentures: 100,
    });

    if (Math.abs(masterRes.productValue - Math.round(excel.productValue)) <= 1) continue;
    totalFail += 1;

    const withDates = computeValuation(product, {
      valuationDate: VALUATION_DATE,
      currentLevel: resolveValuationLevel(product, levels),
      debentures: 100,
      deskRow: {
        allotmentDate: excel.allotmentSerial,
        maturityDate: excel.maturitySerial,
        observationDate: excel.observationSerial,
      },
    });

    if (Math.abs(withDates.productValue - Math.round(excel.productValue)) <= 1) {
      fixDates += 1;
      continue;
    }

    const withEntry = computeValuation(product, {
      valuationDate: VALUATION_DATE,
      currentLevel: resolveValuationLevel(product, levels),
      debentures: 100,
      deskRow: {
        allotmentDate: excel.allotmentSerial,
        maturityDate: excel.maturitySerial,
        observationDate: excel.observationSerial,
        entryLevel: excel.entryLevel,
      },
    });

    if (Math.abs(withEntry.productValue - Math.round(excel.productValue)) <= 1) {
      fixEntry += 1;
      continue;
    }

    const obsMaster = resolveWorkingObservationDate(product, valDate);
    const masterI = obsMaster ? toExcelSerial(obsMaster) : undefined;
    const masterH = toExcelSerial(
      parseExcelishDate(product.maturityRaw ?? product.lastObservationDateRaw) ?? valDate,
    );
    const masterF = toExcelSerial(
      parseExcelishDate(
        product.raw?.["Allotment Date"] ??
          product.raw?.["Trade Date/Opening date"] ??
          product.raw?.["Trade Date"] ??
          "",
      ) ?? valDate,
    );

    if (masterF !== excel.allotmentSerial) fMismatch += 1;
    if (masterH !== excel.maturitySerial) hMismatch += 1;
    if (masterI !== excel.observationSerial) iMismatch += 1;

    if (masterI !== excel.observationSerial) {
      fixObsOnly += 1;
    } else {
      logicBug += 1;
    }
  }

  console.log("Mode A failure breakdown:");
  console.log("  Total failures:", totalFail);
  console.log("  Fixed by Excel F/H/I dates:", fixDates);
  console.log("  Fixed by dates + entry level:", fixEntry);
  console.log("  Raw field mismatches among failures:");
  console.log("    F (allotment serial):", fMismatch);
  console.log("    H (maturity serial):", hMismatch);
  console.log("    I (observation serial):", iMismatch);
  console.log("  Observation-only date fixes:", fixObsOnly);
  console.log("  Possible logic / S / N issues:", logicBug);
}

main();
