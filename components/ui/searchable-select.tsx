"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

import { useClientMounted } from "@/lib/hooks/use-client-mounted";
import { cn } from "@/lib/utils";

type MenuRect = { left: number; top: number; width: number };

const MAX_RESULTS = 60;

/** Searchable white dropdown — avoids 2k+ native &lt;option&gt; DOM nodes. */
export function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const mounted = useClientMounted();
  const [rect, setRect] = useState<MenuRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Avoid SSR/client drift: localStorage selection exists only on the client.
  const displayValue = mounted ? value : "";
  const selectedLabel = options.find((o) => o.value === displayValue)?.label;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle
      ? options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle))
      : options;
    return pool.slice(0, MAX_RESULTS);
  }, [options, query]);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const node = triggerRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setRect({ left: r.left, top: r.bottom + 6, width: r.width });
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
      if ((target as HTMLElement).closest?.("[data-searchable-menu]")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        className="input-glow flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left text-sm"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <Search className="h-4 w-4 shrink-0 text-amber-900/80" />
        <span className={cn("min-w-0 flex-1 truncate", !selectedLabel && "text-stone-500")}>
          {selectedLabel ?? placeholder}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-stone-500 transition", open && "rotate-180")} />
      </button>

      {mounted && open && rect
        ? createPortal(
            <div
              className="dropdown-panel z-[200] max-h-72 overflow-hidden shadow-xl"
              data-searchable-menu
              style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width }}
            >
              <div className="border-b border-stone-100 p-2">
                <input
                  autoFocus
                  className="input-glow w-full rounded-xl px-3 py-2 text-sm outline-none"
                  placeholder="Type to filter…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <ul className="max-h-56 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-stone-500">No matches</li>
                ) : (
                  filtered.map((opt) => (
                    <li key={opt.value}>
                      <button
                        className={cn(
                          "w-full px-4 py-2.5 text-left text-sm hover:bg-gold/10",
                          opt.value === displayValue && "bg-gold/15 font-semibold text-maroon",
                        )}
                        type="button"
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        {opt.label}
                      </button>
                    </li>
                  ))
                )}
              </ul>
              {options.length > MAX_RESULTS && !query ? (
                <p className="border-t border-stone-100 px-3 py-2 text-[10px] text-stone-500">
                  Showing first {MAX_RESULTS} — type to search all {options.length.toLocaleString("en-IN")}
                </p>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
