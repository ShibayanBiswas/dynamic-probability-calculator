import { stripLabelParens } from "@/lib/utils";

/** Desk acronyms from master — keep uppercase on chart axes. */
const ISSUER_ACRONYMS = new Set([
  "argfl",
  "arfsl",
  "nwfl",
  "ebl",
  "arit",
  "rcl",
  "efil",
  "nwil",
  "ecap",
  "efpl",
  "rbs",
  "rsl",
]);

const LEGAL_SUFFIX =
  /\s*,?\s*(Ltd\.?|Limited|Pvt\.?\s*Ltd\.?|Private Limited|Corp\.?|Corporation|Inc\.?)\.?$/i;

/** Canonical grouping key — merges casing / spacing variants. */
export function normalizeIssuerKey(raw: string): string {
  return stripLabelParens(raw.trim().toLowerCase()) || "unspecified";
}

/** Chart axis label (short) and tooltip label (full, cleaned). */
export function formatIssuerChartLabel(raw: string): { short: string; full: string } {
  const full = stripLabelParens((raw || "Unspecified").trim()) || "Unspecified";
  const key = full.toLowerCase();

  if (ISSUER_ACRONYMS.has(key)) {
    return { short: full.toUpperCase(), full };
  }

  const withoutLegal = full.replace(LEGAL_SUFFIX, "").trim() || full;
  const short =
    withoutLegal.length > 16 ? `${withoutLegal.slice(0, 14).trimEnd()}…` : withoutLegal;

  return { short, full };
}

/** Y-axis gutter width from the longest issuer label on the chart. */
export function issuerAxisWidth(labels: string[], rowCount: number, fontSize = 12): number {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0);
  const perChar = rowCount > 12 ? 6.8 : 7.4;
  const fontScale = fontSize / 11;
  return Math.min(172, Math.max(104, Math.round(longest * perChar * fontScale + 20)));
}
