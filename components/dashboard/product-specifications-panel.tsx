"use client";

import { Panel, SectionTitle } from "@/components/layout/app-ui";
import { UniformSpecRail, useUniformSpecCardSize } from "@/components/ui/spec-rail";
import { buildProductSpecCards, type ProductSpecOptions } from "@/lib/product-specifications";
import type { ProductRecord } from "@/lib/types";

export function ProductSpecificationsPanel({
  product,
  options,
  glow = "purple",
}: {
  product: ProductRecord;
  options?: ProductSpecOptions;
  glow?: "purple" | "cyan";
}) {
  const cards = buildProductSpecCards(product, options);
  const { width: uniformWidth, height: uniformHeight, MeasureLayer } = useUniformSpecCardSize(cards);

  return (
    <Panel className="!p-4" glow={glow}>
      <SectionTitle>Product Specifications</SectionTitle>
      {MeasureLayer}
      <UniformSpecRail
        cards={cards}
        className="mt-4"
        uniformHeight={uniformHeight}
        uniformWidth={uniformWidth}
      />
    </Panel>
  );
}
