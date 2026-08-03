import { getLiveBookLifecycleTable } from "@/lib/analytics";
import {
  getCategoryIntelligenceMap,
  getComputationPrimitives,
  getLogicModule,
  logicModules,
} from "@/lib/logic-atlas";
import {
  getCategoryLogicMap,
  getHiddenDependencyIndex,
  getReferenceFormulaCatalog,
  getUniversalFormulaIndex,
} from "@/lib/logic-directory";
import type { DashboardDataset } from "@/lib/types";

/** Backend-only appendix payload — not exposed in frontend navigation. */
export function buildAppendixPayload(dataset?: DashboardDataset) {
  const products = dataset?.products ?? [];
  const lifecycle = getLiveBookLifecycleTable(products);

  return {
    generatedAt: new Date().toISOString(),
    logicModules: logicModules.map((m) => ({
      id: m.id,
      title: m.title,
      nodes: m.nodes.length,
      flows: m.flows.length,
      outputs: m.outputs,
    })),
    categoryIntelligence: getCategoryIntelligenceMap(),
    categoryLogicMap: getCategoryLogicMap(),
    computationPrimitives: getComputationPrimitives(products),
    formulaFunctionIndex: getUniversalFormulaIndex(),
    hiddenDependencyIndex: getHiddenDependencyIndex(),
    referenceFormulaCatalog: getReferenceFormulaCatalog().slice(0, 500),
    liveFormulaCatalog: dataset?.formulaCatalog ?? [],
    validationIssues: dataset?.validationIssues ?? [],
    lifecycle,
    productCount: products.length,
    categorySummaries: dataset?.categorySummaries ?? [],
  };
}

export function buildLogicModuleDetail(moduleId: string) {
  return getLogicModule(moduleId) ?? null;
}
