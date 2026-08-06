/**
 * Intelligence map of SP desk logic pipelines — derived from reference dashboards.
 * UI copy stays passive, free of spreadsheet cell ids, and free of parenthetical asides.
 */

export type LogicNodeKind = "input" | "process" | "engine" | "lookup" | "output";

export type LogicNode = {
  id: string;
  label: string;
  kind: LogicNodeKind;
  description: string;
};

export type LogicFlow = {
  from: string;
  to: string;
  label?: string;
};

export type LogicModule = {
  id: string;
  title: string;
  subtitle: string;
  accent: "cyan" | "purple" | "green" | "amber" | "rose";
  purpose: string;
  stageCount: number;
  metrics: Array<{ label: string; value: string }>;
  nodes: LogicNode[];
  flows: LogicFlow[];
  insights: string[];
  outputs: string[];
};

export const logicModules: LogicModule[] = [
  {
    id: "data-foundation",
    title: "Product Master Intelligence",
    subtitle: "Canonical registry for the live Primary structured-products book",
    accent: "amber",
    purpose:
      "The live product universe is ingested from the merged master book and shared MongoDB. Observation calendars and phase schedules feed every probability module. Expired products are excluded from this desk.",
    stageCount: 6,
    metrics: [
      { label: "Category", value: "Primary" },
      { label: "Registry layers", value: "6" },
      { label: "Role", value: "Source of truth" },
    ],
    nodes: [
      {
        id: "upload",
        label: "Master Upload",
        kind: "input",
        description: "A fresh product master file is ingested and validated.",
      },
      {
        id: "normalize",
        label: "Row Normalizer",
        kind: "process",
        description:
          "Merged master rows are reduced to one desk row per ISIN. Phase 2 overrides Phase 1, which overrides Ten Years, which overrides blank rollover.",
      },
      {
        id: "formula",
        label: "Structure Formula Extractor",
        kind: "engine",
        description: "Structure formulas and product explanations are captured for each product name for reference plots.",
      },
      {
        id: "obs",
        label: "Observation Calendar",
        kind: "lookup",
        description: "Final observation dates and tenor metadata are linked to each product.",
      },
      {
        id: "ext",
        label: "Lifecycle Archive",
        kind: "lookup",
        description: "Matured and perpetual structures are retained for audit.",
      },
      {
        id: "feed",
        label: "Desk Data Bus",
        kind: "output",
        description: "Search, probability, and portfolio analytics are powered from this feed.",
      },
    ],
    flows: [
      { from: "upload", to: "normalize", label: "parse" },
      { from: "normalize", to: "formula", label: "enrich" },
      { from: "normalize", to: "obs", label: "dates" },
      { from: "normalize", to: "ext", label: "archive" },
      { from: "formula", to: "feed" },
      { from: "obs", to: "feed" },
      { from: "ext", to: "feed", label: "history" },
    ],
    insights: [
      "Every probability path is resolved back to this registry.",
      "Valid desk rows are kept only when lifecycle status is known and notionals are finite before any surface is rendered.",
      "Hidden calibration layers such as observation lookbacks and extinguished rollovers remain linked but are not shown to end users.",
      "Live Notional is driven by the sum of trade amounts on the merged master book. Lifecycle tab AUM is driven by deduped desk rows.",
      "Ongoing and live status is classified from the phase schedule end on the live desk clock. Blank and Phase 2 use Maturity. Phase 1 uses POED. Ten Years uses Rollover. Expired products are excluded from this desk. There are no separate Expiring 3M / 1M tabs.",
    ],
    outputs: ["Product search index", "Formula catalog", "Category summaries", "Validation alerts"],
  },
  {
    id: "primary-dashboard",
    title: "Desk Command Center",
    subtitle: "Home pulse, lifecycle tabs, and module routing",
    accent: "cyan",
    purpose:
      "The live Primary desk book is orchestrated through headline KPIs, lifecycle-filtered product lists, the maturity ladder, the lifecycle intelligence table, and shortcuts into Probability, Initial Probability, Current Probability, and analytics.",
    stageCount: 8,
    metrics: [
      { label: "Surfaces", value: "8" },
      { label: "Lifecycle tabs", value: "4" },
      { label: "Focus", value: "Primary lane" },
    ],
    nodes: [
      {
        id: "home",
        label: "Command Home",
        kind: "input",
        description: "Headline KPIs, lifecycle tabs, the maturity ladder, and desk module shortcuts are presented.",
      },
      {
        id: "clock",
        label: "Portfolio Clock",
        kind: "process",
        description: "Lifecycle buckets are refreshed every minute from the live as-of date without reload.",
      },
      {
        id: "filter",
        label: "Lifecycle Filter",
        kind: "process",
        description:
          "Ongoing and observation-due buckets are shared across Home, Probability, Initial Probability, Current Probability, and Analytics. Expiration is measured to phase schedule end. Observation due is measured to upcoming observation averages. Expired products and products whose last observation has already settled are excluded from this probability desk. Expiring 3M / 1M tabs are not used.",
      },
      {
        id: "list",
        label: "Product Register",
        kind: "lookup",
        description: "A searchable tab-scoped table is shown for every product in the active lifecycle pool.",
      },
      {
        id: "intel",
        label: "Lifecycle Intelligence",
        kind: "engine",
        description: "A full-book status breakdown is produced with highlights for the active tab.",
      },
      {
        id: "ladder",
        label: "Maturity Ladder",
        kind: "output",
        description:
          "Notional is grouped by remaining or elapsed window to phase schedule end across Maturity, POED, and Rollover as a single Rollover Phase series.",
      },
      {
        id: "resolver",
        label: "Product Resolver",
        kind: "input",
        description: "Product identity is resolved by ISIN, then product code, then name across desk modules.",
      },
      {
        id: "routes",
        label: "Module Router",
        kind: "output",
        description: "Navigation is provided to Probability, Initial Probability, Current Probability, Analytics Lab, and Logic Atlas.",
      },
    ],
    flows: [
      { from: "home", to: "clock", label: "as-of" },
      { from: "clock", to: "filter" },
      { from: "filter", to: "list", label: "pool" },
      { from: "filter", to: "intel", label: "status" },
      { from: "filter", to: "ladder", label: "window" },
      { from: "home", to: "resolver" },
      { from: "resolver", to: "routes", label: "navigate" },
    ],
    insights: [
      "Headline KPI tiles show a dash until the master book finishes loading. Live Notional uses merged master trade amounts with manifest fallback when summaries are absent.",
      "Live Notional is the sum of trade amounts on the merged master book. Lifecycle tab AUM sums deduped desk-canonical rows.",
      "Ongoing is the full live book where phase end is still ahead (including near-maturity deals). Expired uses phase end in the past. Blank and Phase 2 use Maturity. Phase 1 uses POED. Ten Years uses Rollover. This desk does not expose Expiring 3M / 1M filter tabs.",
      "Observation-due tabs for three months, two months, and one month include live products with any observation average date inside ninety, sixty, or thirty calendar days. The one-month set is nested inside the two-month set, which is nested inside the three-month set.",
      "Product lists and product search on every module use the same lifecycle picker pool as a scrollable list of every product in the active tab. Selection persists across Probability, Initial Probability, and Current Probability. A tab default is applied only when the current pick is outside the active pool.",
      "ScienceLab charts are shown on Analytics Lab only. Home keeps lifecycle intelligence and the maturity ladder.",
      "Lifecycle Intelligence lists Ongoing plus Observation Due 3M / 2M / 1M; the active tab row is highlighted. Obs Due rows are subsets of Ongoing.",
      "Upload Master on Home (and the Upload page) re-parses the registry and refreshes every downstream surface — same placement as Primary SP (not every module tab).",
    ],
    outputs: [
      "Headline KPIs",
      "Lifecycle product list",
      "Lifecycle intelligence table",
      "Maturity ladder",
      "Desk shortcuts",
    ],
  },
    {

    id: "primary-valuation",

    title: "Probability Summary Engine",

    subtitle: "Initial and Current probability for live structures",

    accent: "purple",

    purpose:

      "Initial and Current probability are computed from daily historical index paths. Rollover Phase tenure sets the start date. Observation offsets and Effective Target frame the remaining hurdle without debenture pricing.",

    stageCount: 6,

    metrics: [

      { label: "Core outputs", value: "2" },

      { label: "Phase types", value: "4" },

      { label: "Path mode", value: "Daily" },

    ],

    nodes: [

      {

        id: "identity",

        label: "Identity Resolver",

        kind: "input",

        description: "The product row is unlocked by ISIN, product code, or name.",

      },

      {

        id: "market",

        label: "Market Level Feed",

        kind: "input",

        description:

          "Nifty and Sensex closes for the valuation date are supplied for Current Probability and percent required.",

      },

      {

        id: "extrap",

        label: "Observation Schedule",

        kind: "engine",

        description:

          "Average 1–7 dates become day offsets from phase start for Initial Probability, or from the valuation date for Current Probability.",

      },

      {

        id: "barrier",

        label: "Target / Required Underlying",

        kind: "process",

        description:

          "Initial mode tests Target Underlying (target versus entry). Current mode tests Required Underlying versus today’s mark.",

      },

      {

        id: "formula",

        label: "Path Evaluator",

        kind: "engine",

        description:

          "Each daily path looks up prior closes on simulated observation dates and measures underlying performance.",

      },

      {

        id: "surface",

        label: "Probability Surface",

        kind: "output",

        description:

          "Initial Probability and Current Probability are shown with path counts. Price per debenture and absolute return are not part of this desk.",

      },

    ],

    flows: [

      { from: "identity", to: "extrap", label: "lookup" },

      { from: "market", to: "barrier" },

      { from: "extrap", to: "formula", label: "paths" },

      { from: "barrier", to: "formula", label: "threshold" },

      { from: "formula", to: "surface" },

    ],

    insights: [

      "Phase tenure is set by Rollover Phase. Blank runs from Allotment to Maturity. Phase 1 runs from Allotment to POED. Phase 2 runs from Trade Date to Maturity. Ten Years runs from Allotment to Rollover.",

      "Included paths require the index history to cover every simulated observation.",

      "The last included path has its last observation on Actual Start — Allotment or Trade by phase.",

      "Effective Target on the lifecycle register uses passed observation levels versus Target Level.",

    ],

    outputs: [

      "Initial Probability",

      "Current Probability",

      "Effective Target",

      "Observation Levels",

    ],

  },

  {

    id: "primary-payoff",

    title: "Effective Target Laboratory",

    subtitle: "Observation path metrics for remaining hurdle",

    accent: "green",

    purpose:

      "Observation levels, counts, and Effective Target are derived from the master Average 1–7 schedule and bundled index history. No debenture count or price mark is required.",

    stageCount: 5,

    metrics: [

      { label: "Obs slots", value: "7" },

      { label: "Core metrics", value: "4" },

      { label: "Levels", value: "History" },

    ],

    nodes: [

      {

        id: "select",

        label: "Product Selector",

        kind: "input",

        description: "Dropdown search is provided across the Primary product universe.",

      },

      {

        id: "hydrate",

        label: "Metadata Hydrator",

        kind: "lookup",

        description: "Issuer, ISIN, target level, and observation dates are loaded from the master.",

      },

      {

        id: "deal",

        label: "Schedule Counters",

        kind: "process",

        description: "Total, passed, and remaining observation dates are counted as of today.",

      },

      {

        id: "substitute",

        label: "Level Lookup",

        kind: "engine",

        description: "Passed observation dates resolve to prior Nifty or Sensex closes.",

      },

      {

        id: "matrix",

        label: "Effective Target",

        kind: "output",

        description:

          "Total Obs × Target, minus the sum of passed levels, then divided by Remaining Obs. Blank when Target or a passed level is missing.",

      },

    ],

    flows: [

      { from: "select", to: "hydrate" },

      { from: "hydrate", to: "deal" },

      { from: "deal", to: "substitute" },

      { from: "substitute", to: "matrix" },

    ],

    insights: [

      "Effective Target is independent of Initial and Current probability engines.",

      "Observation Level columns stay blank for future dates and empty Average slots.",

    ],

    outputs: [

      "Observation Levels 1–7",

      "Total / Passed / Remaining Obs",

      "Effective Target",

    ],

  },

{
    id: "portfolio-analytics",
    title: "Analytics Laboratory",
    subtitle: "Lifecycle-scoped charts and KPI bands",
    accent: "rose",
    purpose:
      "The desk command center is extended with ScienceLab charts for coupon, protection, underlying, issuer, and tenor distributions. Charts are filtered by the same lifecycle tab as the product register.",
    stageCount: 7,
    metrics: [
      { label: "Chart panels", value: "6" },
      { label: "Lifecycle tabs", value: "4" },
      { label: "Weighting", value: "AUM" },
    ],
    nodes: [
      {
        id: "tab",
        label: "Lifecycle Tab",
        kind: "input",
        description:
          "Ongoing and observation-due tabs drive every chart and product search pool. Products whose last observation has already settled are excluded from every live pill on this probability desk.",
      },
      {
        id: "pool",
        label: "Valid Master Pool",
        kind: "lookup",
        description: "Desk-canonical rows with finite notional and known lifecycle status are selected from the merged master.",
      },
      {
        id: "kpis",
        label: "KPI Band",
        kind: "output",
        description:
          "Live Notional from merged master trade amounts, ongoing count, and observation-due and expiry tiles are shown. A dash is shown while the book loads. Ongoing means phase still live and last observation not yet settled.",
      },
      {
        id: "universe",
        label: "Lifecycle Universe",
        kind: "engine",
        description: "A pie chart of status mix within the active tab is sized by notional.",
      },
      {
        id: "slices",
        label: "Distribution Engine",
        kind: "engine",
        description:
          "Coupon bands, protection mix, underlying exposure, issuer exposure, and tenor profile to Maturity, POED, or Rollover are aggregated.",
      },
      {
        id: "export",
        label: "Chart Export",
        kind: "output",
        description: "Product list export mirrors the filtered pool for audit.",
      },
    ],
    flows: [
      { from: "tab", to: "pool", label: "filter" },
      { from: "pool", to: "kpis" },
      { from: "pool", to: "universe" },
      { from: "pool", to: "slices", label: "aggregate" },
      { from: "slices", to: "export", label: "audit" },
    ],
    insights: [
      "The headline KPI band matches Home. Live Notional shows a dash until bootstrap completes.",
      "Category analytics KPIs for AUM, average full coupon, average absolute return, and listed share are scoped to the active lifecycle tab.",
      "Coupon buckets use product-driven intervals. Empty tenor bands are hidden when no notional sits in them.",
      "The underlying spread table groups every master underlying dynamically with minimum, maximum, and average levels and coupons.",
      "Analytics Lab shares the lifecycle product list with Home and adds ScienceLab charts that are not shown on Home.",
    ],
    outputs: [
      "Lifecycle universe pie",
      "Coupon distribution",
      "Protection mix",
      "Underlying bars",
      "Issuer bars",
      "Tenor profile",
    ],
  },
  {
    id: "initial-probability",
    title: "Initial Probability Engine",
    subtitle: "Daily historical paths versus adjusted start level",
    accent: "purple",
    purpose:
      "For each trading day since 2001, observation dates are projected from the phase start day offsets. Performance is measured against the adjusted start level. Success requires beating the target versus entry threshold.",
    stageCount: 6,
    metrics: [
      { label: "Frequency", value: "Daily" },
      { label: "Start bump", value: "Nifty 1% / Sensex 0.6%" },
      { label: "Frontier", value: "Actual Start" },
    ],
    nodes: [
      {
        id: "ip-schedule",
        label: "Observation Offsets",
        kind: "input",
        description:
          "Days from actual phase start to each observation date — Allotment for Blank / Phase 1 / 10Y; Trade Date for Phase 2.",
      },
      {
        id: "ip-paths",
        label: "Daily Path Starts",
        kind: "process",
        description:
          "Every index trading day becomes a path start — history runs from 2001-01-01 through the Actual Start frontier.",
      },
      {
        id: "ip-levels",
        label: "Prior Close Lookup",
        kind: "lookup",
        description: "Observation levels use the nearest prior close for each simulated date.",
      },
      {
        id: "ip-start",
        label: "Adjusted Start Level",
        kind: "engine",
        description:
          "Closing level is bumped and ceiling-rounded to the next hundred — Nifty bump 1%; Sensex bump 0.6%, then round up to the next hundred.",
      },
      {
        id: "ip-perf",
        label: "Underlying Performance",
        kind: "engine",
        description: "Average observation level divided by adjusted start level, minus one.",
      },
      {
        id: "ip-prob",
        label: "Initial Probability",
        kind: "output",
        description:
          "Share of included paths that clear the target versus entry threshold — last included path ends with its final observation on Actual Start.",
      },
    ],
    flows: [
      { from: "ip-schedule", to: "ip-paths" },
      { from: "ip-paths", to: "ip-levels" },
      { from: "ip-paths", to: "ip-start" },
      { from: "ip-levels", to: "ip-perf" },
      { from: "ip-start", to: "ip-perf" },
      { from: "ip-perf", to: "ip-prob" },
    ],
    insights: [
      "Included paths require the index history to cover every simulated observation.",
      "The last included path has its final observation on Actual Start (Allotment or Trade by phase).",
      "Daily path starts use Nifty history from 2001-01-01 (Gift AIF / NSP nifty sheet parity), forward-filled with Sensex.",
    ],
    outputs: ["Initial probability", "Path table", "Observation schedule"],
  },
  {
    id: "current-probability",
    title: "Current Probability Engine",
    subtitle: "Daily historical paths from the valuation date",
    accent: "green",
    purpose:
      "Day offsets are measured from the checking date for every observation slot. Passed fixings stay visible as ALREADY PASSED placeholders and are left out of the path average. The hurdle uses Effective Target versus today’s mark. Success compares path performance to that percent required.",
    stageCount: 5,
    metrics: [
      { label: "Frequency", value: "Daily" },
      { label: "Base", value: "Checking date / valuation date" },
      { label: "Frontier", value: "Latest trading day" },
    ],
    nodes: [
      {
        id: "cp-schedule",
        label: "Forward Offsets",
        kind: "input",
        description:
          "Days from valuation date to each observation — schedule keeps all slots; path average uses remaining positive day counts only.",
      },
      {
        id: "cp-paths",
        label: "Daily Path Starts",
        kind: "process",
        description:
          "Every index trading day becomes a path start — last included path ends so its final observation lands on today’s mark or the previous trading session.",
      },
      {
        id: "cp-levels",
        label: "Prior Close Lookup",
        kind: "lookup",
        description: "Observation levels use the nearest prior close.",
      },
      {
        id: "cp-perf",
        label: "Underlying Performance",
        kind: "engine",
        description:
          "Average observation level divided by path start close, minus one — hurdle uses Effective Target when past fixings exist, else master Target.",
      },
      {
        id: "cp-prob",
        label: "Current Probability",
        kind: "output",
        description:
          "Share of included paths that clear percent required — Effective Target = (N × Target − Σ passed levels) ÷ remaining.",
      },
    ],
    flows: [
      { from: "cp-schedule", to: "cp-paths" },
      { from: "cp-paths", to: "cp-levels" },
      { from: "cp-levels", to: "cp-perf" },
      { from: "cp-perf", to: "cp-prob" },
    ],
    insights: [
      "Percent required compares Effective Target to the selected-date Nifty or Sensex level.",
      "Passed Average slots stay on the schedule and path table as ALREADY PASSED; only remaining slots feed the average.",
      "Caching keys on ISIN, mode, valuation date, underlying, and latest index date.",
    ],
    outputs: ["Current probability", "Path table", "Effective Target", "Percent required"],
  },
];

export function getLogicModule(id: string) {
  return logicModules.find((m) => m.id === id);
}

/** Nodes not reachable from any flow root — should be empty for a healthy pipeline. */
export function getDisconnectedNodes(module: LogicModule): LogicNode[] {
  const roots = module.nodes.filter((n) => !module.flows.some((f) => f.to === n.id));
  const reachable = new Set<string>();
  const queue = roots.map((r) => r.id);

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const flow of module.flows) {
      if (flow.from === id) queue.push(flow.to);
    }
  }

  return module.nodes.filter((n) => !reachable.has(n.id));
}

export function isPipelineComplete(module: LogicModule): boolean {
  return getDisconnectedNodes(module).length === 0;
}

export type CategoryIntelligence = {
  category: string;
  dataLane: string;
  valuationPath: string;
  payoffPath: string;
  supportLayers: string[];
  keySignals: string[];
};

export function getCategoryIntelligenceMap(): CategoryIntelligence[] {
  return [
    {
      category: "Primary",
      dataLane: "Primary registry",
      valuationPath: "Probability Summary Engine",
      payoffPath: "Effective Target Laboratory",
      supportLayers: ["Observation lookback", "Last-fixing calendar", "Analytics Laboratory"],
      keySignals: [
        "Entry level",
        "Target level",
        "Initial probability",
        "Current probability",
        "Effective target",
        "Observation levels",
        "Lifecycle status",
      ],
    },
  ];
}

export type ComputationPrimitive = {
  name: string;
  role: string;
  count: number;
  category: "lookup" | "conditional" | "financial" | "text" | "aggregate";
};

/** Abstract computation primitives — counts derived from the live product book. */
export function getComputationPrimitives(
  products: {
    isin?: string | null;
    series?: string | null;
    formulaText?: string | null;
    principalProtection?: string | null;
    listing?: string | null;
    underlying?: string | null;
    maturityRaw?: string | null;
    tradeAmount?: number | null;
  }[],
): ComputationPrimitive[] {
  const count = (pred: (p: (typeof products)[number]) => boolean) => products.filter(pred).length;

  return [
    {
      name: "Cross-Reference Lookup",
      role: "Product identity and economics are resolved from the master index",
      count: count((p) => Boolean(p.isin?.trim() || p.series?.trim())),
      category: "lookup",
    },
    {
      name: "Conditional Branching",
      role: "Logic is routed by protection, listing, and tenor state",
      count: count((p) => Boolean(p.principalProtection?.trim() || p.listing?.trim())),
      category: "conditional",
    },
    {
      name: "Path Success Test",
      role: "Each daily historical path is tested against target or percent required",
      count: count((p) => Boolean(p.formulaText?.trim())),
      category: "financial",
    },
    {
      name: "Effective Target",
      role: "Remaining average level required across pending observations",
      count: count((p) => Boolean(p.formulaText?.trim() && p.tradeAmount)),
      category: "conditional",
    },
    {
      name: "Observation Level Lookup",
      role: "Prior closes are resolved on Average 1–7 observation dates",
      count: count((p) => /Z/i.test(p.formulaText ?? "")),
      category: "lookup",
    },
    {
      name: "Probability Aggregation",
      role: "Successful paths are divided by included paths for Initial and Current modes",
      count: count((p) => Boolean(p.formulaText?.trim() && p.tradeAmount)),
      category: "aggregate",
    },
    {
      name: "Aggregation Roll-up",
      role: "Notional and exposure are summed by lifecycle bucket",
      count: count((p) => (p.tradeAmount ?? 0) > 0),
      category: "aggregate",
    },
    {
      name: "Date Arithmetic",
      role: "Tenor, remaining days, and observation schedules are computed",
      count: count((p) => Boolean(p.maturityRaw?.trim())),
      category: "financial",
    },
    {
      name: "Index Match",
      role: "Product-level master resolution is performed by ISIN, code, or name",
      count: count((p) => Boolean(p.underlying?.trim())),
      category: "lookup",
    },
  ];
}
