# Routes & Components

## Routes

| URL | File | Purpose |
|-----|------|---------|
| `/` | `components/dashboard/dashboard-shell.tsx` | Home — lifecycle tabs, KPIs, lifecycle intelligence, single-series maturity ladder |
| `/valuation` | `components/dashboard/unified-valuation.tsx` | Mark-to-market |
| `/payoff` | `components/dashboard/unified-payoff.tsx` | Payoff scenarios + curve — inputs: **Start Date** (Working!F) + master Initial Price / Debenture (read-only) |
| `/portfolio/details` | `components/dashboard/utility-pages.tsx` | Product details |
| `/portfolio/analytics` | `components/dashboard/portfolio-analytics.tsx` | Analytics lab — KPIs + product list |
| `/intelligence` | `components/reference/logic-atlas-console.tsx` | Logic Atlas — light hero, scrollable Reference Logic Modules, active pipeline, category lanes, computation primitives |
| `/upload` | Upload + validation | Master file ingest |

### Legacy redirects (no page stubs)

Dead `/products` and `/details` page components were removed Jul-2026. `next.config.ts` keeps permanent redirects:

| From | To |
|------|-----|
| `/products` | `/portfolio/analytics` |
| `/details`, `/primary-details` | `/portfolio/details` |
| `/primary-output` | `/valuation` |
| `/reference` | `/intelligence` |

### Next.js API routes (`http://localhost:3000/api`)

| Route | Method | File | Purpose |
|-------|--------|------|---------|
| `/api/market/levels` | GET | `app/api/market/levels/route.ts` | Live Nifty / Sensex (Yahoo + bundled fallback) |
| `/api/market/index-at-date` | GET | `app/api/market/index-at-date/route.ts` | Historical index closes for desk date |
| `/api/market/sync-history` | GET, POST | `app/api/market/sync-history/route.ts` | Backfill index history to MongoDB |
| `/api/parse/bootstrap` | GET | `app/api/parse/bootstrap/route.ts` | Bootstrap — Mongo → disk xlsx → seed |
| `/api/parse` | POST | `app/api/parse/route.ts` | Workbook upload parse + background sync |
| `/api/master/load` | GET | `app/api/master/load/route.ts` | Canonical book (cached Mongo) |
| `/api/master/sync` | POST | `app/api/master/sync/route.ts` | Persist dataset to MongoDB |
| `/api/master/health` | GET | `app/api/master/health/route.ts` | Mongo connectivity |
| `/api/master/download` | GET | `app/api/master/download/route.ts` | Download master workbook |
| `/api/master/sheets` | GET | `app/api/master/sheets/route.ts` | Workbook sheet names |
| `/api/valuation` | POST | `app/api/valuation/route.ts` | `computeValuation` |
| `/api/valuation/at-date` | POST | `app/api/valuation/at-date/route.ts` | Valuation at historical date |
| `/api/payoff` | POST | `app/api/payoff/route.ts` | Formula + curve |
| `/api/pivot` | POST | `app/api/pivot/route.ts` | Pivot (Python on :8000, Node fallback) |
| `/api/analytics/category-stats` | GET | `app/api/analytics/category-stats/route.ts` | Server lifecycle stats |
| `/api/inputs/config` | GET | `app/api/inputs/config/route.ts` | Desk input field config |
| `/api/internal/logic` | GET | `app/api/internal/logic/route.ts` | Logic atlas metadata |
| `/api/internal/appendix` | GET | `app/api/internal/appendix/route.ts` | Internal appendix |

### Python API (`http://127.0.0.1:8000`)

| Route | Method | File | Purpose |
|-------|--------|------|---------|
| `/health` | GET | `backend/python/main.py` | Service health |
| `/pivot` | POST | `backend/python/main.py` | Pivot analytics |

---

## Lifecycle UI (shared pattern)

Tabs: **Ongoing · Expiring in 3M · Expiring in 1M · Expired** (no “All Products”).

| Component | Role |
|-----------|------|
| `lifecycle-product-list.tsx` | Searchable table + export — **full book** in scroll (no row cap) |
| `lifecycle-lab.tsx` | Four KPIs per tab: AUM, Avg Full Coupon, Avg Absolute Return, Listed |
| `lifecycle-intelligence.tsx` | Full-book status table — **Home only**; highlights rows in active tab |
| `science-lab.tsx` | Charts filtered by lifecycle tab — **Analytics Lab only** (all issuers; Tenor Profile = remaining to phase end on live tabs) |

State: `useLifecycleFilter()` — shared across Home, Valuation, Payoff, Product Details, Analytics. **Product selection is shared** via `ProductSelectionProvider` (persisted in localStorage): pick a product on Details and Valuation / Payoff open with that same product. `useResyncProductToLifecyclePool()` only falls back to the tab default when the current pick is **outside** the active tab pool (or empty) — not on every page visit. Changing the lifecycle tab to one that does not contain the pick still loads the tab default (longest tenure live / most recent expired) and resets valuation date.

**Picker scope (Jul-2026):** On Valuation / Payoff / Details, ISIN, product code, and name search only list products in `getLifecyclePickerPool()` for the active tab — an expired 2018 product cannot be selected while Ongoing is active.

Clock: `usePortfolioClock()` → `asOf` for maturity days and KPI refresh.

---

## Input panel

`components/dashboard/excel-input-panel.tsx`

| Mode | Fields |
|------|--------|
| Valuation | ISIN, product code, name, val date, Nifty, Sensex, debentures |
| Payoff | Name, live level (read-only), purchase date, debentures, price |

**Expired tab:** hides “Live · Yahoo Finance” badge; valuation date = observation dates + maturity / rollover C/P (`dd-mm-yyyy` only); Nifty/Sensex read-only from bundled history. When date is **after** final observation, debenture value grows at locked product IRR to maturity (`applyPostLastObservationGrowth`).

**Ongoing / Expiring tabs:** ISIN, code, and name search list only products in the active lifecycle book (`getLifecyclePickerPool`) on Valuation, Payoff, and Product Details. Past desk dates on Valuation show *Historical · index levels for {date}* and KPIs use *on Valuation Date* labels. Payoff ongoing shows *Live · Yahoo Finance · payoff scenarios*; Expired shows last-observation KPIs.

**Desk dialogs:** `deskAlert()` → `DeskDialogProvider` (styled modal, maroon/gold). Used for formula blockers on explicit product picks. Debenture and valuation-date validation are inline only.

Field hints (ℹ️): `INPUT_FIELD_HINTS` in `lib/dashboard-input-config.ts`  
Rendered via `FieldRow` + `FieldHint` in `components/layout/app-ui.tsx`.

Selection state: `lib/context/product-selection-provider.tsx`  
Market sync: `lib/hooks/use-market-sync.ts` — soft commit ~5s, localStorage level restore, tab-focus stale refresh (>5 min), Refresh forces immediate update, sub-0.05 jitter ignored.

---

## Reveal pattern

`components/ui/reveal-output.tsx` — KPIs and Product Overview **behind** “Click here to view output”.

---

## Styling

| Pattern | File |
|---------|------|
| ARWL theme tokens | `app/globals.css`, `tailwind.config.ts`, `lib/chart-theme.ts` |
| Header logo | `components/layout/brand-logo.tsx`, `public/brand/arwl-logo.svg` |
| Buttons | `.btn-primary` (gold), `.btn-ghost`, `.btn-pill` in `globals.css` |
| Dark dropdowns | `.select-dark` in `globals.css` (forms stay light) |
| Payoff table glow | `.payoff-scenarios-stage`, `.pivot-row`, `.current-row` (gold highlight) |
| Premium data tables | `.data-table-premium`, `.data-table-premium-wrap` — used by `DataTable` and pivot explorers |
| Virtual master table | `components/ui/virtual-table-body.tsx` + `master-sheet-pivot.tsx` — row striping via `.data-table-row-alt` (not `nth-child`) |
| KPI band (≤4 metrics) | `.kpi-band-fill` — single full-width row; `overflow-x: auto` only when card `min-width` forces it |
| Intel module rail | `.logic-module-rail` + `.logic-module-card` — fixed-width cards, horizontal snap scroll (`fillFirst={false}` on `HorizontalRail`) |
| Screen Excel export | `useScreenExcelExport()` — preload on `RevealOutput`, *Building workbook…* label, blocks parallel clicks |
| Product date fields | `productHasRolloverSchedule()`, `getProductRolloverDate()` — rollover vs maturity-only display |

---

## Data context

| Provider | Path |
|----------|------|
| Dataset (products) | `lib/context/dataset-provider.tsx` |
| Product selection | `lib/context/product-selection-provider.tsx` |
| Desk dialogs | `lib/context/desk-dialog-provider.tsx`, `lib/desk-alert.ts` |

Default seed: `lib/data/master-seed.json` (from `npm run bake`).
