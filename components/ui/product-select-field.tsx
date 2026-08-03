"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { ProductCombobox } from "@/components/ui/product-combobox";
import { Button } from "@/components/layout/app-ui";
import type { ProductRecord } from "@/lib/types";

/** Product picker with an explicit Select Product action button. */
export function ProductSelectField({
  products,
  browseProducts,
  value,
  onSelect,
  className,
}: {
  products: ProductRecord[];
  browseProducts?: ProductRecord[];
  value: string;
  onSelect: (product: ProductRecord) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`flex flex-wrap items-stretch gap-2 ${className ?? ""}`}>
      <div className="min-w-[min(100%,320px)] flex-1">
        <ProductCombobox
          browseProducts={browseProducts}
          open={open}
          products={products}
          value={value}
          onOpenChange={setOpen}
          onSelect={(p) => {
            onSelect(p);
            setOpen(false);
          }}
        />
      </div>
      <Button className="shrink-0 self-center" type="button" variant="primary" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
        Select Product
      </Button>
    </div>
  );
}
