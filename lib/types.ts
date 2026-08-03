/**
 * The dashboard is Primary-only. The category list is intentionally a single
 * entry so the whole codebase stays narrowly typed to "Primary". To introduce
 * another product line in future, add it here and the type system will surface
 * every place that needs a corresponding implementation.
 */
export const PRODUCT_CATEGORIES = ["Primary"] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Categories that are LIVE in the web app today. */
export const ACTIVE_CATEGORIES: ProductCategory[] = ["Primary"];

export type SheetVisibility = "visible" | "hidden" | "veryHidden";

export interface WorkbookCellRecord {
  address: string;
  value: string | number | boolean | null;
  formatted: string;
  formula?: string;
}

export interface WorkbookRowRecord {
  rowNumber: number;
  values: WorkbookCellRecord[];
}

export interface WorkbookSheetRecord {
  name: string;
  visibility: SheetVisibility;
  rowCount: number;
  columnCount: number;
  headers: string[];
  rows: WorkbookRowRecord[];
  formulas: Array<{
    address: string;
    formula: string;
  }>;
}

export interface ProductRecord {
  category: ProductCategory;
  rowId: string;
  month?: string;
  name: string;
  issuer?: string;
  isin?: string;
  underlying?: string;
  series?: string;
  tradeAmount?: number;
  pricePerDebenture?: number;
  couponPercent?: number;
  tenorDays?: number;
  tenorBucket?: string;
  maturityRaw?: string;
  lastObservationDateRaw?: string;
  formulaText?: string;
  productExplanation?: string;
  principalProtection?: string;
  listing?: string;
  productType?: string;
  rolloverPhase?: string;
  raw: Record<string, string | number | boolean | null>;
}

export interface CategoryMetricSummary {
  category: ProductCategory;
  productCount: number;
  liveNotional: number;
  averageCoupon: number;
  listedShare: number;
  principalProtectedShare: number;
  topIssuers: Array<{ name: string; value: number }>;
  tenorMix: Array<{ bucket: string; value: number }>;
  payoffProfiles: Array<{ name: string; formula: string }>;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  category: string;
  message: string;
  context?: string;
}

export interface FormulaCatalogEntry {
  workbook: string;
  sheet: string;
  cell: string;
  formula: string;
  category?: ProductCategory;
  productName?: string;
}

export interface DashboardDataset {
  workbookName: string;
  loadedAt: string;
  sheets: WorkbookSheetRecord[];
  products: ProductRecord[];
  hiddenDependencySheets: WorkbookSheetRecord[];
  categorySummaries: CategoryMetricSummary[];
  validationIssues: ValidationIssue[];
  formulaCatalog: FormulaCatalogEntry[];
}
