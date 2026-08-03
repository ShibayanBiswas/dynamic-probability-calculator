import { CANONICAL_MANIFEST } from "@/lib/canonical-manifest";

/** Baseline counts — regenerated on every `npm run bake` from NEW PRIMARY. */
export const EXPECTED_PRODUCT_COUNTS: Record<string, { products: number; formulas: number }> = {
  Primary: {
    products: CANONICAL_MANIFEST.deskCanonicalProducts,
    formulas: CANONICAL_MANIFEST.deskCanonicalFormulas,
  },
};
