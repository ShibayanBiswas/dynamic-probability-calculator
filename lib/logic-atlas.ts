/**
 * Intelligence map of SP desk logic pipelines — derived from reference dashboards.
 * UI copy stays passive, free of spreadsheet cell ids, and free of parenthetical asides.
 */

export type LogicNodeKind = "input" | "process" | "engine" | "lookup" | "output";

export type LogicNode = {
  id: string;
  label: string;
  kind: LogicNodeKind;
  /** One-line summary shown on the pipeline card. */
  description: string;
  /** Longer explanation for Active pipeline + Module Intelligence. */
  detail?: string;
  /** Compact metric chips on the pipeline card footer. */
  metrics?: Array<{ label: string; value: string }>;
  /** Short capability tags. */
  tags?: string[];
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
        detail:
          "Upload Master on Home or the Upload page re-parses the workbook into the merged Primary book and refreshes every downstream surface. Invalid rows surface as validation alerts before the desk data bus opens.",
        metrics: [
          { label: "Entry", value: "Workbook" },
          { label: "Gate", value: "Validate" },
        ],
        tags: ["Upload", "Parse"],
      },
      {
        id: "normalize",
        label: "Row Normalizer",
        kind: "process",
        description:
          "Merged master rows are reduced to one desk row per ISIN. Phase 2 overrides Phase 1, which overrides Ten Years, which overrides blank rollover.",
        detail:
          "Desk-canonical rows keep finite notionals and known lifecycle status only. Duplicate ISIN collisions resolve by rollover phase precedence so Probability never double-counts AUM.",
        metrics: [
          { label: "Key", value: "ISIN" },
          { label: "Precedence", value: "P2>P1>10Y>Blank" },
        ],
        tags: ["Dedup", "Phase"],
      },
      {
        id: "formula",
        label: "Structure Formula Extractor",
        kind: "engine",
        description: "Structure formulas and product explanations are captured for each product name for reference plots.",
        detail:
          "Formula text drives ScienceLab reference plots and computation-primitive counts on Logic Atlas. Missing formulas still allow schedule and probability runs when observation dates exist.",
        metrics: [
          { label: "Field", value: "Formula text" },
          { label: "Use", value: "Plots + atlas" },
        ],
        tags: ["Structure", "Explain"],
      },
      {
        id: "obs",
        label: "Observation Calendar",
        kind: "lookup",
        description: "Final observation dates and tenor metadata are linked to each product.",
        detail:
          "Average 1–7 slots, POED, Maturity, Rollover, Trade, and Allotment dates feed Initial offsets, Current offsets, Effective Target counters, and Obs Due lifecycle tabs.",
        metrics: [
          { label: "Slots", value: "Avg 1–7" },
          { label: "Tenor", value: "Phase end" },
        ],
        tags: ["Schedule", "Tenor"],
      },
      {
        id: "ext",
        label: "Lifecycle Archive",
        kind: "lookup",
        description: "Matured and perpetual structures are retained for audit.",
        detail:
          "Expired and extinguished rollovers stay linked for audit but are excluded from every live pill on this probability desk. Lookback layers remain available to engines without cluttering the register.",
        metrics: [
          { label: "Live desk", value: "Exclude expired" },
          { label: "Audit", value: "Retain" },
        ],
        tags: ["Archive", "Hidden layers"],
      },
      {
        id: "feed",
        label: "Desk Data Bus",
        kind: "output",
        description: "Search, probability, and portfolio analytics are powered from this feed.",
        detail:
          "Bootstrap on Vercel prefers the static master seed with Mongo overlays for prices and paths. Local desks can hydrate from Atlas when configured. Every module reads the same canonical product index.",
        metrics: [
          { label: "Consumers", value: "All modules" },
          { label: "Seed", value: "Master + Mongo" },
        ],
        tags: ["Search", "Probability", "Analytics"],
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
        detail:
          "Live Notional, Ongoing, and Obs Due tiles show a dash until bootstrap completes. Module shortcuts route into Probability, Initial, Current, Analytics Lab, and Logic Atlas without losing the active lifecycle tab.",
        metrics: [
          { label: "KPIs", value: "Headline band" },
          { label: "Tabs", value: "4 live" },
        ],
        tags: ["Home", "Shortcuts"],
      },
      {
        id: "clock",
        label: "Portfolio Clock",
        kind: "process",
        description: "Lifecycle buckets are refreshed every minute from the live as-of date without reload.",
        detail:
          "Desk as-of follows the NSE cash clock: previous trading-day close before 15:30 IST, then today’s session after the cash close. Bucket membership recomputes without a hard page refresh.",
        metrics: [
          { label: "Refresh", value: "1 min" },
          { label: "Mark", value: "15:30 IST" },
        ],
        tags: ["As-of", "Live clock"],
      },
      {
        id: "filter",
        label: "Lifecycle Filter",
        kind: "process",
        description:
          "Ongoing and observation-due buckets are shared across Home, Probability, Initial Probability, Current Probability, and Analytics. Expiration is measured to phase schedule end. Observation due is measured to upcoming observation averages. Expired products and products whose last observation has already settled are excluded from this probability desk. Expiring 3M / 1M tabs are not used.",
        detail:
          "Obs Due 1M ⊂ 2M ⊂ 3M ⊂ Ongoing. Blank and Phase 2 end on Maturity, Phase 1 on POED, Ten Years on Rollover. Last-observation settled names drop from every live pill.",
        metrics: [
          { label: "Buckets", value: "Ongoing + Obs Due" },
          { label: "Nested", value: "1M⊂2M⊂3M" },
        ],
        tags: ["Shared pool", "No Expiring tabs"],
      },
      {
        id: "list",
        label: "Product Register",
        kind: "lookup",
        description: "A searchable tab-scoped table is shown for every product in the active lifecycle pool.",
        detail:
          "Selection persists across Probability, Initial, and Current. A tab default applies only when the current pick falls outside the active pool. Columns include Initial Level, as-of mark date, and phase calendar fields.",
        metrics: [
          { label: "Scope", value: "Active tab" },
          { label: "Persist", value: "Cross-module" },
        ],
        tags: ["Search", "Lifecycle table"],
      },
      {
        id: "intel",
        label: "Lifecycle Intelligence",
        kind: "engine",
        description: "A full-book status breakdown is produced with highlights for the active tab.",
        detail:
          "Rows cover Ongoing plus Observation Due 3M / 2M / 1M with notional and count. The active tab row is highlighted so Ops can see nested Obs Due share of Ongoing at a glance.",
        metrics: [
          { label: "Rows", value: "4 status" },
          { label: "Highlight", value: "Active tab" },
        ],
        tags: ["Status mix", "AUM"],
      },
      {
        id: "ladder",
        label: "Maturity Ladder",
        kind: "output",
        description:
          "Notional is grouped by remaining or elapsed window to phase schedule end across Maturity, POED, and Rollover as a single Rollover Phase series.",
        detail:
          "Windows are measured to the phase schedule end that matches Rollover Phase. ScienceLab distribution charts stay on Analytics Lab; Home keeps this ladder plus lifecycle intelligence.",
        metrics: [
          { label: "Axis", value: "Phase end" },
          { label: "Weight", value: "Notional" },
        ],
        tags: ["Tenor", "Rollover Phase"],
      },
      {
        id: "resolver",
        label: "Product Resolver",
        kind: "input",
        description: "Product identity is resolved by ISIN, then product code, then name across desk modules.",
        detail:
          "The same resolver seeds Probability Summary, Effective Target, Initial, and Current so picker search never drifts between modules when names collide.",
        metrics: [
          { label: "Order", value: "ISIN→Code→Name" },
          { label: "Scope", value: "Desk-wide" },
        ],
        tags: ["Identity", "Search"],
      },
      {
        id: "routes",
        label: "Module Router",
        kind: "output",
        description: "Navigation is provided to Probability, Initial Probability, Current Probability, Analytics Lab, and Logic Atlas.",
        detail:
          "Routes carry the active lifecycle tab and selected ISIN where applicable. Upload Master remains on Home and Upload only — matching Primary SP placement.",
        metrics: [
          { label: "Targets", value: "5 modules" },
          { label: "Carry", value: "Tab + ISIN" },
        ],
        tags: ["Navigate", "Desk links"],
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
      "Initial and Current probability are computed from daily historical index paths. Rollover Phase sets the start date across Blank, Phase 1, Phase 2, and Ten Years. Observation offsets and Effective Target frame the remaining hurdle without debenture pricing.",
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
        detail:
          "Opens the Probability Summary surface with the same picker pool as Home. Specs, schedule, and both probability KPIs hydrate from one resolved master row.",
        metrics: [
          { label: "Key", value: "ISIN preferred" },
          { label: "Pool", value: "Lifecycle tab" },
        ],
        tags: ["Picker", "Specs"],
      },
      {
        id: "market",
        label: "Market Level Feed",
        kind: "input",
        description:
          "Nifty and Sensex closes for the valuation date are supplied for Current Probability and percent required.",
        detail:
          "Desk mark policy uses the previous trading-day close before 15:30 IST and today’s close after the cash session. Initial Probability still uses Entry / Actual Start rather than this mark.",
        metrics: [
          { label: "Indexes", value: "Nifty + Sensex" },
          { label: "Mark", value: "Desk as-of" },
        ],
        tags: ["% Required", "Current"],
      },
      {
        id: "extrap",
        label: "Observation Schedule",
        kind: "engine",
        description:
          "Average 1–7 dates become day offsets from phase start for Initial Probability, or from the valuation date for Current Probability.",
        detail:
          "Schedule sits above Product Specs on the Probability tab. Trading-day resolution snaps holiday Average dates to the prior session before offsets are sent to either engine.",
        metrics: [
          { label: "Initial base", value: "Actual Start" },
          { label: "Current base", value: "Checking date" },
        ],
        tags: ["Avg 1–7", "Offsets"],
      },
      {
        id: "barrier",
        label: "Target / Required Underlying",
        kind: "process",
        description:
          "Initial mode tests Target Underlying (target versus entry). Current mode tests Required Underlying versus today’s mark.",
        detail:
          "Target Underlying = Target ÷ Entry − 1. Required Underlying = Target ÷ today mark − 1. Effective Target on the lifecycle register is a separate remaining-hurdle average and does not replace these thresholds.",
        metrics: [
          { label: "Initial", value: "Target %" },
          { label: "Current", value: "% Required" },
        ],
        tags: ["Threshold", "Entry vs mark"],
      },
      {
        id: "formula",
        label: "Path Evaluator",
        kind: "engine",
        description:
          "Each daily path looks up prior closes on simulated observation dates and measures underlying performance.",
        detail:
          "Paths load inline with a Backtester-style progress bar. Included paths need full observation coverage; the frontier path ends on the latest trading session. Trailing Path-Taken-No rows are trimmed.",
        metrics: [
          { label: "Grid", value: "Daily since 2001" },
          { label: "Filter", value: "Included" },
        ],
        tags: ["Path table", "Progress bar"],
      },
      {
        id: "surface",
        label: "Probability Surface",
        kind: "output",
        description:
          "Initial Probability and Current Probability are shown with path counts. Price per debenture and absolute return are not part of this desk.",
        detail:
          "Summary KPIs link into dedicated Initial and Current engines for full path tables and exports. Primary-grade Excel and PDF exports reuse the gold masthead and disclaimer stack.",
        metrics: [
          { label: "KPIs", value: "2 modes" },
          { label: "Export", value: "Excel + PDF" },
        ],
        tags: ["No debenture price", "Summary"],
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
      "The last included path has its last observation on the current trading day.",
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
        detail:
          "Lifecycle-filtered search spans Ongoing and Observation Due books. The selected ISIN seeds every downstream Effective Target field from the merged master row.",
        metrics: [
          { label: "Universe", value: "Live book" },
          { label: "Key", value: "ISIN" },
        ],
        tags: ["Search", "Lifecycle pool"],
      },
      {
        id: "hydrate",
        label: "Metadata Hydrator",
        kind: "lookup",
        description: "Issuer, ISIN, target level, and observation dates are loaded from the master.",
        detail:
          "Average 1–7 dates, Target Level, Initial Level, and phase calendar fields are read once per product so Schedule Counters and Level Lookup never re-parse the workbook.",
        metrics: [
          { label: "Obs slots", value: "1–7" },
          { label: "Target", value: "Master" },
        ],
        tags: ["Issuer", "ISIN", "Target"],
      },
      {
        id: "deal",
        label: "Schedule Counters",
        kind: "process",
        description: "Total, passed, and remaining observation dates are counted as of today.",
        detail:
          "Passed slots are calendar dates already settled through the NSE cash close. Same-day fixings stay pending until 15:30 IST. Remaining Obs drives the Effective Target denominator.",
        metrics: [
          { label: "Total", value: "Present slots" },
          { label: "Clock", value: "Desk as-of" },
        ],
        tags: ["Passed", "Remaining", "EOD rule"],
      },
      {
        id: "substitute",
        label: "Level Lookup",
        kind: "engine",
        description: "Passed observation dates resolve to prior Nifty or Sensex closes.",
        detail:
          "Each settled Average date uses the nearest previous trading-day close from Gift/NSP history with Mongo overlay. Future or blank Average slots stay empty in the Observation Level columns.",
        metrics: [
          { label: "Source", value: "History" },
          { label: "Rule", value: "Prior close" },
        ],
        tags: ["Nifty", "Sensex", "VLOOKUP"],
      },
      {
        id: "matrix",
        label: "Effective Target",
        kind: "output",
        description:
          "Total Obs × Target, minus the sum of passed levels, then divided by Remaining Obs. Blank when Target or a passed level is missing.",
        detail:
          "This remaining-hurdle level is independent of Initial and Current probability engines. It answers what average future fixing must still clear for the coupon path.",
        metrics: [
          { label: "Formula", value: "Hurdle avg" },
          { label: "Blank if", value: "Missing data" },
        ],
        tags: ["Lifecycle table", "No debenture"],
      },
    ],
    flows: [
      { from: "select", to: "hydrate", label: "resolve" },
      { from: "hydrate", to: "deal", label: "dates" },
      { from: "deal", to: "substitute", label: "passed" },
      { from: "substitute", to: "matrix", label: "hurdle" },
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
        detail:
          "The same four live tabs as Home. Changing the tab recomputes every ScienceLab chart and the product register without leaving Analytics Lab.",
        metrics: [
          { label: "Tabs", value: "4" },
          { label: "Sync", value: "Home pool" },
        ],
        tags: ["Ongoing", "Obs Due"],
      },
      {
        id: "pool",
        label: "Valid Master Pool",
        kind: "lookup",
        description: "Desk-canonical rows with finite notional and known lifecycle status are selected from the merged master.",
        detail:
          "Deduped ISIN rows with finite trade amount feed AUM weighting. Invalid or expired rows never enter chart aggregates or list export.",
        metrics: [
          { label: "Filter", value: "Finite AUM" },
          { label: "Key", value: "Desk row" },
        ],
        tags: ["Canonical", "AUM"],
      },
      {
        id: "kpis",
        label: "KPI Band",
        kind: "output",
        description:
          "Live Notional from merged master trade amounts, ongoing count, and observation-due and expiry tiles are shown. A dash is shown while the book loads. Ongoing means phase still live and last observation not yet settled.",
        detail:
          "Matches the Home headline band so Ops can trust Analytics Lab as an extension of Command Center rather than a separate book.",
        metrics: [
          { label: "Parity", value: "Home KPIs" },
          { label: "Load", value: "Dash until ready" },
        ],
        tags: ["Notional", "Counts"],
      },
      {
        id: "universe",
        label: "Lifecycle Universe",
        kind: "engine",
        description: "A pie chart of status mix within the active tab is sized by notional.",
        detail:
          "Status slices stay inside the active lifecycle tab. Nested Obs Due share is visible without leaving the Analytics surface.",
        metrics: [
          { label: "Weight", value: "Notional" },
          { label: "Scope", value: "Active tab" },
        ],
        tags: ["Pie", "Status mix"],
      },
      {
        id: "slices",
        label: "Distribution Engine",
        kind: "engine",
        description:
          "Coupon bands, protection mix, underlying exposure, issuer exposure, and tenor profile to Maturity, POED, or Rollover are aggregated.",
        detail:
          "Empty tenor bands hide when no notional sits in them. Underlying spread tables group every master underlying with min, max, and average levels and coupons.",
        metrics: [
          { label: "Panels", value: "6 charts" },
          { label: "Weight", value: "AUM" },
        ],
        tags: ["Coupon", "Issuer", "Tenor"],
      },
      {
        id: "export",
        label: "Chart Export",
        kind: "output",
        description: "Product list export mirrors the filtered pool for audit.",
        detail:
          "Exports the same lifecycle-filtered register Ops see on screen so chart slices can be reconciled to line-level notionals.",
        metrics: [
          { label: "Scope", value: "Filtered pool" },
          { label: "Use", value: "Audit" },
        ],
        tags: ["List export"],
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
      { label: "Frontier", value: "Latest trading day" },
    ],
    nodes: [
      {
        id: "ip-schedule",
        label: "Observation Offsets",
        kind: "input",
        description: "Days from actual phase start to each observation date.",
        detail:
          "Blank, Phase 1, and Ten Years measure from Allotment. Phase 2 measures from Trade Date. Empty Average slots contribute zero days and are skipped.",
        metrics: [
          { label: "Base", value: "Actual Start" },
          { label: "Slots", value: "Present only" },
        ],
        tags: ["Phase start", "Calendar days"],
      },
      {
        id: "ip-paths",
        label: "Daily Path Starts",
        kind: "process",
        description: "Every index trading day becomes a path start.",
        detail:
          "Paths open on 2001-01-01 from the Gift/NSP nifty series and run forward until the trading-day frontier. Each start carries the closing level used for the Start Level cushion.",
        metrics: [
          { label: "Floor", value: "2001-01-01" },
          { label: "Grid", value: "Daily" },
        ],
        tags: ["Gift nifty", "Sensex fill"],
      },
      {
        id: "ip-levels",
        label: "Prior Close Lookup",
        kind: "lookup",
        description: "Observation levels use the nearest prior close for each simulated date.",
        detail:
          "Projected Average dates that land on weekends or holidays snap to the previous trading session for both the displayed date and the level used in the average.",
        metrics: [
          { label: "Lookup", value: "Prior bar" },
          { label: "Coverage", value: "Full slots" },
        ],
        tags: ["Approx VLOOKUP"],
      },
      {
        id: "ip-start",
        label: "Adjusted Start Level",
        kind: "engine",
        description: "Closing level is bumped and ceiling-rounded to the next hundred.",
        detail:
          "Nifty uses ×1.01 then CEILING to 100. Sensex uses ×1.006 then CEILING to 100. This cushion is Initial-only — Current Probability never applies it.",
        metrics: [
          { label: "Nifty", value: "×1.01" },
          { label: "Sensex", value: "×1.006" },
        ],
        tags: ["Ceiling", "Start Level"],
      },
      {
        id: "ip-perf",
        label: "Underlying Performance",
        kind: "engine",
        description: "Average observation level divided by adjusted start level, minus one.",
        detail:
          "Only paths with a full observation-level set are scored. Performance is compared with Target Underlying = Target Level ÷ Entry − 1.",
        metrics: [
          { label: "Perf", value: "Avg ÷ Start − 1" },
          { label: "Hurdle", value: "Target %" },
        ],
        tags: ["Included paths"],
      },
      {
        id: "ip-prob",
        label: "Initial Probability",
        kind: "output",
        description: "Share of included paths that clear the target versus entry threshold.",
        detail:
          "Successes ÷ Included. The last included path ends so its final observation lands on the latest trading session available to the desk.",
        metrics: [
          { label: "KPI", value: "Success rate" },
          { label: "Frontier", value: "As-of session" },
        ],
        tags: ["Path table", "Schedule"],
      },
    ],
    flows: [
      { from: "ip-schedule", to: "ip-paths", label: "offsets" },
      { from: "ip-paths", to: "ip-levels", label: "simulate" },
      { from: "ip-paths", to: "ip-start", label: "close" },
      { from: "ip-levels", to: "ip-perf", label: "levels" },
      { from: "ip-start", to: "ip-perf", label: "start" },
      { from: "ip-perf", to: "ip-prob", label: "score" },
    ],
    insights: [
      "Included paths require the index history to cover every simulated observation.",
      "The last included path has its last observation on the current trading day.",
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
      "Day offsets are measured from the checking date to each observation. Performance is versus the raw path start close with no adjusted start level. Success uses percent required versus today underlying level.",
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
        description: "Days from valuation date to each remaining observation.",
        detail:
          "Matches NSP Backtesting: observation calendar date minus the Probability checking date. Blank Average slots stay at zero days and are skipped.",
        metrics: [
          { label: "Base", value: "Checking date" },
          { label: "Sheet", value: "Backtesting" },
        ],
        tags: ["Days from valuation"],
      },
      {
        id: "cp-paths",
        label: "Daily Path Starts",
        kind: "process",
        description: "Every index trading day becomes a path start.",
        detail:
          "Same 2001-01-01 floor as Initial. Path Taken stays Yes while the series covers every projected observation, then stops at the trading-day frontier.",
        metrics: [
          { label: "Floor", value: "2001-01-01" },
          { label: "Cascade", value: "Path Taken" },
        ],
        tags: ["Daily grid"],
      },
      {
        id: "cp-levels",
        label: "Prior Close Lookup",
        kind: "lookup",
        description: "Observation levels use the nearest prior close.",
        detail:
          "No Start Level column on Current. Underlying Closing Level is the raw path-start close used later in performance.",
        metrics: [
          { label: "Close", value: "Path start" },
          { label: "Obs", value: "Prior bar" },
        ],
        tags: ["No ceiling"],
      },
      {
        id: "cp-perf",
        label: "Underlying Performance",
        kind: "engine",
        description: "Average observation level divided by path start close, minus one.",
        detail:
          "Compared with Required Underlying = Target Level ÷ today’s mark − 1. Before 15:30 IST the mark is the previous trading-day close; after cash close it rolls to today.",
        metrics: [
          { label: "Perf", value: "Avg ÷ Close − 1" },
          { label: "Hurdle", value: "% Required" },
        ],
        tags: ["Desk mark", "NSE EOD"],
      },
      {
        id: "cp-prob",
        label: "Current Probability",
        kind: "output",
        description: "Share of included paths that clear percent required.",
        detail:
          "Successes ÷ Included on the Backtesting Path Taken = Yes set. Cached by ISIN, mode, checking date, underlying, mark levels, and latest index date.",
        metrics: [
          { label: "KPI", value: "Success rate" },
          { label: "Cache", value: "Summary keys" },
        ],
        tags: ["Path table", "% Required"],
      },
    ],
    flows: [
      { from: "cp-schedule", to: "cp-paths", label: "offsets" },
      { from: "cp-paths", to: "cp-levels", label: "simulate" },
      { from: "cp-levels", to: "cp-perf", label: "levels" },
      { from: "cp-perf", to: "cp-prob", label: "score" },
    ],
    insights: [
      "Percent required compares target to the selected-date Nifty or Sensex level.",
      "Caching keys on ISIN, mode, valuation date, underlying, and latest index date.",
    ],
    outputs: ["Current probability", "Path table", "Percent required"],
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
      dataLane:
        "Merged master + Mongo overlays feed Product Master Intelligence. Live book = Ongoing and Obs Due only; expired names stay archived off the probability desk.",
      valuationPath:
        "Probability Summary routes into Initial (adjusted start, target vs entry) and Current (raw close, % required vs desk mark) daily path engines since 2001-01-01.",
      payoffPath:
        "Effective Target Laboratory resolves Average 1–7 history into Observation Levels, Passed/Remaining Obs, and the remaining-hurdle average — no debenture mark.",
      supportLayers: [
        "Observation lookback",
        "Last-fixing calendar",
        "Analytics Laboratory",
        "Desk mark 15:30 IST",
        "Gift nifty + Sensex fill",
      ],
      keySignals: [
        "Entry / Initial Level",
        "Target level",
        "Initial probability",
        "Current probability",
        "Effective target",
        "Observation levels 1–7",
        "Lifecycle status",
        "As-of mark date",
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
