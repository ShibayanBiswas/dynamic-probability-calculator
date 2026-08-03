"use client";

import Link from "next/link";
import type { Route } from "next";
import { motion, useReducedMotion } from "framer-motion";

import { LogicFlowDiagram } from "@/components/reference/logic-flow-diagram";
import { HorizontalBand, HorizontalRail, RailCard } from "@/components/layout/horizontal-rail";
import { AppPage, Button, Panel, SectionTitle } from "@/components/layout/app-ui";
import { logicModules } from "@/lib/logic-atlas";
import { categoryNeon } from "@/lib/chart-theme";
import { categoryQuickLinks } from "@/lib/navigation";
import { useDataset } from "@/lib/context/dataset-provider";
import { deskEase } from "@/lib/motion";
import { formatCrores, formatNumber } from "@/lib/utils";

export function DeskHubPage() {
  const { dataset } = useDataset();
  const primaryModule =
    logicModules.find((m) => m.id === "initial-probability") ??
    logicModules.find((m) => m.id === "data-foundation") ??
    logicModules[0];
  const reduce = useReducedMotion();

  return (
    <AppPage dense title="Desk">
      <HorizontalBand>
        <Panel className="!p-4" glow="cyan">
          <SectionTitle>Probability Desk</SectionTitle>
          <HorizontalRail className="mt-4">
            <RailCard>
              <motion.div
                whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
                transition={{ duration: 0.22 }}
              >
                <Link href={"/initial-probability" as Route}>
                  <Button className="w-full" variant="primary">
                    Initial Probability
                  </Button>
                </Link>
              </motion.div>
            </RailCard>
            <RailCard>
              <motion.div
                whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
                transition={{ duration: 0.22 }}
              >
                <Link href={"/current-probability" as Route}>
                  <Button className="w-full" variant="primary">
                    Current Probability
                  </Button>
                </Link>
              </motion.div>
            </RailCard>
          </HorizontalRail>
        </Panel>
      </HorizontalBand>

      <HorizontalBand className="mt-4">
        <Panel className="!p-4" glow="purple">
          <SectionTitle>Probability Command</SectionTitle>
          <p className="mt-1 text-sm text-stone-500">Horizontal flow across the probability pipeline</p>
          <div className="mt-4">
            <LogicFlowDiagram horizontal module={primaryModule} />
          </div>
        </Panel>
      </HorizontalBand>

      <HorizontalBand className="mt-4">
        <Panel className="!p-4" glow="cyan">
          <SectionTitle>Category Lanes</SectionTitle>
          <HorizontalRail className="category-intel-rail mt-3" gap="gap-2">
            {categoryQuickLinks.map((link, index) => {
              const count = dataset.products.filter((p) => p.category === link.category).length;
              const notional = dataset.products
                .filter((p) => p.category === link.category)
                .reduce((s, p) => s + (p.tradeAmount ?? 0), 0);
              return (
                <RailCard key={link.category}>
                  <motion.div
                    className="intel-rail-card flex h-full flex-col"
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.06, duration: 0.4, ease: deskEase }}
                    whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="intel-category-dot h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: categoryNeon[link.category] }}
                      />
                      <p className="font-bold text-ink">{link.category}</p>
                    </div>
                    <p className="mt-2 text-sm text-stone-500">{formatNumber(count)} products</p>
                    <p className="text-sm text-stone-500">{formatCrores(notional)}</p>
                  </motion.div>
                </RailCard>
              );
            })}
          </HorizontalRail>
        </Panel>
      </HorizontalBand>
    </AppPage>
  );
}
