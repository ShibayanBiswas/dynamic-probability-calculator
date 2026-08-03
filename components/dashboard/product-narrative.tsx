"use client";

import { motion } from "framer-motion";

import { Panel, SectionTitle } from "@/components/layout/app-ui";
import type { ProductRecord } from "@/lib/types";
import { getProductOverview, parseExplanationBlocks } from "@/lib/product-narrative";
import { narrativeLineToSpans } from "@/lib/product-narrative-format";
import { getCouponLabel } from "@/lib/product-utils";
import { categoryNeon } from "@/lib/chart-theme";
import { formatCurrency } from "@/lib/utils";

function NarrativeLine({ line }: { line: string }) {
  return (
    <>
      {narrativeLineToSpans(line).map((span, i) =>
        span.highlight ? (
          <span key={i} className="product-narrative-num">
            {span.text}
          </span>
        ) : (
          <span key={i}>{span.text}</span>
        ),
      )}
    </>
  );
}

export function ProductNarrative({
  product,
  className,
}: {
  product: ProductRecord;
  className?: string;
}) {
  const overview = getProductOverview(product);
  const blocks = parseExplanationBlocks(overview.explanation);
  const couponLabel = getCouponLabel(product);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.45 }}
    >
      <Panel className="!p-4" glow="purple">
        <SectionTitle>Product Overview</SectionTitle>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--ar-border)] pb-4">
          <div>
            <h3 className="font-serif text-xl font-bold italic text-ink">{overview.title}</h3>
            {overview.issuer ? (
              <p className="mt-1 font-serif text-sm text-stone-600">
                <span className="font-bold text-stone-700">Issuer:</span>{" "}
                <em>{overview.issuer}</em>
                {overview.isin ? (
                  <>
                    {" "}
                    · <span className="font-bold text-stone-700">ISIN:</span> <em>{overview.isin}</em>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <span
            className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
            style={{
              borderColor: `${categoryNeon[product.category]}50`,
              color: categoryNeon[product.category],
              backgroundColor: `${categoryNeon[product.category]}15`,
            }}
          >
            {product.category}
          </span>
        </div>

        {blocks.length > 0 ? (
          <div className="product-narrative-body mt-4 space-y-3 font-serif text-[15px] leading-7 text-ink">
            {blocks.map((block, i) => {
              if (block.type === "point") {
                const match = block.content.match(/^(\d+[\.\)])\s*(.*)$/);
                const num = match?.[1] ?? "";
                const rest = match?.[2] ?? block.content;
                return (
                  <motion.p
                    key={i}
                    animate={{ opacity: 1, x: 0 }}
                    className="pl-1"
                    initial={{ opacity: 0, x: -6 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <span className="product-narrative-num">{num}</span>{" "}
                    <NarrativeLine line={rest} />
                  </motion.p>
                );
              }
              if (block.type === "heading") {
                return (
                  <p key={i} className="font-bold text-ink">
                    {block.content}
                  </p>
                );
              }
              return (
                <p key={i}>
                  <NarrativeLine line={block.content} />
                </p>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 font-serif text-sm italic text-stone-500">
            Product description will appear once the master file includes an explanation for this structure.
          </p>
        )}

        {overview.structure.length > 0 ? (
          <div className="product-narrative-structure-rail horizontal-rail -mx-1 mt-5 overflow-x-auto px-1 pb-1">
            <div className="flex min-w-min gap-2">
              {overview.structure.map((line) => (
                <div key={line} className="desk-structure-card">
                  <NarrativeLine line={line} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-4 border-t border-[color:var(--ar-border)] pt-4 font-serif text-sm">
          {product.tradeAmount ? (
            <span>
              <span className="product-narrative-num">Notional:</span> <em>{formatCurrency(product.tradeAmount)}</em>
            </span>
          ) : null}
          {couponLabel ? (
            <span>
              <span className="product-narrative-num">Coupon:</span> <em>{couponLabel}</em>
            </span>
          ) : null}
        </div>
      </Panel>
    </motion.div>
  );
}
