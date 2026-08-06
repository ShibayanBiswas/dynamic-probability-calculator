import type { InfoBlurb } from "@/lib/info-blurb";

/** Plain-language section descriptions — one paragraph, five lines each. */
export const SECTION_INFO: Record<string, InfoBlurb> = {
  "home-kpis": {
    title: "Understanding these headline numbers",
    body: "These tiles summarise the live probability book: notional, ongoing deals, and observation-due windows.\nLive Notional is the sum of trade amounts on the merged master book.\nOngoing counts products whose phase end is still ahead and whose last observation has not settled yet. Observation Due in 3M, 2M, and 1M flag products with a fixing inside that calendar window under the same live-observation gate.\nExpired products and past-final-observation products are excluded from this probability desk.",
  },
  "home-filter": {
    title: "How the portfolio filter works",
    body: "The book is filtered by Ongoing and Observation Due in 3M, 2M, or 1M.\nThe filter updates the whole home page including summary tiles, maturity chart, and shortcuts below.\nObservation-due tabs surface products with an upcoming fixing for probability prep.\nThe default view is the live Ongoing book for day-to-day checks.\nThe bucket that matches the client conversation being prepared should be selected.",
  },
  "home-maturity": {
    title: "Reading the maturity ladder",
    body: "Invested money is grouped by time to the phase schedule end. Blank and Phase 2 use Maturity. Phase 1 uses POED. Ten Years uses Rollover.\nBars show remaining windows on live tabs.\nNear-term bars flag cash events soon. Longer bars show extended book exposure.\nProduct specs still show Trade, Allotment, Maturity, and Tenor as stored in the master.\nProbability day offsets use the same Rollover Phase start and end rules.",
  },
  "home-modules": {
    title: "What the desk modules do",
    body: "These shortcuts open Probability, Initial Probability, Current Probability, Portfolio Analytics, and Logic Atlas.\nProbability shows the summary results panel for a selected product.\nInitial Probability backtests from the actual phase start. Current Probability backtests from the valuation date.\nAnalytics Lab charts the live book. Logic Atlas documents calculation paths.\nThe module that matches the probability question should be opened.",
  },

  "val-filter": {
    title: "What this probability page covers",
    body: "Probability answers how often historical paths clear the target under Initial and Current rules.\nThis page mirrors the Dynamic Probability Calculator desk model.\nThe top filter chooses live lifecycle buckets. Tabs split the form from the register.\nOnly desk-canonical products from the merged master book appear here.\nUploading a new master from Home refreshes the list automatically.",
  },
  "val-inputs": {
    title: "How to fill in the inputs",
    body: "The product is identified once by ISIN, product code, or name. Highlighted fields are entered by the user.\nValuation date plus Nifty and Sensex levels on that date set the probability checking date.\nNifty-linked products use the Nifty level. Sensex-linked products use Sensex. The two stay separate.\nDebenture count and price marks are not used on this probability desk.\nEach product’s observation schedule drives Initial and Current probability runs.",
  },
  "val-output": {
    title: "Reading the output sheet",
    body: "Initial Probability backtests from phase start. Current Probability backtests from the valuation date.\nTarget Underlying is editable on the input panel (defaults to Target÷Entry−1). Target Level / Effective Target shown above it are read-only.\nWith no settled fixings, Target Level = Entry×(1+Target Underlying). With one or more settled fixings, Effective Target is shown and stays read-only while Target Underlying remains editable.\nRequired Underlying uses Effective Target versus today’s mark when fixings have settled, else Target versus today’s mark.\nFigures update whenever valuation date, market levels, or Target Underlying change.",
  },
  "val-products": {
    title: "About the product list",
    body: "The full register shows name, series, ISIN, issuer, underlying, invested amount, and maturity.\nSearch uses name, ISIN, series, issuer, or underlying with the same keys as desk lookup.\nA row is clicked to select that product for the probability form.\nInvested amounts display in rupees crores with comma grouping.\nSelection carries through so the same product need not be searched twice.",
  },
  "val-workings": {
    title: "What the workings table shows",
    body: "A step-by-step view shows path counts, success share, target percent, and percent required.\nFigures match the Excel Probability / Initial Prob / Current Prob sheets for analysts.\nFigures update whenever valuation date or market levels change.\nHeadline output can be reconciled to intermediate calculation steps.\nThe detailed grid stays available even when not shown on the main screen.",
  },

  "pay-filter": {
    title: "What this current-probability page covers",
    body: "Current Probability answers how often historical paths clear the remaining target from today’s valuation date.\nThis page mirrors the Dynamic Probability Calculator current-probability engine.\nThe top filter chooses live lifecycle buckets. Tabs split deal screen from search.\nDefault is live products unless the filter is widened.\nA product picked on Home can carry through when Current Probability is opened next.",
  },
  "pay-inputs": {
    title: "How to enter the deal",
    body: "The product is chosen from the active lifecycle tab.\nIndex levels come from market sync and the master and are read-only where locked.\nStart Date follows Rollover Phase: Allotment for Blank, Phase 1, and Ten Years, and Trade Date for Phase 2.\nDebenture count and price per debenture are not used on this probability desk.\nProduct lists refresh from the uploaded merged master book with no hardcoded roster.",
  },
  "pay-output": {
    title: "Reading the current-probability output",
    body: "Current Probability shows the share of included daily paths that clear Required Underlying.\nKPI cards include Target Underlying (editable on the input panel) and Required Underlying from the Effective Target or Target Level hurdle.\nPath tables list simulated observation levels and success flags.\nRequired Underlying and Days Left to Last Observation frame the remaining hurdle.\nColumns match the Excel Current Prob / Backtesting sheet for desk reconciliation.",
  },
  "an-lifecycle": {
    title: "Lifecycle universe",
    body: "The chart splits the book by status into ongoing and related live bands, sized by money in crores.\nA large ongoing slice means most capital is still invested.\nObservation-due bands highlight near-term fixing events.\nThe legend shows both product count and rupee amount per slice.\nExpired products are excluded from this probability desk.",
  },
  "an-coupon": {
    title: "Coupon distribution",
    body: "Products are grouped by headline coupon band with invested money in each band shown in crores.\nWhether the book tilts to lower steady returns or higher ambitious payoffs is revealed.\nProducts without a stated coupon sit in a separate bucket.\nBar height reflects invested amount, not just product count.\nProtection mix should be read alongside for a fuller risk picture.",
  },
  "an-protection": {
    title: "Principal protection mix",
    body: "Invested money is divided between principal-protected and capital-at-risk deals in crores.\nMore protected money means a more conservative book.\nLabels follow exact wording from the product file to avoid misclassification.\nAn unclassified slice means the protection field was blank in source data.\nCoupon and tenor charts should be paired for balanced interpretation.",
  },
  "an-underlying": {
    title: "Underlying exposure",
    body: "Underlyings such as Nifty, Sensex, and single names are ranked by linked invested money in crores.\nConcentration is highlighted when one dominant index ties portfolio outcomes to that market.\nThe top two underlyings by amount keep the chart readable. Smaller names roll into Other.\nLong index names stay legible on screen.\nSingle-index dependency can be spotted before client reviews.",
  },
  "an-issuer": {
    title: "Issuer exposure",
    body: "Every issuer in the active lifecycle bucket is ranked by invested money in crores.\nCapital spread across ARGFL, EBL, Edelweiss, and other counterparties is shown.\nAll issuers are included. Labels are shortened on the axis and expand in the tooltip.\nUnderlying exposure should be paired to see both market and credit concentration.\nIssuer mix can be reviewed before client meetings when it matters as much as index linkage.",
  },
  "an-tenor": {
    title: "Tenor profile",
    body: "The book is grouped by time to the same phase schedule end as the Maturity Ladder. Blank and Phase 2 use Maturity. Phase 1 uses POED. Ten Years use Rollover.\nOn live tabs, bars show remaining window to that end.\nBars are sized by invested money in crores. Short bars return cash sooner. Long bars keep money invested longer.\nProduct Specs still show Tenor Days as stored. This chart ignores that column when the phase calendar is known.\nThe home maturity ladder should be read alongside for timing and reinvestment context.",
  },
  "an-radar": {
    title: "Category risk radar",
    body: "Gauges summarise size, average coupon, listed share, and issuer quality in one scorecard.\nHigh coupon with lower protection suggests a more ambitious profile. The reverse is conservative.\nRisk score weighs issuer credibility, protection, tenor, and market linkage.\nFigures beneath each gauge explain the needle in plain terms.\nGauges should be read together because no single needle tells the whole story.",
  },

  "intel-overview": {
    title: "What Logic Atlas shows",
    body: "A technical map is shown from merged master ingest through probability engines and analytics for analysts and engineers.\nEach module card is a major desk surface. One module is selected to walk pipeline nodes left to right.\nLive KPI tiles reflect the current desk book. Live Notional shows a dash until bootstrap finishes loading.\nAny node can be clicked for a plain-language explanation of that stage.\nNothing here changes product data. Logic paths are documented and validated only.",
  },
  "intel-pipeline": {
    title: "Reading a pipeline flow",
    body: "Arrows show data moving between parse, enrich, filter, aggregate, and output stages.\nA green badge means every node is connected. A warning means an orphaned stage needs review.\nProbability Summary covers Initial and Current engines plus Effective Target on the observation path.\nAnalytics Laboratory maps to Analytics Lab. Home uses Desk Command Center instead.\nThe module rail is used to compare probability engines, analytics, and data foundation side by side.",
  },
  "intel-primitives": {
    title: "Computation primitives",
    body: "Building blocks repeated across product rows include lookups, conditionals, path success tests, Effective Target, and roll-ups.\nCounts indicate registry complexity, not live runtime call volume.\nNo raw spreadsheet formula text appears. Formulas are resolved when probability engines are run.\nInitial Probability uses adjusted start level. Current Probability uses percent required from the valuation date.\nAggregation roll-ups power Analytics Lab charts and Home KPI tiles.",
  },
};
