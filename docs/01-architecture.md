# 01 — Architecture

## Purpose

Dynamic Probability Calculator is a Next.js desk that:

1. Clones **Primary SP Dashboard** visual system, lifecycle book, master upload, Intel atlas, and Mongo product/index spine.  
2. Replaces Product Details / Valuation / Payoff with **Probability / Initial Probability / Current Probability**.  
3. Implements NSP `Initial Prob` + `Backtesting` path logic with documented overrides.  
4. **Never shows expired products** in the live UI.

## Stack

| Layer | Technology |
|-------|------------|
| App | Next.js App Router, React, TypeScript |
| Style | Tailwind + Primary SP `--ar-*` CSS tokens |
| Charts | Recharts, Framer Motion |
| Tables | `@tanstack/react-virtual` |
| Excel/PDF | ExcelJS, jsPDF, `xlsx` parse |
| Data | MongoDB `sp_dashboard` · baked JSON fallback |
| Port | **3001** local · `PORT` in production (`scripts/start-production.mjs`) |

## Repository layout

```
app/                    # Routes + API
  probability/          # Summary surface
  initial-probability/
  current-probability/
  intelligence/         # Logic Atlas + master pivot
  api/probability/run/  # Engine endpoint
components/
  dashboard/            # ProbabilityDashboard, ExcelInputPanel, lifecycle list
  layout/               # Shell, KPIs, rails
  charts/               # Payoff plot (past-final)
lib/
  probability/          # engine, as-of, cache, portfolio store
  product-dates.ts      # Phase SSOT
  product-lifecycle.ts  # Filters (no expired UI)
  portfolio-lifecycle-columns.ts
  data/                 # master-seed.json, index JSON
docs/                   # This documentation set
scripts/                # verify:*, bake, start-production.mjs
public/data/            # Downloadable master xlsx
```

## Data flow

```
New Product Master_.xlsx
        │  upload / bake / Mongo sync
        ▼
DatasetProvider  ←→  Mongo products (optional)
        │
NSP formulas (Initial Prob / Backtesting)
        │
lib/probability/engine.ts
        │
POST /api/probability/run
   ├── series: Mongo index_prices OR bundled JSON
   ├── product book cache
   └── result LRU cache
        │
ProbabilityDashboard
   ├── summary KPIs
   ├── ScheduleCard
   ├── PathBacktestTable
   └── PastFinalObservationPanels (payoff + obs table on summary)
```

## Critical modules (debug anchors)

| File | Role |
|------|------|
| `lib/probability/engine.ts` | Schedule, ceiling, paths, threshold, inclusion |
| `lib/probability/as-of.ts` | Past-final clamp + JSON date hydrate |
| `lib/probability/cache.ts` | Result LRU (isin, mode, date, levels, indexMax, bookRevision) |
| `app/api/probability/run/route.ts` | Single + batch; series/product caches |
| `lib/hooks/use-lazy-portfolio-probabilities.ts` | Portfolio column warm (batch 24, soft cap 400) |
| `lib/product-dates.ts` | Working start + schedule end by phase |
| `lib/product-lifecycle.ts` | Status + `UI_LIFECYCLE_FILTERS` |
| `lib/portfolio-lifecycle-columns.ts` | DATA yellow columns + probs + Underlying |
| `components/dashboard/probability-dashboard.tsx` | Three surfaces + exports |
| `components/dashboard/past-final-observation-panels.tsx` | Payoff plot / specs / obs table (coupon in Results) |
| `lib/workbook/dates.ts` | `parseExcelishDate`, safe `formatDisplayDate` |
| `lib/logic-atlas.ts` | Intel module graph |

## Caching

| Cache | Location | Notes |
|-------|----------|-------|
| Probability results | `lib/probability/cache.ts` | ~5 min TTL, LRU 1024 |
| Index series | API module scope | ~5 min |
| Products | API module scope | ~60 s |
| Portfolio probs | client store | Invalidates on valuation date / book revision |

Summary mode sets `includePaths: false`. Path tables virtualize rows.

## Mongo vs fallback

1. Prefer `MONGODB_URI` + `MONGODB_DB=sp_dashboard` (shared with Primary SP).  
2. Fallback: `lib/data/master-seed.json`, `nifty-daily-2001.csv` (Nifty from **2001-01-01**, Gift/NSP parity), `sensex-index-history.json` (~2000+).  
   Legacy `valuation-index-history.json` (~2007+) is only used if the CSV is missing.  
3. Joint series for probability requires both Nifty and Sensex on a calendar date when merging.

## Removed / redirected

- Python `backend/` folder — deleted; Node pivot only.  
- `/valuation` → `/initial-probability`  
- `/payoff` → `/current-probability`  
- `/portfolio/details` → `/probability`  

Legacy valuation libraries may remain for optional verify scripts; they are not primary desk surfaces.
