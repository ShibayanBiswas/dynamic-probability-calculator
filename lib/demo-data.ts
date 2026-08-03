import type { DashboardDataset } from "@/lib/types";

import { PLACEHOLDER_WORKBOOK } from "@/lib/dataset-state";

/** Empty desk snapshot — shown until bootstrap or user upload loads the master book. */
export const demoDataset: DashboardDataset = {
  workbookName: PLACEHOLDER_WORKBOOK,
  loadedAt: new Date().toISOString(),
  sheets: [],
  hiddenDependencySheets: [],
  products: [],
  categorySummaries: [],
  validationIssues: [
    {
      severity: "info",
      category: "Setup",
      message: "Upload the New Product Master workbook to load live Primary structured-product data.",
    },
  ],
  formulaCatalog: [],
};
