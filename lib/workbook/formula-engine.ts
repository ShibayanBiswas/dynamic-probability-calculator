/**
 * Evaluates Excel-style payoff formulas where Z = Nifty performance (decimal).
 * Examples: IF(Z>=6%,47.5%,MAX(-100%,47.5%+(Z-6%)*2.55))
 */

function tokenizePercentages(expression: string) {
  let out = expression.replace(/(-?\d+(?:\.\d+)?)\s*%/g, (_, value: string) => {
    const numeric = Number(value);
    return String(numeric / 100);
  });
  // Excel allows a postfix % on any value (value% = value / 100), e.g. "(Z%)*100%".
  // Numeric percents are handled above; also support the Z variable and grouped
  // sub-expressions so these formulas compile instead of throwing a syntax error.
  out = out.replace(/\bZ\s*%/gi, "(Z*0.01)");
  out = out.replace(/\)\s*%/g, ")*0.01");
  return out;
}

function normalizeFormula(formula: string) {
  let expr = formula.trim();
  if (expr.startsWith("=")) {
    expr = expr.slice(1);
  }
  expr = tokenizePercentages(expr);
  expr = expr.replace(/\bZ\b/g, "z");
  expr = expr.replace(/\bTRUE\b/gi, "true");
  expr = expr.replace(/\bFALSE\b/gi, "false");
  return expr;
}

function parseIf(expression: string): string {
  const upper = expression.toUpperCase();
  const ifIndex = upper.indexOf("IF(");
  if (ifIndex === -1) {
    return expression;
  }

  let depth = 0;
  let start = -1;
  for (let index = ifIndex; index < expression.length; index += 1) {
    if (expression[index] === "(") {
      depth += 1;
      if (depth === 1) {
        start = index + 1;
      }
    } else if (expression[index] === ")") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        const inner = expression.slice(start, index);
        const parts = splitTopLevel(inner, ",");
        if (parts.length === 3) {
          const [condition, whenTrue, whenFalse] = parts;
          const replacement = `(${parseIf(condition.trim())} ? ${parseIf(whenTrue.trim())} : ${parseIf(whenFalse.trim())})`;
          return expression.slice(0, ifIndex) + replacement + expression.slice(index + 1);
        }
        break;
      }
    }
  }

  return expression;
}

/** Excel payoff strings often chain multiple IF(...); convert all of them. */
function parseAllIfs(expression: string): string {
  let out = expression;
  for (let i = 0; i < 64; i += 1) {
    if (!/\bIF\s*\(/i.test(out)) break;
    const next = parseIf(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

function splitTopLevel(value: string, delimiter: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
    if (char === delimiter && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function replaceAndOrCalls(expression: string): string {
  let out = expression;
  for (let pass = 0; pass < 64; pass += 1) {
    const match = /\b(AND|OR)\s*\(/i.exec(out);
    if (!match) break;

    const fn = match[1]!.toUpperCase();
    const openIdx = match.index! + match[0].length;
    let depth = 1;
    let i = openIdx;
    for (; i < out.length && depth > 0; i += 1) {
      if (out[i] === "(") depth += 1;
      else if (out[i] === ")") depth -= 1;
    }
    if (depth !== 0) break;

    const inner = out.slice(openIdx, i - 1);
    const op = fn === "AND" ? "&&" : "||";
    const parts = splitTopLevel(inner, ",").map((part) => part.trim()).filter(Boolean);
    const replacement = `(${parts.join(` ${op} `)})`;
    out = out.slice(0, match.index!) + replacement + out.slice(i);
  }
  return out;
}

function replaceFunctions(expression: string) {
  let output = expression;
  const replacements: Array<[RegExp, string]> = [
    [/\bMIN\s*\(/gi, "Math.min("],
    [/\bMAX\s*\(/gi, "Math.max("],
    [/\bABS\s*\(/gi, "Math.abs("],
  ];

  for (const [pattern, replacement] of replacements) {
    output = output.replace(pattern, replacement);
  }

  return output;
}

function compileFormula(formula: string) {
  const normalized = normalizeFormula(formula);
  const withIf = parseAllIfs(normalized);
  const withAndOr = replaceAndOrCalls(withIf);
  const withFunctions = replaceFunctions(withAndOr);
  const source = `"use strict"; return ${withFunctions};`;
  return new Function("z", "Math", source) as (z: number, math: typeof Math) => number;
}

export function evaluatePayoffFormula(formula: string, z: number) {
  if (!formula?.trim()) {
    return 0;
  }
  try {
    const evaluator = compileFormula(formula);
    const result = evaluator(z, Math);
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/** Strict evaluation for QA — surfaces compile/runtime errors instead of swallowing them. */
export function tryEvaluatePayoffFormula(
  formula: string,
  z: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (!formula?.trim()) {
    return { ok: true, value: 0 };
  }
  try {
    const evaluator = compileFormula(formula);
    const result = evaluator(z, Math);
    if (!Number.isFinite(result)) {
      return { ok: false, error: `Non-finite result at z=${z}` };
    }
    return { ok: true, value: result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildPayoffCurve(formula: string, points = 41) {
  const curve: Array<{ z: number; payoff: number }> = [];
  for (let index = 0; index < points; index += 1) {
    const z = -0.5 + (index / (points - 1)) * 1.25;
    curve.push({
      z,
      payoff: evaluatePayoffFormula(formula, z),
    });
  }
  return curve;
}

export function extractFormulaFunctions(formula: string) {
  const matches = formula.toUpperCase().match(/[A-Z][A-Z0-9._]*(?=\s*\()/g) ?? [];
  return [...new Set(matches)];
}
