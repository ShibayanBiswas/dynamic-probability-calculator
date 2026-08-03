import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  mergePrimaryAndRolloverSheets,
  monthColumnSortKey,
  pickCanonicalRowsForDesk,
  rolloverPhaseBucket,
} from "../lib/master/new-primary-merge";
import {
  verifyPhaseParity,
  verifyRolloverPhase2InPrimary,
} from "../lib/master/new-primary-export";
import { parseMasterExplorerSheets } from "../lib/workbook/parser";

const MASTER = join(process.cwd(), "New Product Master_.xlsx");
const BACKUP = join(process.cwd(), "New Product Master_.backup.xlsx");
const MANIFEST = join(process.cwd(), "lib/data/canonical-manifest.json");

function loadExpectedMerge() {
  if (!existsSync(MANIFEST)) {
    throw new Error("Missing canonical-manifest.json — run: npm run bake");
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
    merge: {
      totalRows: number;
      primaryInputRows: number;
      rolloverInputRows: number;
      duplicatePhase2Removed: number;
      byPhase: Record<string, number>;
    };
  };
  return manifest.merge;
}

function main() {
  if (!existsSync(MASTER)) {
    console.error("Master workbook not found");
    process.exit(1);
  }

  const EXPECTED = loadExpectedMerge();
  const sourcePath = existsSync(BACKUP) ? BACKUP : MASTER;
  const buf = readFileSync(sourcePath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { primary, rollover } = parseMasterExplorerSheets(arrayBuffer);
  if (!primary || !rollover) {
    console.error("Primary/Rollover sheets missing");
    process.exit(1);
  }

  const { rows, headers, report } = mergePrimaryAndRolloverSheets(primary, rollover);
  const primaryRows = primary.rows.map((row) => row.values.map((cell) => cell.formatted ?? cell.value ?? null));
  const rolloverRows = rollover.rows.map((row) => row.values.map((cell) => cell.formatted ?? cell.value ?? null));
  const byPhase = report.byPhase;
  const violations: string[] = [];

  const phaseParity = verifyPhaseParity(
    primary.headers,
    primaryRows,
    rollover.headers,
    rolloverRows,
    headers,
    rows,
  );
  violations.push(...phaseParity.violations);

  const phase2Coverage = verifyRolloverPhase2InPrimary(
    primary.headers,
    primaryRows,
    rollover.headers,
    rolloverRows,
  );
  if (phase2Coverage.missingFromPrimary.length) {
    violations.push(
      `Rollover Phase II ISINs missing from Primary: ${phase2Coverage.missingFromPrimary.join(", ")}`,
    );
  }

  const monthIdx = headers.findIndex((header) => header.trim() === "Month");
  if (monthIdx >= 0) {
    for (let index = 1; index < rows.length; index += 1) {
      const previous = monthColumnSortKey(rows[index - 1]![monthIdx]);
      const current = monthColumnSortKey(rows[index]![monthIdx]);
      if (previous > current) {
        violations.push(
          `NEW PRIMARY not sorted by Month ascending near row ${index + 1} (${String(rows[index - 1]![monthIdx])} → ${String(rows[index]![monthIdx])})`,
        );
        break;
      }
    }
  } else {
    violations.push("Month column missing — cannot verify NEW PRIMARY sort order");
  }

  if (rows.length !== EXPECTED.totalRows) {
    violations.push(`row count ${rows.length} ≠ manifest ${EXPECTED.totalRows} (run npm run bake)`);
  }
  if (report.primaryInputRows !== EXPECTED.primaryInputRows) {
    violations.push(`primary input ${report.primaryInputRows} ≠ manifest ${EXPECTED.primaryInputRows}`);
  }
  if (report.rolloverInputRows !== EXPECTED.rolloverInputRows) {
    violations.push(`rollover input ${report.rolloverInputRows} ≠ manifest ${EXPECTED.rolloverInputRows}`);
  }
  if (report.duplicatePhase2Removed !== EXPECTED.duplicatePhase2Removed) {
    violations.push(
      `duplicate Phase II removed ${report.duplicatePhase2Removed} ≠ manifest ${EXPECTED.duplicatePhase2Removed}`,
    );
  }

  for (const [bucket, expected] of Object.entries(EXPECTED.byPhase)) {
    const actual = byPhase[bucket as keyof typeof byPhase] ?? 0;
    if (actual !== expected) {
      violations.push(`${bucket}: ${actual} ≠ manifest ${expected}`);
    }
  }

  const grid = rows;
  const isinIdx = headers.findIndex((h) => h.trim() === "ISIN No.");
  let phaseIIWins = 0;
  const byIsin = new Map<string, unknown[][]>();
  for (const row of grid) {
    const isin = String(row[isinIdx] ?? "").trim().toUpperCase();
    if (!isin) continue;
    const list = byIsin.get(isin) ?? [];
    list.push(row);
    byIsin.set(isin, list);
  }

  for (const [, group] of byIsin) {
    if (group.length < 2) continue;
    const hasPhaseII = group.some((row) => rolloverPhaseBucket(row, headers) === "phase2");
    const hasPhaseI = group.some((row) => rolloverPhaseBucket(row, headers) === "phase1");
    if (hasPhaseII && hasPhaseI) phaseIIWins += 1;
  }

  const canonical = pickCanonicalRowsForDesk(headers, grid);

  if (violations.length) {
    console.error("verify-new-primary-merge: FAIL");
    for (const violation of violations) console.error(`  - ${violation}`);
    process.exit(1);
  }

  console.log("verify-new-primary-merge: PASS");
  console.log(`  Total NEW PRIMARY rows: ${rows.length}`);
  console.log(
    `  By phase: blank=${byPhase.blank} 10years=${byPhase.tenyears} Phase I=${byPhase.phase1} Phase II=${byPhase.phase2}`,
  );
  console.log(
    `  Phase parity — Phase I Primary+Rollover → NEW PRIMARY ${phaseParity.newPrimaryPhase1} (rollover P1 ${phaseParity.rolloverPhase1})`,
  );
  console.log(
    `  Phase parity — Primary 10yr ${phaseParity.primaryTenYears} = NEW PRIMARY 10yr ${phaseParity.newPrimaryTenYears}`,
  );
  console.log(
    `  Phase parity — Primary blank ${phaseParity.primaryBlank} = NEW PRIMARY blank ${phaseParity.newPrimaryBlank}`,
  );
  console.log(`  Desk canonical rows (unique ISIN): ${canonical.length}`);
  console.log(`  Phase II wins over Phase I (desk): ${phaseIIWins} ISIN groups`);
}

main();
