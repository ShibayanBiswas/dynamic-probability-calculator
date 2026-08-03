# Architecture

> **Doc refresh:** 2026-07-20 — Tenor Profile remaining window; analytics server cache.

## Stack

| Layer | Tech |
|-------|------|
| UI | Next.js 16 App Router, React, Tailwind, Framer Motion |
| Branding | Anand Rathi Wealth light desk theme — gold `#d4b24c`, maroon `#7a1e2c`, ink `#111111` |
| Charts | Recharts (`lib/chart-theme.ts` — ARWL palette) |
| Data | `xlsx` parse + export, JSON seed (`lib/data/master-seed.json`), MongoDB persistence |
| Analytics API | FastAPI + uvicorn (`backend/python`, port **8000**) — pivot fallback |
| Dates | `date-fns`, desk format `D-Mon-YY` |
| Market | Yahoo Finance via `/api/market/levels` (+ bundled Nifty/Sensex); custom underlyings via `/api/market/underlying-at-date` |

## Data flow

```
New Product Master_.xlsx
  Primary (4,499) + Rollover (635)
    → build-new-primary-sheet.ts → NEW PRIMARY (4,879 merged rows)
    → parser.ts (pickCanonicalRowsForDesk)
    → filterValidMasterProducts() → ProductRecord[] (4,179 desk canonical)
                                    │                                              │
                                    │                                    syncMasterDatasetToMongo() (purges stale)
                                    ↓                                              ↓
                          dataset-provider (React context)                  MongoDB `products`
                                    ↓                                              ↑
     ┌──────────────────────────────┼──────────────────────────────┐    loadProductsFromMongo() (5-min cache)
     ↓                              ↓                              ↓
product-lifecycle.ts        valuation-engine.ts            payoff-scenarios.ts
(live clock asOf)           (Working sheet parity)           + payoff-pivots.ts
     ↓                              ↓                              ↓
LifecycleProductList        Unified Valuation                Unified Payoff
Analytics Lab               Product Details
```

**Sparse-row filtering** (`lib/master-book-filter.ts`) drops internal annotation rows (name-only, no ISIN/formula/underlying/issuer/entry/notional) at parse, Mongo sync (with stale-row purge), and load — fully automatic on every upload.

**Server data sources:** `/api/parse/bootstrap` and `/api/master/load` read MongoDB first (cached), fall back to `New Product Master_.xlsx` on disk, then the baked `master-seed.json`. Client upload parsing (`xlsx`) still runs in `dataset-provider` for instant local preview and POSTs to `/api/master/sync` in the background. All server routes that need the book use `resolveMasterProducts()` with the same order.

## Dynamic master — new products without redeploy

The app is **master-driven**, not hardcoded per ISIN. When you add or edit rows in **New Product Master_.xlsx** (Primary and/or Rollover), run **`npm run bake`** to rebuild **NEW PRIMARY**, then upload:

| Master column | App field | Used for |
|---------------|-----------|----------|
| **Formulae** | `formulaText` | Valuation S-column + payoff curve + scenario table (evaluated at runtime) |
| **Product Explanation** | `productExplanation` | Product Overview narrative |
| **Actual Entry Level**, dates, notional, ISIN, etc. | `ProductRecord.raw` + typed fields | Valuation Working chain, lifecycle buckets |
| **Coupon (%)** / **Product return** | `couponPercent` | KPIs, labels |

**What happens on upload**

1. Browser parses the workbook (`parseWorkbookFile`) → updates React `dataset` **immediately**.
2. Valuation / Payoff / Details read products via `useMasterProducts()` → new row appears in pickers **without refresh**.
3. `computeValuation(product, …)` reads `product.formulaText` and evaluates it with `evaluatePayoffFormula()` — no code change per product.
4. Background POST to `/api/master/sync` → MongoDB upsert + purge removed rows + `invalidateProductsCache()`.

**No app redeploy** is required for a new formula or description. Redeploy only when changing application code.

**Requirements for a new row to value & payoff**

- Valid ISIN, notional, entry level, underlying, issuer
- **Formulae** cell with Excel-style expression (`IF`, `MAX`, `MIN`, `%` literals — see `lib/workbook/formula-engine.ts`)
- Allotment / observation dates for valuation applicability

Run `npm run verify:dynamic` to confirm the engine evaluates arbitrary formula text (synthetic test row).

**Limitation:** formulas using unsupported Excel tokens (`MAZ`, custom names, nested sheet refs) will fail validation — extend `formula-engine.ts` or fix the master formula to use `IF`/`MAX`/`MIN`/`ABS` syntax.

## Key modules

| Path | Role |
|------|------|
| `lib/product-lifecycle.ts` | Ongoing / Expiring 3M / 1M / Expired buckets; uses **system clock** |
| `lib/hooks/use-lifecycle-filter.ts` | Shared Ongoing/Expired/Expiring tab (sessionStorage) across desk pages |
| `lib/hooks/use-lifecycle-pool-product.ts` | Keep shared product pick across pages; only fall back to tab default when the pick is outside the active lifecycle pool |
| `lib/hooks/use-expired-level.ts` | Historical underlying for expired marks (Nifty/Sensex **or** custom series) |
| `lib/underlying-benchmark.ts` | Classify Nifty / Sensex / custom; map Infosys, gold, silver, etc. |
| `lib/custom-underlying-history.ts` | Bundled equity closes + commodity estimates |
| `lib/hooks/use-portfolio-clock.ts` | Re-runs lifecycle every minute |
| `lib/hooks/use-market-sync.ts` | Fetches Nifty/Sensex; first pull after ~5s idle; hourly timer; tab-focus refresh when stale (>5 min) |
| `lib/market-data.ts` | Yahoo ^NSEI, ^BSESN; `formatDeskDate()` |
| `lib/workbook/valuation-engine.ts` | Excel Working: O, S, V, X, IRR |
| `lib/workbook/portfolio-valuation-batch.ts` | Batch MTM with lifecycle + index routing |
| `lib/portfolio-snapshot-store.ts` | Full-book portfolio MTM cache — active tab fills first, then all lifecycle pills reuse the same marks |
| `lib/desk-index-state.ts` | Stable Nifty/Sensex string merge (prevents input flicker) |
| `lib/issuer-chart-labels.ts` | Issuer Exposure chart axis formatting |
| `lib/workbook/payoff-pivots.ts` | Kink detection + enhanced scenario table |
| `lib/workbook/export-products.ts` | Multi-sheet lifecycle Excel download |
| `lib/workbook/export-screen.ts` | Valuation / Payoff / Product Details screen Excel (branded, interactive) |
| `lib/workbook/excel-runtime.ts` | Lazy `import("exceljs")` for client exports |
| `lib/hooks/use-screen-excel-export.ts` | Loading state + single-flight guard for screen downloads |
| `lib/logic-atlas.ts` | Intel · Logic Atlas module definitions (5 pipelines) |
| `components/reference/logic-atlas-console.tsx` | `/intelligence` UI — hero, module rail, pipeline diagram |
| `components/ui/reveal-output.tsx` | “Click here” gated output panels |
| `components/ui/master-upload-button.tsx` | Single master workbook upload control |
| `components/layout/brand-logo.tsx` | ARWL logo in header (all pages) |
| `components/ui/identity-selects.tsx` | ISIN / product-code dropdowns (`.select-dark` panels) |

## Routes

| Route | Component |
|-------|-----------|
| `/` | `dashboard-shell.tsx` |
| `/valuation` | `unified-valuation.tsx` |
| `/payoff` | `unified-payoff.tsx` |
| `/portfolio/details` | `utility-pages.tsx` → `ProductDetailsPage` |
| `/portfolio/analytics` | `portfolio-analytics.tsx` + `science-lab.tsx` + `lifecycle-lab.tsx` |
| `/intelligence` | `logic-atlas-console.tsx` + `logic-flow-diagram.tsx` + `master-sheet-pivot.tsx` |

**Legacy redirects** (`next.config.ts`) — no page stubs; dead `/products` and `/details` routes were removed Jul-2026:

| From | To |
|------|-----|
| `/products` | `/portfolio/analytics` |
| `/details`, `/primary-details` | `/portfolio/details` |
| `/primary-output` | `/valuation` |
| `/reference` | `/intelligence` |

### API routes (`http://localhost:3000/api`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/parse` | POST | Parse an uploaded workbook; background Mongo sync |
| `/api/parse/bootstrap` | GET | Initial dataset — Mongo (cached) → disk xlsx → seed |
| `/api/master/load` | GET | Canonical book from MongoDB (cached) |
| `/api/master/sync` | POST | Persist parsed dataset to MongoDB, purge stale rows |
| `/api/master/health` | GET | Mongo connectivity check |
| `/api/master/download` | GET | Download master workbook |
| `/api/master/sheets` | GET | List workbook sheet names |
| `/api/market/levels` | GET | Live Nifty/Sensex (Yahoo) + background history sync |
| `/api/market/index-at-date` | GET | Historical Nifty/Sensex on/before desk date |
| `/api/market/underlying-at-date` | GET | Stock/commodity close or estimate on/before desk date |
| `/api/market/index-at-date` | GET | Index closes for a desk date |
| `/api/market/sync-history` | GET, POST | Backfill index history to MongoDB |
| `/api/pivot` | POST | Pivot via Python engine (Node fallback) |
| `/api/valuation` | POST | Server valuation helper |
| `/api/valuation/at-date` | POST | Valuation at historical date (Mongo index on exact date) |
| `/api/payoff` | POST | Server payoff helper |
| `/api/analytics/category-stats` | GET | Server lifecycle category stats |
| `/api/inputs/config` | GET | Desk input field configuration |
| `/api/internal/logic` | GET | Logic atlas metadata |
| `/api/internal/appendix` | GET | Internal appendix data |

**Python pivot API** (`http://127.0.0.1:8000`): `GET /health`, `POST /pivot`.

## Lifecycle auto-update

- **Portfolio by Lifecycle** passes `asOf = new Date()` via `usePortfolioClock`.
- Counts, AUM, and bucket membership recompute when calendar day changes or every 60s.
- Home KPIs come from `useHeadlineKpis()` → `buildLifecycleIndex()` (with Primary-tab notional fallback).
- **Bucket anchor** — expiration tabs use phase schedule end via `getProductExpirationDate()` (Blank/Phase 2 → Maturity · Phase 1 → POED · 10Y → Rollover C/P); observation-due tabs use upcoming Average 1 / Avg. 2–7 dates.
- **Desk pickers** — `getLifecyclePickerPool()` equals `filterProductsByLifecycle()` for the active tab (strict bucket, no merged ongoing book).

## Valuation date labels (Jul-2026)

- **Live mark** (valuation date = today): *Current Value*, *Coupon Formed as of Today*, *Absolute Return*, *Live · Yahoo Finance*.
- **Historical mark** (past desk date on an ongoing product): *Value on Valuation Date*, *Coupon Formed on Valuation Date*, *Historical · index levels for {date}* — live Yahoo sync does not overwrite the chosen date or levels.
- **Expired** — *at Last Observation* framing; historical **underlying** level for the chosen observation date (Nifty/Sensex index **or** mapped stock/commodity series — never silent Nifty substitution for Infosys/gold/etc.).

Implementation: `lib/valuation-labels.ts`, `isDeskToday()` in `lib/workbook/dates.ts`.

## Market auto-update

- On load: `ProductSelectionProvider` calls `/api/market/levels` after ~5s idle (`MARKET_FIRST_IDLE_MS`).
- Sets **Valuation Date** = today (desk format), **Nifty** / **Sensex** from Yahoo.
- **Soft commit:** routine Yahoo ticks are held ~5s (`LIVE_INDEX_COMMIT_HOLD_MS`) then the latest mark is applied once — avoids input flicker.
- **localStorage restore:** last good Nifty/Sensex levels reload from `sp-dashboard-product-selection-v2` so refresh does not flash empty → Yahoo.
- **Tab focus:** `visibilitychange` triggers refresh only when levels are stale (>5 min, `MARKET_VISIBILITY_STALE_MS`).
- **Refresh levels** button: `refreshMarket({ force: true })` — bypasses throttle and soft hold; commits immediately.
- **Jitter filter:** updates with drift <0.05 rupees on either leg are ignored (`INDEX_LEVEL_COMMIT_EPSILON` in `desk-index-state.ts`).
- Hourly background refresh + calendar-day rollover check every 60s.
- Product identity (ISIN, name) persists in localStorage; market fields stay live only for today's desk date — historical marks keep user-selected levels.
- **Payoff Current Level** is read-only — always live Nifty/Sensex from Yahoo (`resolveLiveIndexLevel`), not manual entry or stale stored level.
- All Yahoo fetches are wrapped in try/catch; the background history sync (`syncIndexPricesFromYahoo`) applies a 5-minute cooldown after a failure so transient DNS/network errors never produce unhandled rejections.

## Performance & caching

- **Mongo product cache** — `loadProductsFromMongo()` (`lib/db/sync-master.ts`) caches the canonical book in-process for 5 minutes and is invalidated by `invalidateProductsCache()` on every sync.
- **Portfolio list MTM** — `loadPortfolioSnapshotMap` caches valuation snapshots across routes; invalidated on master upload.
- **Index sync (live desk)** — market sync owns today's levels; historical dates use `/api/market/index-at-date` only.
- **Index creation once** — `ensureMongoIndexes()` (`lib/db/mongo.ts`) memoizes a single promise per process.
- **Python pivot** — `/pivot` coerces value columns to float before `pd.pivot_table` (avoids string-dtype `fill_value` crashes) and returns a clean 422 on error.

## Product narrative formatting

- Master sheet stores participation as `7500%` meaning **75.0%** (Excel ×100 convention).
- `lib/product-narrative-format.ts` converts e.g. `PR of 7600% (7500%+100%)` → **76.0% — 75.0% participation + 100% coupon** (no parenthetical Excel cell refs in UI labels).
- Product lists render the **entire filtered set** (2,000+ rows) inside scroll regions with sticky headers — use Export for Excel.
- Level bands like `132% of Initial Nifty` display as **132% of initial fixing (+32% index move)**.
- Product Overview renders inside **RevealOutput** on Payoff, Valuation, and Product Details.

## UI patterns

- **RevealOutput** — inputs visible; KPIs/charts/tables behind “Click here to view output”.
- **Horizontal spec rails** — one card per field, scroll horizontally.
- **Light desk theme** — white/stone surfaces, gold accents, high-contrast ink text (`app/globals.css`, `tailwind.config.ts`).
- **Intel Logic Atlas** — light cream hero (`.intel-hero`), horizontally scrollable logic module cards (`.logic-module-rail`, ~328px cards), gold pipeline shell, category lane cards.
- **Chart animations** — `useChartAnimation()` soft bar/line entrance on Home Maturity Ladder and Analytics charts; disabled when `prefers-reduced-motion: reduce`.
- **select-dark** — intentional dark dropdown panels for ISIN, product code, debentures (contrast on light forms).
- **Master upload** — single gold upload button on Home and `/upload` via `MasterUploadButton`.
