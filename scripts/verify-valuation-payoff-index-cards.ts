/**
 * Thorough desk checks for Valuation/Payoff index levels + Mongo/bundled parity.
 * Usage: npx tsx scripts/verify-valuation-payoff-index-cards.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { closeMongoClient, COLLECTIONS, getMongoDb, isMongoConfigured } from "../lib/db/mongo";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { resolveDeskIndexLevels, resolveDeskIndexLevelsForDate } from "../lib/desk-index-levels";
import { hasProductIndexSource, hasResolvedDeskIndexLevel } from "../lib/desk-index-guards";
import { hasCompleteIndexLevels } from "../lib/desk-index-state";
import { fetchLiveMarketLevels } from "../lib/market-data";
import {
  getIndexEntryLevel,
  getProductIndexFieldLabel,
  isSensexLinked,
  resolveLiveIndexLevel,
  resolveValuationLevel,
} from "../lib/product-utils";
import { getUnderlyingKind } from "../lib/underlying-benchmark";
import { getProductLifecycleStatus } from "../lib/product-lifecycle";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { buildEnhancedPayoffScenarioTable } from "../lib/workbook/payoff-pivots";
import { payoffInputsFromDesk } from "../lib/workbook/payoff-scenarios";
import { formatDeskDate } from "../lib/market-data";
import { loadCanonicalProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

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

function deskDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  loadDotEnvLocal();
  warnIfWorkbookDriftsFromSeed();
  const products = loadCanonicalProducts();
  assert(products.length > 0, "No products loaded");

  const failures: string[] = [];
  const pass = (name: string) => console.log(`  PASS  ${name}`);
  const fail = (name: string, detail: string) => {
    failures.push(`${name}: ${detail}`);
    console.log(`  FAIL  ${name} — ${detail}`);
  };

  console.log("\n=== 1. Live market levels API path ===");
  const live = await fetchLiveMarketLevels();
  console.log(
    `  source=${live.source} Nifty=${live.niftyLevel} Sensex=${live.sensexLevel} date=${live.valuationDate}`,
  );
  if (!hasCompleteIndexLevels(live)) {
    fail("live-complete", `incomplete levels ${JSON.stringify(live)}`);
  } else if (!(live.niftyLevel > 20000 && live.niftyLevel < 40000)) {
    fail("live-nifty-range", `Nifty ${live.niftyLevel} outside expected band`);
  } else if (!(live.sensexLevel > 50000 && live.sensexLevel < 120000)) {
    fail("live-sensex-range", `Sensex ${live.sensexLevel} outside expected band`);
  } else {
    pass("live market levels complete & in-band");
  }

  console.log("\n=== 2. Bundled history + resolveDeskIndexLevels ===");
  const jul28 = deskDate("2026-07-28");
  const bn = lookupBundledNiftyOnOrBefore(jul28);
  const bs = lookupBundledSensexOnOrBefore(jul28);
  if (bn == null || Math.abs(bn - 23985.35) > 0.06) {
    fail("bundled-jul28-nifty", `expected 23985.35 got ${bn}`);
  } else {
    pass("bundled Nifty 2026-07-28 = 23985.35");
  }
  if (bs == null || Math.abs(bs - 76765.92) > 0.06) {
    fail("bundled-jul28-sensex", `expected 76765.92 got ${bs}`);
  } else {
    pass("bundled Sensex 2026-07-28 = 76765.92");
  }

  const filled = resolveDeskIndexLevels({}, jul28);
  if (filled.niftyLevel == null || filled.sensexLevel == null) {
    fail("desk-fill-both", JSON.stringify(filled));
  } else if (Math.abs(filled.niftyLevel - 23985.35) > 0.06 || Math.abs(filled.sensexLevel - 76765.92) > 0.06) {
    fail("desk-fill-values", JSON.stringify(filled));
  } else {
    pass("resolveDeskIndexLevels fills both legs from bundled");
  }

  const hist = resolveDeskIndexLevelsForDate({}, "28-07-2026");
  if (
    hist.niftyLevel == null ||
    hist.sensexLevel == null ||
    Math.abs(hist.niftyLevel - 23985.35) > 0.06
  ) {
    fail("desk-fill-for-date", JSON.stringify(hist));
  } else {
    pass("resolveDeskIndexLevelsForDate(28-07-2026)");
  }

  // Stale forward-fill guard
  if (bn != null && Math.abs(bn - 24208.55) < 0.01) {
    fail("stale-guard", "bundled still has stale 24208.55");
  } else {
    pass("stale 24208.55 forward-fill absent");
  }

  console.log("\n=== 3. Mongo index_prices parity (settled days) ===");
  if (!isMongoConfigured()) {
    fail("mongo-config", "MONGODB_URI not set");
  } else {
    const db = await getMongoDb();
    if (!db) {
      fail("mongo-db", "unavailable");
    } else {
      const col = db.collection(COLLECTIONS.indexPrices);
      for (const [date, nifty, sensex] of [
        ["2026-07-28", 23985.35, 76765.92],
        ["2026-07-29", 24250.2, 77654.6],
        ["2026-07-27", 23995.95, 76835.78],
      ] as const) {
        const row = await col.findOne({ date });
        if (!row) {
          fail(`mongo-${date}`, "missing row");
        } else if (
          Math.abs(Number(row.nifty) - nifty) > 0.06 ||
          Math.abs(Number(row.sensex) - sensex) > 0.06
        ) {
          fail(`mongo-${date}`, `got Nifty ${row.nifty} Sensex ${row.sensex}`);
        } else {
          pass(`Mongo ${date} Nifty ${nifty} / Sensex ${sensex}`);
        }
      }
      const today = await col.findOne({ date: "2026-07-30" });
      if (!today || !(Number(today.nifty) > 24000) || !(Number(today.sensex) > 77000)) {
        fail("mongo-today", JSON.stringify(today));
      } else {
        pass(`Mongo 2026-07-30 live bar Nifty ${today.nifty} Sensex ${today.sensex}`);
      }
    }
  }

  console.log("\n=== 4. Valuation/Payoff card resolveLiveIndexLevel ===");
  const ongoing = products.filter((p) => getProductLifecycleStatus(p) === "ongoing");
  const niftyProduct = ongoing.find((p) => getUnderlyingKind(p) === "nifty");
  const sensexProduct = ongoing.find((p) => getUnderlyingKind(p) === "sensex");
  assert(niftyProduct != null, "Need an ongoing Nifty product");
  assert(sensexProduct != null, "Need an ongoing Sensex product");

  const levels = {
    niftyLevel: live.niftyLevel,
    sensexLevel: live.sensexLevel,
  };

  const niftyResolved = resolveLiveIndexLevel(niftyProduct!, levels);
  const sensexResolved = resolveLiveIndexLevel(sensexProduct!, levels);
  if (Math.abs(niftyResolved - live.niftyLevel) > 0.01) {
    fail("card-nifty-resolve", `got ${niftyResolved} expected ${live.niftyLevel}`);
  } else {
    pass(
      `Nifty card (${niftyProduct!.name.slice(0, 40)}) → ${niftyResolved} [label=${getProductIndexFieldLabel(niftyProduct!)}]`,
    );
  }
  if (Math.abs(sensexResolved - live.sensexLevel) > 0.01) {
    fail("card-sensex-resolve", `got ${sensexResolved} expected ${live.sensexLevel}`);
  } else {
    pass(
      `Sensex card (${sensexProduct!.name.slice(0, 40)}) → ${sensexResolved} [label=${getProductIndexFieldLabel(sensexProduct!)}]`,
    );
  }

  // Cross-wire guard: Sensex product must NOT pick Nifty when both present
  if (isSensexLinked(sensexProduct!) && Math.abs(sensexResolved - live.niftyLevel) < 0.01) {
    fail("cross-wire", "Sensex product resolved to Nifty level");
  } else {
    pass("no Nifty/Sensex cross-wire on Sensex product");
  }

  if (!hasProductIndexSource(niftyProduct, levels.niftyLevel, levels.sensexLevel)) {
    fail("source-nifty", "hasProductIndexSource false for Nifty");
  } else {
    pass("hasProductIndexSource(Nifty)");
  }
  if (!hasProductIndexSource(sensexProduct, levels.niftyLevel, levels.sensexLevel)) {
    fail("source-sensex", "hasProductIndexSource false for Sensex");
  } else {
    pass("hasProductIndexSource(Sensex)");
  }

  // Guard: Sensex product with only Nifty filled must fail source check
  if (hasProductIndexSource(sensexProduct, levels.niftyLevel, undefined)) {
    fail("sensex-needs-sensex", "Sensex product accepted Nifty-only levels");
  } else {
    pass("Sensex product rejects Nifty-only source");
  }

  const todayDesk = formatDeskDate(new Date());
  if (
    !hasResolvedDeskIndexLevel(niftyProduct, false, todayDesk, {
      marketStatus: "ready",
      selectionNifty: levels.niftyLevel,
      selectionSensex: levels.sensexLevel,
      marketNifty: levels.niftyLevel,
      marketSensex: levels.sensexLevel,
    })
  ) {
    fail("guard-nifty-today", "hasResolvedDeskIndexLevel false");
  } else {
    pass("hasResolvedDeskIndexLevel(Nifty, today)");
  }
  if (
    !hasResolvedDeskIndexLevel(sensexProduct, false, todayDesk, {
      marketStatus: "ready",
      selectionNifty: levels.niftyLevel,
      selectionSensex: levels.sensexLevel,
      marketNifty: levels.niftyLevel,
      marketSensex: levels.sensexLevel,
    })
  ) {
    fail("guard-sensex-today", "hasResolvedDeskIndexLevel false");
  } else {
    pass("hasResolvedDeskIndexLevel(Sensex, today)");
  }

  console.log("\n=== 5. computeValuation with live card levels ===");
  const niftyVal = computeValuation(niftyProduct!, {
    valuationDate: todayDesk,
    currentLevel: niftyResolved,
    debentures: 100,
  });
  const sensexVal = computeValuation(sensexProduct!, {
    valuationDate: todayDesk,
    currentLevel: sensexResolved,
    debentures: 100,
  });
  if (!(niftyVal.currentLevel > 0) || Math.abs(niftyVal.currentLevel - niftyResolved) > 0.01) {
    fail("val-nifty-level", `currentLevel=${niftyVal.currentLevel}`);
  } else {
    pass(
      `Valuation Nifty currentLevel=${niftyVal.currentLevel} Z=${(niftyVal.z * 100).toFixed(2)}% PV=${niftyVal.productValue.toFixed(2)}`,
    );
  }
  if (!(sensexVal.currentLevel > 0) || Math.abs(sensexVal.currentLevel - sensexResolved) > 0.01) {
    fail("val-sensex-level", `currentLevel=${sensexVal.currentLevel}`);
  } else {
    pass(
      `Valuation Sensex currentLevel=${sensexVal.currentLevel} Z=${(sensexVal.z * 100).toFixed(2)}% PV=${sensexVal.productValue.toFixed(2)}`,
    );
  }

  console.log("\n=== 6. Payoff scenario table from live levels ===");
  for (const [label, product, level] of [
    ["Nifty", niftyProduct!, niftyResolved],
    ["Sensex", sensexProduct!, sensexResolved],
  ] as const) {
    const entry = getIndexEntryLevel(product);
    const desk = payoffInputsFromDesk(product, {
      entryLevel: entry,
      currentLevel: level,
      valuationDate: todayDesk,
      debentures: 100,
    });
    const rows = buildEnhancedPayoffScenarioTable(product, desk);
    if (rows.length < 5) {
      fail(`payoff-${label}-rows`, `only ${rows.length} rows`);
    } else {
      const current = rows.find((r) => r.isCurrent);
      pass(
        `Payoff ${label}: ${rows.length} scenarios, current=${current ? `${(current.performance * 100).toFixed(1)}%` : "none"}, entry=${entry}`,
      );
    }
  }

  console.log("\n=== 7. Sample book scan — resolve never returns entry when live present ===");
  let scanned = 0;
  let bad = 0;
  for (const p of ongoing.slice(0, 200)) {
    const kind = getUnderlyingKind(p);
    if (kind === "custom") continue;
    scanned += 1;
    const resolved = resolveLiveIndexLevel(p, levels);
    const expected = kind === "sensex" ? levels.sensexLevel : levels.niftyLevel;
    if (Math.abs(resolved - expected) > 0.01) {
      bad += 1;
      if (bad <= 5) {
        console.log(`    mismatch ${p.name}: got ${resolved} expected ${expected} kind=${kind}`);
      }
    }
  }
  if (bad > 0) {
    fail("book-scan", `${bad}/${scanned} mismatches`);
  } else {
    pass(`book scan ${scanned} Nifty/Sensex ongoing products resolve correctly`);
  }

  console.log("\n=== 8. Historical valuation level (Jul-28) ===");
  const histLevels = { niftyLevel: 23985.35, sensexLevel: 76765.92 };
  const histNifty = resolveValuationLevel(niftyProduct!, histLevels);
  const histSensex = resolveValuationLevel(sensexProduct!, histLevels);
  if (Math.abs(histNifty - 23985.35) > 0.01) fail("hist-nifty", String(histNifty));
  else pass(`Historical Nifty mark 23985.35 → ${histNifty}`);
  if (Math.abs(histSensex - 76765.92) > 0.01) fail("hist-sensex", String(histSensex));
  else pass(`Historical Sensex mark 76765.92 → ${histSensex}`);

  console.log("\n=== SUMMARY ===");
  if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} check(s)`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log("PASS: Valuation/Payoff index cards + Mongo/bundled levels");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoClient();
  });
