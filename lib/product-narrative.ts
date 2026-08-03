import type { ProductRecord } from "@/lib/types";
import { formatProductExplanation } from "@/lib/product-narrative-format";
import { rawField } from "@/lib/product-utils";

/** Build human-readable product overview — never exposes raw formula strings. */
export function getProductOverview(product: ProductRecord) {
  const rawExplanation =
    product.productExplanation?.trim() ||
    rawField(product, "Product Explanation", "Product explanation", "Description") ||
    "";

  const structure = [
    product.productType && `Structure type: ${product.productType}`,
    product.principalProtection && `Capital protection: ${product.principalProtection}`,
    product.listing && `Listing: ${product.listing}`,
    product.underlying && `Underlying: ${product.underlying}`,
  ].filter(Boolean) as string[];

  return {
    title: product.name,
    explanation: formatProductExplanation(rawExplanation),
    structure,
    issuer: product.issuer,
    isin: product.isin,
    series: product.series,
  };
}

/** Split "Structure type: Equity" into label/value for chip display. */
export function parseStructureLine(line: string): { label: string; value: string } {
  const idx = line.indexOf(":");
  if (idx === -1) return { label: line, value: "" };
  return { label: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
}

/** Split "1. For Final Nifty..." into index token and body. */
export function extractNarrativePoint(content: string): { num: string; body: string } {
  const match = content.match(/^(\d+[\.\)])\s*(.*)$/);
  return { num: match?.[1] ?? "", body: match?.[2] ?? content };
}

/** Split explanation into styled blocks for Times New Roman rendering. */
export function parseExplanationBlocks(text: string): Array<{ type: "heading" | "point" | "text"; content: string }> {
  if (!text.trim()) return [];

  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const blocks: Array<{ type: "heading" | "point" | "text"; content: string }> = [];

  for (const line of lines) {
    if (/^\d+[\.\)]\s/.test(line)) {
      blocks.push({ type: "point", content: line });
    } else if (line.length < 80 && !line.includes(".")) {
      blocks.push({ type: "heading", content: line });
    } else {
      blocks.push({ type: "text", content: line });
    }
  }

  return blocks;
}
