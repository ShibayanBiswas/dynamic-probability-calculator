"use client";

import Link from "next/link";
import type { Route } from "next";
import { motion, useReducedMotion } from "framer-motion";

import { LogicFlowDiagram } from "@/components/reference/logic-flow-diagram";
import { HorizontalBand, HorizontalRail, RailCard } from "@/components/layout/horizontal-rail";
import { AppPage, Button, Panel, SectionTitle } from "@/components/layout/app-ui";
import { logicModules } from "@/lib/logic-atlas";

export function DeskHubPage() {
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
    </AppPage>
  );
}
