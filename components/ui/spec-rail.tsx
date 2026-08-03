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
}: {
  card: SpecRailCard;
  uniformWidth?: number;
  uniformHeight?: number;
  index?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="spec-rail-card spec-rail-card-uniform"
      data-spec-card
      style={
        uniformWidth || uniformHeight
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
      const width = Math.max(240, Math.ceil(maxW) + 20);
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
        className="pointer-events-none fixed -left-[10000px] top-0 flex gap-2 opacity-0"
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
}: {
  cards: SpecRailCard[];
  className?: string;
  uniformWidth?: number;
  uniformHeight?: number;
}) {
  if (cards.length === 0) return null;

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
