"use client";

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Hash, Search, TrendingUp } from "lucide-react";

import { useClientMounted } from "@/lib/hooks/use-client-mounted";
import { getProductDisplayName } from "@/lib/product-display-name";
import type { ProductRecord } from "@/lib/types";
import { categoryNeon } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

interface MenuRect {
  left: number;
  top: number;
  width: number;
}

const ROW_HEIGHT = 64;
const LIST_MAX_HEIGHT = 420;

export function ProductCombobox({
  products,
  browseProducts,
  value,
  onSelect,
  placeholder = "Search product, ISIN, issuer, series...",
  open: controlledOpen,
  onOpenChange,
}: {
  /** Full searchable universe — used when the user types a query. */
  products: ProductRecord[];
  /** Products shown when the search box is empty (defaults to `products`). */
  browseProducts?: ProductRecord[];
  value?: string;
  onSelect: (product: ProductRecord) => void;
  placeholder?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next);
      if (controlledOpen === undefined) setInternalOpen(next);
    },
    [controlledOpen, onOpenChange],
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const mounted = useClientMounted();
  const [rect, setRect] = useState<MenuRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => products.find((p) => getProductDisplayName(p) === value || p.name === value),
    [products, value],
  );

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return browseProducts ?? products;
    return products.filter((p) => {
      const display = getProductDisplayName(p);
      return [display, p.name, p.isin, p.issuer, p.series, p.underlying, p.category]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [products, browseProducts, deferredQuery]);

  // eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/react-virtual
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    enabled: open && filtered.length > 0,
  });

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const node = triggerRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setRect({ left: r.left, top: r.bottom + 8, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-combobox-menu]")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (open) rowVirtualizer.measure();
  }, [open, filtered.length, rowVirtualizer]);

  const listHeight = Math.min(LIST_MAX_HEIGHT, Math.max(ROW_HEIGHT, filtered.length * ROW_HEIGHT));

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        className="input-glow btn-animated flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:border-gold/40 hover:shadow-[0_0_16px_rgba(212,178,76,0.12)] dark:hover:border-gold/20 dark:hover:shadow-none"
        type="button"
        onClick={() => setOpen(!open)}
      >
        <Search className="h-4 w-4 shrink-0 text-amber-900" />
        <div className="min-w-0 flex-1">
          {selected ? (
            <>
              <p className="truncate text-sm font-semibold text-ink">{getProductDisplayName(selected)}</p>
              <p className="truncate text-xs text-muted">
                {[selected.category, selected.isin, selected.issuer].filter(Boolean).join(" · ")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">{placeholder}</p>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted transition", open && "rotate-180")} />
      </button>

      {mounted && rect
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  data-combobox-menu
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="dropdown-panel fixed z-[200] overflow-hidden"
                  exit={{ opacity: 0, y: -6, scale: 0.99 }}
                  initial={{ opacity: 0, y: -6, scale: 0.99 }}
                  style={{ left: rect.left, top: rect.top, width: rect.width }}
                  transition={{ duration: 0.12 }}
                >
                  <div className="border-b border-stone-200 p-3">
                    <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2">
                      <Search className="h-4 w-4 text-gold-dark" />
                      <input
                        autoFocus
                        className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                        placeholder="Type ISIN, name, issuer..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {filtered.length.toLocaleString("en-IN")} products
                    </p>
                  </div>
                  {filtered.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted">No products match “{query}”.</p>
                  ) : (
                    <div
                      ref={listRef}
                      className="overflow-y-auto overscroll-contain"
                      style={{ height: listHeight, maxHeight: "min(50vh, 420px)" }}
                    >
                      <ul className="relative m-0 p-0" style={{ height: rowVirtualizer.getTotalSize() }}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                          const product = filtered[virtualRow.index]!;
                          return (
                            <li
                              key={product.rowId}
                              className="absolute left-0 top-0 w-full"
                              style={{
                                height: virtualRow.size,
                                transform: `translateY(${virtualRow.start}px)`,
                              }}
                            >
                              <button
                                className="flex h-full w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-gold/10 hover:pl-5"
                                type="button"
                                onClick={() => {
                                  onSelect(product);
                                  setOpen(false);
                                  setQuery("");
                                }}
                              >
                                <span
                                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: categoryNeon[product.category] ?? "#d4b24c" }}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-ink">
                                    {getProductDisplayName(product)}
                                  </p>
                                  <p className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-muted">
                                    {product.isin ? (
                                      <span className="inline-flex items-center gap-1">
                                        <Hash className="h-3 w-3" />
                                        {product.isin}
                                      </span>
                                    ) : null}
                                    {product.underlying ? (
                                      <span className="inline-flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3" />
                                        {product.underlying}
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}
