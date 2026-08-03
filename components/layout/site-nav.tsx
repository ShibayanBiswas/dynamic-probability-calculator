"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Upload } from "lucide-react";

import { CommandPalette } from "@/components/layout/command-palette";
import { MarketStrip } from "@/components/layout/market-strip";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { mainSections, resolveNavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SiteNav() {
  const pathname = usePathname();
  const section = resolveNavSection(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="border-t border-[color:var(--ar-border)]">
        <MarketStrip />
        <div className="mx-auto flex max-w-full items-center justify-between gap-4 px-4 py-2 lg:px-6">
          <div className="nav-pill-shell flex items-center gap-1 rounded-2xl border p-1 shadow-sm">
            {mainSections.map((item) => {
              const active = section.id === item.id;
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  className={cn(
                    "relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                    active ? "btn-nav-active text-ink" : "text-muted hover:bg-[color:var(--ar-panel)] hover:text-ink",
                  )}
                  href={item.href as Route}
                >
                  {active ? (
                    <motion.span
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-gold/25 to-maroon/20 shadow-lg shadow-gold/10 dark:from-gold/6 dark:to-transparent dark:shadow-none"
                      layoutId="main-nav-active"
                      transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    />
                  ) : null}
                  <motion.span
                    className="relative inline-flex"
                    whileHover={{ scale: 1.12, rotate: -4 }}
                    transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  >
                    <Icon className="h-4 w-4" />
                  </motion.span>
                  <span className="relative hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              className="btn-ghost btn-animated inline-flex items-center gap-2 text-xs"
              type="button"
              onClick={() => setPaletteOpen(true)}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Search</span>
              <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px] text-stone-500 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-500">
                ⌘K
              </kbd>
            </button>
            <Link className="btn-ghost btn-animated inline-flex items-center gap-2 text-xs" href="/upload">
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Upload</span>
            </Link>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {section.subNav?.length ? (
            <motion.div
              key={section.id}
              animate={{ opacity: 1, y: 0 }}
              className="nav-sub-bar border-t"
              exit={{ opacity: 0, y: -4 }}
              initial={false}
            >
              <div className="mx-auto flex max-w-full items-center gap-1 overflow-x-auto px-3 py-2 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible sm:px-4 lg:px-6">
                {section.subNav.map((item) => {
                  const active = item.match ? item.match(pathname) : pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      className={cn(
                        "nav-sub-pill shrink-0",
                        active && "nav-sub-pill-active",
                      )}
                      href={item.href as Route}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
