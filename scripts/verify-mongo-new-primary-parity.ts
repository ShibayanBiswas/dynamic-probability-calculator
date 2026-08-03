/**
 * Verify MongoDB + Intel explorer grids stay in sync with baked NEW PRIMARY.
 * Usage: npx tsx scripts/verify-mongo-new-primary-parity.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { closeMongoClient, pingMongo } from "../lib/db/mongo";
import { loadProductsFromMongo } from "../lib/db/sync-master";
import { loadMasterSheetsFromMongo } from "../lib/db/sync-master-sheets";
import { sumSheetTradeNotional } from "../lib/primary-book-notional";
import { filterValidMasterProducts } from "../lib/product-lifecycle";
import { loadMasterDatasetFromDisk } from "../lib/server/master-file";
import { loadMasterSheetGridsSeed } from "../lib/server/master-sheet-grids-seed";
import { loadSeedDataset } from "../lib/server/load-seed-dataset";

function loadDotEnvLocal() {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function hasRolloverCpHeader(headers: string[]) {
  return headers.some((header) => /rollover c\/?p date|rollover date/i.test(header));
}

async function main() {
  loadDotEnvLocal();

  const ping = await pingMongo();
  assert(ping.ok, `mongo ping failed: ${"reason" in ping ? ping.reason : ""}`);

  const seed = loadSeedDataset();
  const disk = loadMasterDatasetFromDisk();
  const grids = loadMasterSheetGridsSeed();
  const mongoProducts = await loadProductsFromMongo();
  const mongoSheets = await loadMasterSheetsFromMongo();

  assert(Boolean(seed?.products?.length), "seed missing");
  assert(Boolean(disk?.products?.length), "disk master missing");
  assert(Boolean(grids), "grids seed missing");
  assert(Boolean(mongoProducts?.length), "mongo products missing");
  assert(Boolean(mongoSheets), "mongo sheets missing");

  const seedCount = filterValidMasterProducts(seed.products).length;
  const diskCount = filterValidMasterProducts(disk.products).length;
  const mongoCount = mongoProducts!.length;

  console.log("=== Product count parity ===");
  console.log({ seed: seedCount, diskXlsx: diskCount, mongo: mongoCount });
  assert(seedCount === mongoCount, `seed ${seedCount} ≠ mongo ${mongoCount}`);
  assert(diskCount === mongoCount, `disk ${diskCount} ≠ mongo ${mongoCount}`);

  const seedIsins = new Set(
    seed.products.map((product) => product.isin?.toUpperCase()).filter(Boolean),
  );
  const mongoIsins = new Set(
    mongoProducts!.map((product) => product.isin?.toUpperCase()).filter(Boolean),
  );
  const missingInMongo = [...seedIsins].filter((isin) => !mongoIsins.has(isin));
  const extraInMongo = [...mongoIsins].filter((isin) => !seedIsins.has(isin));
  assert(missingInMongo.length === 0, `ISINs missing in mongo: ${missingInMongo.slice(0, 5).join(", ")}`);
  assert(extraInMongo.length === 0, `Extra ISINs in mongo: ${extraInMongo.slice(0, 5).join(", ")}`);

  const phaseNamed = mongoProducts!.filter((product) =>
    /\(ROLLOVER PHASE [12]\)/i.test(product.name),
  ).length;
  console.log("Mongo products with phase brackets:", phaseNamed);
  assert(phaseNamed > 0, "expected phase brackets on mongo product names");

  console.log("\n=== Intel explorer grid parity ===");
  const checks = [
    ["Primary", grids!.sheets.primary, mongoSheets!.sheets.primary],
    ["Rollover", grids!.sheets.rollover, mongoSheets!.sheets.rollover],
    ["NEW PRIMARY", grids!.sheets.newPrimary, mongoSheets!.sheets.newPrimary],
  ] as const;

  for (const [label, seedSheet, mongoSheet] of checks) {
    assert(Boolean(seedSheet && mongoSheet), `${label} missing seed or mongo sheet`);
    console.log(label, {
      seedRows: seedSheet!.rowCount,
      mongoRows: mongoSheet!.rowCount,
      seedCols: seedSheet!.columnCount,
      mongoCols: mongoSheet!.columnCount,
    });
    assert(seedSheet!.rowCount === mongoSheet!.rowCount, `${label} rowCount mismatch`);
    assert(seedSheet!.columnCount === mongoSheet!.columnCount, `${label} colCount mismatch`);
    assert(
      JSON.stringify(seedSheet!.headers) === JSON.stringify(mongoSheet!.headers),
      `${label} headers mismatch`,
    );
  }

  const primary = mongoSheets!.sheets.primary!;
  const rollover = mongoSheets!.sheets.rollover!;
  const newPrimary = mongoSheets!.sheets.newPrimary!;
  assert(hasRolloverCpHeader(primary.headers), "Primary mongo grid must have Rollover Date/C/P");
  assert(!hasRolloverCpHeader(rollover.headers), "Rollover mongo grid must NOT have Rollover Date/C/P");
  assert(hasRolloverCpHeader(newPrimary.headers), "NEW PRIMARY mongo grid must have Rollover Date/C/P");

  const cpIdx = newPrimary.headers.findIndex((header) =>
    /rollover c\/?p date|rollover date/i.test(header),
  );
  const phaseIdx = newPrimary.headers.findIndex((header) => /rollover phase/i.test(header));
  let badCp = 0;
  let tenYearFilled = 0;
  let tenYearTotal = 0;
  for (const row of newPrimary.rows) {
    const phase = String(row[phaseIdx] ?? "").toLowerCase();
    const cp = String(row[cpIdx] ?? "").trim();
    const is10 = phase.includes("10year");
    if (is10) {
      tenYearTotal += 1;
      if (cp) tenYearFilled += 1;
    } else if (cp && cp !== "—" && cp !== "-") {
      badCp += 1;
    }
  }
  console.log("\n=== Rollover C/P policy (mongo NEW PRIMARY) ===");
  console.log({ tenYearTotal, tenYearFilled, nonTenYearFilled: badCp });
  assert(badCp === 0, `non-10year rows have C/P dates: ${badCp}`);
  assert(tenYearFilled === tenYearTotal && tenYearTotal > 0, "10year C/P incomplete");

  const npSheet = disk!.sheets.find((sheet) => sheet.name === "NEW PRIMARY");
  const liveNotional = sumSheetTradeNotional(npSheet);
  console.log("\n=== Live notional (NEW PRIMARY tab) ===");
  console.log(`₹${(liveNotional / 1e7).toFixed(2)} Cr`);

  const monthIdx = newPrimary.headers.findIndex(
    (header) => header === "Month" || header === "Issue Month",
  );
  const late = newPrimary.rows.filter((row) =>
    /^(Aug|Sep|Oct|Nov|Dec) \/ 26$/.test(String(row[monthIdx] ?? "")),
  );
  const recent2026 = newPrimary.rows.filter((row) =>
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul) \/ 26$/.test(String(row[monthIdx] ?? "")),
  ).length;
  console.log("\n=== Month sanity ===", { recent2026, falseLate2026: late.length });
  assert(late.length === 0, `false late 2026 months: ${late.length}`);
  assert(recent2026 > 0, "expected 2026 issue-month products (Jan–Jul / 26)");

  console.log("\n=== ALL PARITY CHECKS PASSED ===");
  await closeMongoClient();
}

main().catch(async (error) => {
  console.error("FAIL:", error instanceof Error ? error.message : error);
  await closeMongoClient();
  process.exit(1);
});
