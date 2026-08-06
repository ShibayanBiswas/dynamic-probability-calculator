# 01 — Architecture

**Updated:** 2026-08-04

## Purpose

Dynamic Probability Calculator is a Next.js desk that:

1. Clones **Primary SP Dashboard** visual system, lifecycle book, master upload, Intel atlas, and Mongo product/index spine.  
2. Replaces Product Details / Valuation / Payoff with **Probability / Initial Probability / Current Probability**.  
3. Implements NSP `Initial Prob` + `Backtesting` path logic with documented overrides (see [02](02-probability-excel-parity.md), [16](16-product-type-probability-logic.md)).  
4. **Never shows expired products** in the live UI, and also hides names whose **last observation has already settled**.

## Stack

| Layer | Technology |
|-------|------------|
| App | Next.js App Router, React, TypeScript |
| Style | Tailwind + Primary SP `--ar-*` CSS tokens |
| Charts | Recharts, Framer Motion |
| Tables | `@tanstack/react-virtual` |
| Excel/PDF | ExcelJS, jsPDF, `xlsx` parse |
| Data | MongoDB `sp_dashboard` · CDN/baked JSON seed · Gift nifty CSV |
| Runtime | **Node 20.x** (required on Vercel) |
| Port | **3001** local · `PORT` in production (`scripts/start-production.mjs`) |

## Repository layout

```
app/                    # Routes + API
  probability/          # Summary surface (schedule above specs)
  initial-probability/
  current-probability/
  intelligence/         # Logic Atlas + master pivot
  api/probability/run/  # Engine endpoint (maxDuration capped)
components/
  dashboard/            # ProbabilityDashboard, lifecycle list, past-final panels
  reference/            # Logic Atlas console + flow diagram
  ui/path-load-progress.tsx
  layout/               # Shell, KPIs, rails
lib/
  probability/          # engine, as-of, cache, index-series, portfolio store
  product-dates.ts      # Phase SSOT (Actual Start + schedule end)
  product-lifecycle.ts  # Filters (no expired UI)
  portfolio-lifecycle-columns.ts  # Initial Level, as-of, phase dates, probs
  portfolio-observation-metrics.ts  # Effective Target
  desk-mark-as-of.ts    # 15:30 IST mark policy
  market-data.ts        # Yahoo + fallbacks
  logic-atlas.ts        # Intel module graph (enriched pipeline cards)
  data/                 # master-seed, nifty-daily-2001.csv, index JSON
docs/                   # Full documentation set (start at README.md)
scripts/                # verify:*, bake, sync, start-production
public/data/            # Downloadable master / seed assets
```

## Data flow

```
New Product Master_.xlsx
        │  upload / bake / Mongo sync
        ▼
Bootstrap  →  Vercel: prefer /data/master-seed.json (USE_STATIC_SEED)
           →  Local: Mongo products when valid, else disk/seed
        │
DatasetProvider / lifecycle index
        │
POST /api/probability/run
   ├── series: Gift nifty CSV + Sensex fill + Mongo overlay + Yahoo
   ├── desk mark levels (15:30 IST rule)
   ├── product book cache
   └── result LRU cache
        │
ProbabilityDashboard
   ├── summary: Schedule → Specs → Initial/Current KPIs
   ├── Initial/Current: PathLoadProgress → Schedule → Path table
   ├── Lifecycle columns + Effective Target
   └── Excel/PDF Primary-grade exports
```

## Critical modules (debug anchors)

| File | Role |
|------|------|
| `lib/probability/engine.ts` | Schedule, ceiling, paths, threshold, inclusion, Yes frontier + Path-Taken-No |
| `lib/probability/index-series.ts` | `SERIES_FLOOR = 2001-01-01`, merge/fill |
| `lib/probability/as-of.ts` | Past-final clamp + JSON date hydrate |
| `lib/probability/cache.ts` | Result LRU (isin, mode, date, levels, indexMax, bookRevision) |
| `app/api/probability/run/route.ts` | Single + batch; series/product caches; `includePaths` opt-in |
| `lib/hooks/use-lazy-portfolio-probabilities.ts` | Full-book Prob warm, search-priority batches, `ensureWarmed` for gated Excel downloads |
| `lib/probability/target-override.ts` | Target Underlying % → working Target Level; Current+passed defaults to ET÷Entry−1 with back-solve |
| `lib/product-dates.ts` | Working start + schedule end by phase |
| `lib/product-lifecycle.ts` | Status + `UI_LIFECYCLE_FILTERS` |
| `lib/portfolio-lifecycle-columns.ts` | Register columns incl. Initial Level + as-of mark date |
| `lib/desk-mark-as-of.ts` | Prev session vs today mark |
| `components/dashboard/probability-dashboard.tsx` | Three surfaces + exports |
| `lib/logic-atlas.ts` + `logic-atlas-console.tsx` | Intelligence map |
| `lib/workbook/export-probability-screen.ts` | Excel/PDF |

## Caching

| Cache | Location | Notes |
|-------|----------|-------|
| Probability results | `lib/probability/cache.ts` | ~5 min TTL, LRU 1024 |
| Index series | API module scope | ~5 min |
| Products | API module scope | ~60 s |
| Portfolio probs | client store | Invalidates on valuation date / book revision |

Summary mode sets `includePaths: false`. Path tables virtualize rows. Vercel bootstrap avoids shipping a full Mongo product dump in one JSON response.

## Mongo vs fallback

1. Prefer `MONGODB_URI` + `MONGODB_DB=sp_dashboard` (shared with Primary SP) for **prices/paths** and local product hydrate.  
2. On **Vercel**, product book often comes from **static CDN seed**; Mongo still useful for index overlays.  
3. Fallback series: `lib/data/nifty-daily-2001.csv` + `sensex-index-history.json`.  
4. Joint series for probability requires both Nifty and Sensex on a calendar date when merging.

## Removed / redirected

- Python `backend/` — deleted; Node only.  
- `/valuation` → `/initial-probability`  
- `/payoff` → `/current-probability`  
- `/portfolio/details` → `/probability`  

Legacy valuation libraries may remain for optional verify scripts; they are not primary desk surfaces.

## Related docs

- [16 Product-type logic](16-product-type-probability-logic.md)  
- [06 Path engine](06-probability-path-engine.md)  
- [14 Vercel / Render](14-vercel-render-deployment.md)
