import { formatProductExplanation } from "@/lib/product-narrative-format";
import {
  filterProductsByLifecycle,
  getProductLifecycleStatus,
  isValuationApplicable,
  LIFECYCLE_FILTERS,
  type LifecycleFilter,
} from "@/lib/product-lifecycle";
import { getIndexEntryLevel, inferDebentureCount, rawField } from "@/lib/product-utils";
import type { ProductRecord } from "@/lib/types";
import { tryEvaluatePayoffFormula } from "@/lib/workbook/formula-engine";
import { buildEnhancedPayoffScenarioTable } from "@/lib/workbook/payoff-pivots";
import { payoffInputsFromDesk } from "@/lib/workbook/payoff-scenarios";
import { computeValuation } from "@/lib/workbook/valuation-engine";

const Z_SWEEP = [-0.5, -0.3, -0.2, -0.15, -0.1, 0, 0.08, 0.11, 0.32, 0.35, 0.4, 0.5, 0.75, 1.0];

export type ProductValidationIssue = {
  productId: string;
  name: string;
  isin?: string;
  lifecycle: string;
  code: string;
  message: string;
};

export type ProductValidationReport = {
  asOf: string;
  totalProducts: number;
  withFormula: number;
  byLifecycle: Record<LifecycleFilter | "all", { count: number; issues: number }>;
  issues: ProductValidationIssue[];
  /** Issues in ongoing book — gate CI on these. */
  ongoingCritical: ProductValidationIssue[];
  passed: boolean;
  spotChecks: Array<{ label: string; passed: boolean; detail: string }>;
};

function productId(p: ProductRecord) {
  return p.isin ?? p.rowId;
}

/** Extract participation / decay rates cited in master prose (not level thresholds like 111%). */
export function extractParticipationRatesFromExplanation(text: string): number[] {
  const found = new Set<number>();
  for (const m of text.matchAll(/upside decay of (\d{3,}(?:\.\d+)?)%/gi)) found.add(Number(m[1]));
  for (const m of text.matchAll(/(\d{3,}(?:\.\d+)?)% participation/gi)) found.add(Number(m[1]));
  for (const m of text.matchAll(/PR of (\d{3,}(?:\.\d+)?)%?\s*\((\d{3,}(?:\.\d+)?)%\+/gi)) found.add(Number(m[2]));
  for (const m of text.matchAll(/\*\s*(\d{3,}(?:\.\d+)?)%/gi)) found.add(Number(m[1]));
  return [...found].filter((n) => Number.isFinite(n) && n >= 200);
}

/** True if formula encodes the Excel participation rate (600% → *6 or *600%). */
export function formulaContainsExcelParticipation(formula: string, excelPct: number): boolean {
  if (!formula?.trim()) return false;
  const desk = excelPct / 100;
  if (formula.includes(`${excelPct}%`)) return true;
  const bare = new RegExp(`\\*\\s*${desk}(?:[,)\\s]|$)`);
  if (bare.test(formula)) return true;
  const spaced = new RegExp(`\\*\\s*${desk}\\s*\\)`);
  return spaced.test(formula);
}

/** Formatted narrative must not leave raw Excel-scale percents visible. */
export function findRawExcelPercentsInFormatted(formatted: string): string[] {
  const bad: string[] = [];
  for (const match of formatted.matchAll(/\b(\d{3,}(?:\.\d+)?)%/g)) {
    const num = Number(match[1]);
    if (num >= 300) bad.push(`${match[1]}%`);
  }
  if (/\bupside decay of \d{3,}(?:\.\d+)?%/i.test(formatted)) {
    bad.push("upside decay not desk-formatted");
  }
  if (/\bPR of \d{3,}(?:\.\d+)?%/i.test(formatted)) {
    const prMatch = formatted.match(/\bPR of (\d{3,}(?:\.\d+)?)%/i);
    if (prMatch && Number(prMatch[1]) >= 300) {
      bad.push("PR not desk-formatted");
    }
  }
  return bad;
}

function validateFormulaSweep(product: ProductRecord, issues: ProductValidationIssue[], lifecycle: string) {
  const formula = product.formulaText?.trim();
  if (!formula) return;

  for (const z of Z_SWEEP) {
    const result = tryEvaluatePayoffFormula(formula, z);
    if (!result.ok) {
      issues.push({
        productId: productId(product),
        name: product.name,
        isin: product.isin,
        lifecycle,
        code: "FORMULA_EVAL",
        message: `Z=${z}: ${result.error}`,
      });
      return;
    }
  }
}

function validateNarrative(product: ProductRecord, issues: ProductValidationIssue[], lifecycle: string) {
  const raw =
    product.productExplanation?.trim() ||
    rawField(product, "Product Explanation", "Product explanation", "Description") ||
    "";
  if (!raw) return;

  const formatted = formatProductExplanation(raw);
  const rawPercents = findRawExcelPercentsInFormatted(formatted);
  if (rawPercents.length) {
    issues.push({
      productId: productId(product),
      name: product.name,
      isin: product.isin,
      lifecycle,
      code: "NARRATIVE_FORMAT",
      message: `Unconverted Excel percents: ${rawPercents.join(", ")}`,
    });
  }

  if (!product.formulaText?.trim()) return;

  for (const excelPct of extractParticipationRatesFromExplanation(raw)) {
    if (excelPct <= 200) continue;
    if (!formulaContainsExcelParticipation(product.formulaText, excelPct)) {
      issues.push({
        productId: productId(product),
        name: product.name,
        isin: product.isin,
        lifecycle,
        code: "NARRATIVE_FORMULA_MISMATCH",
        message: `Explanation cites ${excelPct}% but formula missing ${excelPct}% or ×${excelPct / 100}`,
      });
    }
  }
}

function validatePayoffTable(product: ProductRecord, issues: ProductValidationIssue[], lifecycle: string) {
  if (!product.formulaText?.trim()) return;
  try {
    buildEnhancedPayoffScenarioTable(
      product,
      payoffInputsFromDesk(product, { debentures: inferDebentureCount(product) }),
      0.1,
    );
  } catch (error) {
    issues.push({
      productId: productId(product),
      name: product.name,
      isin: product.isin,
      lifecycle,
      code: "PAYOFF_TABLE",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function validateValuation(product: ProductRecord, issues: ProductValidationIssue[], lifecycle: string, asOf: Date) {
  if (!product.formulaText?.trim() || !isValuationApplicable(product, asOf)) return;
  const entry = getIndexEntryLevel(product);
  if (entry <= 0) {
    issues.push({
      productId: productId(product),
      name: product.name,
      isin: product.isin,
      lifecycle,
      code: "ENTRY_LEVEL",
      message: "Missing or invalid index entry level",
    });
    return;
  }

  const result = computeValuation(product, {
    valuationDate: asOf.toLocaleDateString("en-GB").replace(/\//g, "-"),
    currentLevel: entry * 1.1,
    debentures: inferDebentureCount(product),
  });

  if (!Number.isFinite(result.productValue) || result.productValue < 0) {
    issues.push({
      productId: productId(product),
      name: product.name,
      isin: product.isin,
      lifecycle,
      code: "VALUATION",
      message: `Invalid product value: ${result.productValue}`,
    });
  }
}

function runSpotChecks(products: ProductRecord[]): ProductValidationReport["spotChecks"] {
  const checks: ProductValidationReport["spotChecks"] = [];

  const magnifier = products.find((p) => p.isin === "INE093JB7BG7");
  if (magnifier?.productExplanation) {
    const fmt = formatProductExplanation(magnifier.productExplanation);
    checks.push({
      label: "Nifty Magnifier 665 — decimal PR band",
      passed:
        fmt.includes("21.3% participation") &&
        fmt.includes("22.3%") &&
        !fmt.includes("2133.33%") &&
        !fmt.includes("2233.33%"),
      detail: fmt.split("\n").find((l) => l.startsWith("2."))?.slice(0, 140) ?? fmt.slice(0, 140),
    });
  }

  const accel = products.find((p) => p.isin === "INE093JA77C4");
  if (accel?.productExplanation) {
    const fmt = formatProductExplanation(accel.productExplanation);
    checks.push({
      label: "Nifty Accelerator 637 — PR band",
      passed: fmt.includes("76.0%") && fmt.includes("75.0% participation") && !fmt.includes("7600%"),
      detail: fmt.slice(0, 120),
    });
  }

  const decayProduct = products.find((p) => (p.productExplanation ?? "").includes("upside decay of 600%"));
  if (decayProduct?.productExplanation && decayProduct.formulaText) {
    const fmt = formatProductExplanation(decayProduct.productExplanation);
    const f = decayProduct.formulaText;
    const at35 = tryEvaluatePayoffFormula(f, 0.35);
    const at36 = tryEvaluatePayoffFormula(f, 0.36);
    const at40 = tryEvaluatePayoffFormula(f, 0.4);
    const approx = (a: number, b: number) => Math.abs(a - b) < 0.011;
    checks.push({
      label: "600% upside decay product — narrative + formula",
      passed:
        fmt.includes("6.0% per 1% index move") &&
        !fmt.includes("upside decay of 600%") &&
        at35.ok &&
        at36.ok &&
        at40.ok &&
        at35.ok && approx(at35.value, 0.6) &&
        at36.ok && approx(at36.value, 0.54) &&
        at40.ok && approx(at40.value, 0.3),
      detail: `formatted decay line OK; Z35=${at35.ok ? at35.value : "err"} Z36=${at36.ok ? at36.value : "err"} Z40=${at40.ok ? at40.value : "err"}`,
    });
  }

  return checks;
}

export function validateProductCatalog(products: ProductRecord[], asOf = new Date()): ProductValidationReport {
  const issues: ProductValidationIssue[] = [];
  const byLifecycle = {} as ProductValidationReport["byLifecycle"];

  byLifecycle.all = { count: products.length, issues: 0 };

  for (const filter of LIFECYCLE_FILTERS) {
    const pool = filterProductsByLifecycle(products, filter, asOf);
    byLifecycle[filter] = { count: pool.length, issues: 0 };

    for (const product of pool) {
      const lifecycle = getProductLifecycleStatus(product, asOf);
      validateFormulaSweep(product, issues, lifecycle);
      validateNarrative(product, issues, lifecycle);
      validatePayoffTable(product, issues, lifecycle);
      validateValuation(product, issues, lifecycle, asOf);
    }
    byLifecycle[filter].issues = issues.filter((i) =>
      pool.some((p) => productId(p) === i.productId),
    ).length;
  }

  byLifecycle.all.issues = issues.length;
  const spotChecks = runSpotChecks(products);
  const spotFailed = spotChecks.some((c) => !c.passed);

  const ongoingPool = filterProductsByLifecycle(products, "ongoing", asOf);
  const ongoingIds = new Set(ongoingPool.map(productId));
  const ongoingCritical = issues.filter(
    (i) =>
      ongoingIds.has(i.productId) &&
      i.code !== "NARRATIVE_FORMULA_MISMATCH" &&
      (i.code === "FORMULA_EVAL" || i.code === "NARRATIVE_FORMAT" || i.code === "PAYOFF_TABLE" || i.code === "VALUATION"),
  );

  return {
    asOf: asOf.toISOString(),
    totalProducts: products.length,
    withFormula: products.filter((p) => p.formulaText?.trim()).length,
    byLifecycle,
    issues,
    ongoingCritical,
    spotChecks,
    passed: ongoingCritical.length === 0 && !spotFailed,
  };
}
