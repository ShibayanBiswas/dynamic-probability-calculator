# Calculation & Logic Review

> **Doc refresh:** 2026-08-02 — Jun-26 Logic sheet path; Working!V grow / 11% discount; wind-up board.  
> **Layman guide:** [12-valuation-plain-english.md](12-valuation-plain-english.md) · **Close-out:** [13-windup-verification.md](13-windup-verification.md)

This document summarises **every major calculation path** in the Primary SP Dashboard. Use it with [02-valuation-excel-parity.md](02-valuation-excel-parity.md), [06-payoff-formulas.md](06-payoff-formulas.md), and [04-lifecycle-analytics-kpis.md](04-lifecycle-analytics-kpis.md) for detail.

### Aug-2026 desk policy (live engine — Logic sheet)

| Step | Desk rule |
|------|-----------|
| Observation **I** | **Last** scheduled fixing (`resolveWorkingObservationDate`) |
| Underlying **N** (live) | Logic path (`resolveValuationExpectedLevel`): no obs → spot IRR → **second-last** obs; ≥1 obs → average of realised fixings locks expected Nifty; past last obs → avg of all levels (locks coupon/IRR) |
| Underlying **N** (Mode B) | Classic Working!N (`computeExpectedUnderlyingLevel`) for Excel desk-row replay |
| Full coupon **S** | Projected before last obs; realised after last obs when avg levels > target; formula wins when it evaluates |
| Post last obs | Lock coupon/IRR; quote via Working!V — grow U by T / discount U·(1+S) @ **11%** / U·(1+S) at phase end — **not** post-obs Y compounding |
| Index / underlying | Nifty/Sensex indices **or** mapped stock/commodity series — **never** silent Nifty substitution for Infosys/gold/etc. |
| Desk default date | Portfolio clock = **today**; 31-Jul NAV audit forces **31-07-2026** levels only |
| Live Notional | Merged master Trade Amount → desk AUM → manifest fallback (`lifecycle-index.ts`) |
| Bootstrap | IndexedDB upload wins on reload when newer than baked seed (`dataset-provider.tsx`) |
| Market fallback | Bundled Nifty/Sensex when Yahoo unavailable (`market-data.ts`) |
| Removed | Required Underlying IRR metric; **Coupon Participation Return** / raw **Coupon / PR / DM** from UI and exports (master column kept for internal CC1 parse) |
| Quick Analytics | Ongoing book on Product Details; pre-launch cells = **Not yet started**; post-end = **Past schedule end** |
| Working!F / elapsed | Phase 2 → Trade Date; Blank / Phase 1 / 10Y → Allotment |
| Same-day IRR | Elapsed **0** on Working!F → Underlying IRR **0%**; live Product IRR still uses full phase tenor (≥30d) |
| Phase tenure | Blank Allotment→Maturity · Phase 1 Allotment→POED · Phase 2 **Trade→Maturity** · 10Y Allotment→Rollover |
| Payoff XIRR tenor | Same as phase tenure (`getPhasePayoffTenorDays`) — ongoing **and** expired |
| Effective Target | `(Total×Target − Σpassed levels) / Remaining` — 0D pending until 15:30 IST |
| Live Product IRR | `irrFromReturn(S, phaseTenor)` — same basis as payoff scenario XIRR (not Working!Y) |
| Mode B Product IRR | Working!Y `(X/U)^(365/elapsed)` — Excel desk-row replay only |

---

## 1. Module dependency map

```
Master Excel (Primary) → parser.ts → ProductRecord[]
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
 product-lifecycle.ts   product-utils.ts    formula-engine.ts
         │                    │                    │
         │              market-index-at-date       │
         │                    │                    │
         ▼                    ▼                    ▼
 valuation-performance   desk-index-levels    payoff-scenarios.ts
 (Working N, O)              │                    │
         │                    │                    ▼
         └──────────► valuation-serial.ts ◄── payoff-pivots.ts
                         valuation-engine.ts
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
   portfolio-valuation-batch  analytics.ts   export-screen.ts
   portfolio-snapshot-store   lifecycle-lab
```

---

## 2. Valuation engine (Working sheet parity)

**Files:** `lib/workbook/valuation-engine.ts`, `valuation-performance.ts`, `valuation-serial.ts`, `formula-engine.ts`

### Inputs (`ValuationInputs`)

| Field | Source | Notes |
|-------|--------|-------|
| `valuationDate` | UI / batch | Parsed `parseExcelishDate`; default today |
| `currentLevel` | Yahoo / Mongo / bundled / entry | Must be > 0; else falls back to `getIndexEntryLevel` |
| `debentures` | `inferDebentureCount()` | Default 100, min 1, rounded |
| `purchasePrice` | API / UI | **Declared but not used** — U always from `getDebenturePrice` |
| `deskRow` | Parity tests only | Overrides F/H/I/K/M/U/P/S |

### Core formulas

| Step | Excel | Formula |
|------|-------|---------|
| Observation **I** | Working I (desk) | **Last** observation in master schedule |
| Expected underlying **N** | Working N | **Live:** `resolveValuationExpectedLevel` (obs-average). **Mode B:** classic XIRR/VLOOKUP |
| Performance **O** | Working O | `IF(N="NA", M/K−1, N/K−1)` → fed to payoff as **Z** |
| Full coupon **S** | Working S | Payoff formula at **O** when it evaluates; headline coupon only if formula fails; CC1 parse via `getCouponPercent()` |
| Post last obs | Logic + Working!V | Lock S/T; Working!V discounts U·(1+S) @ 11% until phase end — live path does **not** use Y compounding |
| Projected full coupon | Desk extension | Before last obs: extrapolated **N** ≥ target or formula flat-coupon Z → headline **S** via `qualifiesForProjectedFullCoupon()` |
| Realised full coupon | Desk extension | After last obs: avg realised levels > target via `qualifiesForFullCoupon()` |
| Column **T** | Working T | `(1+S)^(365/(H−F)) − 1` |
| Final valuation **V** | Working V | Last obs ahead: grow U by T; last obs done & phase end ahead: discount U·(1+S) @ 11%; both done: U·(1+S) |
| Product value **X** | Working X | `max(V, U)` rounded to **integer rupees** |
| Product IRR **Y** (live) | Desk headline | `irrFromReturn(S, getPhasePayoffTenorDays)` — matches payoff XIRR |
| Product IRR **Y** (Mode B) | Working Y | `(X/U)^(365/(G−F)) − 1` |
| Abs return **Z** | Working Z | `X/U − 1` |

### Index history for N (VLOOKUP path)

- **Nifty bundled:** `lib/data/valuation-index-history.json` — Working!AJ:AK + Yahoo backfill (`npm run backfill:index-history`)
- **Sensex bundled:** `lib/data/sensex-index-history.json` — master observation dates + Yahoo `^BSESN`
- **Live / API path:** MongoDB → bundled → Yahoo via `resolveIndexLevelsAtDate()` and `/api/market/index-at-date`

### Index resolution guards (UI)

`hasResolvedDeskIndexLevel()` in `lib/desk-index-guards.ts` blocks valuation output until:

| Book | Requirement |
|------|-------------|
| **Ongoing live** | Market sync ready; Nifty or Sensex level for product underlying |
| **Ongoing historical** | Historical fetch complete (`indexSyncLoading` false) |
| **Expired** | Historical index loaded for selected observation date |

`useLiveIndexLevel` returns **0** (not entry level) when no live/historical source — prevents misleading payoff scenarios while levels load.

### Entry level default

`getIndexEntryLevel()` returns master entry or **10,000** when blank (`lib/product-utils.ts`). UI guards may still block output when entry is missing.

### Batch valuation

| Function | File | Behaviour |
|----------|------|-----------|
| `computeValuation` | `valuation-engine.ts` | Single product |
| `computePortfolioValuationSnapshots` | `portfolio-valuation-batch.ts` | Full pool; live vs expired routing |
| `loadPortfolioSnapshotMap` | `portfolio-snapshot-store.ts` | Cached across pages; chunked idle compute |

**Expired marks:** `computeExpiredMark()` in `lib/expired-mark.ts` — valuation at final observation date with historical index level. When valuation date is **after** final obs (maturity / rollover C/P picker), `applyPostLastObservationGrowth()` compounds the locked IRR from the final fixing to the growth anchor (`getProductExpirationDate()`).

### Post last-obs growth (`applyPostLastObservationGrowth`)

| Input | Role |
|-------|------|
| Final obs date | Lock coupon + product IRR here |
| Growth anchor | Maturity date, or rollover C/P for 10 Years phase |
| Valuation date | Obs date → no growth; between obs and anchor → partial growth; at anchor → full growth |

Same function runs for **Ongoing** (live book past last obs) and **Expired** (historical marks at maturity).

### Valuation Output Sheet — tenor fields

| Label | Source | Notes |
|-------|--------|-------|
| **Product Tenor · Days** | `getProductTenorDays()` | Master **Tenor** / `tenorDays` column, else allotment → expiration span |
| **Rollover Tenor · Days** | `getRolloverTenorDays()` | Shown only for 10 Years rollover phase products |
| ~~Tenor · Days~~ | ~~`getObservationTenorDays()`~~ | **Do not use** for display — that helper is rollover-only and returns `undefined` for standard Primary products (e.g. Nifty Magnifier - 158) |

Files: `build-screen-export-payload.ts`, `unified-valuation.tsx`, `product-specifications.ts`.

---

## 3. Payoff engine

**Files:** `lib/workbook/formula-engine.ts`, `payoff-scenarios.ts`, `payoff-pivots.ts`, `payoff-kinks.ts`, `irr.ts`

### Core symbol

```
Z = (finalOrCurrentLevel / entryLevel) − 1    // decimal, e.g. 0.40 = +40%
```

Scenario tables use `getIndexEntryLevel(product)` (not `getPayoffEntryLevel`).

### Formula pipeline

1. Strip leading `=`
2. `%` tokens → decimal (`49%` → `0.49`)
3. `Z` → `z`
4. `IF(a,b,c)` → ternary (chained, up to 64 passes)
5. **`AND` / `OR`** → `&&` / `||` (supported)
6. `MIN` / `MAX` / `ABS` → `Math.*`
7. `new Function("z", "Math", …)` evaluation

### Scenario table (`buildPayoffScenarioTable`)

Fixed performance offsets in `PAYOFF_SCENARIO_OFFSETS`. Per row:

| Col | Computation |
|-----|-------------|
| G | Fixed offset |
| F | `entry × (1 + G)` |
| Z | = G |
| H | `evaluatePayoffFormula(formula, z)` |
| I | `investment × (1 + H)` |
| XIRR | `irrFromReturn(H, payoffTenorDays)` |

**Enhanced table** adds pivot rows at formula kinks (slope change > 18 per 0.002 Z step) and a **Current** row at live `marketMove`.

**Payoff curve:** 41 points, Z from **−0.5 to +0.75**.

### Live index on Payoff page

`useLiveIndexLevel` → `resolveLiveIndexLevel` — read-only Yahoo Nifty/Sensex when valuation date is today.

---

## 4. Lifecycle classification

**File:** `lib/product-lifecycle.ts`

| Status | Rule |
|--------|------|
| `perpetual` | Name/maturity contains "perpetual" |
| `upcoming` | Allotment > asOf |
| `expired` | Final observation anchor < asOf |
| `expiring-1m` | ≤ 30 calendar days to anchor |
| `expiring-3m` | ≤ 90 calendar days |
| `ongoing` | Otherwise |

**Anchor:** `getProductFinalObservationDate()` ?? `getProductExpiryDate()`.

### Tab filters

| Tab | Includes |
|-----|----------|
| Ongoing | `ongoing`, `perpetual` |
| Expiring 3M | `expiring-1m`, `expiring-3m` |
| Expiring 1M | `expiring-1m` only |
| Expired | `expired` |

**Picker pool:** `getLifecyclePickerPool()` delegates to `filterProductsByLifecycle()` — strict one-tab-one-pool on every desk surface.

**Unknown rows** (no observation/expiry anchor) are excluded via `filterValidMasterProducts` — not in any KPI or list.

---

## 5. Analytics & KPIs

**Files:** `lib/analytics.ts`, `lib/lifecycle-index.ts`, `lib/analytics-server.ts`, `components/analytics/lifecycle-lab.tsx`, `science-lab.tsx`

### Lifecycle Category Analytics KPIs (UI)

| KPI | Formula |
|-----|---------|
| **AUM** | `Σ tradeAmount` for filtered pool |
| **Avg Full Coupon** | Arithmetic mean of `getCouponPercent` (not AUM-weighted) |
| **Avg Absolute Return** | Live: arithmetic mean at desk index levels. Expired: **AUM-weighted** at last observation with historical Nifty/Sensex per obs date |
| **Listed** | `count(listing === "listed") / pool.length` |

> **Note:** Protected share is still computed in `buildLifecycleIndex` for Home headline stats but is **not** shown in the Lifecycle Category Analytics KPI band (replaced by Absolute Return, Jul-2026).

### Science Lab charts

| Chart | Function | Notes |
|-------|----------|-------|
| Lifecycle Universe | `getLifecycleChartData` | Notional pie by status |
| Coupon Distribution | `getCouponDistribution` | AUM-weighted bands |
| Principal Protection | `getProtectionMix` | Protected / exposed / unknown |
| Underlying Exposure | `getUnderlyingExposure` | Top 2 + **Other** rollup |
| **Issuer Exposure** | `getIssuerExposure` | **All issuers**; axis labels via `lib/issuer-chart-labels.ts` |
| Tenor Profile | `getTenorDistribution` | **Live:** remaining window to phase schedule end. **Expired:** full phase tenure. Same SSOT as Maturity Ladder (`verify:analytics` parity check) |
| Maturity Ladder | `getMaturityLadder` | **Single series** — notional by remaining/elapsed window to phase schedule end (Home) |

### Client vs server analytics

- **UI** uses client `getLifecycleCategoryStats` in `lifecycle-lab.tsx`
- **API** `/api/analytics/category-stats` uses `getLifecycleCategoryStatsServer` (async historical index for edge cases) — not wired to main UI today

---

## 6. Index / underlying level resolution

**Files:** `lib/market-data.ts`, `lib/market-index-at-date.ts`, `lib/bundled-index-history.ts`, `lib/underlying-benchmark.ts`, `lib/custom-underlying-history.ts`, `lib/hooks/use-index-at-date.ts`, `lib/desk-index-state.ts`

### Live desk (today)

1. Yahoo `^NSEI` + `^BSESN` via `/api/market/levels`
2. `applyMarket` in `product-selection-provider` — sole writer for today's Nifty/Sensex
3. **Soft commit ~5s** — routine ticks batched; **Refresh levels** forces immediate commit
4. **localStorage restore** — last good levels on reload (`loadCachedSelection`)
5. **Tab-focus refresh** — only when stale (>5 min, `MARKET_VISIBILITY_STALE_MS`)
6. **Jitter filter** — drift <0.05 ignored (`INDEX_LEVEL_COMMIT_EPSILON`)
7. Levels merged without wiping missing fields (`mergeIndexLevelStrings`)

### Historical desk date (Nifty / Sensex products)

1. In-memory cache → MongoDB `index_prices` → bundled Nifty **and** Sensex → Yahoo close
2. `resolveIndexLevelsForDate` in `excel-input-panel` (historical dates only; sets `indexSyncLoading`)
3. Client instant fallbacks: `instantNiftyForDeskDate` / `instantSensexForDeskDate`

### Portfolio observation levels (0D EOD rule)

**Files:** `lib/observation-settlement.ts`, `lib/portfolio-observation-metrics.ts`, `lib/hooks/use-observation-levels.ts`, `lib/hooks/use-portfolio-clock.ts`

| Observation calendar day vs as-of | Observation Level cell |
|-----------------------------------|------------------------|
| **Future** | Blank (`—`) |
| **Past** | Fill with underlying EOD close (bundled / Mongo / Yahoo on-or-before) |
| **Same day (0D)** | Blank until **NSE cash close 15:30 IST**; then fill with that day’s EOD |

- Passed / remaining counts and **Effective Target** use the same settlement gate (0D is still “remaining” before EOD).
- `usePortfolioClock` bumps `asOf` when the desk day changes **or** when the session crosses 15:30 IST so levels refresh after close.
- Re-bake / patch index history: `npm run backfill:index-history` · Guard: `npm run verify:obs-settlement`

### Custom underlyings (stocks / commodities)

`getUnderlyingKind()` classifies master **Underlying** as `nifty` | `sensex` | `custom`.

| Class | Series | Source label |
|-------|--------|--------------|
| Nifty / Sensex | Bundled + Mongo + Yahoo indices | `history` / `yahoo` |
| NSE equities (Infosys, ITC, M&M, …) | Baked Yahoo NSE closes | `yahoo` |
| MCX Silver / Reliance 24K gold | COMEX futures × USDINR proxy | `estimate` (honest — not official MCX/Reliance print) |

- Lookup: `resolveHistoricalIndexLevel` → `resolveCustomUnderlyingLevel` (`lib/data/custom-underlying-history.json`)
- API: `GET /api/market/underlying-at-date?date=&underlying=`
- **Never** substitute Nifty closes against a stock/gold entry level
- Re-bake: `npm run bake:underlyings` · Audit: `npm run verify:custom-underlyings`

### Expired product marks

`useExpiredDeskMark` → `useExpiredLevel` → `/api/market/index-at-date` (Nifty/Sensex) **or** `/api/market/underlying-at-date` (custom). Valuation blocked until `hasResolvedDeskIndexLevel` passes.

---

## 7. API calculation routes

Base: **http://localhost:3000/api**

| Route | Method | Logic |
|-------|--------|-------|
| `POST /api/valuation` | POST | `computeValuation(product, inputs)` |
| `POST /api/valuation/at-date` | POST | Mongo index on **exact** date → valuation |
| `POST /api/payoff` | POST | `evaluatePayoffFormula` + `buildPayoffCurve` |
| `GET /api/analytics/category-stats` | GET | `getLifecycleCategoryStatsServer` |
| `GET /api/market/levels` | GET | `fetchLiveMarketLevels` |
| `GET /api/market/index-at-date` | GET | `resolveIndexLevelsAtDate` (on-or-before) |
| `GET /api/market/underlying-at-date` | GET | Custom equity/commodity close or estimate |
| `GET /api/market/sync-history` | GET, POST | Index history backfill |
| `GET /api/parse/bootstrap` | GET | Bootstrap dataset |
| `POST /api/parse` | POST | Upload parse |
| `GET /api/master/load` | GET | Canonical book |
| `POST /api/master/sync` | POST | Mongo sync |
| `POST /api/pivot` | POST | Pivot (Python `127.0.0.1:8000/pivot` fallback) |

Python API: `GET http://127.0.0.1:8000/health`, `POST http://127.0.0.1:8000/pivot`.

---

## 8. Verification scripts

| Script | Validates |
|--------|-----------|
| `verify-calculation-core.ts` | Serial math, formula, valuation smoke |
| `verify-valuation-working-parity.ts` | Mode A/B vs 31-May-26 xlsm |
| `verify-ongoing-valuation.ts` | Ongoing sample + batch MTM vs Working levels |
| `verify-expired-valuation.ts` | Expired historical index + mark |
| `verify-lifecycle-valuation-full.ts` | **Full book** ongoing + expired marks + Logic lock |
| `verify-valuation-pipeline.ts` | **Steps A→E** replay — ongoing, historical, expired obs + maturity |
| `verify-all-product-metrics.ts` | Value, abs return, IRR, coupon formed — full book |
| `verify-payoff-xirr-tenor.ts` | Payoff XIRR tenor — full book scenario rows (ongoing + expired) |
| `verify-phase-logic-audit.ts` | Blank / P1 / P2 / 10Y — Working!F, schedule end, payoff tables, marks |
| `verify-expired-phase-logic.ts` | Expired Blank/P1/P2 tenure + hist obs/phase-end marks |
| `verify-irr-phase-tenure-parity.ts` | Product IRR ↔ scenario XIRR (`npm run verify:irr-phase-tenure`) |
| `verify-31jul-nav-match.ts` | 31-Jul NAV vs Logic path + phase tenure |
| `verify-asof-vs-31jul-levels.ts` | Desk today vs 31-Jul index date split |
| `verify-effective-target.ts` | Effective Target full ongoing book |
| `verify-coupon-formula-parity.ts` | Coupon Formed === payoff formula — live + expired pools |
| `verify-full-coupon-logic.ts` | Logic I/II + Working!V discount path |
| `verify-screen-exports.ts` | Export payload + KPI tile structure |
| `verify-explorer-annotations.ts` | Intel Master Explorer row filter |
| `verify-lifecycle-kpis.ts` | AUM, coupon, listed per bucket |
| `verify-edge-cases.ts` | Missing formula/entry scan |
| `verify-analytics-plots.ts` | Chart data sums vs AUM |
| `verify-dynamic-master.ts` | Synthetic formula row |
| `verify-full-suite.ts` | Aggregates all verify scripts |

```bash
npm run verify              # full gate
npm run verify:valuation    # Working sheet parity
npm run verify:ongoing      # Ongoing marks
npm run verify:expired      # Expired historical marks + Logic lock
npm run verify:expired-phase # Expired Blank/P1/P2 tenure + phase-end marks
npm run verify:lifecycle-full  # Full book ongoing + expired
npm run verify:valuation-pipeline  # Steps A→E full book
npm run verify:all-metrics     # All KPI metrics parity
npm run verify:payoff-xirr       # Payoff scenario XIRR tenor
npm run verify:phase-logic       # Phase-by-phase payoff + valuation audit
npm run verify:irr-phase-tenure  # Product IRR ↔ scenario XIRR
npm run verify:31jul-nav         # 31-Jul NAV vs Logic path
npm run verify:asof-levels       # Desk today vs 31-Jul index split
npm run verify:effective-target  # Effective Target full ongoing book
npm run verify:rollover-phase    # Working!F / phase elapsed & Underlying IRR
npm run verify:coupon-formula    # Coupon Formed === payoff formula (live + expired pools)
npm run verify:seamlessness      # Defaults, calendars, expired date menus
npm run verify:full-coupon       # Logic path + Working!V
npm run verify:exports           # Screen export parity
npm run verify:calc              # Serial math, formula, valuation smoke
npm run verify:filter-parity     # Lifecycle filter parity vs UI
npm run verify:explorer     # Intel table annotation filter
npm run verify:kpis         # lifecycle KPI audit
npm run backfill:index-history  # bundled Nifty + Sensex history
```

---

## 9. Known gaps & inconsistencies

| # | Issue | Impact | Mitigation |
|---|-------|--------|------------|
| 1 | `purchasePrice` input ignored by engine | API accepts field; U from master price | Document only; remove from API later if desired |
| 2 | Entry default **10,000** when master blank | Valuation may run with synthetic entry | UI guards block dirty products |
| 3 | ~~Bundled index history is Nifty-only~~ | **Resolved Jul-2026** — Sensex bundled in `sensex-index-history.json` | Run `npm run backfill:index-history` |
| 4 | `valuation/at-date` uses **exact** Mongo date | Weekend/holiday may miss vs on-or-before elsewhere | Use `index-at-date` route for UI |
| 5 | Client vs server category stats differ for rare expired-in-active edge | Analytics API unused by main UI | Prefer client path for UI parity |
| 6 | `getPayoffEntryLevel` unused in scenario builders | Doc oversimplified payoff anchor | Scenarios use index entry level |
| 7 | Formula eval failure → **S = 0** silently | Understates value for broken formulas | `verify:full` catches ongoing issues |
| 8 | Pre-obs discount uses fixed **11%** | Excel parity; not configurable | Matches Working sheet |
| 9 | `isDeskToday("")` returns **false** | Empty date is not live mark | Seeded to today on mount |

---

## 10. Consumer map

| Surface | Primary modules |
|---------|-----------------|
| Unified Valuation | `computeValuation`, `useExpiredLevel`, `resolveValuationLevel` |
| Unified Payoff | `buildEnhancedPayoffScenarioTable`, `useLiveIndexMove` |
| Portfolio list / export | `loadPortfolioSnapshotMap` → `computePortfolioValuationSnapshots`; columns **Observation 1–7**, **Expiration Date** |
| Lifecycle Lab | `getLifecycleCategoryStats` |
| Science Lab | `getIssuerExposure`, `getUnderlyingExposure`, … |
| Home headline | `buildLifecycleIndex` + Primary tab `categorySummaries.liveNotional` (no runtime manifest fallback) |
| Product Details | `computeValuation`, `useLifecycleProductPick`, tab-scoped picker |

---

## 12. Portfolio table columns (Jul-2026)

**Files:** `lib/portfolio-lifecycle-columns.ts`, `lib/portfolio-observation-columns.ts`, `lib/valuation-labels.ts`, `lifecycle-product-list.tsx`, `export-products.ts`

**Canonical 32-column order** (live tabs — Ongoing / Expiring / Obs due):

| # | Column |
|---|--------|
| 1–4 | # · Status · As of Today · Days Left |
| 5–8 | Name · ISIN · Issuer · Underlying |
| 9–11 | Initial Level · Target Level · Initial Price / Debenture |
| 12–17 | Current Price / Debenture · Investment Amount (₹ Cr) · Current Amount (₹ Cr) · Absolute Return · Coupon Formed as of Today · Product IRR since Start |
| 18–25 | Maturity Coupon · Trade Date · Allotment Date · Expiration Date · Rollover Phase · Rollover Date · Product Series · Tenor Days |
| 26–32 | Observation 1 … Observation 7 |

| Column | Label | Source |
|--------|-------|--------|
| Observation 1–7 | `Observation 1` … `Observation 7` | Master Average 1 / Avg. 2–7 |
| Expiration Date | `Expiration Date` | Phase schedule end — Maturity (Blank/P2), POED (Phase 1), Rollover C/P (10Y) |
| Rollover Phase | `Rollover Phase` | Master `Rollover Phase` — blank, Phase I, Phase II, 10 Years |
| Rollover Date | `Rollover Date` | Master `Rollover C/P Date` only — blank when absent |
| Days Left / Since Expiry | phase end | Calendar days to/from Maturity · POED · Rollover |

Lifecycle MTM columns (Value, Abs Return, etc.) use `lifecyclePortfolioColumnLabels(filter)` — **column positions stay fixed**; only label text changes for expired vs live tabs.

---

## 13. Master Explorer annotation filter

**File:** `lib/master-book-filter.ts`

Intel **Master Data · Workbook Explorer** hides non-product rows:

- Internal desk labels (`PC/NM/PM`, `Protected call - …`)
- Legal boilerplate in any column (`ZERO COUPON…`, `LETTER OF ALLOTMENT`, …)
- Sparse rows without real identity (valid ISIN, payoff formula, or underlying+issuer+entry/trade)

Verify: `npm run verify:explorer`

---

## 14. Review verdict (02-Aug-2026) — READY TO WIND UP

| Area | Status | Notes |
|------|--------|-------|
| Valuation Logic + Working!V | **Sound** | Mode B parity + live Logic path; no post-obs Y — [13-windup-verification.md](13-windup-verification.md) |
| Coupon Formed policy | **Sound** | Payoff formula at Working **O** when it evaluates; headline only if formula fails — `verify:coupon-formula` |
| Phase tenure / payoff XIRR | **Sound** | Blank/P1/P2/10Y SSOT — `verify:phase-logic` · `verify:irr-phase-tenure` |
| 31-Jul NAV | **99.26% exact** | phaseTenureBad **0**; 17 NAV-file residuals accepted |
| Effective Target | **Sound** | Full ongoing book — `verify:effective-target` |
| Payoff formula engine | **Sound** | Covers IF/MIN/MAX/ABS/AND/OR; unsupported tokens fail QA |
| Lifecycle buckets | **Sound** | Clock-driven; observation anchor correct |
| Analytics KPIs | **Documented** | UI shows AUM + Full Coupon + Abs Return + Listed |
| Issuer exposure chart | **Updated** | All issuers; formatted axis labels |
| Index sync (live desk) | **Stabilised** | Soft commit, localStorage restore, jitter filter, stale-only tab refresh |
| Chart animations | **Enabled** | `useChartAnimation` — respects `prefers-reduced-motion` |
| Portfolio navigation perf | **Improved** | Snapshot cache across routes |

Re-run the wind-up pack in [13-windup-verification.md](13-windup-verification.md) after master changes. Regenerate `docs/edge-case-audit.md` with `npm run verify:edge-cases`.
