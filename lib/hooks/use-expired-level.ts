"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getExpiredMarkDeskDate,
  resolveHistoricalIndexLevel,
} from "@/lib/expired-mark";
import { formatDeskDate } from "@/lib/market-data";
import { getProductAllotmentDate } from "@/lib/product-dates";
import { getProductLifecycleStatus } from "@/lib/product-lifecycle";
import {
  isCustomUnderlyingProduct,
  isSensexLinked,
  resolveValuationLevel,
} from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { getUnderlyingKind } from "@/lib/underlying-benchmark";
import { parseExcelishDate } from "@/lib/workbook/dates";

export type ExpiredLevel = {
  isExpired: boolean;
  effectiveDate: string | null;
  level: number | null;
  niftyLevel: number | null;
  sensexLevel: number | null;
  underlyingLevel: number | null;
  source: "history" | "yahoo" | "estimate" | "missing" | null;
  loading: boolean;
};

export function useExpiredLevel(
  product: ProductRecord | undefined,
  deskDateOverride?: string | null,
): ExpiredLevel {
  const isExpired = product ? getProductLifecycleStatus(product) === "expired" : false;
  const effectiveDate =
    product && isExpired ? deskDateOverride ?? getExpiredMarkDeskDate(product) ?? null : null;
  const allotment = product ? getProductAllotmentDate(product) : undefined;
  const markDate = effectiveDate ? parseExcelishDate(effectiveDate) : undefined;
  const allotmentTime = allotment?.getTime();
  const kind = product ? getUnderlyingKind(product) : "nifty";
  const isCustom = product ? isCustomUnderlyingProduct(product) : false;

  const syncLevel = useMemo(() => {
    if (!product || !isExpired || !markDate) return null;
    return resolveHistoricalIndexLevel(product, markDate) ?? null;
  }, [product, isExpired, markDate]);

  const fetchKey =
    product && isExpired && effectiveDate
      ? `${product.rowId}:${effectiveDate}:${allotmentTime ?? ""}:${kind}`
      : null;

  const [fetchedNifty, setFetchedNifty] = useState<number | null>(null);
  const [fetchedSensex, setFetchedSensex] = useState<number | null>(null);
  const [fetchedUnderlying, setFetchedUnderlying] = useState<number | null>(null);
  const [fetchedSource, setFetchedSource] = useState<ExpiredLevel["source"]>(null);
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!fetchKey || !product || !isExpired || !effectiveDate) return;

    let cancelled = false;

    void (async () => {
      try {
        if (isCustom) {
          const params = new URLSearchParams({
            date: effectiveDate,
            underlying: product.underlying ?? "",
          });
          const res = await fetch(`/api/market/underlying-at-date?${params.toString()}`, {
            cache: "no-store",
          });
          const json = res.ok
            ? ((await res.json()) as {
                level: number | null;
                source?: "history" | "yahoo" | "estimate" | "missing";
              })
            : null;
          if (!cancelled) {
            setFetchedUnderlying(
              json?.level != null && Number.isFinite(json.level) && json.level > 0
                ? json.level
                : null,
            );
            setFetchedNifty(null);
            setFetchedSensex(null);
            setFetchedSource(json?.source ?? (json?.level ? "history" : "missing"));
            setFetchedKey(fetchKey);
          }
          return;
        }

        const params = new URLSearchParams({ date: effectiveDate });
        const minDesk = allotment ? formatDeskDate(allotment) : undefined;
        if (minDesk && minDesk !== "Unknown") params.set("minDate", minDesk);

        const res = await fetch(`/api/market/index-at-date?${params.toString()}`, {
          cache: "no-store",
        });
        const json = res.ok
          ? ((await res.json()) as { niftyLevel: number | null; sensexLevel: number | null })
          : null;

        if (!cancelled) {
          setFetchedNifty(
            json?.niftyLevel != null && Number.isFinite(json.niftyLevel) ? json.niftyLevel : null,
          );
          setFetchedSensex(
            json?.sensexLevel != null && Number.isFinite(json.sensexLevel)
              ? json.sensexLevel
              : null,
          );
          setFetchedUnderlying(null);
          setFetchedSource(json ? "yahoo" : "missing");
          setFetchedKey(fetchKey);
        }
      } catch {
        if (!cancelled) {
          setFetchedNifty(null);
          setFetchedSensex(null);
          setFetchedUnderlying(null);
          setFetchedSource("missing");
          setFetchedKey(fetchKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allotment, effectiveDate, fetchKey, isCustom, isExpired, product]);

  const remoteReady = Boolean(fetchKey && fetchedKey === fetchKey);

  const underlyingLevel = isCustom
    ? remoteReady
      ? fetchedUnderlying
      : syncLevel
    : null;

  const niftyLevel = isCustom
    ? // Active channel for custom closes — UI labels as the underlying name.
      underlyingLevel
    : remoteReady
      ? fetchedNifty
      : syncLevel != null && product && !isSensexLinked(product)
        ? syncLevel
        : null;

  const sensexLevel = isCustom
    ? null
    : remoteReady
      ? fetchedSensex
      : syncLevel != null && product && isSensexLinked(product)
        ? syncLevel
        : null;

  const level =
    product && (niftyLevel != null || sensexLevel != null || underlyingLevel != null)
      ? resolveValuationLevel(product, {
          niftyLevel: niftyLevel ?? undefined,
          sensexLevel: sensexLevel ?? undefined,
          underlyingLevel: underlyingLevel ?? undefined,
        })
      : syncLevel;

  return {
    isExpired,
    effectiveDate,
    level: level != null && level > 0 ? level : null,
    niftyLevel,
    sensexLevel,
    underlyingLevel,
    source: remoteReady ? fetchedSource : syncLevel != null ? "history" : null,
    loading: Boolean(fetchKey && fetchedKey !== fetchKey),
  };
}
