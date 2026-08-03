# 07 — Routes & components

## Pages

| Route | Entry | Notes |
|-------|-------|-------|
| `/` | Home shell | KPIs, lifecycle, upload |
| `/probability` | `ProbabilityDashboard` summary | Probability sheet KPIs |
| `/initial-probability` | Initial surface | Schedule + paths + Start Level |
| `/current-probability` | Current surface | Schedule + paths, no Start Level |
| `/desk` | Desk hub | Shortcuts |
| `/portfolio/analytics` | Analytics Lab | Live book |
| `/intelligence` | Logic Atlas + Master pivot | |
| `/upload` | Master upload | |
| `/valuation` | redirect | → Initial |
| `/payoff` | redirect | → Current |
| `/portfolio/details` | redirect | → Probability |

Nav: `lib/navigation.ts`. Redirects: `next.config.ts` + stub pages.

## Probability dashboard anatomy

`components/dashboard/probability-dashboard.tsx`

1. Lifecycle pills  
2. Interface | Product List tabs  
3. `ExcelInputPanel` mode=`probability`  
4. KPI band  
5. Summary results / schedule / paths  
6. Past-final panels when applicable  
7. Download Excel / PDF  

## Shared components

| Component | Role |
|-----------|------|
| `ExcelInputPanel` | Search, valuation date, levels |
| `LifecycleProductList` | DATA-style register |
| `ProductSpecificationsPanel` | Spec rail |
| `PayoffCurvePanel` | Formula plot (past-final) |
| `ObservationDatesTable` | Obs levels vs entry |
| `SearchableSelect` | Hydration-safe combobox |
| `KpiBand` | Scrollable KPIs |

## Probability-critical APIs

| Route | Role |
|-------|------|
| `POST /api/probability/run` | Engine |
| `GET /api/market/levels` | Live indexes |
| `GET /api/market/index-at-date` | Historical |
| `POST /api/pivot` | Intel pivot |
| Master upload / Mongo sync | Book ingest |

## Input policy

Same as Primary Product Details **except** debentures hidden; checking date may clamp to last observation; labels never use `()`.
