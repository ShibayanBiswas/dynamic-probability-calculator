"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import {
  bandEnter,
  pageEnter,
  panelHover,
  staggerContainer,
  staggerItem,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Page-level entrance — wrap each route's main content once. */
export function PageEnter({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={cn("desk-page-enter", className)} {...pageEnter}>
      {children}
    </motion.div>
  );
}

/** Staggered band / section entrance. */
export function MotionBand({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} {...bandEnter(delay)}>
      {children}
    </motion.div>
  );
}

/** Stagger children on mount (KPI tiles, cards, chips). */
export function Stagger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="initial" animate="animate" variants={staggerContainer}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={staggerItem}>
      {children}
    </motion.div>
  );
}

/** Glass panel with lift-on-hover. */
export function MotionPanelShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} {...panelHover}>
      {children}
    </motion.div>
  );
}
