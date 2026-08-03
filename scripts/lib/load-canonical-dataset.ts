/**
 * Canonical desk book for regression scripts — matches cold-start app bootstrap
 * (`/data/master-seed.json`), NOT the trimmed local xlsx unless explicitly requested.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CANONICAL_MANIFEST } from "../../lib/canonical-manifest";
import { hydrateProductRolloverPhases } from "../../lib/product-dates";
import { hydrateProductDisplayNames } from "../../lib/product-display-name";
import { buildLifecycleIndex } from "../../lib/lifecycle-index";
import { filterValidMasterProducts } from "../../lib/product-lifecycle";
import type { ProductRecord } from "../../lib/types";
import { parseWorkbookBuffer } from "../../lib/workbook/parser";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const CANONICAL_SEED_PATH = join(REPO_ROOT, "lib/data/master-seed.json");
export const MASTER_XLSX_PATH = join(REPO_ROOT, "New Product Master_.xlsx");

export const EXPECTED_CANONICAL = {
  parsedProducts: CANONICAL_MANIFEST.deskCanonicalProducts,
  liveNotionalCr: CANONICAL_MANIFEST.liveNotionalCr,
  deskBookNotionalCr: CANONICAL_MANIFEST.deskBookNotionalCr ?? 0,
  protectedCallIsin: CANONICAL_MANIFEST.protectedCallIsin,
} as const;

export type DatasetSource = "seed" | "xlsx";

export function loadSeedProducts(): ProductRecord[] {
  if (!existsSync(CANONICAL_SEED_PATH)) {
    throw new Error(`Missing ${CANONICAL_SEED_PATH} — run: npm run bake`);
  }
  const seed = JSON.parse(readFileSync(CANONICAL_SEED_PATH, "utf8")) as { products: ProductRecord[] };
  hydrateProductRolloverPhases(seed.products);
  hydrateProductDisplayNames(seed.products);
  return seed.products;
}

/** App + regression default — baked seed (NEW PRIMARY desk canonical). */
export function loadCanonicalProducts(asOf = new Date()): ProductRecord[] {
  return filterValidMasterProducts(loadSeedProducts(), asOf);
}

/** Parse pipeline — local New Product Master_.xlsx (may differ from seed until rebaked). */
export function loadMasterWorkbookProducts(): ProductRecord[] {
  if (!existsSync(MASTER_XLSX_PATH)) {
    throw new Error(`Missing ${MASTER_XLSX_PATH}`);
  }
  const file = readFileSync(MASTER_XLSX_PATH);
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  return parseWorkbookBuffer(buf, "New Product Master_.xlsx").products;
}

export function warnIfWorkbookDriftsFromSeed(asOf = new Date()) {
  if (!existsSync(MASTER_XLSX_PATH) || !existsSync(CANONICAL_SEED_PATH)) return;

  const seedValid = loadCanonicalProducts(asOf);
  const xlsxValid = filterValidMasterProducts(loadMasterWorkbookProducts(), asOf);
  if (seedValid.length === xlsxValid.length) return;

  console.warn(
    `[canonical-dataset] Workbook valid count ${xlsxValid.length} ≠ seed ${seedValid.length}. ` +
      "Verify scripts use loadCanonicalProducts(); rebake seed after master upload.",
  );
}

export function assertCanonicalHeadline(asOf = new Date()) {
  if (!existsSync(CANONICAL_SEED_PATH)) {
    throw new Error(`Missing ${CANONICAL_SEED_PATH} — run: npm run bake`);
  }
  const seed = JSON.parse(readFileSync(CANONICAL_SEED_PATH, "utf8")) as {
    products: ProductRecord[];
    categorySummaries: Array<{ category: string; liveNotional?: number }>;
  };
  const products = filterValidMasterProducts(seed.products, asOf);
  const primaryTabNotional = seed.categorySummaries.find((s) => s.category === "Primary")?.liveNotional;
  const index = buildLifecycleIndex(products, asOf, { newPrimaryTabNotional: primaryTabNotional });
  const notionalCr = Math.round((index.headline.liveNotional / 1e7) * 100) / 100;

  if (products.length !== EXPECTED_CANONICAL.parsedProducts) {
    throw new Error(
      `Canonical product count ${products.length} ≠ manifest ${EXPECTED_CANONICAL.parsedProducts} — run npm run bake`,
    );
  }
  if (Math.abs(notionalCr - EXPECTED_CANONICAL.liveNotionalCr) > 0.05) {
    throw new Error(
      `Live Notional ₹${notionalCr} Cr ≠ manifest NEW PRIMARY tab ₹${EXPECTED_CANONICAL.liveNotionalCr} Cr — run npm run bake`,
    );
  }
  const deskCr = Math.round((index.headline.deskBookNotional / 1e7) * 100) / 100;
  if (
    EXPECTED_CANONICAL.deskBookNotionalCr > 0 &&
    Math.abs(deskCr - EXPECTED_CANONICAL.deskBookNotionalCr) > 0.05
  ) {
    throw new Error(
      `Desk book notional ₹${deskCr} Cr ≠ manifest ₹${EXPECTED_CANONICAL.deskBookNotionalCr} Cr — run npm run bake`,
    );
  }
  if (EXPECTED_CANONICAL.protectedCallIsin) {
    const protectedCall = products.find((p) => p.isin === EXPECTED_CANONICAL.protectedCallIsin);
    if (!protectedCall) {
      throw new Error(`Missing Protected Call anchor ISIN ${EXPECTED_CANONICAL.protectedCallIsin}`);
    }
  }
  if (index.validProducts.length !== products.length) {
    throw new Error(
      `Lifecycle index valid ${index.validProducts.length} ≠ filtered canonical ${products.length}`,
    );
  }

  return { products, index, notionalCr };
}
