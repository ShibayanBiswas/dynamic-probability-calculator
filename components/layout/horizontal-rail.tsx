"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Full-width single card row — one card per horizontal band. */
export function HorizontalBand({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn("w-full", className)} id={id}>
      {children}
    </section>
  );
}

/** Horizontally laid-out rail — fill full row by default; scroll only on overflow. */
export function HorizontalRail({
  children,
  className,
  gap = "gap-4",
  fillFirst = true,
  variant = "default",
}: {
  children: ReactNode;
  className?: string;
  gap?: string;
  /** Expand cards to share the full row width first; scroll only when min-width forces overflow. */
  fillFirst?: boolean;
  /** Scrollable spec cards sized to label text (product specifications, lifecycle KPIs). */
  variant?: "default" | "spec";
}) {
  const isSpec = variant === "spec";
  const railGap = isSpec ? "gap-2" : gap;

  return (
    <div
      className={cn(
        "horizontal-rail w-full -mx-1 px-1 pb-2",
        isSpec && "horizontal-rail-spec",
        !isSpec && fillFirst && "horizontal-rail-fill",
        !isSpec && !fillFirst && "overflow-x-auto",
        className,
      )}
    >
      <div
        className={cn(
          "flex snap-x snap-mandatory",
          isSpec && "horizontal-rail-spec-inner",
          !isSpec && fillFirst && "horizontal-rail-fill-inner w-full",
          !isSpec && !fillFirst && "w-max min-w-full flex-nowrap",
          railGap,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function RailCard({
  children,
  className,
  minWidth = "min-w-0",
  fillFirst = true,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
  fillFirst?: boolean;
}) {
  return (
    <div
      className={cn(
        "rail-card snap-start",
        fillFirst ? "rail-card-fill w-full" : minWidth,
        className,
      )}
    >
      {children}
    </div>
  );
}
