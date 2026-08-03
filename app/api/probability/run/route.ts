import { NextResponse } from "next/server";

import { getIndexPricesBetween } from "@/lib/db/index-prices";
import niftyHistory from "@/lib/data/valuation-index-history.json";
import sensexHistory from "@/lib/data/sensex-index-history.json";
import {
  getCachedProbability,
  invalidateProbabilityCache,
  probabilityCacheKey,
  setCachedProbability,
} from "@/lib/probability/cache";
import {
  buildIndexSeries,
  runProbabilityBacktest,
  resolveUnderlyingKind,
  type ProbabilityRunResult,
} from "@/lib/probability/engine";
import { resolveMasterProducts } from "@/lib/server/resolve-master-products";
import { excelSerialToDate, parseExcelishDate, toLocalDateKey } from "@/lib/workbook/dates";
import type { ProductRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Series = ReturnType<typeof buildIndexSeries>;

let seriesCache: { key: string; series: Series; loadedAt: number } | null = null;
let productsCache: { products: ProductRecord[]; loadedAt: number } | null = null;

function loadBundledSeries(): Series {
  const niftyMap = new Map<string, number>();
  for (const row of niftyHistory.entries as Array<{ dateSerial: number; level: number }>) {
    niftyMap.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  const sensexMap = new Map<string, number>();
  for (const row of sensexHistory.entries as Array<{ dateSerial: number; level: number }>) {
    sensexMap.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  const dates = new Set([...niftyMap.keys(), ...sensexMap.keys()]);
  const rows: Array<{ date: string; nifty: number; sensex: number }> = [];
  for (const date of [...dates].sort()) {
    const nifty = niftyMap.get(date);
    const sensex = sensexMap.get(date);
    if (nifty == null || sensex == null) continue;
    rows.push({ date, nifty, sensex });
  }
  return buildIndexSeries(rows);
}

async function loadSeries(): Promise<Series> {
  const end = toLocalDateKey(new Date());
  const cacheKey = `2001-01-01:${end}`;
  if (seriesCache && seriesCache.key === cacheKey && Date.now() - seriesCache.loadedAt < 5 * 60 * 1000) {
    return seriesCache.series;
  }

  const mongoRows = await getIndexPricesBetween("2001-01-01", end);
  let series: Series;
  if (mongoRows.length >= 1000) {
    series = buildIndexSeries(mongoRows.map((r) => ({ date: r.date, nifty: r.nifty, sensex: r.sensex })));
  } else {
    series = loadBundledSeries();
  }

  seriesCache = { key: cacheKey, series, loadedAt: Date.now() };
  return series;
}

async function loadProducts(): Promise<ProductRecord[]> {
  if (productsCache && Date.now() - productsCache.loadedAt < 60_000) {
    return productsCache.products;
  }
  const products = await resolveMasterProducts();
  productsCache = { products, loadedAt: Date.now() };
  return products;
}

function runModesForProduct(args: {
  product: ProductRecord;
  modes: Array<"initial" | "current">;
  valuationDate: Date;
  valuationKey: string;
  series: Series;
  indexMaxDate: string;
  niftyLevel?: number;
  sensexLevel?: number;
  includePaths: boolean;
  bookRevision?: string;
}): Record<string, ProbabilityRunResult> {
  const underlying = resolveUnderlyingKind(args.product);
  if (!underlying) {
    throw new Error("Probability is available only for Nifty and Sensex underlyings");
  }

  const results: Record<string, ProbabilityRunResult> = {};
  for (const m of args.modes) {
    const key = probabilityCacheKey({
      isin: args.product.isin ?? "",
      mode: m,
      valuationDate: args.valuationKey,
      underlying,
      indexMaxDate: args.indexMaxDate,
      includePaths: args.includePaths,
      bookRevision: args.bookRevision,
      niftyLevel: args.niftyLevel,
      sensexLevel: args.sensexLevel,
    });
    let result = getCachedProbability(key);
    if (!result) {
      result = runProbabilityBacktest({
        product: args.product,
        mode: m,
        valuationDate: args.valuationDate,
        series: args.series,
        niftyLevel: args.niftyLevel,
        sensexLevel: args.sensexLevel,
        includePaths: args.includePaths,
      });
      setCachedProbability(key, result);
    }
    results[m] = result;
  }
  return results;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      isin?: string;
      /** Batch portfolio warm-up — shared series load, summary-only recommended. */
      isins?: string[];
      mode?: "initial" | "current" | "both";
      valuationDate?: string;
      niftyLevel?: number;
      sensexLevel?: number;
      includePaths?: boolean;
      invalidate?: boolean;
      bookRevision?: string;
    };

    if (body.invalidate) {
      invalidateProbabilityCache();
      seriesCache = null;
      productsCache = null;
      return NextResponse.json({ ok: true, invalidated: true });
    }

    const mode = body.mode ?? "both";
    const includePaths = body.includePaths !== false;
    const valuationDate = parseExcelishDate(body.valuationDate) ?? new Date();
    const valuationKey = toLocalDateKey(valuationDate);
    const modes: Array<"initial" | "current"> = mode === "both" ? ["initial", "current"] : [mode];

    const series = await loadSeries();
    if (series.length === 0) {
      return NextResponse.json({ error: "Index price history is unavailable" }, { status: 503 });
    }
    const indexMaxDate = series[series.length - 1]!.date;
    const products = await loadProducts();
    const byIsin = new Map(products.filter((p) => p.isin).map((p) => [p.isin!, p]));

    const batchIsins = (body.isins ?? [])
      .map((isin) => isin.trim())
      .filter(Boolean)
      .slice(0, 80);

    if (batchIsins.length > 0) {
      const batchResults: Array<{
        isin: string;
        ok: boolean;
        error?: string;
        initial?: ProbabilityRunResult;
        current?: ProbabilityRunResult;
      }> = [];

      for (const isin of batchIsins) {
        const product = byIsin.get(isin);
        if (!product) {
          batchResults.push({ isin, ok: false, error: "Product not found in live book" });
          continue;
        }
        if (!resolveUnderlyingKind(product)) {
          batchResults.push({
            isin,
            ok: false,
            error: "Probability is available only for Nifty and Sensex underlyings",
          });
          continue;
        }
        try {
          const results = runModesForProduct({
            product,
            modes,
            valuationDate,
            valuationKey,
            series,
            indexMaxDate,
            niftyLevel: body.niftyLevel,
            sensexLevel: body.sensexLevel,
            includePaths: false,
            bookRevision: body.bookRevision,
          });
          batchResults.push({
            isin,
            ok: true,
            initial: results.initial,
            current: results.current,
          });
        } catch (error) {
          batchResults.push({
            isin,
            ok: false,
            error: error instanceof Error ? error.message : "Probability run failed",
          });
        }
      }

      return NextResponse.json({
        ok: true,
        valuationDate: valuationKey,
        indexMaxDate,
        results: batchResults,
      });
    }

    const isin = body.isin?.trim();
    if (!isin) {
      return NextResponse.json({ error: "ISIN is required" }, { status: 400 });
    }

    const product = byIsin.get(isin);
    if (!product) {
      return NextResponse.json({ error: "Product not found in live book" }, { status: 404 });
    }

    if (!resolveUnderlyingKind(product)) {
      return NextResponse.json(
        { error: "Probability is available only for Nifty and Sensex underlyings" },
        { status: 400 },
      );
    }

    const results = runModesForProduct({
      product,
      modes,
      valuationDate,
      valuationKey,
      series,
      indexMaxDate,
      niftyLevel: body.niftyLevel,
      sensexLevel: body.sensexLevel,
      includePaths,
      bookRevision: body.bookRevision,
    });

    return NextResponse.json({
      ok: true,
      isin,
      valuationDate: valuationKey,
      indexMaxDate,
      ...results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Probability run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
