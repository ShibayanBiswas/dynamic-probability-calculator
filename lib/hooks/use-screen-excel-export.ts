"use client";

import { useCallback, useRef, useState } from "react";

import { preloadExcelExport } from "@/lib/workbook/excel-runtime";
import { preloadPdfExport } from "@/lib/workbook/pdf-runtime";

/** Run a screen export (Excel or PDF) once at a time with visible loading + error feedback. */
export function useScreenExport() {
  const [exporting, setExporting] = useState(false);
  const inFlight = useRef(false);

  const warmExport = useCallback(() => {
    preloadExcelExport();
    preloadPdfExport();
  }, []);

  const runExport = useCallback(async (task: () => Promise<void>, label = "Export") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setExporting(true);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      await task();
    } catch (error) {
      console.error("Screen export failed:", error);
      const message =
        error instanceof Error ? error.message : `${label} failed. Please try again.`;
      window.alert(`${label} failed: ${message}`);
    } finally {
      inFlight.current = false;
      setExporting(false);
    }
  }, []);

  return { exporting, runExport, warmExport };
}

/** @deprecated Use useScreenExport */
export const useScreenExcelExport = useScreenExport;
