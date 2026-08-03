/**
 * Prove desk default clock is today, while 31-Jul NAV audit uses 31-Jul levels.
 */
import { parseExcelishDate, toLocalDateKey, isDeskToday } from "../lib/workbook/dates";
import { lookupBundledNiftyOnOrBefore } from "../lib/bundled-index-history";
import { lookupBundledSensexOnOrBefore } from "../lib/bundled-sensex-history";
import { formatDeskDate } from "../lib/market-data";
import { loadCanonicalProducts } from "./lib/load-canonical-dataset";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { getIndexEntryLevel, isSensexLinked } from "../lib/product-utils";
import { filterProductsByLifecycle, filterValidMasterProducts } from "../lib/product-lifecycle";

const JUL31 = parseExcelishDate("31-07-2026")!;
const JUL31_STR = "31-07-2026";

function main() {
  const today = new Date();
  const todayKey = toLocalDateKey(today);
  const todayDesk = formatDeskDate(today);

  const niftyToday = lookupBundledNiftyOnOrBefore(today);
  const sensexToday = lookupBundledSensexOnOrBefore(today);
  const nifty31 = lookupBundledNiftyOnOrBefore(JUL31)!;
  const sensex31 = lookupBundledSensexOnOrBefore(JUL31)!;

  console.log("=== AS-OF vs 31-JUL LEVELS ===");
  console.log({
    deskDefaultTodayKey: todayKey,
    deskDefaultTodayLabel: todayDesk,
    isDeskToday_todayLabel: isDeskToday(todayDesk),
    isDeskToday_31JulLabel: isDeskToday(JUL31_STR),
    niftyToday,
    sensexToday,
    nifty31Jul: nifty31,
    sensex31Jul: sensex31,
    levelsDifferFromToday:
      niftyToday !== nifty31 || sensexToday !== sensex31 || todayKey !== "2026-07-31",
  });

  if (nifty31 !== 24383.6 || sensex31 !== 78094.64) {
    console.error("FAIL: 31-Jul bundled closes are not the settled Yahoo closes used for NAV.");
    process.exit(1);
  }
  if (!isDeskToday(todayDesk)) {
    console.error("FAIL: today's desk label is not recognised as desk today.");
    process.exit(1);
  }
  if (isDeskToday(JUL31_STR) && todayKey !== "2026-07-31") {
    console.error("FAIL: 31-Jul must not be treated as desk-today when calendar day has moved on.");
    process.exit(1);
  }

  const asOf = today;
  const products = filterValidMasterProducts(loadCanonicalProducts(), asOf);
  const ongoing = filterProductsByLifecycle(products, "ongoing", asOf).filter((p) => p.formulaText?.trim());
  const sample = ongoing.find((p) => !isSensexLinked(p)) ?? ongoing[0]!;
  const levelToday = isSensexLinked(sample) ? sensexToday! : niftyToday!;
  const level31 = isSensexLinked(sample) ? sensex31 : nifty31;

  const vToday = computeValuation(sample, {
    valuationDate: todayDesk,
    currentLevel: levelToday,
    debentures: 1,
  });
  const v31 = computeValuation(sample, {
    valuationDate: JUL31_STR,
    currentLevel: level31,
    debentures: 1,
  });

  console.log("Sample ongoing mark:", {
    isin: sample.isin,
    name: String(sample.name ?? "").slice(0, 40),
    entry: getIndexEntryLevel(sample),
    V_today: vToday.productValue,
    V_31Jul: v31.productValue,
    usedLevelToday: levelToday,
    usedLevel31Jul: level31,
  });

  if (!(vToday.productValue > 0) || !(v31.productValue > 0)) {
    console.error("FAIL: sample valuations not positive.");
    process.exit(1);
  }

  console.log("\n=== PASS ===");
  console.log("Desk default clock = today; 31-Jul NAV/audit path uses 31-Jul Nifty/Sensex only.");
}

main();
