import { existsSync, readFileSync } from "fs";
import path from "path";

import { NextResponse } from "next/server";

import { runInBackground, withTimeout } from "@/lib/async-utils";
import { getIndexPricesBetween, syncIndexPricesFromYahoo } from "@/lib/db/index-prices";
import niftyHistory from "@/lib/data/valuation-index-history.json";
import sensexHistory from "@/lib/data/sensex-index-history.json";
import {
  getCachedProbability,
  invalidateProbabilityCache,
  probabilityCacheKey,
  setCachedProbability,
} from "@/lib/probability/cache";
import {
  getProbabilityCheckingDate,
  hasPassedFinalObservation,
} from "@/lib/probability/as-of";
import {
  runProbabilityBacktest,
  resolveUnderlyingKind,
  type IndexBar,
  type ProbabilityRunResult,
} from "@/lib/probability/engine";
import { mergeForwardFilledSeries, SERIES_FLOOR } from "@/lib/probability/index-series";
import { resolveMasterProducts } from "@/lib/server/resolve-master-products";
import { excelSerialToDate, formatDisplayDate, parseExcelishDate, toLocalDateKey } from "@/lib/workbook/dates";
import type { ProductRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Path tables can be ~6k rows. Keep under Pro/Fluid budgets; Hobby may still
 * complete summary-only runs faster via Gift CSV + short Mongo overlay.
 */
export const maxDuration = 60;

type Series = IndexBar[];

let seriesCache: { key: string; series: Series; loadedAt: number } | null = null;
let productsCache: { products: ProductRecord[]; loadedAt: number } | null = null;

/** Gift AIF / NSP `nifty` sheet — daily closes from 2001-01-01 (reference Excel parity). */
function loadNiftyFromGiftCsv(): Map<string, number> {
  const file = path.join(process.cwd(), "lib/data/nifty-daily-2001.csv");
  const map = new Map<string, number>();
  if (!existsSync(file)) return map;
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const date = line.slice(0, comma).trim();
    const level = Number(line.slice(comma + 1).trim());
    if (!date || !Number.isFinite(level) || level <= 0) continue;
    map.set(date, level);
  }
  return map;
}

function loadNiftyFallbackJson(): Map<string, number> {
  const niftyMap = new Map<string, number>();
  for (const row of niftyHistory.entries as Array<{ dateSerial: number; level: number }>) {
    niftyMap.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  return niftyMap;
}

function loadSensexBundled(): Map<string, number> {
  const sensexMap = new Map<string, number>();
  for (const row of sensexHistory.entries as Array<{ dateSerial: number; level: number }>) {
    sensexMap.set(toLocalDateKey(excelSerialToDate(row.dateSerial)), row.level);
  }
  return sensexMap;
}

function loadBundledSeries(): Series {
  const giftNifty = loadNiftyFromGiftCsv();
  const niftyMap = giftNifty.size > 0 ? giftNifty : loadNiftyFallbackJson();
  return mergeForwardFilledSeries(niftyMap, loadSensexBundled());
}

/** ISO date N calendar days before `endKey` (UTC noon arithmetic). */
function daysBefore(endKey: string, days: number): string {
  const [y, m, d] = endKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - days);
  return toLocalDateKey(dt);
}

async function loadSeries(): Promise<Series> {
  const end = toLocalDateKey(new Date());
  const cacheKey = `${SERIES_FLOOR}:${end}:ffill:giftnifty-2001`;
  if (seriesCache && seriesCache.key === cacheKey && Date.now() - seriesCache.loadedAt < 5 * 60 * 1000) {
    return seriesCache.series;
  }

  // Never await Yahoo on the request path — Gift CSV + Mongo overlay are enough for KPIs/paths.
  // Background refresh keeps the frontier current without risking Vercel timeouts.
  runInBackground("probability-yahoo-sync", (async () => {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 45);
    await syncIndexPricesFromYahoo(from);
  })());

  // Always seed from Gift/NSP Nifty since 2001 so paths never truncate at Yahoo ~2007.
  const niftyMap = loadNiftyFromGiftCsv();
  if (niftyMap.size === 0) {
    for (const [d, v] of loadNiftyFallbackJson()) niftyMap.set(d, v);
  }
  const sensexMap = loadSensexBundled();

  // Overlay only recent Mongo bars (Gift already has deep history). Full 2001→today
  // scans burn cold-start time/memory on Vercel for little gain.
  const overlayStart = daysBefore(end, process.env.VERCEL ? 450 : 900);
  try {
    const mongoRows = await withTimeout(
      getIndexPricesBetween(overlayStart, end),
      process.env.VERCEL ? 8_000 : 15_000,
      "mongo index overlay",
    );
    if (mongoRows.length >= 50) {
      for (const r of mongoRows) {
        if (r.nifty > 0) niftyMap.set(r.date, r.nifty);
        if (r.sensex > 0) sensexMap.set(r.date, r.sensex);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "mongo overlay failed";
    console.warn(`[probability/run] ${message} — using Gift/bundled series`);
  }

  const series = mergeForwardFilledSeries(niftyMap, sensexMap);
  seriesCache = { key: cacheKey, series, loadedAt: Date.now() };
  return seriesCache.series;
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
  /** Requested desk date before last-obs clamp. */
  requestedDate: Date;
  series: Series;
  indexMaxDate: string;
  niftyLevel?: number;
  sensexLevel?: number;
  includePaths: boolean;
  bookRevision?: string;
}): {
  initial?: ProbabilityRunResult;
  current?: ProbabilityRunResult;
  checkingDate: string;
  asOfLastObservation: boolean;
} {
  const underlying = resolveUnderlyingKind(args.product);
  if (!underlying) {
    throw new Error("Probability is available only for Nifty and Sensex underlyings");
  }

  const checkingDate = getProbabilityCheckingDate(args.product, args.requestedDate);
  const valuationKey = toLocalDateKey(checkingDate);
  const asOfLastObservation = hasPassedFinalObservation(args.product, args.requestedDate);
  // After final obs, drop live levels so Current uses the checking-date close from history.
  const niftyLevel = asOfLastObservation ? undefined : args.niftyLevel;
  const sensexLevel = asOfLastObservation ? undefined : args.sensexLevel;

  const results: { initial?: ProbabilityRunResult; current?: ProbabilityRunResult } = {};
  for (const m of args.modes) {
    const key = probabilityCacheKey({
      isin: args.product.isin ?? "",
      mode: m,
      valuationDate: valuationKey,
      underlying,
      indexMaxDate: args.indexMaxDate,
      includePaths: args.includePaths,
      bookRevision: args.bookRevision,
      niftyLevel,
      sensexLevel,
    });
    let result = getCachedProbability(key);
    if (!result) {
      result = runProbabilityBacktest({
        product: args.product,
        mode: m,
        valuationDate: checkingDate,
        series: args.series,
        niftyLevel,
        sensexLevel,
        includePaths: args.includePaths,
      });
      setCachedProbability(key, result);
    }
    results[m] = result;
  }
  return {
    ...results,
    checkingDate: valuationKey,
    asOfLastObservation,
  };
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
    // Opt-in only — full path payloads are large (~6k rows). Dashboard loads KPIs first, then unlocks paths.
    const includePaths = body.includePaths === true;
    const requestedDate = parseExcelishDate(body.valuationDate) ?? new Date();
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
        checkingDate?: string;
        asOfLastObservation?: boolean;
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
            requestedDate,
            series,
            indexMaxDate,
            niftyLevel: body.niftyLevel,
            sensexLevel: body.sensexLevel,
            includePaths: false,
            bookRevision: body.bookRevision,
          });
          // Portfolio warm-up only needs headline probs — drop schedule/path shells.
          batchResults.push({
            isin,
            ok: true,
            initial: results.initial
              ? {
                  ...results.initial,
                  schedule: [],
                  pathSchedule: [],
                  paths: [],
                }
              : undefined,
            current: results.current
              ? {
                  ...results.current,
                  schedule: [],
                  pathSchedule: [],
                  paths: [],
                }
              : undefined,
            checkingDate: results.checkingDate,
            asOfLastObservation: results.asOfLastObservation,
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
        valuationDate: toLocalDateKey(requestedDate),
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
      requestedDate,
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
      valuationDate: results.checkingDate,
      checkingDate: results.checkingDate,
      checkingDateDisplay: formatDisplayDate(parseExcelishDate(results.checkingDate) ?? requestedDate),
      asOfLastObservation: results.asOfLastObservation,
      indexMaxDate,
      initial: results.initial,
      current: results.current,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Probability run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
