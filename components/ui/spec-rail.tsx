"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { HorizontalRail, RailCard } from "@/components/layout/horizontal-rail";
import { deskEase } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type SpecRailCard = {
  label: string;
  value: string;
  mono?: boolean;
};

function SpecRailCardBody({
  card,
  uniformWidth,
  uniformHeight,
  index = 0,
  stretch = false,
}: {
  card: SpecRailCard;
  uniformWidth?: number;
  uniformHeight?: number;
  index?: number;
  /** Stretch card to fill its grid/flex cell (full horizontal band). */
  stretch?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn("spec-rail-card spec-rail-card-uniform", stretch && "spec-rail-card-stretch")}
      data-spec-card
      style={
        stretch
          ? uniformHeight
            ? { minHeight: uniformHeight, width: "100%" }
            : { width: "100%" }
          : uniformWidth || uniformHeight
            ? {
                width: uniformWidth,
                minWidth: uniformWidth,
                minHeight: uniformHeight,
              }
            : undefined
      }
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.35, ease: deskEase }}
      whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
    >
      <p className="spec-rail-label">{card.label}</p>
      <p className={cn("spec-rail-value", card.mono && "font-mono text-xs")}>{card.value}</p>
    </motion.div>
  );
}

/** Measure natural card sizes, then apply the largest width/height to every visible card. */
export function useUniformSpecCardSize(cards: SpecRailCard[]) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width?: number; height?: number }>({});

  const cardKey = useMemo(
    () => cards.map((c) => `${c.label}\0${c.value}`).join("\n"),
    [cards],
  );

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root || cards.length === 0) {
      setSize({});
      return;
    }

    const els = root.querySelectorAll<HTMLElement>("[data-spec-card]");
    let maxW = 0;
    let maxH = 0;
    els.forEach((el) => {
      el.style.width = "auto";
      el.style.minWidth = "auto";
      el.style.minHeight = "auto";
      const rect = el.getBoundingClientRect();
      maxW = Math.max(maxW, rect.width);
      maxH = Math.max(maxH, rect.height);
    });

    if (maxW > 0) {
      const viewportCap =
        typeof window !== "undefined" ? Math.max(160, Math.floor(window.innerWidth * 0.78)) : 240;
      const width = Math.min(Math.max(200, Math.ceil(maxW) + 20), Math.max(viewportCap, 200));
      const height = maxH > 0 ? Math.ceil(maxH) + 8 : undefined;
      requestAnimationFrame(() => {
        setSize({ width, height });
      });
    }
  }, [cardKey, cards.length]);

  const MeasureLayer =
    cards.length > 0 ? (
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible fixed -left-[10000px] top-0 flex gap-2 select-none"
      >
        {cards.map((card) => (
          <SpecRailCardBody key={`measure-${card.label}`} card={card} />
        ))}
      </div>
    ) : null;

  return { ...size, MeasureLayer };
}

export function UniformSpecRail({
  cards,
  className,
  uniformWidth,
  uniformHeight,
  /** Stretch cards across the full horizontal viewport (Probability Specs / Results). */
  fillRow = true,
}: {
  cards: SpecRailCard[];
  className?: string;
  uniformWidth?: number;
  uniformHeight?: number;
  fillRow?: boolean;
}) {
  if (cards.length === 0) return null;

  if (fillRow) {
    const cols = Math.min(cards.length, 6);
    return (
      <div
        className={cn("spec-rail-fill-grid w-full gap-2 md:gap-3", className)}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {cards.map((card, index) => (
          <SpecRailCardBody
            key={card.label}
            card={card}
            index={index}
            stretch
            uniformHeight={uniformHeight}
          />
        ))}
      </div>
    );
  }

  return (
    <HorizontalRail className={className} variant="spec">
      {cards.map((card, index) => (
        <RailCard key={card.label} fillFirst={false} className="spec-rail-item">
          <SpecRailCardBody
            card={card}
            index={index}
            uniformHeight={uniformHeight}
            uniformWidth={uniformWidth}
          />
        </RailCard>
      ))}
    </HorizontalRail>
  );
}
