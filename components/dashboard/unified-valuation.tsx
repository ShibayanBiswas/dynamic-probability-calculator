"use client";

import { useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";

import { ExcelInputPanel } from "@/components/dashboard/excel-input-panel";
import { LifecycleProductList } from "@/components/dashboard/lifecycle-product-list";
import { ProductNarrative } from "@/components/dashboard/product-narrative";
import { ProductSpecificationsPanel } from "@/components/dashboard/product-specifications-panel";
import { RevealOutput } from "@/components/ui/reveal-output";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import {
  AppPage,
  Button,
  FieldRow,
  FieldStack,
  KpiBand,
  Output,
  OutputGlow,
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
import { hasResolvedDeskIndexLevel } from "@/lib/desk-index-guards";
import { useLiveIndexLevel } from "@/lib/hooks/use-live-index-level";
import { useLifecycleFilter } from "@/lib/hooks/use-lifecycle-filter";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import {
  pickLifecyclePoolProduct,
  useLifecycleProductPick,
  useResyncProductToLifecyclePool,
} from "@/lib/hooks/use-lifecycle-pool-product";
import { buildValuationExpirationMaturityFields } from "@/lib/valuation-output-fields";
import { valuationMetricLabels } from "@/lib/valuation-labels";
import {
  buildDeskExportInputs,
  buildObservationExportTable,
  buildScreenSpecExportRows,
  buildValuationDateDisplays,
  buildValuationOutputSheetRows,
} from "@/lib/workbook/build-screen-export-payload";
import {
  getLifecyclePickerPool,
  isValuationApplicableAt,
  LIFECYCLE_FILTERS,
  type LifecycleFilter,
  LIFECYCLE_FILTER_LABELS,
} from "@/lib/product-lifecycle";
import { ProductOutputGuard } from "@/components/ui/product-output-guard";
import { formatOptionalNumber, handleOutputReveal } from "@/lib/product-data-guards";
import {
  getDebenturePrice,
  getIndexEntryLevelRaw,
  getProductIndexFieldLabel,
  getTargetLevel,
  rawField,
} from "@/lib/product-utils";
import { getProductAllotmentDate, getProductMaturityDate, getProductTenorDays, getProductTradeOpeningDate, getRolloverTenorDays, isTenYearRolloverProduct } from "@/lib/product-dates";
import { formatDisplayDate, parseExcelishDate } from "@/lib/workbook/dates";
import type { ProductRecord } from "@/lib/types";
import { computeValuation } from "@/lib/workbook/valuation-engine";
import { useScreenExcelExport } from "@/lib/hooks/use-screen-excel-export";
import { formatCrores, formatCurrency, formatFormulaReturn, formatNumber, formatPercent, formatProductUnitValue, formatReportAsOf } from "@/lib/utils";
import { formatExpiredAsOfPatch } from "@/lib/expired-valuation-dates";
import { DeskDataQualityBanner } from "@/components/ui/desk-data-quality-banner";
import { assessProductData } from "@/lib/product-data-guards";
const TABS = [
  { id: "interface", label: "Valuation Interface" },
  { id: "products", label: "Product List" },
];

export function UnifiedValuationDashboard() {
  const masterProducts = useMasterProducts();
  const selection = useProductSelection();
  const { asOf } = usePortfolioClock();
  const { filter: lifecycle, setFilter: setLifecycle } = useLifecycleFilter("ongoing");
  const [tab, setTab] = useState("interface");

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

  // Expired products mark to the chosen observation date at the historical
  // index level on that date, not the live market level.
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

  const effectiveLevel = useLiveIndexLevel(product, isExpired, expiredIndexLevels);

  const valuation = useMemo(() => {
    if (!product || !isValuationApplicableAt(product, effectiveDate)) return null;
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
    const inputs = {
      valuationDate: effectiveDate,
      currentLevel: effectiveLevel,
      debentures: Math.max(1, Math.round(Number(selection.debentures) || 100)),
    };
    return computeValuation(product, inputs);
  }, [
    product,
    isExpired,
    effectiveDate,
    effectiveLevel,
    expiredIndexLoading,
    selection.indexSyncLoading,
    selection.marketStatus,
    selection.niftyLevel,
    selection.sensexLevel,
    selection.debentures,
    selection.marketLevels?.niftyLevel,
    selection.marketLevels?.sensexLevel,
    expiredNifty,
    expiredSensex,
    expiredLevel,
  ]);

  return (
    <AppPage dense title="Valuation">
      <HorizontalBand>
        <Panel className="!p-4" glow="cyan">
          <SectionInfo {...SECTION_INFO["val-filter"]} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SubTitle>Primary Valuation · Portfolio Filter</SubTitle>
            <div className="flex flex-wrap gap-2">
              {LIFECYCLE_FILTERS.map((key) => (
                <Button key={key} active={lifecycle === key} variant="pill" onClick={() => setLifecycle(key)}>
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

      {tab === "interface" ? (
        <ValuationInterface
          effectiveDate={effectiveDate}
          expiredNifty={expiredNifty}
          expiredSensex={expiredSensex}
          isExpired={isExpired}
          lifecycle={lifecycle}
          pool={pool}
          product={product}
          qualityNotice={qualityNotice}
          resetToLifecycleDefaults={resetToLifecycleDefaults}
          selectFromPool={selectFromPool}
          selection={selection}
          valuation={valuation}
        />
      ) : null}
      {tab === "products" ? (
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

function ValuationInterface({
  pool,
  product,
  selection,
  valuation,
  lifecycle,
  isExpired,
  effectiveDate,
  expiredNifty,
  expiredSensex,
  qualityNotice,
  resetToLifecycleDefaults,
  selectFromPool,
}: {
  pool: ProductRecord[];
  product?: ProductRecord;
  selection: ReturnType<typeof useProductSelection>;
  valuation: ReturnType<typeof computeValuation> | null;
  lifecycle: LifecycleFilter;
  isExpired: boolean;
  effectiveDate: string;
  expiredNifty: number | null;
  expiredSensex: number | null;
  qualityNotice: ReturnType<typeof useLifecycleProductPick>["qualityNotice"];
  resetToLifecycleDefaults: ReturnType<typeof useLifecycleProductPick>["resetToLifecycleDefaults"];
  selectFromPool: ReturnType<typeof useLifecycleProductPick>["selectFromPool"];
}) {
  const labels = valuationMetricLabels(isExpired, effectiveDate, product);
  const { exporting: exportingScreen, runExport: runScreenExport, warmExport: warmScreenExport } =
    useScreenExcelExport();
  const outputResetKey = useMemo(
    () =>
      [
        product?.rowId,
        selection.valuationDate,
        selection.niftyLevel,
        selection.sensexLevel,
        selection.indexSyncLoading,
        selection.marketStatus,
        selection.debentures,
        selection.isin,
        selection.productCode,
      ].join("|"),
    [product?.rowId, selection.valuationDate, selection.niftyLevel, selection.sensexLevel, selection.indexSyncLoading, selection.marketStatus, selection.debentures, selection.isin, selection.productCode],
  );

  const allotmentDate = product ? getProductAllotmentDate(product) : undefined;
  const allotmentDisplay = allotmentDate ? formatDisplayDate(allotmentDate) : "—";
  const tradeDate = product ? getProductTradeOpeningDate(product) : undefined;
  const tradeDisplay = tradeDate
    ? formatDisplayDate(tradeDate)
    : (product ? rawField(product, "Trade Date/Opening date", "Trade Date") : undefined) ?? "—";
  const maturityDate = product ? getProductMaturityDate(product) : undefined;
  const maturityDisplay = maturityDate ? formatDisplayDate(maturityDate) : product?.maturityRaw ?? "—";
  const asOfSelected = parseExcelishDate(effectiveDate);
  const productTenorDays = product ? getProductTenorDays(product, asOfSelected ?? undefined) : undefined;
  const rolloverTenorDays =
    product && isTenYearRolloverProduct(product) ? getRolloverTenorDays(product) : undefined;
  const dateDisplays = product ? buildValuationDateDisplays(product) : null;

  const deskExportInputs = useMemo(
    () =>
      buildDeskExportInputs(isExpired, {
        valuationDate: effectiveDate,
        niftyLevel: selection.niftyLevel,
        sensexLevel: selection.sensexLevel,
        debentures: selection.debentures,
      }, { niftyLevel: expiredNifty, sensexLevel: expiredSensex }),
    [effectiveDate, expiredNifty, expiredSensex, isExpired, selection.debentures, selection.niftyLevel, selection.sensexLevel],
  );

  const valuationOutputSheet = useMemo(() => {
    if (!product || !dateDisplays) return [];
    return buildValuationOutputSheetRows({
      product,
      valuation,
      effectiveDate,
      isExpired,
      tradeDisplay: dateDisplays.tradeDisplay,
      allotmentDisplay: dateDisplays.allotmentDisplay,
      maturityDisplay: dateDisplays.maturityDisplay,
      productTenorDays,
      rolloverTenorDays,
    });
  }, [dateDisplays, effectiveDate, isExpired, productTenorDays, rolloverTenorDays, product, valuation]);

  const valuationSpecRows = useMemo(() => {
    if (!product) return [];
    return buildScreenSpecExportRows("valuation", product, {
      underlyingLevel: valuation?.currentLevel,
      underlyingLevelLabel: `Val. Date ${getProductIndexFieldLabel(product)} Level`,
      asOf: asOfSelected ?? undefined,
    });
  }, [asOfSelected, product, valuation?.currentLevel]);

  const valuationObservationRows = useMemo(
    () => (product ? buildObservationExportTable(product, asOfSelected ?? new Date()) : []),
    [asOfSelected, product],
  );

  return (
    <>
      <HorizontalBand className="mt-4">
        <Panel className="!p-4" glow="purple">
          <SectionInfo {...SECTION_INFO["val-inputs"]} />
          <SectionTitle>Inputs</SectionTitle>
          <div className="mt-4">
            <ExcelInputPanel
              activeProduct={product}
              category={product?.category ?? "Primary"}
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
                          const { downloadValuationScreenExcel } = await import("@/lib/workbook/export-screen");
                          await downloadValuationScreenExcel({
                            product,
                            valuation,
                            inputs: {
                              ...deskExportInputs,
                              isin: selection.isin,
                              productCode: selection.productCode,
                            },
                            outputSheet: valuationOutputSheet,
                            specRows: valuationSpecRows,
                            observationRows: valuationObservationRows,
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
                          const { downloadValuationScreenPdf } = await import("@/lib/workbook/export-screen-pdf");
                          await downloadValuationScreenPdf({
                            product,
                            valuation,
                            inputs: deskExportInputs,
                            outputSheet: valuationOutputSheet,
                            specRows: valuationSpecRows,
                            observationRows: valuationObservationRows,
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
              label="Click here to view valuation output"
              resetKey={outputResetKey}
              onReveal={() => {
                warmScreenExport();
                handleOutputReveal(product);
              }}
            >
              <ProductOutputGuard mode="valuation" product={product}>
                {({ showValues }) =>
                  showValues ? (
                    <>
                <KpiBand
                  items={[
                    {
                      label: labels.value,
                      value: isValuationApplicableAt(product, effectiveDate)
                        ? formatProductUnitValue(valuation?.productValue ?? 0)
                        : "—",
                    },
                    {
                      label: labels.coupon,
                      value: isValuationApplicableAt(product, effectiveDate)
                        ? formatPercent(valuation?.absReturn ?? 0, 1)
                        : "—",
                    },
                    {
                      label: labels.couponFormed,
                      value: isValuationApplicableAt(product, effectiveDate)
                        ? formatFormulaReturn(valuation?.formulaReturn ?? 0)
                        : "—",
                    },
                    {
                      label: labels.productIrr,
                      value: isValuationApplicableAt(product, effectiveDate)
                        ? formatPercent(valuation?.productIrr ?? 0, 2)
                        : "—",
                    },
                    {
                      label: "Total Amount",
                      value: isValuationApplicableAt(product, effectiveDate)
                        ? formatCurrency(valuation?.totalAmount ?? 0, false)
                        : "—",
                    },
                  ]}
                />

              <HorizontalBand className="mt-4">
                <ProductNarrative product={product} />
              </HorizontalBand>

              <HorizontalBand className="mt-4">
                <ProductSpecificationsPanel
                  product={product}
                  options={{
                    underlyingLevel: valuation?.currentLevel,
                    underlyingLevelLabel: `Val. Date ${getProductIndexFieldLabel(product)} Level`,
                    asOf: parseExcelishDate(effectiveDate) ?? undefined,
                  }}
                />
              </HorizontalBand>

              <HorizontalBand className="mt-4">
                <Panel className="!p-4" glow="cyan">
                  <SectionTitle>Output Sheet</SectionTitle>
                  <SectionInfo {...SECTION_INFO["val-output"]} />
                  <FieldStack>
                <FieldRow label="Product Name">
                  <Output>{product.name}</Output>
                </FieldRow>
                <FieldRow label="Category">
                  <OutputGlow accent="cyan">{product.category}</OutputGlow>
                </FieldRow>
                <FieldRow label="ISIN">
                  <Output className="font-mono text-sm">{product.isin ?? "—"}</Output>
                </FieldRow>
                <FieldRow label="Issuer">
                  <Output>{product.issuer ?? "—"}</Output>
                </FieldRow>
                <FieldRow label="Underlying">
                  <Output>{product.underlying ?? "—"}</Output>
                </FieldRow>
                <FieldRow label="Entry / Initial Fixing">
                  <OutputGlow accent="purple">
                    {formatOptionalNumber(getIndexEntryLevelRaw(product) ?? valuation?.indexEntryLevel, formatNumber)}
                  </OutputGlow>
                </FieldRow>
                <FieldRow label={`Val. Date ${getProductIndexFieldLabel(product)} Level`}>
                  <OutputGlow accent="cyan">
                    {formatOptionalNumber(valuation?.currentLevel, formatNumber)}
                  </OutputGlow>
                </FieldRow>
                <FieldRow label="Target Level">
                  <Output>
                    {String(getTargetLevel(product) ?? rawField(product, "Target Level", "Target Nifty ") ?? "—")}
                  </Output>
                </FieldRow>
                <FieldRow label="Price / Debenture">
                  <Output>{formatProductUnitValue(getDebenturePrice(product))}</Output>
                </FieldRow>
                <FieldRow label="Trade Date">
                  <Output>{tradeDisplay}</Output>
                </FieldRow>
                <FieldRow label="Allotment Date">
                  <Output>{allotmentDisplay}</Output>
                </FieldRow>
                {buildValuationExpirationMaturityFields(product, maturityDisplay).map(({ label, value }) => (
                  <FieldRow key={label} label={label}>
                    <Output>{value}</Output>
                  </FieldRow>
                ))}
                {rolloverTenorDays != null ? (
                  <FieldRow label="Rollover Tenor · Days">
                    <Output>{formatNumber(rolloverTenorDays, 0)}</Output>
                  </FieldRow>
                ) : null}
                <FieldRow label="Product Tenor · Days">
                  <Output>{productTenorDays != null ? formatNumber(productTenorDays, 0) : "—"}</Output>
                </FieldRow>
                <FieldRow label={labels.daysElapsed}>
                  <Output>{valuation ? formatNumber(valuation.elapsedDays, 0) : "—"}</Output>
                </FieldRow>
                <FieldRow label="Underlying Performance">
                  <OutputGlow accent="green">{formatPercent(valuation?.z ?? 0, 1)}</OutputGlow>
                </FieldRow>
                <FieldRow label={labels.couponFormed}>
                  <OutputGlow accent="green">{formatFormulaReturn(valuation?.formulaReturn ?? 0)}</OutputGlow>
                </FieldRow>
                <FieldRow label={labels.productIrr}>
                  <OutputGlow accent="purple">{formatPercent(valuation?.productIrr ?? 0, 2)}</OutputGlow>
                </FieldRow>
                <FieldRow label={labels.value}>
                  <OutputGlow accent="cyan">{formatProductUnitValue(valuation?.productValue ?? 0)}</OutputGlow>
                </FieldRow>
                <FieldRow label="Total Amount">
                  <Output>{formatCurrency(valuation?.totalAmount ?? 0, false)}</Output>
                </FieldRow>
                <FieldRow label="Notional">
                  <Output>{product.tradeAmount ? formatCrores(product.tradeAmount) : "—"}</Output>
                </FieldRow>
              </FieldStack>
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
