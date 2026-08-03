"use client";

import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";

import { ExcelInputPanel } from "@/components/dashboard/excel-input-panel";
import { LifecycleProductList } from "@/components/dashboard/lifecycle-product-list";
import { PayoffCurvePanel } from "@/components/dashboard/payoff-curve";
import { ProductNarrative } from "@/components/dashboard/product-narrative";
import { ProductSpecificationsPanel } from "@/components/dashboard/product-specifications-panel";
import { RevealOutput } from "@/components/ui/reveal-output";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import { ObservationDatesTable } from "@/components/ui/observation-dates-table";
import {
  AppPage,
  Button,
  KpiBand,
  Output,
  Panel,
  SectionInfo,
  SectionTitle,
  SubPageTabs,
  SubTitle,
} from "@/components/layout/app-ui";
import { SECTION_INFO } from "@/lib/section-info";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import { useMasterProducts } from "@/lib/hooks/use-master-products";
import { useExpiredDeskMark } from "@/lib/hooks/use-expired-desk-mark";
import { useLifecycleFilter } from "@/lib/hooks/use-lifecycle-filter";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import {
  pickLifecyclePoolProduct,
  useLifecycleProductPick,
  useResyncProductToLifecyclePool,
} from "@/lib/hooks/use-lifecycle-pool-product";
import { useLiveIndexLevel, useLiveIndexMove } from "@/lib/hooks/use-live-index-level";
import { useObservationLevels } from "@/lib/hooks/use-observation-levels";
import { valuationMetricLabels } from "@/lib/valuation-labels";
import {
  buildObservationExportTable,
  buildPayoffExportFootnotes,
  buildScreenSpecExportRows,
} from "@/lib/workbook/build-screen-export-payload";
import {
  getLifecyclePickerPool,
  getProductLifecycleStatus,
  isValuationApplicableAt,
  LIFECYCLE_FILTERS,
  LIFECYCLE_FILTER_LABELS,
  type LifecycleFilter,
} from "@/lib/product-lifecycle";
import { ProductOutputGuard } from "@/components/ui/product-output-guard";
import { handleOutputReveal, assessProductData } from "@/lib/product-data-guards";
import { DeskDataQualityBanner } from "@/components/ui/desk-data-quality-banner";
import { getDebenturePrice, getIndexEntryLevel, getProductIndexFieldLabel, getTargetLevel, rawField } from "@/lib/product-utils";
import { getWorkingAllotmentDate } from "@/lib/product-dates";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";
import { describePayoffBand } from "@/lib/product-narrative-format";
import { PayoffScenariosTable } from "@/components/ui/payoff-scenarios-table";
import type { ProductRecord } from "@/lib/types";
import { buildEnhancedPayoffScenarioTable, type PayoffRowFlags } from "@/lib/workbook/payoff-pivots";
import { payoffInputsFromDesk } from "@/lib/workbook/payoff-scenarios";
import { useScreenExcelExport } from "@/lib/hooks/use-screen-excel-export";
import { computeValuation } from "@/lib/workbook/valuation-engine";
import { formatFormulaReturn, formatNumber, formatPercent, formatProductUnitValue, formatReportAsOf } from "@/lib/utils";
import { formatExpiredAsOfPatch } from "@/lib/expired-valuation-dates";

const TABS = [
  { id: "details", label: "Non-PP SP Details" },
  { id: "search", label: "Product Search" },
];

export function UnifiedPayoffDashboard() {
  const masterProducts = useMasterProducts();
  const selection = useProductSelection();
  const { asOf } = usePortfolioClock();
  const { filter: lifecycle, setFilter: setLifecycle } = useLifecycleFilter("ongoing");
  const [tab, setTab] = useState("details");

  const pool = useMemo(
    () => getLifecyclePickerPool(masterProducts, lifecycle, asOf),
    [masterProducts, lifecycle, asOf],
  );

  useResyncProductToLifecyclePool(pool, lifecycle, asOf);
  const { selectFromPool, resetToLifecycleDefaults, qualityNotice } = useLifecycleProductPick(
    pool,
    lifecycle,
    asOf,
  );

  const product = pickLifecyclePoolProduct(pool, selection.resolvedProduct, lifecycle, asOf);
  const isExpired = product ? getProductLifecycleStatus(product, asOf) === "expired" : false;
  const debentureCount = Math.max(1, Math.round(Number(selection.debentures) || 100));
  const { isExpired: expiredFlag, effectiveDate: expiredMarkDate, level: expiredLevel, niftyLevel: expiredNifty, sensexLevel: expiredSensex } = useExpiredDeskMark(
    product,
    selection.valuationDate,
  );
  const expiredIndexLevels = useMemo(
    () => ({ level: expiredLevel, niftyLevel: expiredNifty, sensexLevel: expiredSensex }),
    [expiredLevel, expiredNifty, expiredSensex],
  );
  const effectiveDate =
    expiredFlag && selection.valuationDate
      ? selection.valuationDate
      : expiredFlag && expiredMarkDate
        ? expiredMarkDate
        : selection.valuationDate;

  const effectiveLevel = useLiveIndexLevel(product, expiredFlag, expiredIndexLevels);
  const marketMove = useLiveIndexMove(product, expiredFlag, expiredIndexLevels);

  const payoffBandNote = useMemo(() => {
    if (!product?.formulaText) return undefined;
    return describePayoffBand(product.formulaText, marketMove);
  }, [product, marketMove]);

  const scenarios = useMemo(() => {
    if (!product?.formulaText) return [];
    return buildEnhancedPayoffScenarioTable(
      product,
      payoffInputsFromDesk(product, {
        debentures: debentureCount,
        pricePerDebenture: getDebenturePrice(product),
        valuationDate: effectiveDate,
        expired: isExpired,
      }),
      marketMove,
    );
  }, [product, marketMove, debentureCount, effectiveDate, isExpired]);

  const livePayoffIrr = useMemo(() => {
    const live = scenarios.find((r) => r.isCurrent);
    return live?.irr ?? 0;
  }, [scenarios]);

  const targetDisplay = useMemo(() => {
    if (!product) return "—";
    const target = getTargetLevel(product);
    if (target) return formatNumber(target);
    const raw = rawField(product, "Target Nifty", "Target Level");
    if (raw) return raw;
    return "—";
  }, [product]);

  return (
    <AppPage dense title="Payoff">
      <HorizontalBand>
        <Panel className="!p-4" glow="cyan">
          <SectionInfo {...SECTION_INFO["pay-filter"]} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SubTitle>Primary Payoff · Portfolio Filter</SubTitle>
            <div className="flex flex-wrap gap-2">
              {LIFECYCLE_FILTERS.map((key) => (
                <Button
                  key={key}
                  active={lifecycle === key}
                  className={lifecycle === key ? "btn-pill-purple-active" : undefined}
                  variant="pill"
                  onClick={() => setLifecycle(key)}
                >
                  {LIFECYCLE_FILTER_LABELS[key]}
                </Button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-sm text-stone-500">
            {formatNumber(pool.length)} products in {LIFECYCLE_FILTER_LABELS[lifecycle].toLowerCase()} book
          </p>
        </Panel>
      </HorizontalBand>

      <HorizontalBand className="mt-4">
        <SubPageTabs active={tab} onSelect={setTab} tabs={TABS} />
      </HorizontalBand>

      {tab === "details" ? (
        <NonPpSpDetails
          effectiveDate={effectiveDate}
          effectiveLevel={effectiveLevel}
          isExpired={isExpired}
          lifecycle={lifecycle}
          livePayoffIrr={livePayoffIrr}
          marketMove={marketMove}
          payoffBandNote={payoffBandNote}
          pool={pool}
          product={product}
          qualityNotice={qualityNotice}
          resetToLifecycleDefaults={resetToLifecycleDefaults}
          scenarios={scenarios}
          selectFromPool={selectFromPool}
          targetDisplay={targetDisplay}
        />
      ) : null}
      {tab === "search" ? (
        <HorizontalBand className="mt-4">
          <LifecycleProductList
            activeFilter={lifecycle}
            compact
            filter={lifecycle}
            products={masterProducts}
            selectedId={product?.rowId}
            showFilterPills={false}
            onSelect={(p) => selectFromPool(p)}
          />
        </HorizontalBand>
      ) : null}
    </AppPage>
  );
}

function NonPpSpDetails({
  livePayoffIrr,
  marketMove,
  payoffBandNote,
  pool,
  product,
  scenarios,
  targetDisplay,
  lifecycle,
  isExpired,
  effectiveDate,
  effectiveLevel,
  qualityNotice,
  resetToLifecycleDefaults,
  selectFromPool,
}: {
  livePayoffIrr: number;
  marketMove: number;
  payoffBandNote?: string;
  pool: ProductRecord[];
  product?: ProductRecord;
  scenarios: PayoffRowFlags[];
  targetDisplay: string;
  lifecycle: LifecycleFilter;
  isExpired: boolean;
  effectiveDate: string;
  effectiveLevel: number;
  qualityNotice: ReturnType<typeof useLifecycleProductPick>["qualityNotice"];
  resetToLifecycleDefaults: ReturnType<typeof useLifecycleProductPick>["resetToLifecycleDefaults"];
  selectFromPool: ReturnType<typeof useLifecycleProductPick>["selectFromPool"];
}) {
  const selection = useProductSelection();
  const { asOf } = usePortfolioClock();
  const debentureCount = Math.max(1, Math.round(Number(selection.debentures) || 100));
  const masterPrice = product ? getDebenturePrice(product) : 100_000;
  const masterPriceDisplay = product ? String(masterPrice) : "";
  const phaseStartDisplay = useMemo(() => {
    if (!product) return selection.purchaseDate;
    const start = getWorkingAllotmentDate(product, asOf);
    return start ? formatDisplayDate(start) : selection.purchaseDate;
  }, [product, asOf, selection.purchaseDate]);
  const { exporting: exportingScreen, runExport: runScreenExport, warmExport: warmScreenExport } =
    useScreenExcelExport();
  const indexLabel = product ? getProductIndexFieldLabel(product) : "Nifty";
  const detailLabels = valuationMetricLabels(isExpired, effectiveDate, product);
  const canValue = product ? isValuationApplicableAt(product, effectiveDate) : false;

  const valuation = useMemo(() => {
    if (!product || !canValue) return null;
    return computeValuation(product, {
      valuationDate: effectiveDate,
      currentLevel: effectiveLevel,
      debentures: debentureCount,
      purchasePrice: masterPrice,
    });
  }, [product, canValue, effectiveDate, effectiveLevel, debentureCount, masterPrice]);

  const outputResetKey = useMemo(
    () =>
      [
        product?.rowId,
        selection.debentures,
        masterPriceDisplay,
        phaseStartDisplay,
        selection.niftyLevel,
        selection.sensexLevel,
        selection.valuationDate,
      ].join("|"),
    [
      product?.rowId,
      selection.debentures,
      masterPriceDisplay,
      phaseStartDisplay,
      selection.niftyLevel,
      selection.sensexLevel,
      selection.valuationDate,
    ],
  );

  const kpiItems = isExpired
    ? [
        { label: `Initial ${indexLabel} Level`, value: formatNumber(getIndexEntryLevel(product!)) },
        {
          label: detailLabels.underlyingLevel,
          value: effectiveLevel > 0 ? formatNumber(effectiveLevel) : "—",
        },
        {
          label: "Index Move on Selected Observation",
          value: formatPercent(marketMove, 1),
        },
        {
          label: detailLabels.value,
          value: valuation ? formatProductUnitValue(valuation.productValue) : "—",
        },
        {
          label: detailLabels.productIrr,
          value: valuation ? formatPercent(valuation.productIrr, 2) : "—",
        },
      ]
    : [
        {
          label: `Live ${indexLabel} Level`,
          value: effectiveLevel > 0 ? formatNumber(effectiveLevel) : "—",
        },
        { label: "Initial Fixing", value: formatNumber(getIndexEntryLevel(product!)) },
        { label: "Target Level", value: targetDisplay },
        { label: "Live Index Move", value: formatPercent(marketMove, 1) },
        { label: "Product XIRR at live index move", value: formatPercent(livePayoffIrr, 2) },
      ];

  const payoffSpecRows = useMemo(
    () => (product ? buildScreenSpecExportRows("payoff", product) : []),
    [product],
  );
  const payoffFootnotes = useMemo(
    () => buildPayoffExportFootnotes(isExpired, valuation, detailLabels, payoffBandNote),
    [detailLabels, isExpired, payoffBandNote, valuation],
  );
  const observationRows = useMemo(
    () => (product ? buildObservationExportTable(product, parseExcelishDate(effectiveDate) ?? new Date()) : []),
    [effectiveDate, product],
  );

  return (
    <>
      <HorizontalBand className="mt-4">
        <Panel className="!p-4" glow="purple">
          <SectionInfo {...SECTION_INFO["pay-inputs"]} />
          <SectionTitle>Non-PP SP Details · Input</SectionTitle>
          <p className="mt-1 text-sm italic text-amber-900/90">
            Select the product and debenture count — Start Date and Initial Price / Debenture come from the master
          </p>
          <div className="mt-3">
            <ExcelInputPanel
              activeProduct={product}
              category={product?.category ?? "Primary"}
              compact
              lifecycleFilter={lifecycle}
              mode="payoff"
              onPickProduct={selectFromPool}
              onResetDefaults={resetToLifecycleDefaults}
              products={pool}
            />
          </div>
        </Panel>
      </HorizontalBand>

      {product ? (
        <>
          {qualityNotice ? (
            <HorizontalBand className="mt-4">
              <DeskDataQualityBanner
                assessment={assessProductData(qualityNotice.attempted)}
                product={qualityNotice.attempted}
              />
            </HorizontalBand>
          ) : null}

          <HorizontalBand className="mt-4">
            <Panel className="!p-3" glow="cyan">
              <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-amber-900/90">
                {isExpired && product ? formatExpiredAsOfPatch(product, effectiveDate) : formatReportAsOf(effectiveDate)}
              </p>
            </Panel>
          </HorizontalBand>

          <HorizontalBand className="mt-4">
            <RevealOutput
              footer={
                product ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      disabled={exportingScreen}
                      variant="primary"
                      onClick={() =>
                        runScreenExport(async () => {
                          const { downloadPayoffScreenExcel } = await import("@/lib/workbook/export-screen");
                          await downloadPayoffScreenExcel({
                            product,
                            scenarios,
                            marketMove,
                            liveLevel: effectiveLevel,
                            inputs: {
                              debentures: selection.debentures,
                              pricePerDebenture: masterPriceDisplay,
                              purchaseDate: phaseStartDisplay,
                            },
                            kpis: kpiItems.map((item) => [item.label, item.value]),
                            specRows: payoffSpecRows,
                            payoffFootnotes,
                            observationRows,
                            valuationDate: effectiveDate,
                            expired: isExpired,
                          });
                        }, "Excel download")
                      }
                    >
                      <Download className="h-4 w-4" />
                      {exportingScreen ? "Building…" : "Download Excel"}
                    </Button>
                    <Button
                      disabled={exportingScreen}
                      variant="accent"
                      onClick={() =>
                        runScreenExport(async () => {
                          const { downloadPayoffScreenPdf } = await import("@/lib/workbook/export-screen-pdf");
                          await downloadPayoffScreenPdf({
                            product,
                            scenarios,
                            marketMove,
                            inputs: {
                              debentures: selection.debentures,
                              pricePerDebenture: masterPriceDisplay,
                              purchaseDate: phaseStartDisplay,
                            },
                            kpis: kpiItems.map((item) => [item.label, item.value]),
                            specRows: payoffSpecRows,
                            payoffFootnotes,
                            observationRows,
                          });
                        }, "PDF download")
                      }
                    >
                      <FileText className="h-4 w-4" />
                      {exportingScreen ? "Building…" : "Download PDF"}
                    </Button>
                  </div>
                ) : null
              }
              label="Click here to view payoff output"
              resetKey={outputResetKey}
              onReveal={() => {
                warmScreenExport();
                handleOutputReveal(product);
              }}
            >
              <ProductOutputGuard mode="payoff" product={product}>
                {({ showValues }) =>
                  showValues ? (
                    <>
              <KpiBand accents={["cyan", "purple", "green", "amber", "rose"]} items={kpiItems} />
              {isExpired && valuation ? (
                <p className="mt-2 text-center text-xs text-stone-500">
                  {detailLabels.coupon}: {formatPercent(valuation.absReturn, 1)} · {detailLabels.couponFormed}:{" "}
                  {formatFormulaReturn(valuation.formulaReturn)}
                </p>
              ) : null}
              {payoffBandNote ? (
                <p className="mt-2 text-center text-xs italic text-amber-900/90">{payoffBandNote}</p>
              ) : null}

              <HorizontalBand className="mt-4">
                <ProductNarrative product={product} />
              </HorizontalBand>
              {product.formulaText ? (
                <PayoffCurvePanel
                  entryLevel={getIndexEntryLevel(product)}
                  formula={product.formulaText}
                  marketMove={marketMove}
                  title={product.name}
                />
              ) : null}

              <HorizontalBand className="mt-4">
                <ProductSpecificationsPanel product={product} />
              </HorizontalBand>

              <HorizontalBand className="mt-4">
                <PayoffObservationDates product={product} />
              </HorizontalBand>

              <HorizontalBand className="mt-4">
                <Panel className="!p-4" glow="cyan">
                  <SectionTitle>Product Payoff</SectionTitle>
                  <SectionInfo {...SECTION_INFO["pay-output"]} />
                  <p className="mt-2 text-xs text-stone-500">
                    Product returns and XIRR at each final-fixing level, computed as of the rollover date.
                  </p>
                  <div className="mt-3">
                    <PayoffScenariosTable rows={scenarios} />
                  </div>
                </Panel>
              </HorizontalBand>
                    </>
                  ) : null
                }
              </ProductOutputGuard>
            </RevealOutput>
          </HorizontalBand>
        </>
      ) : (
        <HorizontalBand className="mt-4">
          <Panel>
            <Output>No products in this lifecycle bucket.</Output>
          </Panel>
        </HorizontalBand>
      )}
    </>
  );
}

function PayoffObservationDates({ product }: { product: ProductRecord }) {
  const { levels } = useObservationLevels(product);
  if (levels.length === 0) return null;

  return (
    <Panel className="!p-4" glow="cyan">
      <SectionTitle>Observation Dates</SectionTitle>
      <p className="mt-1 text-xs text-stone-500">
        Underlying level on each observation date and its performance versus the initial fixing at allotment.
      </p>
      <div className="mt-3">
        <ObservationDatesTable levels={levels} />
      </div>
    </Panel>
  );
}
