"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/layout/app-ui";
import type { DeskAlertVariant } from "@/lib/desk-alert";
import { cn } from "@/lib/utils";

export type DeskDialogState = {
  title: string;
  message: string;
  variant: DeskAlertVariant;
};

const VARIANT_META: Record<
  DeskAlertVariant,
  { icon: typeof Info; glow: "cyan" | "purple"; accent: string; label: string }
> = {
  info: { icon: Info, glow: "cyan", accent: "text-maroon", label: "Desk Notice" },
  warning: { icon: AlertTriangle, glow: "purple", accent: "text-amber-900", label: "Please Note" },
  error: { icon: OctagonAlert, glow: "purple", accent: "text-maroon", label: "Action Required" },
};

export function DeskDialog({
  open,
  state,
  onClose,
}: {
  open: boolean;
  state: DeskDialogState | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const variant = state?.variant ?? "info";
  const meta = VARIANT_META[variant];
  const Icon = meta.icon;

  return (
    <AnimatePresence>
      {open && state ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          role="presentation"
        >
          <button
            aria-label="Close dialog"
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
            type="button"
            onClick={onClose}
          />
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            aria-labelledby="desk-dialog-title"
            aria-modal="true"
            className={cn(
              "glass relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-gold/30 shadow-[0_24px_80px_-20px_rgba(122,30,44,0.45)]",
              meta.glow === "cyan" ? "glass-glow-cyan" : "glass-glow-purple",
            )}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            role="alertdialog"
          >
            <div className="h-1 bg-gradient-to-r from-maroon via-gold to-maroon/70" />
            <div className="border-b border-gold/15 bg-gradient-to-r from-maroon/[0.06] via-white to-gold/[0.08] px-5 py-4">
              <div className="flex items-start gap-3">
                <BrandLogo compact />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-gold-dark">{meta.label}</p>
                  <h2 className="font-ui mt-1 text-lg font-bold text-ink" id="desk-dialog-title">
                    {state.title}
                  </h2>
                </div>
                <div
                  className={cn(
                    "rounded-xl border border-gold/25 bg-white/80 p-2 shadow-sm",
                    meta.accent,
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
              </div>
            </div>
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-stone-700">{state.message}</p>
            </div>
            <div className="flex justify-end border-t border-stone-100 bg-stone-50/80 px-5 py-3">
              <Button variant="primary" onClick={onClose}>
                OK
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
