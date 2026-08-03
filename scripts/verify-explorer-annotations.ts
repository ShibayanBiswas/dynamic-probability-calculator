/**
 * Verify Intel explorer annotation filtering + full reference column parity
 * on Primary / Rollover / NEW PRIMARY grids.
 *
 * Usage: npx tsx scripts/verify-explorer-annotations.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  filterCanonicalExplorerRows,
  isSparseMasterExplorerRow,
} from "../lib/master-book-filter";
import {
  explorerTableForSheet,
  explorerTableForSheetRaw,
  type MasterSheetTab,
} from "../lib/master-sheet-table";
import { loadMasterSheetGridsSeed } from "../lib/server/master-sheet-grids-seed";
import { parseMasterExplorerSheets } from "../lib/workbook/parser";
import { formatNumber } from "../lib/utils";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = join(ROOT, "New Product Master_.xlsx");

const EXPECTED_COLS: Record<MasterSheetTab, number> = {
  Primary: 38,
  Rollover: 37,
  "NEW PRIMARY": 38,
};

function assert(ok: boolean, msg: string, fails: string[]) {
  if (!ok) fails.push(msg);
}

function main() {
  const fails: string[] = [];

  if (!existsSync(MASTER)) {
    console.error(`Master workbook not found: ${MASTER}`);
    process.exit(1);
  }

  const file = readFileSync(MASTER);
  const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  const parsed = parseMasterExplorerSheets(buf);
  const seed = loadMasterSheetGridsSeed();

  let totalHidden = 0;

  for (const tab of ["Primary", "Rollover", "NEW PRIMARY"] as const) {
    const sheet =
      tab === "Primary" ? parsed.primary : tab === "Rollover" ? parsed.rollover : parsed.newPrimary;
    if (!sheet) {
      fails.push(`${tab}: sheet missing from disk master`);
      console.log(`${tab}: sheet missing`);
      continue;
    }

    const rawTable = explorerTableForSheetRaw(sheet, tab);
    const alignedTable = explorerTableForSheet(sheet, tab);
    const filtered = filterCanonicalExplorerRows(alignedTable.rows);
    totalHidden += filtered.hiddenCount;

    const protectedLeaks = filtered.rows.filter((row) => isSparseMasterExplorerRow(row));
    const expected = EXPECTED_COLS[tab];
    const couponCol = rawTable.columns.find((c) => c.sourceHeader === "Coupon / PR / DM");
    const tradeDateCols = rawTable.columns.filter((c) => c.sourceHeader === "Trade Date/Opening date");
    const poedCol = rawTable.columns.find((c) => c.sourceHeader === "POED");

    console.log(`\n=== ${tab} ===`);
    console.log(`  Raw rows:        ${formatNumber(rawTable.rows.length)}`);
    console.log(`  Explorer cols:   ${formatNumber(rawTable.columns.length)} (expected ${expected})`);
    console.log(`  Canonical rows:  ${formatNumber(filtered.rows.length)}`);
    console.log(`  Hidden notes:    ${formatNumber(filtered.hiddenCount)}`);
    console.log(`  Annotation leak: ${protectedLeaks.length}`);
    console.log(
      `  Coupon / PR / DM: ${couponCol ? `yes (numeric=${couponCol.numeric})` : "MISSING"} · Trade Date cols: ${tradeDateCols.length} · POED isDate=${poedCol?.isDate ?? false}`,
    );

    assert(rawTable.columns.length === expected, `${tab}: expected ${expected} columns, got ${rawTable.columns.length}`, fails);
    assert(Boolean(couponCol), `${tab}: missing Coupon / PR / DM column`, fails);
    assert(couponCol?.numeric === false, `${tab}: Coupon / PR / DM must not be numeric`, fails);
    assert(tradeDateCols.length === 1, `${tab}: expected exactly 1 Trade Date column, got ${tradeDateCols.length}`, fails);
    assert(poedCol?.isDate === true, `${tab}: POED should be a date column`, fails);
    assert(protectedLeaks.length === 0, `${tab}: ${protectedLeaks.length} annotation leaks`, fails);

    if (protectedLeaks.length > 0) {
      console.log("  Sample leaks:");
      for (const row of protectedLeaks.slice(0, 5)) {
        const name = String(row["Name on Signup Form"] ?? "").trim();
        const formula = String(row.Formulae ?? "").trim();
        console.log(`    · ${name || formula.slice(0, 72)}`);
      }
    }

    if (seed) {
      const seedSheet =
        tab === "Primary"
          ? seed.sheets.primary
          : tab === "Rollover"
            ? seed.sheets.rollover
            : seed.sheets.newPrimary;
      assert(Boolean(seedSheet), `${tab}: missing from baked master-sheet-grids.json`, fails);
      if (seedSheet) {
        assert(
          seedSheet.headers.length === expected,
          `${tab}: seed grids expected ${expected} cols, got ${seedSheet.headers.length}`,
          fails,
        );
        assert(
          seedSheet.headers.includes("Coupon / PR / DM"),
          `${tab}: seed grids missing Coupon / PR / DM`,
          fails,
        );
        console.log(`  Seed grids:      ${seedSheet.rowCount} rows · ${seedSheet.headers.length} cols`);
      }
    } else {
      fails.push("master-sheet-grids.json seed unavailable");
    }
  }

  if (fails.length) {
    console.error("\nFAIL:");
    for (const fail of fails) console.error(`  - ${fail}`);
    process.exit(1);
  }

  console.log(
    totalHidden > 0
      ? "\nExplorer annotation filter OK · column parity OK."
      : "\nColumn parity OK (no annotations hidden — check master if unexpected).",
  );
}

main();
