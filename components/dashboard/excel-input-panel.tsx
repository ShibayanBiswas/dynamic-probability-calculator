"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { ObservationDateSelect } from "@/components/ui/observation-date-select";
import { useIndexAtDate } from "@/lib/hooks/use-index-at-date";
import { IsinSelect, ProductCodeSelect } from "@/components/ui/identity-selects";
import { ProductSelectField } from "@/components/ui/product-select-field";
import { DebentureSelect } from "@/components/ui/debenture-select";
import { ValuationDatePicker } from "@/components/ui/valuation-date-picker";
import { Button, FieldRow, FieldStack, Input, SubTitle } from "@/components/layout/app-ui";
import {
  instantNiftyForDeskDate,
  instantSensexForDeskDate,
} from "@/lib/client/index-at-date-client";
import { formatDeskIndexLevel } from "@/lib/desk-index-state";
import { pickDefaultLifecycleProduct } from "@/lib/desk-lifecycle-defaults";
import { useMasterProducts } from "@/lib/hooks/use-master-products";
import { usePortfolioClock } from "@/lib/hooks/use-portfolio-clock";
import {
  getPayoffSteps,
  getValuationInputFields,
  VALUATION_DISCLAIMER,
} from "@/lib/dashboard-input-config";
import { useProductSelection } from "@/lib/context/product-selection-provider";
import { getWorkingAllotmentDate } from "@/lib/product-dates";
import {
  clampValuationDateToPhaseWindow,
  getLifecyclePickerPool,
  getProductLifecycleStatus,
  isProductInLifecyclePickerPool,
  lifecycleFilterBookLabel,
  type LifecycleFilter,
} from "@/lib/product-lifecycle";
import { pickLifecyclePoolProduct } from "@/lib/hooks/use-lifecycle-pool-product";
import {
  getDebenturePrice,
  getProductIndexFieldLabel,
  isCustomUnderlyingProduct,
} from "@/lib/product-utils";
import { lookupCustomUnderlyingMetaOnOrBefore, resolveCustomUnderlyingLevel } from "@/lib/custom-underlying-history";
import { resolveCustomUnderlyingSpec } from "@/lib/underlying-benchmark";
import { formatDeskDate } from "@/lib/market-data";
import { formatDisplayDate, isDeskToday, parseExcelishDate } from "@/lib/workbook/dates";
import {
  computeObservationScheduleMetrics,
  formatEffectiveTargetCell,
} from "@/lib/portfolio-observation-metrics";
import {
  parseTargetUnderlyingPercentInput,
  workingTargetLevel,
} from "@/lib/probability/target-override";
import type { ProductCategory, ProductRecord } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Product picker universes scoped to the active lifecycle tab.
 * ISIN / code / name search only surfaces products in the current book —
 * an expired row cannot be picked while the Ongoing tab is active.
 */
function useProductUniverses(lifecycleFilter: LifecycleFilter | undefined, pool: ProductRecord[]) {
  const allMaster = useMasterProducts();
  const { asOf } = usePortfolioClock();
  return useMemo(() => {
    const book = allMaster.length > 0 ? allMaster : pool;

    if (!lifecycleFilter) {
      return { searchProducts: book, browseProducts: book };
    }

    const tabPool = getLifecyclePickerPool(book, lifecycleFilter, asOf);

    // Browse + search both use the full tab pool so "Select the Primary Structured
    // Product" scrolls every product under Ongoing / Obs-due.
    return {
      searchProducts: tabPool,
      browseProducts: tabPool,
    };
  }, [allMaster, pool, lifecycleFilter, asOf]);
}

export function ExcelInputPanel({
  category,
  products,
  mode,
  compact,
  lifecycleFilter,
  activeProduct,
  onPickProduct,
  onResetDefaults,
}: {
  category: ProductCategory;
  products: ProductRecord[];
  mode: "valuation" | "payoff" | "probability";
  compact?: boolean;
  lifecycleFilter?: LifecycleFilter;
  /** Product aligned to the lifecycle pool — keeps inputs in sync with valuation output. */
  activeProduct?: ProductRecord;
  /** Lifecycle guard — resets to tab default and raises data-quality popups on hard blockers. */
  onPickProduct?: (product: ProductRecord) => void;
  /** Optional page-level reset (clears quality banners). Falls back to panel default pick. */
  onResetDefaults?: () => void;
}) {
  const selection = useProductSelection();
  const pickProduct = onPickProduct ?? ((picked: ProductRecord) => selection.selectProduct(picked));
  const { resolveIndexLevelsForDate } = useIndexAtDate();
  const { asOf } = usePortfolioClock();
  const { searchProducts, browseProducts } = useProductUniverses(lifecycleFilter, products);
  const poolProduct =
    activeProduct ??
    pickLifecyclePoolProduct(products, selection.resolvedProduct, lifecycleFilter ?? "ongoing", asOf);
  const product = poolProduct;
  const selectionOutsidePool =
    lifecycleFilter != null &&
    selection.resolvedProduct != null &&
    !isProductInLifecyclePickerPool(selection.resolvedProduct, lifecycleFilter, asOf);
  const lifecycleStatus = product ? getProductLifecycleStatus(product, asOf) : undefined;
  const isExpired = lifecycleStatus === "expired";
  const pickerIsin = selectionOutsidePool ? (product?.isin ?? "") : selection.isin;
  const pickerCode = selectionOutsidePool
    ? (product?.series ?? String(product?.raw["Product Code"] ?? ""))
    : selection.productCode;
  const pickerName = selectionOutsidePool ? (product?.name ?? "") : selection.productName;
  const usesValuationInputs = mode === "valuation" || mode === "probability";
  const isLiveMark = usesValuationInputs && !isExpired && isDeskToday(selection.valuationDate);
  const steps = !compact && mode === "payoff" ? getPayoffSteps() : null;
  const fields = usesValuationInputs ? getValuationInputFields() : null;

  const indexSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionRef = useRef(selection);
  const productRef = useRef(product);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useEffect(() => {
    productRef.current = product;
  }, [product]);

  const handleValuationDateChange = useCallback(
    (next: string) => {
      const clamped =
        product && !isExpired ? clampValuationDateToPhaseWindow(product, next) : next;
      selection.setField("valuationDate", clamped);
      if (isExpired) return;

      if (isDeskToday(clamped)) {
        // Drop historical marks so live Yahoo can repaint Val. Date Nifty / Sensex.
        selection.setValuationIndexLevels(
          {
            niftyLevel: selection.marketLevels?.niftyLevel ?? null,
            sensexLevel: selection.marketLevels?.sensexLevel ?? null,
          },
          product,
          { replaceEmpty: true },
        );
        void selection.refreshMarket({ force: true });
        return;
      }

      // Instant historical closes — replaceEmpty clears any stale live opposite leg
      // while the Mongo/Yahoo-at-date resolve finishes.
      selection.setValuationIndexLevels(
        {
          niftyLevel: instantNiftyForDeskDate(clamped) ?? null,
          sensexLevel: instantSensexForDeskDate(clamped) ?? null,
        },
        product,
        { replaceEmpty: true },
      );
    },
    [isExpired, product, selection],
  );

  /** Restore tab default product, valuation/observation date, debentures, and market levels. */
  const handleResetToDefaults = useCallback(() => {
    if (onResetDefaults) {
      onResetDefaults();
      void selection.refreshMarket({ force: true });
      return;
    }
    const filter = lifecycleFilter ?? "ongoing";
    const next = pickDefaultLifecycleProduct(searchProducts, filter, asOf);
    if (!next) return;
    if (onPickProduct) {
      onPickProduct(next);
    } else {
      selection.selectProduct(next, { silent: true, resetValuationDate: true });
    }
    selection.setCategory(category);
    void selection.refreshMarket({ force: true });
  }, [asOf, category, lifecycleFilter, onPickProduct, onResetDefaults, searchProducts, selection]);

  // When the product changes, snap Valuation Date into its phase window.
  useEffect(() => {
    if (!usesValuationInputs || !product || isExpired || !selection.valuationDate) return;
    const clamped = clampValuationDateToPhaseWindow(product, selection.valuationDate);
    if (clamped !== selection.valuationDate) {
      selection.setField("valuationDate", clamped);
    }
  }, [usesValuationInputs, product, isExpired, selection.valuationDate, selection]);

  const liveIndexDisplay = useCallback(
    (fieldKey: "niftyLevel" | "sensexLevel", stored: string) => {
      // When marking as of today, always prefer the live Yahoo/desk sync over a stale cached level.
      if (isLiveMark && selection.marketLevels) {
        const live =
          fieldKey === "niftyLevel" ? selection.marketLevels.niftyLevel : selection.marketLevels.sensexLevel;
        if (live > 0) return formatDeskIndexLevel(live);
      }
      const num = Number(stored);
      if (num > 0) return stored;
      return stored;
    },
    [isLiveMark, selection.marketLevels],
  );

  useEffect(() => {
    if (!usesValuationInputs || !selection.valuationDate) return;
    // Live desk today — market sync owns levels; avoid duplicate resolve cycles that flicker inputs.
    if (!isExpired && isDeskToday(selection.valuationDate)) return;

    if (indexSyncTimer.current) clearTimeout(indexSyncTimer.current);

    // Brief debounce so calendar scrubbing settles; optimistic levels already applied on change.
    indexSyncTimer.current = setTimeout(() => {
      const active = productRef.current;
      const sel = selectionRef.current;
      const minDesk = active
        ? formatDeskDate(getWorkingAllotmentDate(active) ?? new Date(0))
        : undefined;

      sel.setIndexSyncLoading(true);
      void resolveIndexLevelsForDate(
        sel.valuationDate,
        minDesk !== "Unknown" ? minDesk : undefined,
        (levels) => {
          selectionRef.current.setValuationIndexLevels(levels, productRef.current);
        },
      ).finally(() => {
        selectionRef.current.setIndexSyncLoading(false);
      });
    }, 200);

    return () => {
      if (indexSyncTimer.current) clearTimeout(indexSyncTimer.current);
    };
  }, [usesValuationInputs, product?.rowId, isExpired, selection.valuationDate, resolveIndexLevelsForDate]);

  return (
    <div className="space-y-3">
      {selectionOutsidePool ? (
        <div className="desk-alert" role="status">
          <span className="font-semibold">{selection.resolvedProduct?.name}</span> is not in the{" "}
          <span className="font-semibold">{lifecycleFilterBookLabel(lifecycleFilter)}</span>{" "}
          book — switch lifecycle tab or pick a product from this list. Showing{" "}
          <span className="font-semibold">{product?.name ?? "the first product in this book"}</span> instead.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {isLiveMark && selection.marketLevels ? (
            <span className="market-live-badge">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live · {selection.marketLevels.source === "yahoo" ? "Yahoo Finance" : "Desk fallback"}
            </span>
          ) : null}
          {usesValuationInputs && selection.valuationDate && !isLiveMark ? (
            <span className="desk-badge">
              {isExpired ? "Historical observation" : "Historical"} · index levels for{" "}
              {selection.valuationDate}
            </span>
          ) : null}
          {mode === "payoff" && !isExpired && selection.marketLevels ? (
            <span className="market-live-badge">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live · {selection.marketLevels.source === "yahoo" ? "Yahoo Finance" : "Desk fallback"} ·
              payoff scenarios
            </span>
          ) : null}
          {mode === "payoff" && isExpired ? (
            <span className="desk-badge">
              Historical observation · index levels for {selection.valuationDate || "selected date"}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          title="Restore tab default product, valuation date, and refresh index levels"
          variant="ghost"
          onClick={handleResetToDefaults}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {usesValuationInputs && fields ? (
        <div>
          <FieldStack>
            {fields.map((field) => {
              if (field.type === "divider") {
                return (
                  <p key={field.key} className="py-1 text-center text-xs font-bold uppercase tracking-[0.3em] text-stone-500">
                    — {field.label} —
                  </p>
                );
              }
              if (field.key === "isin") {
                return (
                  <FieldRow key={field.key} label={field.label}>
                    <IsinSelect
                      products={searchProducts}
                      value={pickerIsin}
                      onChange={(isin, picked) => {
                        if (!picked || !lifecycleFilter || isProductInLifecyclePickerPool(picked, lifecycleFilter, asOf)) {
                          selection.setField("isin", isin);
                          if (picked) pickProduct(picked);
                          selection.setCategory(category);
                        }
                      }}
                    />
                  </FieldRow>
                );
              }
              if (field.key === "productCode") {
                return (
                  <FieldRow key={field.key} label={field.label}>
                    <ProductCodeSelect
                      products={searchProducts}
                      value={pickerCode}
                      onChange={(code, picked) => {
                        if (!picked || !lifecycleFilter || isProductInLifecyclePickerPool(picked, lifecycleFilter, asOf)) {
                          selection.setField("productCode", code);
                          if (picked) pickProduct(picked);
                          selection.setCategory(category);
                        }
                      }}
                    />
                  </FieldRow>
                );
              }
              if (field.key === "productName") {
                return (
                  <FieldRow key={field.key} label={field.label} wide>
                    <ProductSelectField
                      browseProducts={browseProducts}
                      products={searchProducts}
                      value={pickerName}
                      onSelect={(p) => {
                        if (!lifecycleFilter || isProductInLifecyclePickerPool(p, lifecycleFilter, asOf)) {
                          pickProduct(p);
                          selection.setCategory(category);
                        }
                      }}
                    />
                  </FieldRow>
                );
              }
              if (field.key === "debentures") {
                if (mode === "probability") return null;
                return (
                  <FieldRow key={field.key} label={field.label}>
                    <DebentureSelect
                      product={product}
                      value={selection.debentures}
                      onChange={(v) => selection.setField("debentures", v)}
                    />
                  </FieldRow>
                );
              }
              if (field.type === "targetLevelDisplay" || field.type === "targetUnderlying") {
                if (mode !== "probability") return null;
                return (
                  <ProbabilityTargetFields
                    key={field.key}
                    fieldKey={field.key}
                    product={product}
                    asOf={asOf}
                    valuationDate={selection.valuationDate}
                  />
                );
              }
              const stateKey = field.key as keyof typeof selection;
              if (!(stateKey in selection)) return null;
              const stored = String(selection[stateKey] ?? "");
              if (field.key === "valuationDate") {
                return (
                  <FieldRow key={field.key} label={field.label}>
                    {isExpired ? (
                      <ObservationDateSelect
                        product={product}
                        value={stored}
                        onChange={handleValuationDateChange}
                      />
                    ) : (
                      <ValuationDatePicker
                        product={product}
                        value={stored}
                        onChange={handleValuationDateChange}
                      />
                    )}
                  </FieldRow>
                );
              }
              const value =
                field.key === "niftyLevel" || field.key === "sensexLevel"
                  ? liveIndexDisplay(field.key, stored)
                  : stored;
              return (
                <FieldRow key={field.key} label={field.label}>
                  <Input
                    readOnly={isExpired && (field.key === "niftyLevel" || field.key === "sensexLevel")}
                    className={cn(field.highlight && "input-glow", field.key === "valuationDate" && "font-semibold text-ink")}
                    type={field.type === "number" ? "number" : "text"}
                    value={value}
                    onChange={(e) => selection.setField(stateKey as "isin", e.target.value)}
                  />
                </FieldRow>
              );
            })}
          </FieldStack>
          {mode === "valuation" ? (
            <DisclaimerBox className="mt-4">{VALUATION_DISCLAIMER}</DisclaimerBox>
          ) : null}
        </div>
      ) : (
        <PayoffInputBlock
          activeProduct={product}
          asOf={asOf}
          browseProducts={browseProducts}
          category={category}
          lifecycleFilter={lifecycleFilter}
          onPickProduct={pickProduct}
          pickerName={pickerName}
          searchProducts={searchProducts}
        />
      )}

      {steps ? (
        <div className="rounded-2xl border border-maroon/20 bg-maroon/5 p-4">
          <SubTitle>Steps</SubTitle>
          <ol className="mt-3 space-y-4">
            {steps.map((s) => (
              <li key={s.step}>
                <p className="text-sm font-semibold text-ink">
                  {s.step}) {s.title}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-stone-600">
                  {s.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function PayoffInputBlock({
  category,
  searchProducts,
  browseProducts,
  activeProduct,
  lifecycleFilter,
  asOf,
  pickerName,
  onPickProduct,
}: {
  category: ProductCategory;
  searchProducts: ProductRecord[];
  browseProducts: ProductRecord[];
  activeProduct?: ProductRecord;
  lifecycleFilter?: LifecycleFilter;
  asOf: Date;
  pickerName: string;
  onPickProduct: (product: ProductRecord) => void;
}) {
  const selection = useProductSelection();
  const { resolveIndexLevelsForDate } = useIndexAtDate();
  const product = activeProduct;
  const isExpired = product ? getProductLifecycleStatus(product, asOf) === "expired" : false;
  const isLiveMark = !isExpired && isDeskToday(selection.valuationDate);
  const niftyLevel =
    (isLiveMark && selection.marketLevels && selection.marketLevels.niftyLevel > 0
      ? selection.marketLevels.niftyLevel
      : Number(selection.niftyLevel)) || 0;
  const sensexLevel =
    (isLiveMark && selection.marketLevels && selection.marketLevels.sensexLevel > 0
      ? selection.marketLevels.sensexLevel
      : Number(selection.sensexLevel)) || 0;
  const isCustom = product ? isCustomUnderlyingProduct(product) : false;
  const indexLabel = product ? getProductIndexFieldLabel(product) : "Nifty";
  const customMeta =
    product && isCustom && selection.valuationDate
      ? (() => {
          const d = parseExcelishDate(selection.valuationDate);
          const spec = resolveCustomUnderlyingSpec(product);
          if (!d || !spec) return null;
          return lookupCustomUnderlyingMetaOnOrBefore(spec.key, d);
        })()
      : null;
  // Working!F — Phase 2 = Trade Date; Blank / Phase 1 / 10Y = Allotment (label always "Start Date")
  const phaseStart = product ? getWorkingAllotmentDate(product, asOf) : undefined;
  const phaseStartDisplay = phaseStart ? formatDisplayDate(phaseStart) : "—";
  const priceDisplay = product ? formatNumber(getDebenturePrice(product), 0) : "—";
  const indexLoading =
    selection.marketStatus === "loading" || selection.indexSyncLoading === true;
  const niftyDisplay =
    niftyLevel > 0
      ? formatNumber(niftyLevel)
      : indexLoading
        ? "Fetching from Yahoo…"
        : "—";
  const sensexDisplay =
    sensexLevel > 0
      ? formatNumber(sensexLevel)
      : indexLoading
        ? "Fetching from Yahoo…"
        : "—";

  const handleObservationDateChange = (next: string) => {
    selection.setField("valuationDate", next);
    if (isCustom && product) {
      const d = parseExcelishDate(next);
      const level = d ? resolveCustomUnderlyingLevel(product, d) : undefined;
      selection.setValuationIndexLevels(
        { niftyLevel: level ?? null, sensexLevel: null },
        product,
        { replaceEmpty: true },
      );
      return;
    }
    const minDesk = product
      ? formatDeskDate(getWorkingAllotmentDate(product, asOf) ?? new Date(0))
      : undefined;
    void resolveIndexLevelsForDate(
      next,
      minDesk !== "Unknown" ? minDesk : undefined,
      (levels) => selection.setValuationIndexLevels(levels, product),
    );
  };

  return (
    <FieldStack>
      <FieldRow label="Product Name" wide>
        <ProductSelectField
          browseProducts={browseProducts}
          products={searchProducts}
          value={pickerName}
          onSelect={(p) => {
            if (!lifecycleFilter || isProductInLifecyclePickerPool(p, lifecycleFilter, asOf)) {
              onPickProduct(p);
              selection.setCategory(category);
            }
          }}
        />
      </FieldRow>
      {isExpired ? (
        <FieldRow label="Observation Date">
          <ObservationDateSelect product={product} value={selection.valuationDate} onChange={handleObservationDateChange} />
        </FieldRow>
      ) : null}
      {isCustom ? (
        <FieldRow label={`${indexLabel} Level · Underlying`}>
          <Input
            readOnly
            className="input-glow font-semibold text-maroon"
            value={niftyLevel > 0 ? formatNumber(niftyLevel) : "—"}
          />
        </FieldRow>
      ) : (
        <>
          <FieldRow label={indexLabel === "Nifty" ? "Nifty Level · Underlying" : "Nifty Level"}>
            <Input
              readOnly
              className={cn("input-glow font-semibold", indexLabel === "Nifty" ? "text-maroon" : "text-ink")}
              value={niftyDisplay}
            />
          </FieldRow>
          <FieldRow label={indexLabel === "Sensex" ? "Sensex Level · Underlying" : "Sensex Level"}>
            <Input
              readOnly
              className={cn("input-glow font-semibold", indexLabel === "Sensex" ? "text-maroon" : "text-ink")}
              value={sensexDisplay}
            />
          </FieldRow>
        </>
      )}
      {isExpired && isCustom ? (
        <p className="text-xs text-stone-500">
          {customMeta?.source === "estimate"
            ? `Expired mark uses an estimated ${indexLabel} level (commodity futures × USDINR) on the selected date — not a Nifty close.`
            : `Expired mark uses the historical ${indexLabel} close on the selected observation / maturity date — not Nifty.`}
        </p>
      ) : null}
      <FieldRow label="Start Date">
        <Input readOnly className="input-glow font-semibold text-ink" value={phaseStartDisplay} />
      </FieldRow>
      <FieldRow label="No. of Debentures">
        <DebentureSelect product={product} value={selection.debentures} onChange={(v) => selection.setField("debentures", v)} />
      </FieldRow>
      <FieldRow label="Initial Price / Debenture">
        <Input readOnly className="input-glow font-semibold text-ink" value={priceDisplay} />
      </FieldRow>
    </FieldStack>
  );
}

export function DisclaimerBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("desk-disclaimer", className)}>
      <span className="desk-disclaimer-label">Disclaimer · </span>
      {children}
    </div>
  );
}

/**
 * Probability desk absolute hurdle + editable Target Underlying %.
 * — 0 settled obs → read-only Target Level (from Entry × (1 + Target Underlying))
 * — ≥1 settled obs → read-only Effective Target (derived; not typed)
 * Target Underlying stays editable in both cases and drives dynamic recalculation.
 */
function ProbabilityTargetFields({
  fieldKey,
  product,
  asOf,
  valuationDate,
}: {
  fieldKey: string;
  product: ProductRecord | undefined;
  asOf: Date;
  valuationDate: string;
}) {
  const selection = useProductSelection();
  const checkingDate = parseExcelishDate(valuationDate) ?? asOf;

  const fraction = parseTargetUnderlyingPercentInput(selection.targetUnderlyingPct);
  const level = product ? workingTargetLevel(product, fraction) : null;
  const metrics = product
    ? computeObservationScheduleMetrics(product, checkingDate, { targetLevel: level })
    : null;
  const showEffectiveTarget = (metrics?.passed ?? 0) >= 1;

  if (fieldKey === "targetLevelDisplay") {
    const label = showEffectiveTarget ? "Effective Target" : "Target Level";
    const value = showEffectiveTarget
      ? formatEffectiveTargetCell(metrics?.effectiveTarget ?? null)
      : level != null && Number.isFinite(level)
        ? formatNumber(level)
        : "—";
    return (
      <FieldRow label={label}>
        <Input
          readOnly
          className="font-semibold text-ink"
          value={value}
          title={
            showEffectiveTarget
              ? "Read-only Effective Target — edit Target Underlying to recalculate"
              : "Read-only Target Level — edit Target Underlying to recalculate"
          }
        />
      </FieldRow>
    );
  }

  return (
    <FieldRow label="Target Underlying">
      <div className="relative">
        <Input
          className="input-glow pr-8 font-semibold text-ink"
          type="number"
          step="0.1"
          inputMode="decimal"
          value={selection.targetUnderlyingPct}
          onChange={(e) => selection.setField("targetUnderlyingPct", e.target.value)}
          title="Editable in all cases — percent points (36.0 = 36%)"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-stone-500">
          %
        </span>
      </div>
    </FieldRow>
  );
}
