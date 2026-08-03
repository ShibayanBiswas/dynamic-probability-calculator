"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Database, Download, HardDrive, Loader2, RefreshCw, Search } from "lucide-react";

import { Panel, SectionTitle, Button } from "@/components/layout/app-ui";
import { VirtualizedTableSection } from "@/components/ui/virtual-table-body";
import { useDataset } from "@/lib/context/dataset-provider";
import {
  compactWorkbookSheetRaw,
  explorerTableForSheetRaw,
  findWorkbookSheet,
  formatMasterSheetCell,
  MASTER_SHEET_REFERENCE_NOTE,
  type CompactMasterSheetPayload,
  type MasterSheetColumnDef,
  type MasterSheetTab,
  type MasterSheetsApiPayload,
} from "@/lib/master-sheet-table";
import type { WorkbookSheetRecord } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";

const MASTER_LOAD_TIMEOUT_MS = 120_000;
const SHEET_TABS: MasterSheetTab[] = ["Primary", "Rollover", "NEW PRIMARY"];

type LoadedSheets = {
  primary: WorkbookSheetRecord | CompactMasterSheetPayload | null;
  rollover: WorkbookSheetRecord | CompactMasterSheetPayload | null;
  newPrimary: WorkbookSheetRecord | CompactMasterSheetPayload | null;
  workbookName: string;
  compact: boolean;
  source: "mongodb" | "disk" | "upload" | "client" | "seed";
};

function reasonToMessage(reason?: MasterSheetsApiPayload["reason"]) {
  switch (reason) {
    case "master_not_found":
      return "Master workbook not found — run npm run bake, or place New Product Master_.xlsx at the repo root.";
    case "mongodb_empty":
      return "MongoDB has no sheet grids — run npm run sync:seed (or sync:master). Baked grids should still load automatically.";
    case "master_parse_failed":
      return "Could not parse New Product Master_.xlsx — check the file is a valid workbook.";
    case "sheets_missing":
      return "Primary, Rollover, or NEW PRIMARY tabs were not found in the master workbook.";
    default:
      return "Master sheets could not be loaded.";
  }
}

function sheetRowCount(sheet: WorkbookSheetRecord | CompactMasterSheetPayload | null | undefined) {
  if (!sheet) return 0;
  return sheet.rowCount;
}

function sheetToTable(
  sheet: WorkbookSheetRecord | CompactMasterSheetPayload,
  tab: MasterSheetTab,
): { columns: MasterSheetColumnDef[]; rows: Record<string, unknown>[] } {
  return explorerTableForSheetRaw(sheet, tab);
}

async function fetchAllSheets(signal: AbortSignal): Promise<MasterSheetsApiPayload> {
  const res = await fetch("/api/master/sheets", { signal });
  return (await res.json()) as MasterSheetsApiPayload;
}

async function parseSheetsFromDownload(): Promise<LoadedSheets | null> {
  const res = await fetch("/api/master/download");
  if (!res.ok) return null;

  const buffer = await res.arrayBuffer();
  const { parseMasterExplorerSheets } = await import("@/lib/workbook/parser");
  const parsed = parseMasterExplorerSheets(buffer);

  if (!parsed.primary && !parsed.rollover && !parsed.newPrimary) return null;

  return {
    primary: parsed.primary ? compactWorkbookSheetRaw(parsed.primary) : null,
    rollover: parsed.rollover ? compactWorkbookSheetRaw(parsed.rollover) : null,
    newPrimary: parsed.newPrimary ? compactWorkbookSheetRaw(parsed.newPrimary) : null,
    workbookName: parsed.workbookName,
    compact: true,
    source: "client",
  };
}

function activeSheetForTab(loaded: LoadedSheets | null, tab: MasterSheetTab) {
  if (!loaded) return null;
  if (tab === "Primary") return loaded.primary;
  if (tab === "Rollover") return loaded.rollover;
  return loaded.newPrimary;
}

export function MasterSheetPivot() {
  const { dataset } = useDataset();
  const [activeTab, setActiveTab] = useState<MasterSheetTab>("NEW PRIMARY");
  const [query, setQuery] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const localPrimary = findWorkbookSheet(dataset.sheets, "Primary");
  const localRollover = findWorkbookSheet(dataset.sheets, "Rollover");
  const localNewPrimary = findWorkbookSheet(dataset.sheets, "NEW PRIMARY");
  const hasLocalSheets = Boolean(localPrimary || localRollover || localNewPrimary);

  const uploadedSheets = useMemo((): LoadedSheets | null => {
    if (!hasLocalSheets) return null;
    return {
      primary: localPrimary ?? null,
      rollover: localRollover ?? null,
      newPrimary: localNewPrimary ?? null,
      workbookName: dataset.workbookName,
      compact: false,
      source: "upload",
    };
  }, [hasLocalSheets, localPrimary, localRollover, localNewPrimary, dataset.workbookName]);

  const uploadedStatus = uploadedSheets
    ? `Loaded from uploaded workbook · ${dataset.workbookName}`
    : null;

  const [remoteSheets, setRemoteSheets] = useState<LoadedSheets | null>(null);
  const [remoteStatus, setRemoteStatus] = useState("Loading master sheets from New Product Master_.xlsx…");
  const [remoteLoading, setRemoteLoading] = useState(true);

  const loadRemoteSheets = useCallback(async (signal: AbortSignal) => {
    setRemoteLoading(true);
    setRemoteStatus("Loading Primary, Rollover, and NEW PRIMARY sheets…");

    try {
      const meta = await fetchAllSheets(signal);
      if (signal.aborted) return;

      const primary = meta.sheets?.primary ?? null;
      const rollover = meta.sheets?.rollover ?? null;
      const newPrimary = meta.sheets?.newPrimary ?? null;

      if (meta.ok && (primary || rollover || newPrimary)) {
        const source = meta.source ?? "disk";
        const workbookName = meta.workbookName ?? "New Product Master_.xlsx";
        setRemoteSheets({
          primary,
          rollover,
          newPrimary,
          workbookName,
          compact: true,
          source,
        });
        const count = sheetRowCount(primary) + sheetRowCount(rollover) + sheetRowCount(newPrimary);
        const sourceLabel =
          source === "mongodb"
            ? "MongoDB"
            : source === "seed"
              ? "Baked master grids"
              : `repo root · ${workbookName}`;
        setRemoteStatus(`Loaded ${formatNumber(count)} rows from ${sourceLabel}`);
        return;
      }

      setRemoteStatus("API unavailable — parsing master workbook in browser…");
      const client = await parseSheetsFromDownload();
      if (client) {
        setRemoteSheets(client);
        const count =
          sheetRowCount(client.primary) + sheetRowCount(client.rollover) + sheetRowCount(client.newPrimary);
        setRemoteStatus(`Loaded ${formatNumber(count)} rows from local master file · ${client.workbookName}`);
        return;
      }

      setRemoteSheets(null);
      setRemoteStatus(reasonToMessage(meta.reason));
    } catch {
      if (signal.aborted) return;
      setRemoteSheets(null);
      setRemoteStatus("Could not load master sheets — ensure the dev server is running.");
    }
  }, []);

  useEffect(() => {
    if (hasLocalSheets) return;

    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), MASTER_LOAD_TIMEOUT_MS);

    void (async () => {
      try {
        await loadRemoteSheets(controller.signal);
      } catch (error) {
        if (cancelled) return;
        const aborted = error instanceof DOMException && error.name === "AbortError";
        if (aborted) {
          setRemoteStatus(
            "Master workbook load timed out — click Retry or ensure MongoDB is running (npm run sync:master).",
          );
        } else {
          setRemoteStatus("Could not load master sheets — ensure the dev server is running.");
        }
        setRemoteSheets(null);
      } finally {
        if (!cancelled) setRemoteLoading(false);
        window.clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [hasLocalSheets, loadRemoteSheets, reloadToken]);

  const loadedSheets = uploadedSheets ?? remoteSheets;
  const status = uploadedStatus ?? remoteStatus;
  const loading = uploadedSheets ? false : remoteLoading;

  const activeSheet = activeSheetForTab(loadedSheets, activeTab);

  const { columns, rows } = useMemo(() => {
    if (!activeSheet) {
      return { columns: [] as MasterSheetColumnDef[], rows: [] as Record<string, unknown>[] };
    }
    return sheetToTable(activeSheet, activeTab);
  }, [activeSheet, activeTab]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const needle = query.toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((v) => v != null && String(v).toLowerCase().includes(needle)),
    );
  }, [rows, query]);

  const colSpan = Math.max(columns.length + 1, 2);
  const sourceLabel =
    loadedSheets?.source === "mongodb"
      ? "MongoDB"
      : loadedSheets?.source === "seed"
        ? "Baked grids"
        : loadedSheets?.source === "client"
          ? "Local master file"
          : hasLocalSheets
            ? "Workbook upload"
            : loadedSheets?.source === "disk"
              ? "Repo master file"
              : loading
                ? "Loading…"
                : "Unavailable";

  async function downloadMasterWorkbook() {
    setDownloading(true);
    try {
      const res = await fetch("/api/master/download");
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "New Product Master_.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setRemoteStatus("Download failed — ensure New Product Master_.xlsx is at the repo root.");
    } finally {
      setDownloading(false);
    }
  }

  function retryLoad() {
    setReloadToken((token) => token + 1);
  }

  return (
    <Panel className="!p-5" glow="cyan">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gold/20 pb-4">
        <div>
          <SectionTitle>Master Data · Workbook Explorer</SectionTitle>
          <p className="mt-1.5 text-sm text-stone-600">
            <span className="font-semibold text-maroon">{formatNumber(filtered.length)}</span> rows ·{" "}
            <span className="font-semibold text-maroon">{formatNumber(columns.length)}</span> columns · {status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              loadedSheets || hasLocalSheets
                ? "inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-gradient-to-r from-emerald-50 to-emerald-100/80 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-900 shadow-sm"
                : loading
                  ? "inline-flex items-center gap-2 rounded-full border border-gold/40/40 bg-gold/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-maroon shadow-sm"
                  : "inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-gradient-to-r from-amber-50 to-amber-100/80 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-950 shadow-sm"
            }
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : loadedSheets || hasLocalSheets ? (
              <Database className="h-3.5 w-3.5" />
            ) : (
              <HardDrive className="h-3.5 w-3.5" />
            )}
            {sourceLabel}
          </span>
          {!loading && !loadedSheets && !hasLocalSheets ? (
            <Button variant="primary" onClick={retryLoad}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          ) : null}
          <Button disabled={downloading || loading} variant="accent" onClick={() => void downloadMasterWorkbook()}>
            <Download className="h-4 w-4" />
            {downloading ? "Preparing…" : "Download New Master"}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {SHEET_TABS.map((tab) => {
          const count = sheetRowCount(activeSheetForTab(loadedSheets, tab));
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              className={cn(
                "rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] transition",
                active
                  ? "border-maroon/35 bg-maroon text-white shadow-sm"
                  : "border-gold/25 bg-gold/5 text-stone-600 hover:border-gold/45 hover:bg-gold/10",
              )}
              type="button"
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              <span className={cn("ml-2 tabular-nums", active ? "text-gold-soft" : "text-maroon")}>
                {formatNumber(count)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
        <input
          className="input-glow w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none"
          disabled={loading || !activeSheet}
          placeholder={`Search ${activeTab} sheet — name, ISIN, issuer, underlying…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-stone-600">
            <Loader2 className="h-4 w-4 animate-spin text-maroon" />
            Reading New Product Master_.xlsx…
          </p>
        ) : !activeSheet ? (
          <p className="text-sm text-stone-500">
            {activeTab} sheet unavailable — reload the page, or run{" "}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">npm run bake</code> then{" "}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">npm run sync:seed</code> if using
            MongoDB.
          </p>
        ) : (
          <MasterSheetFlatTable colSpan={colSpan} columns={columns} rowCount={filtered.length}>
            {(index) => {
              const row = filtered[index]!;
              return (
                <tr className={cn(index % 2 === 1 && "data-table-row-alt", "whitespace-nowrap")}>
                  <td className="col-pinned sticky left-0 z-[1] font-mono text-xs text-stone-500">{index + 1}</td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        col.numeric && "text-right tabular-nums cell-value",
                        (col.sourceHeader === "Name on Signup Form" || col.label === "Product Name") &&
                          "max-w-[280px] truncate font-medium text-ink",
                        (col.sourceHeader === "ISIN No." || col.label === "ISIN Number") && "font-mono text-xs",
                        (col.sourceHeader === "Formulae" || col.label === "Payoff Formula") &&
                          "max-w-[220px] truncate text-xs text-stone-600",
                      )}
                      title={formatMasterSheetCell(row[col.key], col)}
                    >
                      {formatMasterSheetCell(row[col.key], col)}
                    </td>
                  ))}
                </tr>
              );
            }}
          </MasterSheetFlatTable>
        )}
      </div>

      {filtered.length > 0 ? (
        <p className="mt-3 text-xs text-stone-500">
          {formatNumber(filtered.length)} {activeTab} rows
          {query.trim() ? ` · ${formatNumber(filtered.length)} match search` : ""} · scroll horizontally for all
          master columns
        </p>
      ) : null}

      <p className="mt-2 text-xs text-stone-500">{MASTER_SHEET_REFERENCE_NOTE}</p>
    </Panel>
  );
}

function MasterSheetFlatTable({
  columns,
  rowCount,
  colSpan,
  children,
}: {
  columns: MasterSheetColumnDef[];
  rowCount: number;
  colSpan: number;
  children: (index: number) => ReactNode;
}) {
  return (
    <VirtualizedTableSection
      colSpan={colSpan}
      rowCount={rowCount}
      scrollClassName="data-table-premium-wrap max-h-[min(72vh,780px)] overflow-auto"
      tableClassName="data-table-premium text-sm"
      emptyState={
        <tr>
          <td className="py-12 text-center text-stone-500" colSpan={colSpan}>
            No rows match your search.
          </td>
        </tr>
      }
      thead={
        <tr className="whitespace-nowrap">
          <th className="col-pinned sticky left-0 z-[2] min-w-[3rem]">#</th>
          {columns.map((col) => (
            <th key={col.key} className={cn(col.numeric && "text-right", "min-w-max px-5")} title={col.label}>
              {col.label}
            </th>
          ))}
        </tr>
      }
    >
      {children}
    </VirtualizedTableSection>
  );
}
