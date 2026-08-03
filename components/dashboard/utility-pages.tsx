"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { Download, FileText, Upload as UploadIcon } from "lucide-react";

import { PayoffCurvePanel } from "@/components/dashboard/payoff-curve";
import { ExcelInputPanel } from "@/components/dashboard/excel-input-panel";
import { LifecycleProductList } from "@/components/dashboard/lifecycle-product-list";
import { ProductNarrative } from "@/components/dashboard/product-narrative";
import { DynamicTable, type DynamicTableColumn } from "@/components/ui/dynamic-table";
import { ObservationDatesTable } from "@/components/ui/observation-dates-table";
import {
  AppPage,
  Button,
  KpiBand,
  Output,
  Panel,
  SectionTitle,
  SubTitle,
} from "@/components/layout/app-ui";
import { UniformSpecRail, useUniformSpecCardSize } from "@/components/ui/spec-rail";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import {
  getLifecyclePickerPool,
  isValuationApplicableAt,
} from "@/lib/product-lifecycle";
import { buildProductSpecCards } from "@/lib/product-specifications";
import { categoryNeon } from "@/lib/chart-theme";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import { useDataset } from "@/lib/context/dataset-provider";
import { useExpiredDeskMark } from "@/lib/hooks/use-expired-desk-mark";
import { hasResolvedDeskIndexLevel } from "@/lib/desk-index-guards";
import { useLiveIndexLevel, useLiveIndexMove } from "@/lib/hooks/use-live-index-level";
import { useObservationLevels } from "@/lib/hooks/use-observation-levels";
import { useLifecycleFilter } from "@/lib/hooks/use-lifecycle-filter";
import {
  pickLifecyclePoolProduct,
  useLifecycleProductPick,
  useResyncProductToLifecyclePool,
} from "@/lib/hooks/use-lifecycle-pool-product";
import { valuationMetricLabels } from "@/lib/valuation-labels";
import {
  buildDeskExportInputs,
  buildLifecycleExportRows,
  buildObservationExportTable,
  buildScreenSpecExportRows,
} from "@/lib/workbook/build-screen-export-payload";
import {
  computeUnderlyingIrrSincePhaseStart,
  getDaysLeftToMaturity,
  getElapsedDaysSinceWorkingAllotment,
} from "@/lib/product-dates";
import {
  computeObservationScheduleMetrics,
  formatEffectiveTargetCell,
} from "@/lib/portfolio-observation-metrics";
import { parseExcelishDate } from "@/lib/workbook/dates";
import { ProductOutputGuard } from "@/components/ui/product-output-guard";
import { handleOutputReveal, assessProductData } from "@/lib/product-data-guards";
import { DeskDataQualityBanner } from "@/components/ui/desk-data-quality-banner";
import { getDebenturePrice, getIndexEntryLevel } from "@/lib/product-utils";
import { getPayoffScenarioEndLabel, payoffInputsFromDesk } from "@/lib/workbook/payoff-scenarios";
import { PayoffScenariosTable } from "@/components/ui/payoff-scenarios-table";
import { buildEnhancedPayoffScenarioTable } from "@/lib/workbook/payoff-pivots";
import { useScreenExcelExport } from "@/lib/hooks/use-screen-excel-export";
import { downloadQuickAnalyticsWorkbook } from "@/lib/workbook/export-products";
import { computeValuation } from "@/lib/workbook/valuation-engine";
import type { ProductRecord } from "@/lib/types";
import { formatCrores, formatCurrency, formatFormulaReturn, formatNumber, formatPercent, formatProductUnitValue, formatReportAsOf } from "@/lib/utils";
import { formatExpiredAsOfPatch } from "@/lib/expired-valuation-dates";
import { MasterUploadButton } from "@/components/ui/master-upload-button";
import { RevealOutput } from "@/components/ui/reveal-output";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import { useMasterProducts } from "@/lib/hooks/use-master-products";

export function UploadDiagnosticsPage() {
  const { dataset, uploadState } = useDataset();
  const formulaCount = useMemo(
    () => dataset.products.filter((product) => Boolean(product.formulaText?.trim())).length,
    [dataset.products],
  );

  const validationColumns = useMemo<DynamicTableColumn<(typeof dataset.validationIssues)[number]>[]>(
    () => [
      { key: "category", header: "Category", render: (row) => row.category },
      { key: "message", header: "Message", render: (row) => row.message },
    ],
    [],
  );

  const categoryColumns = useMemo<DynamicTableColumn<(typeof dataset.categorySummaries)[number]>[]>(
    () => [
      {
        key: "category",
        header: "Category",
        render: (row) => (
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryNeon[row.category] }} />
            {row.category}
          </span>
        ),
      },
      {
        key: "products",
        header: "Products",
        render: (row) => formatNumber(row.productCount),
      },
      {
        key: "formulas",
        header: "Formulas",
        render: (row) =>
          formatNumber(dataset.products.filter((p) => p.category === row.category && p.formulaText).length),
      },
      {
        key: "notional",
        header: "Notional",
        render: (row) => formatCurrency(row.liveNotional),
      },
      {
        key: "probability",
        header: "Probability",
        render: () => (
          <Link className="text-gold-dark underline" href={"/probability" as Route}>
            Open
          </Link>
        ),
      },
      {
        key: "initial-probability",
        header: "Initial Probability",
        render: () => (
          <Link className="text-maroon underline" href={"/initial-probability" as Route}>
            Open
          </Link>
        ),
      },
      {
        key: "current-probability",
        header: "Current Probability",
        render: () => (
          <Link className="text-maroon underline" href={"/current-probability" as Route}>
            Open
          </Link>
        ),
      },
    ],
    [dataset.products],
  );

  return (
    <AppPage dense>
      <div className="space-y-4">
        <Panel glow="cyan" className="!p-8">
          <div className="upload-dropzone mx-auto max-w-2xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/20 to-gold/5 shadow-inner">
              <UploadIcon className="h-8 w-8 text-gold-dark" />
            </div>
            <SectionTitle icon={UploadIcon}>New Product Master</SectionTitle>
            <p className="mt-2 text-sm text-muted">
              Upload <strong className="text-ink">New Product Master_.xlsx</strong> to refresh the desk book —
              valuations, payoff, and lifecycle lists update automatically.
            </p>
            <div className="mt-8 flex justify-center">
              <MasterUploadButton className="!px-8 !py-3" />
            </div>
            <Output className="mt-6 text-left text-sm">{uploadState}</Output>
          </div>
        </Panel>
        <Panel glow="purple">
          <SectionTitle>Validation</SectionTitle>
          <div className="mt-4">
            <DynamicTable
              columns={validationColumns}
              emptyMessage="No issues detected."
              getRowKey={(row, index) => `${row.category}-${index}`}
              rows={dataset.validationIssues}
              virtualizeAt={999}
            />
          </div>
        </Panel>
      </div>
      <Panel className="mt-4" glow="cyan">
        <SectionTitle>Product Count Verification</SectionTitle>
        <p className="mt-2 text-sm text-stone-500">
          Live master book · {formatNumber(dataset.products.length)} desk products · {formatNumber(formulaCount)}{" "}
          payoff formulae.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dataset.categorySummaries.map((entry, index) => (
            <motion.div
              key={entry.category}
              animate={{ opacity: 1, y: 0 }}
              className="kpi-card !p-4"
              initial={{ opacity: 0, y: 12 }}
              style={{ "--kpi-accent": categoryNeon[entry.category] } as CSSProperties}
              transition={{ delay: index * 0.06 }}
            >
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500">{entry.category}</p>
              <p className="mt-1 text-2xl font-bold text-ink">{formatNumber(entry.productCount)}</p>
              <p className="text-xs text-stone-500">{formatCrores(entry.liveNotional)} notional</p>
            </motion.div>
          ))}
        </div>
      </Panel>
      <Panel className="mt-4" glow="cyan">
        <SectionTitle>Category Summary</SectionTitle>
        <div className="mt-4">
          <DynamicTable
            columns={categoryColumns}
            getRowKey={(row) => row.category}
            rows={dataset.categorySummaries}
            virtualizeAt={999}
          />
        </div>
      </Panel>
    </AppPage>
  );
}

export function ProductDetailsPage() {
  const masterProducts = useMasterProducts();
  const selection = useProductSelection();
  const { asOf } = usePortfolioClock();
  const { filter: lifecycle, setFilter: setLifecycle } = useLifecycleFilter("ongoing");

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

  // Expired products are marked to the chosen observation date using
  // the historical index level on that date — never the live market level.
  const {
    isExpired,
    effectiveDate: expiredMarkDate,
    level: expiredLevel,
    niftyLevel: expiredNifty,
    sensexLevel: expiredSensex,
    loading: expiredIndexLoading,
  } = useExpiredDeskMark(product, selection.valuationDate);
  const expiredIndexLevels = useMemo(
    () => ({ level: expiredLevel, niftyLevel: expiredNifty, sensexLevel: expiredSensex }),
    [expiredLevel, expiredNifty, expiredSensex],
  );
  const effectiveDate =
    isExpired && selection.valuationDate
      ? selection.valuationDate
      : isExpired && expiredMarkDate
        ? expiredMarkDate
        : selection.valuationDate;
  const debentureCount = Math.max(1, Math.round(Number(selection.debentures) || 100));
  const { exporting: exportingScreen, runExport: runScreenExport, warmExport: warmScreenExport } =
    useScreenExcelExport();
  const [exportingQuickAnalytics, setExportingQuickAnalytics] = useState(false);

  const effectiveLevel = useLiveIndexLevel(product, isExpired, expiredIndexLevels);

  const canValue = product ? isValuationApplicableAt(product, effectiveDate) : false;
  const detailLabels = valuationMetricLabels(isExpired, effectiveDate, product);

  const valuation = useMemo(() => {
    if (!product || !canValue) return null;
    if (
      !hasResolvedDeskIndexLevel(product, isExpired, effectiveDate, {
        loading: expiredIndexLoading,
        indexSyncLoading: selection.indexSyncLoading,
        marketStatus: selection.marketStatus,
        niftyLevel: expiredNifty,
        sensexLevel: expiredSensex,
        selectionNifty: Number(selection.niftyLevel) || undefined,
        selectionSensex: Number(selection.sensexLevel) || undefined,
        marketNifty: selection.marketLevels?.niftyLevel,
        marketSensex: selection.marketLevels?.sensexLevel,
        expiredLevel,
      })
    ) {
      return null;
    }
    return computeValuation(product, {
      valuationDate: effectiveDate,
      currentLevel: effectiveLevel,
      debentures: Math.max(1, Math.round(Number(selection.debentures) || 100)),
      purchasePrice: Number(selection.pricePerDebenture) || getDebenturePrice(product),
    });
  }, [
    product,
    canValue,
    isExpired,
    expiredIndexLoading,
    selection.indexSyncLoading,
    selection.marketStatus,
    effectiveDate,
    effectiveLevel,
    expiredLevel,
    expiredNifty,
    expiredSensex,
    selection.debentures,
    selection.pricePerDebenture,
    selection.niftyLevel,
    selection.sensexLevel,
    selection.marketLevels?.niftyLevel,
    selection.marketLevels?.sensexLevel,
  ]);

  const marketMove = useLiveIndexMove(product, isExpired, expiredIndexLevels);

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

  const deskExportInputs = useMemo(
    () =>
      buildDeskExportInputs(
        isExpired,
        {
          valuationDate: effectiveDate,
          niftyLevel: selection.niftyLevel,
          sensexLevel: selection.sensexLevel,
          debentures: selection.debentures,
        },
        { niftyLevel: expiredNifty, sensexLevel: expiredSensex },
      ),
    [
      effectiveDate,
      expiredNifty,
      expiredSensex,
      isExpired,
      selection.debentures,
      selection.niftyLevel,
      selection.sensexLevel,
    ],
  );

  const detailsSpecRows = useMemo(() => {
    if (!product) return [];
    const asOfSelected = parseExcelishDate(effectiveDate) ?? asOf;
    const entry = getIndexEntryLevel(product);
    const currentLevel = effectiveLevel > 0 ? effectiveLevel : entry;
    return buildScreenSpecExportRows("product-details", product, {
      underlyingLevel: currentLevel,
      underlyingLevelLabel: detailLabels.underlyingLevel,
      asOf: asOfSelected,
    });
  }, [asOf, detailLabels.underlyingLevel, effectiveDate, effectiveLevel, product]);

  const detailsLifecycleRows = useMemo(() => {
    if (!product) return [];
    return buildLifecycleExportRows({
      product,
      valuation,
      effectiveLevel,
      valuationDate: effectiveDate,
      asOf,
      isExpired,
    });
  }, [asOf, effectiveDate, effectiveLevel, isExpired, product, valuation]);

  const detailsObservationRows = useMemo(() => {
    if (!product) return [];
    const asOfSelected = parseExcelishDate(effectiveDate) ?? asOf;
    return buildObservationExportTable(product, asOfSelected);
  }, [asOf, effectiveDate, product]);

  const outputResetKey = useMemo(
    () =>
      [
        product?.rowId,
        selection.valuationDate,
        selection.niftyLevel,
        selection.sensexLevel,
        expiredIndexLoading,
        expiredLevel,
        selection.debentures,
        selection.isin,
        selection.productCode,
      ].join("|"),
    [product?.rowId, selection.valuationDate, selection.niftyLevel, selection.sensexLevel, expiredIndexLoading, expiredLevel, selection.debentures, selection.isin, selection.productCode],
  );

  return (
    <AppPage dense title="Product Details">
      <HorizontalBand>
        <LifecycleProductList
          activeFilter={lifecycle}
          compact
          filter={lifecycle}
          products={masterProducts}
          selectedId={product?.rowId}
          onFilterChange={setLifecycle}
          onSelect={(p) => selectFromPool(p)}
        />
      </HorizontalBand>

      {!product ? (
        <HorizontalBand className="mt-4">
          <Panel>
            <Output>No products in this lifecycle bucket — switch category or upload master data.</Output>
          </Panel>
        </HorizontalBand>
      ) : (
        <div className="mt-4 space-y-4">
          <HorizontalBand>
            <Panel className="!p-4" glow="cyan">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SubTitle>Desk Inputs</SubTitle>
                {lifecycle === "ongoing" ? (
                  <Button
                    disabled={exportingQuickAnalytics}
                    variant="accent"
                    onClick={() => {
                      setExportingQuickAnalytics(true);
                      void downloadQuickAnalyticsWorkbook(masterProducts, {
                        valuationDate: effectiveDate,
                        niftyLevel: Number(selection.niftyLevel) || undefined,
                        sensexLevel: Number(selection.sensexLevel) || undefined,
                        asOf: parseExcelishDate(effectiveDate) ?? asOf,
                      }).finally(() => setExportingQuickAnalytics(false));
                    }}
                  >
                    <Download className="h-4 w-4" />
                    {exportingQuickAnalytics ? "Building workbook…" : "Quick Analytics"}
                  </Button>
                ) : null}
              </div>
              <div className="mt-3">
                <ExcelInputPanel
                  activeProduct={product}
                  category={product.category}
                  compact
                  lifecycleFilter={lifecycle}
                  mode="valuation"
                  onPickProduct={selectFromPool}
                  onResetDefaults={resetToLifecycleDefaults}
                  products={pool}
                />
              </div>
            </Panel>
          </HorizontalBand>

          {qualityNotice ? (
            <HorizontalBand>
              <DeskDataQualityBanner
                assessment={assessProductData(qualityNotice.attempted)}
                product={qualityNotice.attempted}
              />
            </HorizontalBand>
          ) : null}

          {!isExpired ? (
            <HorizontalBand>
              <Panel className="!p-3" glow="cyan">
                <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-amber-900/90">
                  {formatReportAsOf(effectiveDate)}
                </p>
              </Panel>
            </HorizontalBand>
          ) : (
            <HorizontalBand>
              <Panel className="!p-3" glow="cyan">
                <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-amber-900/90">
                  {formatExpiredAsOfPatch(product, effectiveDate)}
                </p>
              </Panel>
            </HorizontalBand>
          )}

          <HorizontalBand>
            <RevealOutput
              footer={
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    disabled={exportingScreen || !product}
                    variant="primary"
                    onClick={() =>
                      runScreenExport(async () => {
                        const { downloadProductDetailsScreenExcel } = await import("@/lib/workbook/export-screen");
                        await downloadProductDetailsScreenExcel({
                          product,
                          valuation,
                          scenarios,
                          marketMove,
                          canValue,
                          inputs: deskExportInputs,
                          specRows: detailsSpecRows,
                          lifecycleRows: detailsLifecycleRows,
                          observationRows: detailsObservationRows,
                          expired: isExpired,
                        });
                      }, "Excel download")
                    }
                  >
                    <Download className="h-4 w-4" />
                    {exportingScreen ? "Building…" : "Download Excel"}
                  </Button>
                  <Button
                    disabled={exportingScreen || !product}
                    variant="accent"
                    onClick={() =>
                      runScreenExport(async () => {
                        const { downloadProductDetailsScreenPdf } = await import("@/lib/workbook/export-screen-pdf");
                        await downloadProductDetailsScreenPdf({
                          product,
                          valuation,
                          scenarios,
                          marketMove,
                          canValue,
                          inputs: deskExportInputs,
                          specRows: detailsSpecRows,
                          lifecycleRows: detailsLifecycleRows,
                          observationRows: detailsObservationRows,
                        });
                      }, "PDF download")
                    }
                  >
                    <FileText className="h-4 w-4" />
                    {exportingScreen ? "Building…" : "Download PDF"}
                  </Button>
                </div>
              }
              label="Click here to view product output"
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
                      <KpiBand
                        accents={["cyan", "purple", "amber", "green"]}
                        items={[
                          {
                            label: detailLabels.value,
                            value: canValue
                              ? formatProductUnitValue(valuation?.productValue ?? 0)
                              : "—",
                          },
                          {
                            label: detailLabels.coupon,
                            value: canValue ? formatPercent(valuation?.absReturn ?? 0, 1) : "—",
                          },
                          {
                            label: detailLabels.couponFormed,
                            value: canValue ? formatFormulaReturn(valuation?.formulaReturn ?? 0) : "—",
                          },
                          {
                            label: detailLabels.productIrr,
                            value: canValue ? formatPercent(valuation?.productIrr ?? 0, 2) : "—",
                          },
                        ]}
                      />

              <HorizontalBand className="mt-4">
                <ProductNarrative product={product} />
              </HorizontalBand>

              {product.formulaText ? (
                <HorizontalBand className="mt-4">
                  <PayoffCurvePanel
                    entryLevel={getIndexEntryLevel(product)}
                    formula={product.formulaText}
                    marketMove={canValue ? marketMove : 0}
                    title={product.name}
                  />
                </HorizontalBand>
              ) : null}

              <HorizontalBand className="mt-4">
                <ProductSpecsAndLifecycle
                  asOf={asOf}
                  canValue={canValue}
                  effectiveLevel={effectiveLevel}
                  isExpired={isExpired}
                  product={product}
                  valuation={valuation}
                  valuationDate={effectiveDate}
                />
              </HorizontalBand>

              <HorizontalBand className="mt-4">
                <Panel glow="cyan" className="!p-4">
                  <SectionTitle>Payoff Scenarios</SectionTitle>
                  <p className="mt-2 text-xs text-stone-500">
                    Product returns and XIRR to the {getPayoffScenarioEndLabel(product)} date.
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
        </div>
      )}
    </AppPage>
  );
}

function ProductSpecsAndLifecycle({
  product,
  valuation,
  effectiveLevel,
  asOf,
  valuationDate,
  isExpired = false,
  canValue = true,
}: {
  product: ProductRecord;
  valuation: ReturnType<typeof computeValuation> | null;
  effectiveLevel: number;
  asOf: Date;
  valuationDate: string;
  isExpired?: boolean;
  canValue?: boolean;
}) {
  const labels = valuationMetricLabels(isExpired, valuationDate, product);

  const entry = getIndexEntryLevel(product);
  const currentLevel = effectiveLevel > 0 ? effectiveLevel : entry;
  const asOfSelected = parseExcelishDate(valuationDate) ?? asOf;
  const { levels } = useObservationLevels(product, asOfSelected);

  const daysLeftToMaturity = canValue ? getDaysLeftToMaturity(product, asOfSelected) : undefined;
  const daysSinceAllotment = canValue
    ? getElapsedDaysSinceWorkingAllotment(product, asOfSelected)
    : undefined;

  const underlyingIrr = canValue
    ? computeUnderlyingIrrSincePhaseStart(entry, currentLevel, daysSinceAllotment)
    : undefined;

  const effectiveTargetDisplay = canValue
    ? formatEffectiveTargetCell(computeObservationScheduleMetrics(product, asOfSelected).effectiveTarget)
    : "—";

  const specCards = useMemo(() => buildProductSpecCards(product), [product]);

  const lifecycleCards = useMemo(
    () =>
      [
        {
          label: labels.daysToRollover,
          value: daysLeftToMaturity != null ? formatNumber(daysLeftToMaturity, 0) : "—",
        },
        { label: labels.daysElapsed, value: daysSinceAllotment != null ? formatNumber(daysSinceAllotment, 0) : "—" },
        { label: labels.productIrr, value: valuation && canValue ? formatPercent(valuation.productIrr, 2) : "—" },
        { label: labels.underlyingIrr, value: underlyingIrr != null ? formatPercent(underlyingIrr, 2) : "—" },
        {
          label: labels.couponFormed,
          value: valuation && canValue ? formatFormulaReturn(valuation.formulaReturn) : "—",
        },
        { label: labels.coupon, value: valuation && canValue ? formatPercent(valuation.absReturn, 1) : "—" },
        { label: "Effective Target", value: effectiveTargetDisplay },
      ] as Array<{ label: string; value: string }>,
    [
      canValue,
      daysLeftToMaturity,
      daysSinceAllotment,
      effectiveTargetDisplay,
      labels.coupon,
      labels.couponFormed,
      labels.daysElapsed,
      labels.daysToRollover,
      labels.productIrr,
      labels.underlyingIrr,
      underlyingIrr,
      valuation,
    ],
  );

  const allSpecCards = useMemo(
    () => [...specCards, ...(!isExpired ? lifecycleCards : [])],
    [specCards, lifecycleCards, isExpired],
  );
  const { width: uniformWidth, height: uniformHeight, MeasureLayer } = useUniformSpecCardSize(allSpecCards);

  return (
    <div className="space-y-4">
      {MeasureLayer}
      <Panel className="!p-4" glow="purple">
        <SectionTitle>Product Specifications</SectionTitle>
        <UniformSpecRail
          cards={specCards}
          className="mt-4"
          uniformHeight={uniformHeight}
          uniformWidth={uniformWidth}
        />
      </Panel>

      {!isExpired ? (
        <Panel className="!p-4" glow="cyan">
          <SectionTitle>{labels.lifecycleSection}</SectionTitle>
          <p className="mt-1 text-xs text-stone-500">{labels.performanceNote}</p>
          <UniformSpecRail
            cards={lifecycleCards}
            className="mt-4"
            uniformHeight={uniformHeight}
            uniformWidth={uniformWidth}
          />
        </Panel>
      ) : null}

      {levels.length > 0 ? (
        <Panel className="!p-4" glow="purple">
          <SectionTitle>Observation Dates</SectionTitle>
          <p className="mt-1 text-xs text-stone-500">
            Underlying level on each observation date and its performance versus the initial fixing at allotment.
          </p>
          <div className="mt-3">
            <ObservationDatesTable levels={levels} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
