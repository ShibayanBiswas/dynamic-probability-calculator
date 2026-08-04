# 07 — Routes & components

**Updated:** 2026-08-04

## Pages

| Route | Entry | Notes |
|-------|-------|-------|
| `/` | Home shell | KPIs, lifecycle, upload, maturity ladder |
| `/probability` | `ProbabilityDashboard` summary | Schedule **above** specs; Initial+Current KPIs; no path table |
| `/initial-probability` | Initial surface | Inline progress → schedule + paths + Start Level |
| `/current-probability` | Current surface | Inline progress → schedule + paths, no Start Level |
| `/desk` | Desk hub | Shortcuts to Initial / Current |
| `/portfolio/analytics` | Analytics Lab | Lifecycle-scoped ScienceLab charts |
| `/intelligence` | Logic Atlas + Master pivot | Enriched pipeline cards |
| `/upload` | Master upload | |
| `/valuation` | redirect | → Initial |
| `/payoff` | redirect | → Current |
| `/portfolio/details` | redirect | → Probability |

Nav: `lib/navigation.ts`. Redirects: `next.config.ts` + stub pages.

## Probability dashboard anatomy

`components/dashboard/probability-dashboard.tsx`

1. Lifecycle pills (Ongoing / Obs Due 3M/2M/1M)  
2. Interface | Product List tabs  
3. `ExcelInputPanel` mode=`probability` (search, valuation date, auto levels — **no debentures**)  
4. KPI band  
5. **Summary:** Observation Schedule → Product Specs → Initial/Current results  
6. **Initial/Current:** `PathLoadProgress` → Schedule → PathBacktestTable (Included default)  
7. Past-final panels when applicable  
8. Download Excel / PDF (Primary-grade)  

## Shared components

| Component | Role |
|-----------|------|
| `ExcelInputPanel` | Search, valuation date, levels |
| `LifecycleProductList` | DATA-style register (Initial Level, as-of, phase dates, probs) |
| `ProductSpecificationsPanel` | Spec rail |
| `PathLoadProgress` | Inline path-load bar (no modal) |
| `PathBacktestTable` | Virtualized path rows |
| `PayoffCurvePanel` | Formula plot (past-final) |
| `ObservationDatesTable` | Obs levels vs entry |
| `SearchableSelect` | Hydration-safe combobox |
| `KpiBand` | Scrollable / fill-grid KPIs |
| `LogicAtlasConsole` / `LogicFlowDiagram` | Intelligence map |
| `PastFinalObservationPanels` | Specs / results / payoff / obs |

## Probability-critical APIs

| Route | Role |
|-------|------|
| `POST /api/probability/run` | Engine (`includePaths` opt-in; `maxDuration` capped on Vercel) |
| `GET /api/market/levels` | Live indexes (desk mark aware) |
| `GET /api/market/index-at-date` | Historical |
| `GET /api/parse/bootstrap` | Product book bootstrap (static seed on Vercel) |
| `POST /api/pivot` | Intel pivot |
| Master upload / Mongo sync | Book ingest |

## Input policy

Same as Primary Product Details **except** debentures hidden; checking date may clamp to last observation; labels never use `()`.

## Related

- [16 Product-type logic](16-product-type-probability-logic.md)  
- [06 Path engine](06-probability-path-engine.md)
