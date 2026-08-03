/**
 * Formats master-sheet product explanations for desk display.
 * Excel often stores participation rates as 7500 meaning 75.00% (×100 in cell).
 * Desk copy avoids parenthetical asides — use em dashes for clarifications.
 */

const NUM = String.raw`\d+(?:\.\d+)?`;

/** Excel-encoded rate → desk % (7500 → 75.0%, 2133.33 → 21.3%). */
export function excelRateToDesk(n: number): number {
  if (!Number.isFinite(n)) return n;
  if (n >= 300) return n / 100;
  return n;
}

export function formatDeskRate(n: number, digits = 1): string {
  return `${excelRateToDesk(n).toFixed(digits)}%`;
}

/** True when a raw % token is Excel-scale (2133.33, 7600) not a level/coupon (80, 124). */
export function isExcelScalePercent(n: number): boolean {
  return Number.isFinite(n) && n >= 300;
}

/** Index move percentage for narrative — no leading "+" on positives. */
export function formatIndexMoveLabel(move: number, digits = 1): string {
  const num = Number.isFinite(move) ? move : 0;
  return `${num.toFixed(digits)}%`;
}

/** Index move range for narrative — no leading "+" on positives. */
export function formatIndexMoveRangeLabel(lo: number, hi: number, digits = 1): string {
  return `${formatIndexMoveLabel(lo, digits)} to ${formatIndexMoveLabel(hi, digits)}`;
}

function formatPrParticipationLine(totalRaw: string, partRaw: string, baseRaw: string): string {
  const total = Number(totalRaw);
  const part = Number(partRaw);
  const base = Number(baseRaw);
  return `PR of ${formatDeskRate(total)} — ${formatDeskRate(part)} participation + ${base}% coupon`;
}

export function formatProductExplanation(text: string): string {
  if (!text?.trim()) return text;

  let out = text.trim();

  // PR of 2233.33% (2133.33%+100%) or 1850%(1700%+150%) — decimals + optional space before (
  out = out.replace(
    new RegExp(`PR of (${NUM})%?\\s*\\((${NUM})%\\+(${NUM})%\\)`, "gi"),
    (_, total, part, base) => formatPrParticipationLine(total, part, base),
  );

  // Standalone PR of 6100% / PR of 2666 (missing % — must not prefix-match 100% as 10).
  // Keep the captured token (n) for desk-scale values so a re-pass over already
  // formatted copy ("PR of 76.0%") does not strip the decimal via Number().
  out = out.replace(new RegExp(`\\bPR of (${NUM})%`, "gi"), (_, n) => {
    const num = Number(n);
    return isExcelScalePercent(num) ? `PR of ${formatDeskRate(num)}` : `PR of ${n}%`;
  });
  out = out.replace(new RegExp(`\\bPR of (${NUM})(?![\\d%.])`, "gi"), (_, n) => {
    const num = Number(n);
    return isExcelScalePercent(num) ? `PR of ${formatDeskRate(num)}` : `PR of ${n}%`;
  });

  // Upside/downside decay participation: 600% in Excel = 6.0% per 1% index move
  out = out.replace(/\b(upside decay of|downside,?)\s*(\d{3,}(?:\.\d+)?)%/gi, (match, label, n) => {
    const num = Number(n);
    if (isExcelScalePercent(num)) {
      return `${label} ${excelRateToDesk(num).toFixed(1)}% per 1% index move`;
    }
    return match;
  });

  // Generic "600% participation" prose (Portfolio Insurance style)
  out = out.replace(/\b(\d{3,}(?:\.\d+)?)% participation\b/gi, (match, n) => {
    const num = Number(n);
    if (isExcelScalePercent(num)) {
      const desk = formatDeskRate(num);
      return `${desk} participation — for every 1% index move → ${desk} return`;
    }
    return match;
  });

  // Range bands: 109% to 111% of Initial Nifty → 9.0% to 11.0% index move
  out = out.replace(
    /from (\d+(?:\.\d+)?)% to (\d+(?:\.\d+)?)% of Initial Nifty(?: Level)?/gi,
    (_, lo, hi) => {
      const moveLo = Number(lo) - 100;
      const moveHi = Number(hi) - 100;
      return `from ${lo}% to ${hi}% of initial fixing — ${formatIndexMoveRangeLabel(moveLo, moveHi)} index move`;
    },
  );

  // Level references above/below thresholds
  out = out.replace(/above (\d+(?:\.\d+)?)% of Initial Nifty Level/gi, (_, pct) => {
    const move = Number(pct) - 100;
    return `above ${pct}% of initial fixing — ${formatIndexMoveLabel(move)} index move`;
  });

  out = out.replace(/at or above (\d+(?:\.\d+)?)% of Initial Nifty Level/gi, (_, pct) => {
    const move = Number(pct) - 100;
    return `at or above ${pct}% of initial fixing — ${formatIndexMoveLabel(move)} index move`;
  });

  // Single level: 108% of Initial Nifty (no "Level")
  out = out.replace(
    /(\d+(?:\.\d+)?)% of Initial Nifty(?! Level)/gi,
    (match, pct) => {
      const move = Number(pct) - 100;
      return `${pct}% of initial fixing — ${formatIndexMoveLabel(move)} index move`;
    },
  );

  // coupon of 4850% → coupon of 48.5%
  out = out.replace(/\bcoupon of (\d{3,}(?:\.\d+)?)%/gi, (_, n) => {
    const num = Number(n);
    return isExcelScalePercent(num) ? `coupon of ${formatDeskRate(num)}` : `coupon of ${num}%`;
  });

  // Remaining Excel-scale percents (3+ digits / decimals) → desk display
  out = out.replace(/\b(\d{3,}(?:\.\d+)?)%/g, (match, n) => {
    const num = Number(n);
    return isExcelScalePercent(num) ? formatDeskRate(num) : match;
  });

  out = out.replace(/(\d+\.\s[^2]+?)\s+2\.\s/g, "$1\n2. ");
  out = out.replace(/(\d+\.\s[^3]+?)\s+3\.\s/g, "$1\n3. ");
  out = out.replace(/(\d+\.\s[^4]+?)\s+4\.\s/g, "$1\n4. ");

  // Normalize level references: 132% of Initial → 132% of initial fixing — 32.0% move
  out = out.replace(/(\d+(?:\.\d+)?)% of Initial Nifty(?: Level)?/gi, (match, pct) => {
    const move = Number(pct) - 100;
    return `${pct}% of initial fixing — ${formatIndexMoveLabel(move)} index move`;
  });

  return sanitizeNarrativeDisplay(out);
}

/** Strip ugly "=" separators, fix merged numbered bands, and renumber duplicate points. */
export function sanitizeNarrativeDisplay(text: string): string {
  let out = text.trim();
  out = out.replace(/\s=\s+/g, " — ");
  out = out.replace(/^=\s*/gm, "");
  out = out.replace(/([.!?])\s+(\d+)\.\s+/g, "$1\n$2. ");
  out = out.replace(/\n{3,}/g, "\n\n");
  out = out.replace(/\s—\s—\s/g, " — ");
  out = renumberNarrativePoints(out);
  // Strip legacy "+" prefixes on index-move percentages in already-formatted copy
  out = out.replace(/—\s*\+(\d+(?:\.\d+)?%)/g, "— $1");
  out = out.replace(/\bto\s+\+(\d+(?:\.\d+)?%)/g, "to $1");
  return out;
}

/** Renumber 1. 2. 3. payoff bands when master prose repeats the same index. */
function renumberNarrativePoints(text: string): string {
  const lines = text.split("\n");
  let point = 0;
  return lines
    .map((line) => {
      if (/^\d+[\.\)]\s/.test(line)) {
        point += 1;
        return line.replace(/^\d+[\.\)]\s*/, `${point}. `);
      }
      return line;
    })
    .join("\n");
}

export type NarrativeRichSpan = {
  text: string;
  /** Numeric token — rendered in desk maroon. */
  highlight?: boolean;
};

const HIGHLIGHT_TOKEN =
  /\d+(?:\.\d+)?%\s*(?:to\s*\d+(?:\.\d+)?%)?|\d+(?:\.\d+)?(?=\s*times\b)|₹[\d,]+(?:\.\d+)?(?:\s?Cr|\s?L)?/gi;

/** Split a narrative line into styled spans — numeric tokens only. */
export function narrativeLineToSpans(line: string): NarrativeRichSpan[] {
  const spans: NarrativeRichSpan[] = [];
  let last = 0;
  const re = new RegExp(HIGHLIGHT_TOKEN.source, "gi");
  let match = re.exec(line);

  while (match) {
    if (match.index > last) {
      spans.push({ text: line.slice(last, match.index) });
    }
    spans.push({ text: match[0], highlight: true });
    last = match.index + match[0].length;
    match = re.exec(line);
  }

  if (last < line.length) {
    spans.push({ text: line.slice(last) });
  }

  return spans.length > 0 ? spans : [{ text: line }];
}

/** HTML emphasis for Product Overview on the web. */
export function narrativeLineToHtml(line: string): string {
  return narrativeLineToSpans(line)
    .map((span) => {
      const html = span.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      if (span.highlight) {
        return `<span class="product-narrative-num">${html}</span>`;
      }
      return html;
    })
    .join("");
}

/** Human-readable formula PR tokens — 7500% → 75× participation. */
export function formatFormulaForDisplay(formula: string): string {
  if (!formula?.trim()) return formula;
  return formula.replace(/(\d{3,}(?:\.\d+)?)%/g, (match, n) => {
    const num = Number(n);
    return isExcelScalePercent(num) ? formatDeskRate(num) : match;
  });
}

/**
 * Describes the active payoff band from index performance (for KPI subtitles).
 * Nifty Accelerator: flat 100% at/above 133% initial — 33% move.
 */
export function describePayoffBand(formula: string, z: number): string | undefined {
  if (!formula?.trim()) return undefined;
  const pct = z * 100;
  if (formula.includes("7500%") || formula.includes("32%")) {
    if (z >= 0.33) return "At/above 133% initial — 33% move — flat 100% coupon band";
    if (z >= 0.32 && z < 0.33) return "132–133% initial band — 32% to 33% move — accelerated PR";
    if (z >= 0.08) return "Above 108% initial — 8% move — 100% PR band";
  }
  return `Live index move ${formatIndexMoveLabel(pct, 1)} vs initial fixing`;
}
