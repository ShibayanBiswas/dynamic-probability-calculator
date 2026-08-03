import type { ProductRecord } from "@/lib/types";
import {
  getProductOverview,
  parseExplanationBlocks,
  parseStructureLine,
} from "@/lib/product-narrative";
import { buildProductSpecRows } from "@/lib/product-specifications";
import { getProductObservationDates } from "@/lib/product-dates";
import { getCouponLabel } from "@/lib/product-utils";
import { buildPayoffCurve } from "@/lib/workbook/formula-engine";
import { formatDisplayDate } from "@/lib/workbook/dates";
import { formatCurrency, formatNumber } from "@/lib/utils";

export const SCREEN_EXPORT_DISCLAIMER =
  "The information provided in this communication is a reproduction of factual details. No part of the information provided herein should be construed as investment advice by ARWL and/or its employees. Investors/clients must make their own investment decisions based on their own specific investment objectives and financial position. This communication does not constitute an offer or solicitation for the purchase or sale of any financial instrument or security.";

export function screenExportStamp() {
  return `Generated ${formatDisplayDate(new Date())}`;
}

export function buildDescriptionLines(product: ProductRecord) {
  const overview = getProductOverview(product);
  const blocks = parseExplanationBlocks(overview.explanation);
  const lines = blocks.map((b) => b.content).filter(Boolean);
  return lines.length > 0 ? lines : ["Product description will appear once the master file includes an explanation."];
}

/** Structure chips + notional/coupon footer for Product Overview exports. */
export function buildOverviewFooterRows(product: ProductRecord): Array<[string, string]> {
  const overview = getProductOverview(product);
  const couponLabel = getCouponLabel(product);
  const rows = overview.structure.map((line) => {
    const { label, value } = parseStructureLine(line);
    return [label, value] as [string, string];
  });
  if (product.tradeAmount) {
    rows.push(["Notional", formatCurrency(product.tradeAmount)]);
  }
  if (couponLabel) {
    rows.push(["Coupon", couponLabel]);
  }
  return rows;
}

export function buildSpecRows(product: ProductRecord): Array<[string, string]> {
  return buildProductSpecRows(product, {
    includeTradeDate: false,
    notionalFormat: "currency",
    includeObservationDates: true,
  });
}

/** PDF-friendly spec rows — compact dates, left-aligned values, fewer page breaks. */
export function buildSpecRowsForPdf(product: ProductRecord): Array<[string, string]> {
  const obs = getProductObservationDates(product);
  const obsFormatted = obs.map((d) => formatDisplayDate(d));
  const obsLines: string[] = [];
  for (let i = 0; i < obsFormatted.length; i += 4) {
    obsLines.push(obsFormatted.slice(i, i + 4).join(" · "));
  }

  return buildSpecRows(product).map(([label, value]) => {
    if (label === "Observation Dates" && obsLines.length > 0) {
      return [label, obsLines.join("\n")];
    }
    return [label, value];
  });
}

/** Render payoff plot PNG — desk brand palette for Excel / PDF embeds. */
export function renderPayoffCurvePng(formula: string, entryLevel: number): string | null {
  if (typeof document === "undefined") return null;
  const curve = buildPayoffCurve(formula).map((p) => ({
    z: p.z,
    payoff: Math.max(-1, Math.min(p.payoff, 3)),
    underlying: entryLevel * (1 + p.z),
  }));
  if (curve.length < 2) return null;

  const W = 820;
  const H = 440;
  const padL = 72;
  const padR = 72;
  const padT = 52;
  const padB = 72;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const GOLD = "#D4B24C";
  const GOLD_RICH = "#C4A03E";
  const MAROON = "#7A1E2C";
  const MAROON_DEEP = "#5C1622";
  const IVORY = "#FAF7EF";
  const PLOT = "#FCF8EE";
  const MUTED = "#78716C";
  const RULE = "#C9B88A";
  const INK = "#1C1917";
  const FONT = '"Segoe UI", Calibri, Arial, sans-serif';

  // Parchment page
  ctx.fillStyle = IVORY;
  ctx.fillRect(0, 0, W, H);

  // Gold top rule
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, 0, W, 3);

  // Soft plot wash
  ctx.fillStyle = PLOT;
  ctx.fillRect(padL, padT, W - padL - padR, H - padT - padB);

  const zs = curve.map((p) => p.z);
  const ps = curve.map((p) => p.payoff);
  const us = curve.map((p) => p.underlying);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const pMin = Math.min(...ps, 0);
  const pMax = Math.max(...ps, 0);
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const xOf = (z: number) => padL + ((z - zMin) / (zMax - zMin || 1)) * (W - padL - padR);
  const yPayoff = (p: number) => H - padB - ((p - pMin) / (pMax - pMin || 1)) * (H - padT - padB);
  const yUnderlying = (u: number) => H - padB - ((u - uMin) / (uMax - uMin || 1)) * (H - padT - padB);

  ctx.fillStyle = MAROON_DEEP;
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText("Payoff & Underlying", padL, 28);
  ctx.fillStyle = MUTED;
  ctx.font = `italic 10px ${FONT}`;
  ctx.fillText("Scenario curve · product return vs index level", padL, 42);

  ctx.font = `10px ${FONT}`;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const val = pMin + ((pMax - pMin) * i) / 5;
    const y = yPayoff(val);
    ctx.strokeStyle = "#E7E1CF";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillStyle = GOLD_RICH;
    ctx.fillText(`${(val * 100).toFixed(0)}%`, 10, y + 3);
  }
  ctx.fillStyle = MAROON;
  for (let i = 0; i <= 5; i++) {
    const val = uMin + ((uMax - uMin) * i) / 5;
    const y = yUnderlying(val);
    ctx.fillText(formatNumber(val, 0), W - padR + 8, y + 3);
  }
  ctx.fillStyle = MUTED;
  for (let i = 0; i <= 5; i++) {
    const val = zMin + ((zMax - zMin) * i) / 5;
    const x = xOf(val);
    ctx.fillText(`${(val * 100).toFixed(0)}%`, x - 12, H - padB + 18);
  }

  // Zero return guide
  ctx.strokeStyle = RULE;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padL, yPayoff(0));
  ctx.lineTo(W - padR, yPayoff(0));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = INK;
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillText("Underlying performance", W / 2 - 58, H - 36);

  // Index level (maroon)
  ctx.strokeStyle = MAROON;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  curve.forEach((p, i) => {
    const x = xOf(p.z);
    const y = yUnderlying(p.underlying);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Product return (gold) — primary series
  ctx.strokeStyle = GOLD_RICH;
  ctx.lineWidth = 2.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  curve.forEach((p, i) => {
    const x = xOf(p.z);
    const y = yPayoff(p.payoff);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Gold frame
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(padL, padT, W - padL - padR, H - padT - padB);

  // Legend strip
  ctx.fillStyle = "#F8F4EA";
  ctx.fillRect(padL, H - 22, W - padL - padR, 16);
  ctx.font = `bold 10px ${FONT}`;
  ctx.fillStyle = GOLD_RICH;
  ctx.fillRect(padL + 10, H - 15, 20, 3.5);
  ctx.fillText("Product return · left", padL + 36, H - 10);
  ctx.fillStyle = MAROON;
  ctx.fillRect(W / 2 + 40, H - 15, 20, 3.5);
  ctx.fillText("Index level · right", W / 2 + 66, H - 10);

  return canvas.toDataURL("image/png");
}
