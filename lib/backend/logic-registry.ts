import masterSchema from "@/lib/data/master-schema.json";
import primaryValuation from "@/lib/data/reference-workbooks/primary-valuation.json";
import automatedPrimary from "@/lib/data/reference-workbooks/automated-primary-dashboard.json";

/** Backend registry — workbook schema and engine mappings. Not for frontend display. */
export const logicRegistry = {
  version: "1.0.0",
  masterSchema,
  workbooks: {
    primaryValuation,
    automatedPrimary,
  },
  laneMapping: masterSchema.laneMapping,
  computationEngines: {
    primaryValuation: {
      module: "lib/workbook/valuation-engine.ts",
      entry: "computeValuation",
      inputs: ["valuationDate", "currentLevel", "debentures", "product"],
      outputs: ["productValue", "absReturn", "productIrr", "z", "totalAmount"],
      excelRefs: ["Valuation!M6:O6", "Working!B4:Z5465"],
    },
    payoffScenarios: {
      module: "lib/workbook/payoff-scenarios.ts",
      entry: "buildPayoffScenarioTable",
      inputs: ["currentLevel", "debentures", "pricePerDebenture", "formulaText"],
      outputs: ["performance", "finalFixing", "z", "maturityValue", "returnOnInvestment", "irr"],
      excelRefs: ["Payoff scenario matrix"],
    },
    formulaEvaluation: {
      module: "lib/workbook/formula-engine.ts",
      entry: "evaluatePayoffFormula",
      inputs: ["formulaText", "z"],
      outputs: ["payoff"],
      excelRefs: ["Formulae column — New Product Master"],
    },
  },
  categoryColumns: masterSchema.master.categorySheets,
} as const;

export type LogicRegistry = typeof logicRegistry;
