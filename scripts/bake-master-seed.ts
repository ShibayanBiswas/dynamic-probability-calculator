import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { mergePrimaryAndRolloverSheets } from "../lib/master/new-primary-merge";
import type { DashboardDataset } from "../lib/types";
import { buildLifecycleIndex } from "../lib/lifecycle-index";
import { compactWorkbookSheetRaw } from "../lib/master-sheet-table";
import { roundNotionalCr, sumSheetTradeNotional } from "../lib/primary-book-notional";
import { filterValidMasterProducts } from "../lib/product-lifecycle";
import { parseMasterExplorerSheets, parseWorkbookBuffer } from "../lib/workbook/parser";

const ROOT = process.cwd();
const WORKBOOK = join(ROOT, "New Product Master_.xlsx");
const BACKUP = join(ROOT, "New Product Master_.backup.xlsx");
const OUT = join(ROOT, "lib", "data", "master-seed.json");
const GRIDS_OUT = join(ROOT, "lib", "data", "master-sheet-grids.json");
const MANIFEST_OUT = join(ROOT, "lib", "data", "canonical-manifest.json");

const file = readFileSync(WORKBOOK);
const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
const full = parseWorkbookBuffer(arrayBuffer, "New Product Master_.xlsx");
const explorer = parseMasterExplorerSheets(arrayBuffer, "New Product Master_.xlsx");

const validProducts = filterValidMasterProducts(full.products);
const newPrimarySheet = explorer.newPrimary ?? null;
const newPrimaryTabNotional = sumSheetTradeNotional(newPrimarySheet);
const lifecycleIndex = buildLifecycleIndex(validProducts, new Date(), { newPrimaryTabNotional });
const formulaCount = validProducts.filter((product) => product.formulaText?.trim()).length;
const protectedCall =
  validProducts.find((product) => product.isin === "INE804I07RK0") ??
  validProducts.find((product) => /protected call/i.test(product.name)) ??
  null;

const mergeSourcePath = existsSync(WORKBOOK) ? WORKBOOK : BACKUP;
const mergeBuf = readFileSync(mergeSourcePath);
const mergeArrayBuffer = mergeBuf.buffer.slice(
  mergeBuf.byteOffset,
  mergeBuf.byteOffset + mergeBuf.byteLength,
) as ArrayBuffer;
const { primary, rollover } = parseMasterExplorerSheets(mergeArrayBuffer);
const mergeReport =
  primary && rollover
    ? mergePrimaryAndRolloverSheets(primary, rollover).report
    : {
        primaryInputRows: explorer.primary?.rowCount ?? 0,
        rolloverInputRows: explorer.rollover?.rowCount ?? 0,
        mergedRowCount: explorer.newPrimary?.rowCount ?? 0,
        duplicatePhase2Removed: 0,
        byPhase: { blank: 0, tenyears: 0, phase1: 0, phase2: 0, other: 0 },
      };

const dataset: DashboardDataset = {
  workbookName: full.workbookName,
  loadedAt: full.loadedAt,
  products: full.products,
  categorySummaries: full.categorySummaries,
  validationIssues: full.validationIssues,
  formulaCatalog: [],
  sheets: [],
  hiddenDependencySheets: [],
};

const liveNotionalCr = roundNotionalCr(newPrimaryTabNotional);

const primarySummary = dataset.categorySummaries.find((summary) => summary.category === "Primary");
if (primarySummary && liveNotionalCr > 0) {
  primarySummary.liveNotional = liveNotionalCr * 1e7;
}

writeFileSync(OUT, JSON.stringify(dataset));
console.log(`Baked ${dataset.products.length} desk-canonical products to master-seed.json (NEW PRIMARY)`);
if (primarySummary && liveNotionalCr > 0) {
  console.log(`Headline liveNotional: ₹${liveNotionalCr} Cr (NEW PRIMARY tab Trade Amount sum)`);
}

console.log(
  `Desk book: ${dataset.categorySummaries.find((s) => s.category === "Primary")?.productCount} products`,
);

const grids = {
  workbookName: full.workbookName,
  loadedAt: full.loadedAt,
  sheets: {
    primary: explorer.primary ? compactWorkbookSheetRaw(explorer.primary) : null,
    rollover: explorer.rollover ? compactWorkbookSheetRaw(explorer.rollover) : null,
    newPrimary: explorer.newPrimary ? compactWorkbookSheetRaw(explorer.newPrimary) : null,
  },
};

writeFileSync(GRIDS_OUT, JSON.stringify(grids));
const primaryRows = grids.sheets.primary?.rowCount ?? 0;
const rolloverRows = grids.sheets.rollover?.rowCount ?? 0;
const newPrimaryRows = grids.sheets.newPrimary?.rowCount ?? 0;
console.log(
  `Baked explorer grids to master-sheet-grids.json · Primary ${primaryRows} · Rollover ${rolloverRows} · NEW PRIMARY ${newPrimaryRows} rows`,
);

const deskBookNotionalCr = roundNotionalCr(lifecycleIndex.headline.deskBookNotional);
const manifest = {
  generatedAt: new Date().toISOString(),
  workbookName: full.workbookName,
  deskCanonicalProducts: validProducts.length,
  deskCanonicalFormulas: formulaCount,
  liveNotionalCr,
  deskBookNotionalCr,
  protectedCallIsin: protectedCall?.isin ?? null,
  explorerGrids: {
    primaryRows,
    rolloverRows,
    newPrimaryRows,
  },
  merge: {
    totalRows: mergeReport.mergedRowCount,
    primaryInputRows: mergeReport.primaryInputRows,
    rolloverInputRows: mergeReport.rolloverInputRows,
    duplicatePhase2Removed: mergeReport.duplicatePhase2Removed,
    byPhase: mergeReport.byPhase,
  },
};

writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2));
console.log(
  `Baked canonical manifest · ${manifest.deskCanonicalProducts} desk products · Live ₹${manifest.liveNotionalCr} Cr (NEW PRIMARY tab) · Desk ₹${manifest.deskBookNotionalCr} Cr · NEW PRIMARY ${manifest.merge.totalRows} rows`,
);
