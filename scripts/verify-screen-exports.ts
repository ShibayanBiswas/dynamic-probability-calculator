/**
 * Verifies desk screen export payloads mirror on-screen sections.
 * Usage: npx tsx scripts/verify-screen-exports.ts
 */
import { PORTFOLIO_OBS_COLUMN_LABELS } from "../lib/portfolio-observation-columns";
import {
  PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL,
  PORTFOLIO_OBS_COUNT_COLUMN_LABELS,
  PORTFOLIO_OBS_LEVEL_COLUMN_LABELS,
  PORTFOLIO_PASSED_OBS_COLUMN_LABEL,
  PORTFOLIO_REMAINING_OBS_COLUMN_LABEL,
  PORTFOLIO_TOTAL_OBS_COLUMN_LABEL,
  computeObservationScheduleMetrics,
} from "../lib/portfolio-observation-metrics";
import { formatDeskDate } from "../lib/market-data";
import {
  getProductLifecycleStatus,
  isValuationApplicableAt,
  LIFECYCLE_FILTERS,
} from "../lib/product-lifecycle";
import { computeValuation } from "../lib/workbook/valuation-engine";
import { getIndexEntryLevel } from "../lib/product-utils";
import {
  lifecyclePortfolioColumnLabels,
  PORTFOLIO_DAYS_COLUMN_LABEL,
  PORTFOLIO_EXPIRED_DAYS_COLUMN_LABEL,
  PORTFOLIO_LAST_OBS_COLUMN_LABEL,
  valuationMetricLabels,
} from "../lib/valuation-labels";
import { getExpiredMarkDeskDate } from "../lib/expired-mark";
import {
  buildDeskExportInputs,
  buildLifecycleExportRows,
  buildObservationExportTable,
  buildPayoffExportFootnotes,
  buildScreenSpecExportRows,
  buildValuationDateDisplays,
  buildValuationOutputSheetRows,
} from "../lib/workbook/build-screen-export-payload";
import { PORTFOLIO_EXPORT_COLUMNS } from "../lib/workbook/export-products";
import { PRODUCT_SPECIFICATION_LABELS } from "../lib/product-specifications";
import {
  EXPIRED_PORTFOLIO_LIFECYCLE_HEADERS,
  EXPIRED_PORTFOLIO_LIFECYCLE_TABLE_COLUMN_COUNT,
  LIVE_PORTFOLIO_LIFECYCLE_HEADERS,
  PORTFOLIO_AVG_COLUMN_LABELS,
  portfolioLifecycleColumnDefs,
  portfolioLifecycleExportRow,
  portfolioLifecycleTableHeaders,
  PORTFOLIO_LIFECYCLE_COLUMN_DEFS,
  PORTFOLIO_LIFECYCLE_TABLE_COLUMN_COUNT,
} from "../lib/portfolio-lifecycle-columns";
import {
  formatProductRolloverPhaseLabel,
  formatProductRolloverScheduleDate,
  getDaysLeftToMaturity,
  getProductAllotmentDate,
  getProductObservationDates,
  getProductTenorDays,
  getProductTradeOpeningDate,
  getRolloverTenorDays,
  getWorkingAllotmentDate,
  isPhase2RolloverProduct,
  isTenYearRolloverProduct,
} from "../lib/product-dates";
import { parseExcelishDate } from "../lib/workbook/dates";
import { formatNumber } from "../lib/utils";
import { buildValuationExpirationMaturityRows } from "../lib/valuation-output-fields";
import { buildPayoffCurve } from "../lib/workbook/formula-engine";
import { buildEnhancedPayoffScenarioTable } from "../lib/workbook/payoff-pivots";
import { payoffInputsFromDesk } from "../lib/workbook/payoff-scenarios";
import { loadCanonicalProducts, warnIfWorkbookDriftsFromSeed } from "./lib/load-canonical-dataset";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function main() {
  warnIfWorkbookDriftsFromSeed();
  const products = loadCanonicalProducts();
  assert(products.length > 0, "No products loaded");

  const ongoing = products.find((p) => getProductLifecycleStatus(p) === "ongoing");
  const expired = products.find((p) => getProductLifecycleStatus(p) === "expired");
  assert(ongoing != null, "Need at least one ongoing product");
  assert(expired != null, "Need at least one expired product");

  // Live portfolio columns: yellow DATA + Initial/Current Prob + obs levels + Effective Target.
  const EXPECTED_LIVE_PORTFOLIO_HEADERS = [
    "No.",
    "Status",
    "Product Name",
    "Initial Prob",
    "Current Prob",
    "Series",
    "Tenor",
    "Allotment Date",
    "Actual Entry Level",
    "Target Level",
    ...PORTFOLIO_AVG_COLUMN_LABELS,
    "Amount",
    "Maturity",
    "ISIN",
    PORTFOLIO_DAYS_COLUMN_LABEL,
    "Tenor Left",
    "Years",
    ...PORTFOLIO_OBS_LEVEL_COLUMN_LABELS,
    ...PORTFOLIO_OBS_COUNT_COLUMN_LABELS,
    PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL,
  ] as const;

  assert(
    LIVE_PORTFOLIO_LIFECYCLE_HEADERS.length === EXPECTED_LIVE_PORTFOLIO_HEADERS.length,
    `Portfolio column count ${LIVE_PORTFOLIO_LIFECYCLE_HEADERS.length} !== ${EXPECTED_LIVE_PORTFOLIO_HEADERS.length}`,
  );
  for (let i = 0; i < EXPECTED_LIVE_PORTFOLIO_HEADERS.length; i++) {
    const expected = EXPECTED_LIVE_PORTFOLIO_HEADERS[i]!;
    const actual = LIVE_PORTFOLIO_LIFECYCLE_HEADERS[i];
    assert(
      actual === expected,
      `Portfolio column ${i + 1}: expected "${expected}", got "${actual ?? "(missing)"}"`,
    );
  }
  assert(
    PORTFOLIO_EXPORT_COLUMNS.length === LIVE_PORTFOLIO_LIFECYCLE_HEADERS.length,
    "Export columns and UI headers diverged in length",
  );
  for (let i = 0; i < LIVE_PORTFOLIO_LIFECYCLE_HEADERS.length; i++) {
    assert(
      PORTFOLIO_EXPORT_COLUMNS[i] === LIVE_PORTFOLIO_LIFECYCLE_HEADERS[i],
      `Export column ${i + 1} out of sync with UI`,
    );
  }
  assert(PORTFOLIO_LIFECYCLE_TABLE_COLUMN_COUNT === 34, "Live portfolio table should have 34 columns");
  assert(PORTFOLIO_LIFECYCLE_COLUMN_DEFS.length === 20, "Live column spec should have 20 slots");
  assert(EXPIRED_PORTFOLIO_LIFECYCLE_TABLE_COLUMN_COUNT === 34, "Expired portfolio table should have 34 columns");
  assert(portfolioLifecycleColumnDefs("expired").length === 20, "Expired column spec should have 20 slots");

  for (const filter of LIFECYCLE_FILTERS) {
    const headers = portfolioLifecycleTableHeaders(lifecyclePortfolioColumnLabels(filter), filter);
    const expectedCount =
      filter === "expired" ? EXPIRED_PORTFOLIO_LIFECYCLE_TABLE_COLUMN_COUNT : PORTFOLIO_LIFECYCLE_TABLE_COLUMN_COUNT;
    assert(
      headers.length === expectedCount,
      `Filter "${filter}" column count ${headers.length} !== ${expectedCount}`,
    );
    assert(headers.includes(PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL), `${filter} missing Effective Target`);
    if (filter !== "expired") {
      assert(headers.includes(PORTFOLIO_DAYS_COLUMN_LABEL), `${filter} missing Days Left`);
    } else {
      assert(headers.includes(PORTFOLIO_EXPIRED_DAYS_COLUMN_LABEL), `${filter} missing Days Since Expiry`);
    }
  }

  assert(PORTFOLIO_EXPORT_COLUMNS.includes("Series"), "Portfolio export missing Series column");
  assert(PORTFOLIO_EXPORT_COLUMNS.includes("Initial Prob"), "Portfolio export missing Initial Prob column");
  assert(PORTFOLIO_EXPORT_COLUMNS.includes("Current Prob"), "Portfolio export missing Current Prob column");
  assert(
    PORTFOLIO_EXPORT_COLUMNS.includes(PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL),
    "Portfolio export missing Effective Target column",
  );
  for (const label of PORTFOLIO_AVG_COLUMN_LABELS) {
    assert(PORTFOLIO_EXPORT_COLUMNS.includes(label), `Portfolio export missing ${label}`);
  }
  for (const label of PORTFOLIO_OBS_LEVEL_COLUMN_LABELS) {
    assert(PORTFOLIO_EXPORT_COLUMNS.includes(label), `Portfolio export missing ${label}`);
  }

  const valuationDate = "15/03/2024";
  const asOf = parseExcelishDate(valuationDate) ?? new Date();

  const phaseSample = products.find((p) => p.rolloverPhase === "Phase II");
  const plainSample = products.find((p) => !p.rolloverPhase && p.lastObservationDateRaw);
  assert(phaseSample != null, "Need a Phase II product for rollover column mapping");
  assert(plainSample != null, "Need a non-rollover product for rollover column mapping");
  const blankSnapshot = {
    valuationDate: "",
    value: null,
    totalAmount: null,
    absReturn: null,
    couponFormed: null,
    productIrr: null,
  };
  assert(
    formatProductRolloverPhaseLabel(phaseSample) === "Phase 2",
    "Rollover Phase should surface master Phase II as Phase 2",
  );

  const tenYearSample = products.find((p) => p.rolloverPhase === "10years");
  assert(tenYearSample != null, "Need a 10years product for rollover phase label");
  assert(
    formatProductRolloverPhaseLabel(tenYearSample) === "10 Years",
    "10years master phase should display as 10 Years",
  );

  const phase1Sample = products.find((p) => p.rolloverPhase === "Phase I");
  assert(phase1Sample != null, "Need a Phase I product for rollover phase label");
  assert(
    /\(ROLLOVER PHASE 1\)$/i.test(phase1Sample.name),
    `Phase I product name should include (ROLLOVER PHASE 1), got: ${phase1Sample.name}`,
  );
  assert(
    formatProductRolloverPhaseLabel(phase1Sample) === "Phase 1",
    "Phase I master phase should display as Phase 1",
  );

  const staleTenYear = products.find((p) => p.isin === "INE504H07FR8");
  assert(staleTenYear != null, "Need INE504H07FR8 for stale rollover phase inference");
  const staleProduct = {
    ...staleTenYear,
    rolloverPhase: undefined,
    raw: Object.fromEntries(
      Object.entries(staleTenYear.raw ?? {}).filter(([key]) => key !== "Rollover Phase"),
    ),
  };
  assert(
    formatProductRolloverPhaseLabel(staleProduct) === "10 Years",
    "10-year deal with Rollover C/P must infer 10 Years when phase column missing from cache",
  );
  assert(
    !formatProductRolloverScheduleDate(plainSample),
    "Rollover Date must stay blank when Rollover C/P Date is absent (no Last Obs fallback)",
  );

  // Probability desk export still includes Initial/Current Prob + Effective Target.
  const sampleExport = portfolioLifecycleExportRow({
    index: 0,
    product: ongoing!,
    snapshot: blankSnapshot,
    labels: lifecyclePortfolioColumnLabels("ongoing"),
    asOf,
    badgeFilter: "ongoing",
  });
  assert("Initial Prob" in sampleExport, "Export missing Initial Prob");
  assert("Current Prob" in sampleExport, "Export missing Current Prob");
  assert(PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL in sampleExport, "Export missing Effective Target");

  const expiredHeaders = portfolioLifecycleTableHeaders(lifecyclePortfolioColumnLabels("expired"), "expired");
  assert(
    expiredHeaders.includes(PORTFOLIO_EXPIRED_DAYS_COLUMN_LABEL),
    "Expired portfolio export must use Days Since Expiry column",
  );
  assert(
    !expiredHeaders.includes(PORTFOLIO_DAYS_COLUMN_LABEL),
    "Expired portfolio export must not use Days Left to Expiry column",
  );
  assert(
    expiredHeaders.includes(PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL),
    "Expired portfolio should keep Effective Target with observation metrics",
  );
  assert(
    expiredHeaders.length === EXPIRED_PORTFOLIO_LIFECYCLE_HEADERS.length,
    "Expired headers helper length mismatch",
  );
  const expiredSample = products.find((p) => getProductLifecycleStatus(p) === "expired");
  assert(expiredSample != null, "Need expired product for column mapping");
  const expiredRow = portfolioLifecycleExportRow({
    index: 0,
    product: expiredSample,
    snapshot: blankSnapshot,
    labels: lifecyclePortfolioColumnLabels("expired"),
    asOf,
    badgeFilter: "expired",
  });
  assert(
    expiredRow[PORTFOLIO_EXPIRED_DAYS_COLUMN_LABEL] !== "",
    "Expired tab must populate Days Since Expiry",
  );
  assert(
    PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL in expiredRow,
    "Expired export should include Effective Target key",
  );

  const labels = valuationMetricLabels(false, valuationDate, ongoing);
  const dates = buildValuationDateDisplays(ongoing);
  const productTenor = getProductTenorDays(ongoing, asOf);
  const rolloverTenor = isTenYearRolloverProduct(ongoing) ? getRolloverTenorDays(ongoing) : undefined;
  const entry = getIndexEntryLevel(ongoing);
  const valuation = computeValuation(ongoing, {
    valuationDate,
    currentLevel: entry * 1.05,
    debentures: 100,
  });

  const outputRows = buildValuationOutputSheetRows({
    product: ongoing,
    valuation,
    effectiveDate: valuationDate,
    isExpired: false,
    tradeDisplay: dates.tradeDisplay,
    allotmentDisplay: dates.allotmentDisplay,
    maturityDisplay: dates.maturityDisplay,
    productTenorDays: productTenor,
    rolloverTenorDays: rolloverTenor,
  });
  const outputLabels = outputRows.map(([label]) => label);
  assert(outputLabels.includes(labels.daysElapsed), "Valuation output sheet missing days elapsed");
  assert(outputLabels.includes(PORTFOLIO_LAST_OBS_COLUMN_LABEL), "Valuation output sheet missing Expiration Date");
  const maturityCount = outputLabels.filter((l) => l === "Maturity Date").length;
  const deduped = buildValuationExpirationMaturityRows(ongoing, dates.maturityDisplay);
  assert(
    maturityCount <= 1,
    `Valuation output should not duplicate Maturity Date (found ${maturityCount})`,
  );
  assert(
    outputRows.filter(([label]) => label === "Maturity Date" || label === PORTFOLIO_LAST_OBS_COLUMN_LABEL).length ===
      deduped.length,
    "Expiration/Maturity rows should match dedupe helper",
  );
  assert(outputLabels.includes("Product Tenor · Days"), "Valuation output sheet missing Product Tenor · Days");
  const productTenorRow = outputRows.find(([label]) => label === "Product Tenor · Days");
  assert(productTenorRow?.[1] !== "—", "Product Tenor · Days should be populated for ongoing sample");
  assert(outputLabels.includes("Notional"), "Valuation output sheet missing Notional");
  assert(outputRows.length >= 20, `Valuation output sheet too short (${outputRows.length} rows)`);

  const specValuation = buildScreenSpecExportRows("valuation", ongoing, {
    underlyingLevel: valuation.currentLevel,
    underlyingLevelLabel: labels.underlyingLevel,
    asOf,
  });
  assert(specValuation.length === PRODUCT_SPECIFICATION_LABELS.length, "Product specs length mismatch");
  for (let i = 0; i < PRODUCT_SPECIFICATION_LABELS.length; i += 1) {
    assert(
      specValuation[i]?.[0] === PRODUCT_SPECIFICATION_LABELS[i],
      `Product Specs column ${i + 1}: expected "${PRODUCT_SPECIFICATION_LABELS[i]}", got "${specValuation[i]?.[0]}"`,
    );
  }

  const specPayoff = buildScreenSpecExportRows("payoff", ongoing);
  assert(specPayoff.some(([l]) => l === "Trade Date"), "Payoff specs should include Trade Date like on-screen panel");
  assert(specPayoff.some(([l]) => l === "POED"), "Payoff specs should include POED");
  assert(specPayoff.some(([l]) => l === "Tenor Classification"), "Payoff specs should include Tenor Classification");

  const lifecycleRows = buildLifecycleExportRows({
    product: ongoing,
    valuation,
    effectiveLevel: valuation.currentLevel,
    valuationDate,
    asOf,
    isExpired: false,
  });
  assert(lifecycleRows.length === 7, `Lifecycle export expected 7 rows, got ${lifecycleRows.length}`);
  assert(lifecycleRows.some(([l]) => l === "Days Left to Maturity"), "Lifecycle missing Days Left to Maturity");
  assert(lifecycleRows.some(([l]) => l === "Effective Target"), "Lifecycle missing Effective Target");
  const daysLeftRow = lifecycleRows.find(([l]) => l === "Days Left to Maturity");
  const expectedDaysLeft = getDaysLeftToMaturity(ongoing, asOf);
  assert(
    daysLeftRow?.[1] === (expectedDaysLeft != null ? formatNumber(expectedDaysLeft, 0) : "—"),
    `Days Left to Maturity should use calendar maturity gap (got ${daysLeftRow?.[1]})`,
  );
  assert(
    buildLifecycleExportRows({
      product: expired,
      valuation: null,
      effectiveLevel: entry,
      valuationDate: "01/01/2020",
      asOf: new Date(),
      isExpired: true,
    }).length === 0,
    "Expired products should not export lifecycle section",
  );

  // Performance start date: Phase 2 → Trade; Blank / Phase 1 / 10 Years → Allotment.
  const phase2 = products.find((p) => isPhase2RolloverProduct(p) && getProductTradeOpeningDate(p));
  if (phase2) {
    const start = getWorkingAllotmentDate(phase2, asOf);
    const trade = getProductTradeOpeningDate(phase2);
    assert(
      start?.getTime() === trade?.getTime(),
      "Phase 2 working allotment must prefer Trade Date",
    );
    const allotment = getProductAllotmentDate(phase2);
    if (allotment && trade && allotment.getTime() < trade.getTime()) {
      const preTradeStart = getWorkingAllotmentDate(phase2, allotment);
      assert(
        preTradeStart?.getTime() === trade.getTime(),
        "Phase 2 must keep Trade Date even when valuing before Trade (never fall back to Allotment)",
      );
      assert(
        !isValuationApplicableAt(phase2, formatDeskDate(allotment)),
        "Phase 2 MTM before Trade Date must be blocked",
      );
    }
  }
  const phase1 = products.find(
    (p) => !isPhase2RolloverProduct(p) && getProductAllotmentDate(p) && getProductTradeOpeningDate(p),
  );
  if (phase1) {
    const start = getWorkingAllotmentDate(phase1, asOf);
    const allotment = getProductAllotmentDate(phase1);
    assert(
      start?.getTime() === allotment?.getTime(),
      "Non-Phase-2 working allotment must prefer Allotment Date",
    );
  }

  const observationRows = buildObservationExportTable(ongoing, asOf);
  assert(observationRows.length > 0, "Observation export table empty");
  assert(observationRows[0]?.length === 4, "Observation export row should have 4 columns");

  const footnotes = buildPayoffExportFootnotes(true, valuation, labels, "Sample desk note");
  assert(footnotes.length === 2, "Payoff footnotes should include expired metrics + desk note");

  const deskLive = buildDeskExportInputs(
    false,
    { valuationDate, niftyLevel: "22000", sensexLevel: "73000", debentures: "100" },
    { niftyLevel: null, sensexLevel: null },
  );
  assert(deskLive.niftyLevel === "22000", "Live desk inputs should preserve selection");

  const deskExpired = buildDeskExportInputs(
    true,
    { valuationDate, niftyLevel: "22000", sensexLevel: "73000", debentures: "100" },
    { niftyLevel: 21500, sensexLevel: 71200 },
  );
  assert(deskExpired.niftyLevel === "21500", "Expired desk inputs should use resolved Nifty");
  assert(deskExpired.sensexLevel === "71200", "Expired desk inputs should use resolved Sensex");

  const payoffInputs = payoffInputsFromDesk(ongoing, { valuationDate, expired: false });
  const exportScenarios = buildEnhancedPayoffScenarioTable(ongoing, payoffInputs, 0.08);
  const screenScenarios = buildEnhancedPayoffScenarioTable(ongoing, payoffInputs, 0.08);
  assert(exportScenarios.length === screenScenarios.length, "Payoff export scenarios should match screen table row count");
  for (let i = 0; i < exportScenarios.length; i += 1) {
    const a = exportScenarios[i];
    const b = screenScenarios[i];
    assert(
      Math.abs(a.performance - b.performance) < 1e-6 &&
        Math.abs(a.maturityValue - b.maturityValue) < 1e-9 &&
        Math.abs(a.irr - b.irr) < 1e-9,
      `Payoff scenario row ${i} mismatch between export and screen`,
    );
  }

  const formula = ongoing.formulaText ?? "Z";
  const curve = buildPayoffCurve(formula).map((p) => ({
    z: p.z,
    payoff: Math.max(-1, Math.min(p.payoff, 3)),
  }));
  assert(curve.length >= 41, "Payoff plot curve should use desk 41-point sweep");
  assert(curve.every((p) => p.payoff >= -1 && p.payoff <= 3), "Payoff plot clamp should match on-screen chart");

  // Observation schedule metrics + Effective Target (live tabs).
  const today = new Date();
  const liveObsSample = products.find((p) => {
    const status = getProductLifecycleStatus(p, today);
    return (
      (status === "ongoing" || status === "expiring-3m" || status === "expiring-1m") &&
      getProductObservationDates(p).length >= 2
    );
  });
  assert(liveObsSample != null, "Need a live product with ≥2 observation dates");
  const metrics = computeObservationScheduleMetrics(liveObsSample, today);
  assert(metrics.total === getProductObservationDates(liveObsSample).length, "Total obs count mismatch");
  assert(metrics.passed + metrics.remaining === metrics.total, "Passed + remaining must equal total");
  const liveRow = portfolioLifecycleExportRow({
    index: 0,
    product: liveObsSample,
    snapshot: blankSnapshot,
    labels: lifecyclePortfolioColumnLabels("ongoing"),
    asOf: today,
    badgeFilter: "ongoing",
  });
  assert(liveRow[PORTFOLIO_TOTAL_OBS_COLUMN_LABEL] === metrics.total, "Total Observation Dates cell mismatch");
  assert(liveRow[PORTFOLIO_PASSED_OBS_COLUMN_LABEL] === metrics.passed, "Passed cell mismatch");
  assert(liveRow[PORTFOLIO_REMAINING_OBS_COLUMN_LABEL] === metrics.remaining, "Remaining cell mismatch");
  if (metrics.effectiveTarget != null) {
    assert(
      typeof liveRow[PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL] === "number",
      "Effective Target should be numeric when computable",
    );
  } else {
    assert(
      liveRow[PORTFOLIO_EFFECTIVE_TARGET_COLUMN_LABEL] === "",
      "Effective Target should be blank when not computable",
    );
  }

  console.log("verify-screen-exports: PASS");
  console.log(`  products: ${products.length}`);
  console.log(`  valuation output fields: ${outputRows.length}`);
  console.log(`  lifecycle fields: ${lifecycleRows.length}`);
  console.log(`  observation rows: ${observationRows.length}`);
  console.log(`  portfolio columns: ${PORTFOLIO_EXPORT_COLUMNS.length}`);
}

main();
