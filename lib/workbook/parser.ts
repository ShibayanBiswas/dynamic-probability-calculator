import * as XLSX from "xlsx";

import {
  type CategoryMetricSummary,
  type DashboardDataset,
  type FormulaCatalogEntry,
  type ProductCategory,
  PRODUCT_CATEGORIES,
  type ProductRecord,
  type ValidationIssue,
  type WorkbookCellRecord,
  type WorkbookRowRecord,
  type WorkbookSheetRecord,
} from "@/lib/types";
import { EXPECTED_PRODUCT_COUNTS } from "@/lib/workbook/expected-counts";
import { isInternalDeskLabel, isLegalBoilerplateText, isSparseMasterRowCells } from "@/lib/master-book-filter";
import { stripRolloverPhaseNameSuffix } from "@/lib/master-column-labels";
import { resolveDeskProductGrid } from "@/lib/master/desk-product-grid";
import { pickCanonicalRowsForDesk } from "@/lib/master/new-primary-merge";
import { DESK_PRODUCT_SOURCE_SHEET } from "@/lib/master-source";
import {
  sourceHeadersFromSheetHeaders,
} from "@/lib/master/new-primary-export";
import { hydrateProductRolloverPhases, parseMasterRolloverPhase } from "@/lib/product-dates";
import { applyRolloverPhaseNameSuffixToName, hydrateProductDisplayNames } from "@/lib/product-display-name";
import { filterValidMasterProducts } from "@/lib/product-lifecycle";
import { sumSheetTradeNotional } from "@/lib/primary-book-notional";
import { classifyProtection, getCouponPercent, parseCouponString } from "@/lib/product-utils";
import { formatExcelishDate, formatMasterSheetDate } from "@/lib/workbook/dates";

const SHEET_VISIBILITY: Record<number, "visible" | "hidden" | "veryHidden"> = {
  0: "visible",
  1: "hidden",
  2: "veryHidden",
};

const TARGET_HEADERS = {
  month: ["Month"],
  tradeDate: ["Trade Date/Opening date", "Allotment Date", "Trade Date"],
  productName: ["Product Name"],
  name: ["Name on Signup Form", "Name of Client", "Client Name", "Name"],
  issuer: ["Issuer"],
  isin: ["ISIN No.", "ISIN"],
  underlying: ["Underlying"],
  series: ["Series"],
  tradeAmount: ["Trade Amount", "Actual outflow", "Maturity value", "Investment Amount", "Initial Investment (Rs.)"],
  pricePerDebenture: ["price per debenture", "Price per bond", "Price Per Bond", "Price per bond"],
  couponPercent: ["Coupon (%)", "Coupon / PR / DM", "Product return"],
  tenorDays: ["Tenor", "Product tenor", "Remaining Tenor (days)"],
  tenorBucket: ["Classification based on tenor"],
  maturityRaw: ["Maturity", "Maturity date", "Maturity Date"],
  lastObservationDateRaw: ["Last Observation Date", "Observation date", "Final Observation Dates "],
  formulaText: ["Formulae"],
  productExplanation: ["Product Explanation"],
  principalProtection: ["Principal Protection", "Capital Guarantee"],
  listing: ["Listing"],
  productType: ["Product Type"],
  rolloverPhase: ["Rollover Phase"],
  entryLevel: ["Actual Entry Level", "Entry Level", "Initial Fixing Level"],
} as const;

/** Legacy multi-category column headers — never persisted in product raw. */
/** Legacy multi-category headers — never persisted in product raw (Rollover Phase kept for desk fallback). */
const STRIP_RAW_HEADERS = new Set(["Rollover", "Maximizer", "DMF"]);

const HIDDEN_DEPENDENCIES = [
  "2nd last obs dates",
  "Sheet1",
  "Sheet2",
  "Sheet3",
  "Master",
  "Working",
  "Working (2)",
  "Dump",
  "Combined Portfolio - Input",
  "Equity Portfolio Returns",
];

const HEADER_MARKERS = [
  "underlying",
  "name on signup form",
  "product name",
  "formulae",
  "payoff formula",
  "isin no.",
  "isin number",
  "trade amount",
  "issue month",
  "sr.no",
];

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeCoupon(value: unknown) {
  return parseCouponString(value as string | number | null);
}

function isLikelyExcelDateCell(cell: XLSX.CellObject): boolean {
  if (cell.t === "d") return true;
  if (cell.t !== "n" || typeof cell.v !== "number") return false;
  if (cell.v <= 30000 || cell.v >= 60000) return false;
  const fmt = String(cell.z ?? "").toLowerCase();
  if (fmt && /y|m|d|mmm|yy/.test(fmt) && !/%/.test(fmt)) return true;
  const text = String(cell.w ?? "");
  return /[A-Za-z]{3}|[\/\-]/.test(text) && !/^[\d,.]+$/.test(text);
}

/**
 * Prefer Excel serial / Date over locale `cell.w` (often US `m/d/yy`).
 * Normalize dates to `dd-MMM-yy` immediately so sync cannot day/month-swap.
 */
function excelCellDisplayValue(cell: XLSX.CellObject | undefined): unknown {
  if (!cell) return null;
  if (cell.t === "d" && cell.v instanceof Date) {
    return formatMasterSheetDate(cell.v) ?? cell.w ?? null;
  }
  if (isLikelyExcelDateCell(cell) && typeof cell.v === "number") {
    return formatMasterSheetDate(cell.v) ?? cell.w ?? cell.v;
  }
  if (cell.v instanceof Date) {
    return formatMasterSheetDate(cell.v) ?? cell.w ?? null;
  }
  if (cell.w != null && String(cell.w).trim() !== "") return cell.w;
  return cell.v ?? null;
}

function buildCell(address: string, value: unknown, formula?: string): WorkbookCellRecord {
  const display =
    value === undefined || value === null
      ? ""
      : String(value);

  return {
    address,
    value: value === undefined || value === null ? null : (value as string | number | boolean | null),
    formatted: display,
    formula,
  };
}

function getSheetMatrix(sheet: XLSX.WorkSheet) {
  const ref = sheet["!ref"];
  if (!ref) {
    return { headers: [] as string[], dataRows: [] as unknown[][], headerRowIndex: 0 };
  }

  const range = XLSX.utils.decode_range(ref);
  let headerRowIndex = range.s.r;

  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 40); r++) {
    const cells: unknown[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      cells.push(excelCellDisplayValue(cell));
    }
    const normalized = cells.map(normalizeHeader);
    if (HEADER_MARKERS.some((marker) => normalized.includes(marker))) {
      headerRowIndex = r;
      break;
    }
  }

  const colCount = range.e.c - range.s.c + 1;
  const rawHeaders: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c });
    const cell = sheet[addr];
    rawHeaders.push(String(excelCellDisplayValue(cell) ?? "").trim());
  }
  const headers = sourceHeadersFromSheetHeaders(rawHeaders);

  const dataRows: unknown[][] = [];
  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const row: unknown[] = new Array(colCount).fill(null);
    let hasValue = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      const value = excelCellDisplayValue(cell);
      if (value !== null && value !== "") {
        hasValue = true;
      }
      row[c - range.s.c] = value;
    }
    if (hasValue) {
      const firstCell = String(row[0] ?? "").trim();
      if (firstCell.startsWith("Reference:")) continue;

      const monthIdx = headers.indexOf("Month");
      const nameIdx = headers.indexOf("Name on Signup Form");
      const isinIdx = headers.indexOf("ISIN No.");
      const hasKeyField = [monthIdx, nameIdx, isinIdx].some(
        (index) => index >= 0 && String(row[index] ?? "").trim(),
      );
      if (!hasKeyField) continue;

      dataRows.push(row);
    }
  }

  return { headers, dataRows, headerRowIndex };
}

function getSheetData(workbook: XLSX.WorkBook, name: string): WorkbookSheetRecord {
  const sheet = workbook.Sheets[name];
  const { headers, dataRows, headerRowIndex } = getSheetMatrix(sheet);
  const formulaSheet = XLSX.utils.sheet_to_formulae(sheet);
  const formulas = formulaSheet
    .filter((entry) => entry.includes("="))
    .map((entry) => {
      const [address, ...formulaParts] = entry.split("=");
      return {
        address,
        formula: formulaParts.join("="),
      };
    });

  const workbookMeta = workbook.Workbook?.Sheets?.find((candidate) => candidate.name === name);
  const rowRecords: WorkbookRowRecord[] = dataRows.map((row, index) => ({
    rowNumber: headerRowIndex + index + 2,
    values: row.map((value, cellIndex) =>
      buildCell(XLSX.utils.encode_cell({ c: cellIndex, r: headerRowIndex + index + 1 }), value),
    ),
  }));

  return {
    name,
    visibility: SHEET_VISIBILITY[workbookMeta?.Hidden ?? 0] ?? "visible",
    rowCount: Math.max(dataRows.length, 0),
    columnCount: headers.length,
    headers,
    rows: rowRecords,
    formulas,
  };
}

function readField(headers: string[], row: unknown[], target: keyof typeof TARGET_HEADERS) {
  const expected = TARGET_HEADERS[target].map(normalizeHeader);
  const matchedIndex = headers.findIndex((header) => expected.includes(normalizeHeader(header)));
  return matchedIndex >= 0 ? row[matchedIndex] : null;
}

function isValidProductName(name: string) {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.startsWith("unnamed ")) {
    return false;
  }
  if (/^\d+$/.test(normalized)) {
    return false;
  }
  if (isInternalDeskLabel(name) || isLegalBoilerplateText(name)) {
    return false;
  }
  const blocked = ["month", "underlying", "formulae", "product name", "name on signup form", "sr.no"];
  return !blocked.includes(normalized);
}

function rolloverPhaseLabelRank(phase: string): number {
  const lower = phase.trim().toLowerCase();
  if (!lower) return 0;
  if (lower.includes("10year")) return 1;
  if (lower.includes("ii") || lower.includes("phase 2") || lower === "phase2") return 3;
  if (lower.includes("phase i") || lower.includes("phase 1") || lower === "phase1") return 2;
  return 0;
}

/** Fill missing rolloverPhase from the Rollover sheet when Primary / NEW PRIMARY row is blank. */
function enrichProductsRolloverPhaseFromRolloverSheet(
  products: ProductRecord[],
  rolloverSheet: WorkbookSheetRecord | undefined,
): void {
  if (!rolloverSheet) return;

  const headers = sourceHeadersFromSheetHeaders(rolloverSheet.headers);
  const isinIdx = headers.indexOf("ISIN No.");
  const phaseIdx = headers.indexOf("Rollover Phase");
  if (isinIdx < 0 || phaseIdx < 0) return;

  const phaseByIsin = new Map<string, string>();
  for (const row of rolloverSheet.rows) {
    const isin = String(row.values[isinIdx]?.value ?? "")
      .trim()
      .toUpperCase();
    const phase = parseMasterRolloverPhase(String(row.values[phaseIdx]?.value ?? ""));
    if (!isin || !phase) continue;

    const existing = phaseByIsin.get(isin);
    if (!existing || rolloverPhaseLabelRank(phase) > rolloverPhaseLabelRank(existing)) {
      phaseByIsin.set(isin, phase);
    }
  }

  for (const product of products) {
    if (parseMasterRolloverPhase(product.rolloverPhase)) continue;
    const isin = product.isin?.trim().toUpperCase();
    if (!isin) continue;
    const phase = phaseByIsin.get(isin);
    if (phase) product.rolloverPhase = phase;
  }
}

function mapRowToProduct(category: ProductCategory, headers: string[], row: unknown[], index: number): ProductRecord | null {
  const productName = String(readField(headers, row, "productName") ?? "").trim();
  const signupName = String(readField(headers, row, "name") ?? "").trim();
  const rolloverPhase = parseMasterRolloverPhase(String(readField(headers, row, "rolloverPhase") ?? ""));
  const name = applyRolloverPhaseNameSuffixToName(productName || signupName, rolloverPhase);
  if (!isValidProductName(name)) {
    return null;
  }

  if (
    isSparseMasterRowCells({
      tradeAmount: toNumber(readField(headers, row, "tradeAmount")),
      isin: String(readField(headers, row, "isin") ?? "").trim(),
      formula: String(readField(headers, row, "formulaText") ?? "").trim(),
      underlying: String(readField(headers, row, "underlying") ?? "").trim(),
      issuer: String(readField(headers, row, "issuer") ?? "").trim(),
      entryLevel: toNumber(readField(headers, row, "entryLevel")),
      name,
    })
  ) {
    return null;
  }

  const raw = headers.reduce<Record<string, string | number | boolean | null>>((acc, header, headerIndex) => {
    if (STRIP_RAW_HEADERS.has(header.trim())) {
      return acc;
    }
    const cell = row[headerIndex];
    if (typeof cell === "number" && Number.isNaN(cell)) {
      acc[header] = null;
    } else {
      acc[header] = (cell ?? null) as string | number | boolean | null;
    }
    return acc;
  }, {});

  const maturityRaw = readField(headers, row, "maturityRaw");
  const lastObservationDateRaw = readField(headers, row, "lastObservationDateRaw");

  return {
    category,
    rowId: `${category}-${index + 1}`,
    month: String(readField(headers, row, "month") ?? "").trim() || undefined,
    name,
    issuer: String(readField(headers, row, "issuer") ?? "").trim() || undefined,
    isin: String(readField(headers, row, "isin") ?? "").trim() || undefined,
    underlying: String(readField(headers, row, "underlying") ?? "").trim() || undefined,
    series: String(readField(headers, row, "series") ?? "").trim() || undefined,
    tradeAmount: toNumber(readField(headers, row, "tradeAmount")),
    pricePerDebenture: toNumber(readField(headers, row, "pricePerDebenture")),
    couponPercent: normalizeCoupon(readField(headers, row, "couponPercent")),
    tenorDays: toNumber(readField(headers, row, "tenorDays")),
    tenorBucket: String(readField(headers, row, "tenorBucket") ?? "").trim() || undefined,
    maturityRaw:
      maturityRaw != null && maturityRaw !== "" ? formatExcelishDate(maturityRaw as string | number) : undefined,
    lastObservationDateRaw:
      lastObservationDateRaw != null && lastObservationDateRaw !== ""
        ? formatExcelishDate(lastObservationDateRaw as string | number)
        : undefined,
    formulaText: String(readField(headers, row, "formulaText") ?? "").trim() || undefined,
    productExplanation: String(readField(headers, row, "productExplanation") ?? "").trim() || undefined,
    principalProtection: String(readField(headers, row, "principalProtection") ?? "").trim() || undefined,
    listing: String(readField(headers, row, "listing") ?? "").trim() || undefined,
    productType: String(readField(headers, row, "productType") ?? "").trim() || undefined,
    rolloverPhase,
    raw,
  };
}

function buildCategorySummary(category: ProductCategory, products: ProductRecord[]): CategoryMetricSummary {
  const notional = products.reduce((sum, product) => sum + (product.tradeAmount ?? 0), 0);
  const coupons = products.map((product) => getCouponPercent(product)).filter((c): c is number => c !== undefined);
  const averageCoupon = coupons.length > 0 ? coupons.reduce((sum, c) => sum + c, 0) / coupons.length : 0;
  const listedShare =
    products.length > 0
      ? products.filter((product) => normalizeHeader(product.listing) === "listed").length / products.length
      : 0;
  const principalProtectedShare =
    products.length > 0
      ? products.filter((product) => classifyProtection(product.principalProtection) === "protected").length /
        products.length
      : 0;

  const issuerTotals = new Map<string, number>();
  const tenorTotals = new Map<string, number>();
  const payoffProfiles: Array<{ name: string; formula: string }> = [];
  const seenFormulas = new Set<string>();

  for (const product of products) {
    const issuerKey = product.issuer || "Unknown issuer";
    issuerTotals.set(issuerKey, (issuerTotals.get(issuerKey) ?? 0) + (product.tradeAmount ?? 0));

    const tenorKey = product.tenorBucket || "Unclassified";
    tenorTotals.set(tenorKey, (tenorTotals.get(tenorKey) ?? 0) + (product.tradeAmount ?? 0));

    if (product.formulaText && !seenFormulas.has(product.formulaText) && payoffProfiles.length < 12) {
      seenFormulas.add(product.formulaText);
      payoffProfiles.push({
        name: product.name,
        formula: product.formulaText,
      });
    }
  }

  return {
    category,
    productCount: products.length,
    liveNotional: notional,
    averageCoupon,
    listedShare,
    principalProtectedShare,
    topIssuers: [...issuerTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value })),
    tenorMix: [...tenorTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([bucket, value]) => ({ bucket, value })),
    payoffProfiles,
  };
}

function buildFormulaCatalog(
  workbookName: string,
  sheets: WorkbookSheetRecord[],
  products: ProductRecord[],
): FormulaCatalogEntry[] {
  const catalog: FormulaCatalogEntry[] = [];

  for (const sheet of sheets) {
    for (const formula of sheet.formulas) {
      catalog.push({
        workbook: workbookName,
        sheet: sheet.name,
        cell: formula.address,
        formula: formula.formula,
      });
    }

    const formulaHeaderIndex = sheet.headers.findIndex((header) => normalizeHeader(header) === "formulae");
    if (formulaHeaderIndex >= 0) {
      for (const row of sheet.rows) {
        const value = row.values[formulaHeaderIndex]?.value;
        const formulaText = String(value ?? "").trim();
        if (!formulaText || formulaText.startsWith("=")) {
          continue;
        }
        const nameIndex = sheet.headers.findIndex((header) =>
          ["name on signup form", "product name", "name"].includes(normalizeHeader(header)),
        );
        const productName = nameIndex >= 0 ? String(row.values[nameIndex]?.value ?? "").trim() : undefined;
        catalog.push({
          workbook: workbookName,
          sheet: sheet.name,
          cell: `ROW${row.rowNumber}`,
          formula: formulaText,
          category: PRODUCT_CATEGORIES.includes(sheet.name as ProductCategory)
            ? (sheet.name as ProductCategory)
            : undefined,
          productName,
        });
      }
    }
  }

  for (const product of products) {
    if (!product.formulaText) {
      continue;
    }
    if (!catalog.some((entry) => entry.formula === product.formulaText && entry.productName === product.name)) {
      catalog.push({
        workbook: workbookName,
        sheet: product.category,
        cell: "Formulae",
        formula: product.formulaText,
        category: product.category,
        productName: product.name,
      });
    }
  }

  return catalog;
}

function buildValidationIssues(
  workbookName: string,
  sheets: WorkbookSheetRecord[],
  hiddenSheets: WorkbookSheetRecord[],
  products: ProductRecord[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const category of PRODUCT_CATEGORIES) {
    const categoryProducts = products.filter((product) => product.category === category);
    if (!categoryProducts.length) {
      issues.push({
        severity: "error",
        category,
        message: `No rows were parsed for the ${category} sheet.`,
      });
    }

    const formulaCoverage =
      categoryProducts.length > 0
        ? categoryProducts.filter((product) => Boolean(product.formulaText)).length / categoryProducts.length
        : 0;

    if (formulaCoverage < 0.2) {
      issues.push({
        severity: "warning",
        category,
        message: `Low formula coverage detected for ${category}. Review workbook changes before relying on payoff outputs.`,
      });
    }

    const expected = EXPECTED_PRODUCT_COUNTS[category];
    if (expected && categoryProducts.length !== expected.products) {
      issues.push({
        severity: "error",
        category,
        message: `Product count mismatch for ${category}: parsed ${categoryProducts.length}, Excel master has ${expected.products}.`,
      });
    } else if (expected) {
      const formulaCount = categoryProducts.filter((p) => p.formulaText).length;
      if (formulaCount !== expected.formulas) {
        issues.push({
          severity: "warning",
          category,
          message: `Formula count for ${category}: parsed ${formulaCount}, Excel master has ${expected.formulas}.`,
        });
      }
    }
  }

  if (hiddenSheets.length < 3) {
    issues.push({
      severity: "warning",
      category: "Hidden Sheets",
      message: "Fewer hidden dependency sheets were found than expected.",
    });
  }

  const missingKeyColumns = sheets
    .filter((sheet) => PRODUCT_CATEGORIES.includes(sheet.name as ProductCategory))
    .flatMap((sheet) => {
      const required = ["Name on Signup Form", "Underlying", "Formulae"];
      return required
        .filter((header) => !sheet.headers.some((candidate) => normalizeHeader(candidate) === normalizeHeader(header)))
        .map((header) => `${sheet.name}: missing ${header}`);
    });

  for (const entry of missingKeyColumns) {
    issues.push({
      severity: "warning",
      category: "Schema",
      message: entry,
    });
  }

  return issues;
}

export function parseWorkbookBuffer(buffer: ArrayBuffer, workbookName: string): DashboardDataset {
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
    cellDates: true,
    dense: false,
  });

  const sheets = workbook.SheetNames.map((sheetName) => getSheetData(workbook, sheetName));
  const hiddenDependencySheets = sheets.filter(
    (sheet) => sheet.visibility !== "visible" || HIDDEN_DEPENDENCIES.includes(sheet.name),
  );

  const deskGrid = resolveDeskProductGrid(sheets);

  const canonicalHeaders = deskGrid?.headers ?? [];

  let processedGridRows = deskGrid?.gridRows ?? [];
  if (deskGrid) {
    const nameIdx = canonicalHeaders.indexOf("Name on Signup Form");
    if (nameIdx >= 0) {
      processedGridRows = processedGridRows.map((row) => {
        const copy = [...row];
        copy[nameIdx] = stripRolloverPhaseNameSuffix(String(copy[nameIdx] ?? ""));
        return copy;
      });
    }
  }

  const deskGridRows = deskGrid ? pickCanonicalRowsForDesk(canonicalHeaders, processedGridRows) : [];

  const rawProducts = deskGrid
    ? deskGridRows
        .map((row, index) => mapRowToProduct("Primary", canonicalHeaders, row, index))
        .filter((product): product is ProductRecord => product !== null)
    : [];

  enrichProductsRolloverPhaseFromRolloverSheet(
    rawProducts,
    sheets.find((candidate) => candidate.name === "Rollover"),
  );
  hydrateProductRolloverPhases(rawProducts);
  hydrateProductDisplayNames(rawProducts);

  const products = filterValidMasterProducts(rawProducts);
  const skippedMasterRows = rawProducts.length - products.length;

  const categorySummaries = PRODUCT_CATEGORIES.map((category) =>
    buildCategorySummary(
      category,
      products.filter((product) => product.category === category),
    ),
  );

  const newPrimarySheet = sheets.find((sheet) => sheet.name === DESK_PRODUCT_SOURCE_SHEET);
  const newPrimaryTabNotional = sumSheetTradeNotional(newPrimarySheet);
  if (newPrimaryTabNotional > 0) {
    const primarySummary = categorySummaries.find((summary) => summary.category === "Primary");
    if (primarySummary) primarySummary.liveNotional = newPrimaryTabNotional;
  }

  const formulaCatalog = buildFormulaCatalog(workbookName, sheets, products);

  const validationIssues = buildValidationIssues(workbookName, sheets, hiddenDependencySheets, products);
  if (!deskGrid) {
    validationIssues.unshift({
      severity: "error",
      category: "Primary",
      message: `${DESK_PRODUCT_SOURCE_SHEET} desk book unavailable — need Primary + Rollover sheets or a ${DESK_PRODUCT_SOURCE_SHEET} tab. Run: npm run bake`,
    });
  } else if (deskGrid.source === "primary-rollover-merge") {
    const report = deskGrid.mergeReport!;
    validationIssues.unshift({
      severity: "info",
      category: "Primary",
      message: `Desk book from Primary + Rollover merge (${DESK_PRODUCT_SOURCE_SHEET} pipeline: ${report.mergedRowCount} merged rows → ${products.length} desk-canonical products).`,
    });
    if (
      deskGrid.tabRowCount != null &&
      deskGrid.tabRowCount !== report.mergedRowCount
    ) {
      validationIssues.push({
        severity: "warning",
        category: "Primary",
        message: `${DESK_PRODUCT_SOURCE_SHEET} tab has ${deskGrid.tabRowCount} rows but merge produced ${report.mergedRowCount} — tab may be stale; calculations use the live merge.`,
      });
    }
  } else {
    validationIssues.unshift({
      severity: "info",
      category: "Primary",
      message: `Product book loaded from ${DESK_PRODUCT_SOURCE_SHEET} tab (pickCanonicalRowsForDesk → ${products.length} valid rows).`,
    });
  }
  if (skippedMasterRows > 0) {
    validationIssues.push({
      severity: "info",
      category: "Primary",
      message: `Excluded ${skippedMasterRows} sparse master rows (internal notes / blank rows). ${products.length} desk-canonical products retained.`,
    });
  }

  return {
    workbookName,
    loadedAt: new Date().toISOString(),
    sheets,
    products,
    hiddenDependencySheets,
    categorySummaries,
    validationIssues,
    formulaCatalog,
  };
}

export async function parseWorkbookFile(file: File): Promise<DashboardDataset> {
  const buffer = await file.arrayBuffer();
  return parseWorkbookBuffer(buffer, file.name);
}

/** Primary + Rollover + NEW PRIMARY grids — Intel Master Explorer client-side fallback. */
export function parseMasterExplorerSheets(
  buffer: ArrayBuffer,
  workbookName = "New Product Master_.xlsx",
): {
  workbookName: string;
  primary: WorkbookSheetRecord | null;
  rollover: WorkbookSheetRecord | null;
  newPrimary: WorkbookSheetRecord | null;
} {
  const workbook = XLSX.read(buffer, { type: "array", cellNF: true, cellText: true, cellDates: true });
  const pick = (name: "Primary" | "Rollover" | "NEW PRIMARY") =>
    workbook.SheetNames.includes(name) ? getSheetData(workbook, name) : null;

  return {
    workbookName,
    primary: pick("Primary"),
    rollover: pick("Rollover"),
    newPrimary: pick("NEW PRIMARY"),
  };
}
