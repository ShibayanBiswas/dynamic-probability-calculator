import type { InfoBlurb } from "@/lib/info-blurb";

export type InputSurface = "valuation-primary" | "payoff-primary";

export const VALUATION_DISCLAIMER =
  "The valuation shown above is as per ARWL estimates and may differ from the actual unwind value because of volatility, illiquidity of long-dated options, and prevailing market levels on the day of unwind. ARWL does not guarantee the same.";

export const INPUT_HINT = "* Highlighted cells are for inputs";

export const IDENTITY_HINT = "Enter any ONE of the below fields";

export function getPayoffSteps() {
  return [
    {
      step: 1,
      title: "Set deal parameters",
      items: [
        "Product Name — select from dropdown / product list",
        "Current Level — live / historical underlying level (read-only)",
        "Start Date — Working!F (Allotment for Blank / Phase 1 / 10Y; Trade Date for Phase 2)",
        "No. of debentures — as purchased by the client",
        "Initial Price / Debenture — from master (read-only)",
      ],
    },
    {
      step: 2,
      title: "Scenario sweep",
      items: [
        "Underlying performance levels can be changed as required, except the 0% anchor row",
        "Review maturity value, return on investment, and IRR per scenario row",
      ],
    },
  ];
}

export function getValuationInputFields() {
  return [
    { key: "isin", label: "Enter The ISIN", type: "text" as const, highlight: true },
    { key: "or1", label: "OR", type: "divider" as const },
    { key: "productCode", label: "Enter the Product Code", type: "text" as const, highlight: true },
    { key: "or2", label: "OR", type: "divider" as const },
    { key: "productName", label: "Select the Primary Structured Product", type: "product" as const, highlight: true },
    { key: "valuationDate", label: "Valuation Date", type: "date" as const, highlight: true },
    { key: "niftyLevel", label: "Val. Date Nifty Level", type: "number" as const, highlight: true },
    { key: "sensexLevel", label: "Val. Date Sensex Level", type: "number" as const, highlight: true },
    { key: "targetLevelDisplay", label: "Target Level", type: "targetLevelDisplay" as const, highlight: false },
    { key: "targetUnderlyingPct", label: "Target Underlying", type: "targetUnderlying" as const, highlight: true },
    { key: "debentures", label: "No. of Debentures", type: "number" as const, highlight: true },
  ];
}

export const DEBENTURE_PRESETS = ["1", "10", "25", "50", "100", "250", "500", "1000"];

/** Field-level hints — one paragraph, five lines max when expanded. */
export const INPUT_FIELD_HINTS: Record<string, InfoBlurb> = {
  isin: {
    title: "ISIN",
    body: "International Securities Identification Number — unique 12-character debenture code.\nEnter any one identity field (ISIN, product code, or name).\nThe app resolves the remaining fields automatically from the master file.\nMatches the ISIN column on the desk valuation Working sheet.\nUse when the client statement shows ISIN but not the marketing name.",
  },
  productCode: {
    title: "Product Code",
    body: "Desk series / product code from the signup form (e.g. ARG17SUBNCD02).\nMatches the Primary master sheet Series column.\nEnter any one identity field — ISIN, code, or name.\nSelecting a code loads formula, entry level, and default debenture count.\nUseful when the signup form series is known but ISIN is not handy.",
  },
  productName: {
    title: "Product Name",
    body: "Full name as on the signup form; dropdown respects the active lifecycle filter.\nSelecting a product loads formula, entry level, and default debenture count.\nEnter any one identity field — name, ISIN, or product code.\nNames can look similar — confirm ISIN in the specifications panel after pick.\nMatches the Name on Signup Form column in the desk workbooks.",
  },
  valuationDate: {
    title: "Valuation Date",
    body: "Mark-to-market date for this run — defaults to today from the desk clock.\nMust be on or after trade date and on or before maturity for historical marks.\nDrives elapsed tenor, discounting branch, and IRR in Working sheet logic.\nChange it to reproduce a prior desk valuation (e.g. month-end).\nNifty and Sensex levels should match this same calendar date.",
  },
  niftyLevel: {
    title: "Valuation Date Nifty Level",
    body: "Closing Nifty 50 level on the valuation date.\nAuto-filled from Yahoo Finance (^NSEI) when available.\nUsed when the product underlying is Nifty or Nifty-linked.\nDoes not overwrite the Sensex field — each index stays separate.\nMirrors Working sheet D1 for Nifty-linked rows.",
  },
  sensexLevel: {
    title: "Valuation Date Sensex Level",
    body: "Closing Sensex level on the valuation date.\nAuto-filled from Yahoo Finance (^BSESN) when available.\nUsed when the product underlying is Sensex.\nDoes not overwrite the Nifty field — each index stays separate.\nMirrors Working sheet C1 for Sensex-linked rows.",
  },
  targetLevelDisplay: {
    title: "Target Level / Effective Target",
    body: "Read-only absolute hurdle for the selected product.\nWhen no observation fixings have settled, shows Target Level (Final Level Target) from Entry × (1 + Target Underlying).\nWhen one or more observation dates have settled, shows Effective Target for the remaining schedule.\nEffective Target is never typed directly — edit Target Underlying instead.\nMatches the Probability / Initial Prob / Backtesting desk maths.",
  },
  targetUnderlyingPct: {
    title: "Target Underlying",
    body: "Editable performance hurdle as a percent (e.g. 36.0 means 36%).\nOn Initial Prob / Summary / Current with no settled fixings: defaults to master Target ÷ Entry − 1; Target Level = Entry × (1 + pct).\nOn Current Prob with one or more settled fixings: defaults to Effective Target ÷ Entry − 1; edits back-solve Target Level so Effective Target tracks Entry × (1 + pct).\nEffective Target stays read-only. Always editable.",
  },
  debentures: {
    title: "No. of Debentures",
    body: "Client holding size — natural number, max notional ÷ price per debenture.\nDefaults from trade notional ÷ price per debenture in the master file.\nProduct Value is per debenture at ₹1L face; Total Amount = Product Value × count.\nInvalid counts show an alert and are not applied.\nMatches debenture count scaling on the desk valuation interface.",
  },
  currentLevel: {
    title: "Current Level",
    body: "Live closing level of the linked index from Yahoo Finance.\nRead-only on Payoff — updated from market sync, not manual entry.\nDrives the highlighted current scenario row in the payoff table.\nNifty products use Nifty; Sensex products use Sensex.\nRepresents the index at trade date for most standard payoff runs.",
  },
  purchaseDate: {
    title: "Start Date",
    body: "Fixed label on Payoff — value is Working!F for the selected product (read-only).\nBlank / Phase 1 / 10 Years → Allotment Date; Phase 2 → Trade Date.\nMatches valuation elapsed / Product IRR start.\nPayoff XIRR still annualises over full phase tenure to schedule end.\nComes from the master sheet — not a client purchase override.",
  },
  pricePerDebenture: {
    title: "Initial Price / Debenture",
    body: "Master deal price per debenture — fetched per product and not editable on Payoff.\nCombined with debenture count to size client investment and maturity amounts.\nEach scenario row scales returns to this investment base.\nTypically ₹1,00,000 face unless the master lists a different deal price.\nMatches Price / Debenture on the desk master and Product Specs.",
  },
};
