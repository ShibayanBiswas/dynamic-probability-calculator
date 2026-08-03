# Primary SP Dashboard — Documentation Index

All desk reference docs live in **`docs/`**. Start here.

| # | Document | Use when you need… |
|---|----------|-------------------|
| 01 | [Architecture](01-architecture.md) | Stack, data flow, routes, auto-update behaviour |
| 02 | [Valuation Excel parity](02-valuation-excel-parity.md) | Working sheet columns, V/X/IRR logic, worked example |
| 03 | [Testing & debug](03-testing-debug.md) | Smoke tests, `npm run verify`, symptom → file map |
| 04 | [Lifecycle analytics KPIs](04-lifecycle-analytics-kpis.md) | **AUM, Avg Full Coupon, Avg Absolute Return, Listed** — formulas & audit |
| 05 | [Narrative & master Excel](05-narrative-master-excel.md) | 600%, 7500%, product explanations, NEW PRIMARY column map |
| 06 | [Payoff & formula engine](06-payoff-formulas.md) | Z performance, IF formulas, scenario table, pivots |
| 07 | [Routes & components](07-routes-and-components.md) | Page → file map, UI patterns, input fields |
| 08 | [Debug playbook](08-debug-playbook.md) | Step-by-step troubleshooting by symptom |
| 09 | [Master column logic & edge cases](09-master-column-logic.md) | NEW PRIMARY columns, NaN handling, market fetch fallbacks |
| 10 | [Deployment](10-deployment.md) | **Local development (localhost) + optional cloud** |
| 11 | [Calculation review](11-calculation-review.md) | **Full logic/math audit** — valuation, payoff, analytics, index resolution, gaps |
| 12 | [Valuation plain English](12-valuation-plain-english.md) | **Layman guide** — how marks work, labels, downloads, full-book verify |
| 13 | [Wind-up verification](13-windup-verification.md) | **Close-out verdict** — full-book PASS board, date/index split, Effective Target |
| — | [Seamless QA report](seamless-qa-report.md) | Consolidated audit: valuation parity, edge cases, manual checklist |

## Quick commands

```bash
bash start-dashboard.sh   # Linux/macOS — Python API + Next.js (kills stale :3000/:8000)
npm run dev               # Next.js only http://localhost:3000
npm run verify            # bake seed + counts + full product QA
npm run verify:full       # all products: formulas + narrative + payoff
npm run verify:valuation  # Working sheet Mode B parity (31-May-26)
npm run verify:ongoing    # Ongoing valuation sample + batch
npm run verify:expired    # Expired marks + Logic lock → phase end U·(1+S)
npm run verify:expired-phase # Expired Blank/P1/P2 tenure + hist obs/phase-end marks
npm run verify:custom-underlyings  # Non-Nifty/Sensex expired marks (no Nifty bluff)
npm run verify:valuation-pipeline  # Steps A→E full book replay
npm run verify:payoff-xirr       # Payoff XIRR tenor — full book scenario rows
npm run verify:phase-logic       # Blank / P1 / P2 / 10Y payoff + marks
npm run verify:irr-phase-tenure  # Product IRR ↔ scenario XIRR
npm run verify:31jul-nav         # 31-Jul NAV vs Logic path + phase tenure
npm run verify:asof-levels       # Desk today vs 31-Jul index date split
npm run verify:effective-target  # Effective Target full ongoing book
npm run verify:full-coupon       # Logic I/II + Working!V discount path
npm run verify:all-metrics       # Value, abs return, IRR, coupon formed
npm run verify:coupon-formula    # Coupon Formed === payoff formula (live + expired + CC1)
npm run verify:lifecycle-full    # Full book ongoing + expired marks
npm run verify:rollover-phase    # Working!F / schedule end / payoff XIRR tenor
npm run verify:seamlessness      # Defaults, calendars, expired date menus
npm run verify:exports           # Screen export parity + KPI tiles
npm run verify:calc              # Serial math, formula, valuation smoke
npm run verify:filter-parity     # Lifecycle filter parity vs UI
npm run verify:obs-due           # Observation-due 1M/2M/3M pools
npm run verify:obs-settlement    # 0D obs levels blank until NSE 15:30 IST
npm run verify:index-levels      # Yahoo ↔ Mongo ↔ bundled Nifty/Sensex
npm run verify:explorer   # Intel Master Explorer row filter
npm run verify:edge-cases # Master missing-field / NaN scan
npm run verify:data-quality  # Data-quality guard alerts vs canonical book
npm run backfill:index-history  # bundled Nifty + Sensex for offline marks
npm run bake:underlyings  # Yahoo/estimate history for stock & commodity underlyings
npm run verify:dynamic    # Synthetic row — proves formula-driven valuation/payoff
npm run bake              # New Product Master_.xlsx → master-seed.json + public download copy
npm run sync:master-backup # Sync Primary/Rollover from Downloads backup + restore column formulas
```

**Full stack:** `start-dashboard.sh` starts the Python analytics API on `http://127.0.0.1:8000` and Next.js on `http://localhost:3000`. Stop with `bash start-dashboard.sh --stop`.

### Local services

| Service | URL |
|---------|-----|
| **Dashboard** | http://localhost:3000 |
| **Next.js API** | http://localhost:3000/api |
| **Python pivot API** | http://127.0.0.1:8000 |
| **MongoDB** (optional) | mongodb://127.0.0.1:27017 |

Full route list: [07-routes-and-components.md](07-routes-and-components.md) · [01-architecture.md](01-architecture.md) § API routes.

**MongoDB (optional):** Set `MONGODB_URI` in `.env.local` (see `.env.example`). On master upload, products + formulas sync to MongoDB. Index history syncs from Yahoo on each `/api/market/levels` call and via `POST /api/market/sync-history`.

**Screen exports:** Valuation, Payoff, and Product Details offer **Download Excel** and **Download PDF** inside the revealed output panel. Branded maroon/gold banner; **Valuation Summary** KPI tiles use two-row label/value layout (matches on-screen KPI band). **Product Specifications stay plain white**. Excel includes interactive payoff formulas + observation dates; portfolio workbooks include a **Formula Guide** sheet. Filenames follow `SP-{Screen}-{ISIN}-{DD-MM-YYYY}.{ext}`. Exports lazy-load on first use (`export-screen.ts`, `export-screen-pdf.ts`).

**Seamless desk:** Master upload persists in IndexedDB and wins on reload when newer than baked seed. Live Notional KPI from merged master. Yahoo market levels fall back to bundled index. Portfolio clock = today; 31-Jul NAV audit is separate. See [seamless-qa-report.md](seamless-qa-report.md) · [13-windup-verification.md](13-windup-verification.md).

**Intel · Logic Atlas (`/intelligence`):** Light cream/gold hero banner, horizontally scrollable Reference Logic Modules (fixed-width cards ~328px, snap scroll), active pipeline diagram, category lanes, computation primitives table. Logic map source: `lib/logic-atlas.ts`.

## Master Excel (local, gitignored)

| File | Role |
|------|------|
| `New Product Master_.xlsx` | Source of truth — **Primary** sheet → products, Formulae, Product Explanation |
| `Dashboards - 31st May 26/*.xlsm` | Reference valuation / payoff workbooks |

After updating the master file:

1. Place `New Product Master_.xlsx` in repo root  
2. Run `npm run verify`  
3. Upload from Home in the app (or restart dev server to pick up baked seed)

## Verified snapshot (02-Aug-2026) — READY TO WIND UP

Full close-out board: [13-windup-verification.md](13-windup-verification.md).

| Metric | Value |
|--------|-------|
| Desk-canonical products | **4,179** (**4,151** with formulas) |
| Lifecycle pools (ongoing / expired) | Calendar-driven — e.g. **2,324** / **1,855** |
| Payoff XIRR rows | **74,718** — `verify:payoff-xirr` PASS |
| Product IRR ↔ scenario XIRR | **4,151/4,151** — `verify:irr-phase-tenure` PASS |
| Phase logic (Blank/P1/P2/10Y) | `verify:phase-logic` · `verify:expired-phase` — **PASS** |
| Post-last-obs Logic lock | **1,822/1,822** → phase end U·(1+S) — `verify:expired` |
| 31-Jul NAV exact | **99.26%** · phaseTenureBad **0** — `verify:31jul-nav` |
| Effective Target | **2,324/2,324** — `verify:effective-target` PASS |
| Mode B Excel Working | **2,395/2,395** — `verify:valuation` |
| Valuation pipeline A→E | **PASS** — ongoing + historical + expired obs/maturity |
| Index levels | Yahoo↔Mongo↔bundled — `verify:index-levels` PASS |

### Aug-2026 Logic sheet desk policy

| Topic | Behaviour |
|-------|-----------|
| **Live Notional** | Merged master Trade Amount → desk AUM → manifest fallback (`lifecycle-index.ts`) |
| **Expected Nifty** | No obs: spot IRR → **second-last** obs. ≥1 obs: average of realised fixings locks expected Nifty |
| **Full coupon** | Projected before last obs; realised after last obs when avg level > target |
| **Post last obs** | Lock coupon/IRR; Working!V discounts U·(1+S) @ **11%** until phase end — **not** post-obs Y compounding |
| **Desk default date** | Portfolio clock = **today**; historical picks use that date’s index closes |
| **31-Jul NAV audit** | Forced valuation date **31-07-2026** with Nifty **24,383.6** / Sensex **78,094.64** |
| **Custom underlyings** | Stocks → Yahoo NSE closes; gold/silver → labelled estimates. **Never** silent Nifty substitution |
| **Lifecycle tabs** | Tab-scoped picker; default = longest tenure (live) or most recent expired |
| **Valuation date** | Picker clamped to phase window: Working!F → schedule end (Phase 2 min = Trade Date) |
| **Phase IRRs / elapsed** | From Working!F — Phase 2 **Trade Date**, else **Allotment**; same-day elapsed = 0 → 0% IRR |
| **Expired tab** | Obs dates + phase end; historical index only; Logic lock to phase end |
| **Effective Target** | `(Total×Target − Σpassed levels) / Remaining` — 0D pending until 15:30 IST |
| **Maturity Ladder / Tenor Profile** | Phase schedule end SSOT (Maturity / POED / Rollover) |
| **Required Underlying IRR** | **Removed** from UI and exports |
| **Intel Logic Atlas** | Passive-facing copy — no Working-cell refs or parentheticals (`lib/logic-atlas.ts`) |

### Rollover Phase SSOT (Jul-2026)

| Phase | Valuation start (Working!F) | Schedule / lifecycle end | Payoff XIRR / calculation tenor |
|-------|----------------------------|--------------------------|--------------------------------|
| Blank | Allotment | Maturity | Allotment → Maturity |
| Phase 1 | Allotment | POED (fallback Maturity) | Allotment → POED |
| Phase 2 | **Trade Date** | Maturity | **Trade → Maturity** |
| 10 Years | Allotment | Rollover C/P | Allotment → Rollover |

**Lifecycle tabs (dynamic, same SSOT everywhere):** Ongoing = full live book (phase end still ahead, **including** Expiring 3M/1M). Expiring 3M·1M / Expired use the same phase schedule end. Obs-due 3M·2M·1M use upcoming Average 1 / Avg. 2–7 on the live book only. Product list + “Select the Primary Structured Product” = scrollable `getLifecyclePickerPool` ≡ `filterProductsByLifecycle`. Audits: `verify:seamlessness` · `verify:filter-parity` · `verify:obs-due` · `verify:phase-logic`.

Product Specs still show Excel Trade / Allotment / Maturity / Tenor Days as stored. Raw **Coupon / PR / DM** is on master Excel + Intel explorer (reference parity); Product Specs prefer **Coupon Percentage**.

### Jul-2026 product-details updates

| Topic | Behaviour |
|-------|-----------|
| **Coupon formed vs abs return** | Coupon Formed = payoff formula at projected **O** when it evaluates; headline coupon only if formula fails. Abs return = present value **Z** on valuation date. Both can differ while observation dates are still ahead. |
| **Required Underlying IRR** | **Removed** (Jul-2026 desk overhaul) |
| **Rollover Phase SSOT** | See table below — audit: `npm run verify:rollover-phase` |
| **KPI / spec cards** | ≤4 KPIs fill one full-width row; horizontal scroll only when label text needs more space. |
| **Master Pivot Explorer** | Virtualized table uses `data-table-row-alt` striping (fixes scroll glitches with sticky `#` column). |
| **Portfolio Days column** | **Days Left to Expiry** / **Days Since Expiry** — phase schedule end (Maturity; Phase 1 POED; 10Y Rollover). |
| **Screen Excel exports** | Lazy ExcelJS + preload on reveal + single-flight guard; interactive formulas/notes on Payoff Curve & scenario tables. |
| **Intel Logic Atlas** | Light hero patch, scrollable logic module cards, desk shortcuts, pipeline inspector — `logic-atlas-console.tsx` + `globals.css` intel-* tokens. |
| **Localhost performance** | Portfolio snapshot cache (`portfolio-snapshot-store.ts`), lighter page transitions, debounced index sync, chart entrance animations (`useChartAnimation`, respects `prefers-reduced-motion`), dynamic xlsx import on upload. |
| **Issuer Exposure chart** | All issuers in active bucket — formatted axis labels (`issuer-chart-labels.ts`), full names in tooltip. |
| **Index level sync** | Soft Yahoo commit ~5s; `localStorage` restores last good levels on reload; tab-focus refresh when stale (>5 min); Refresh forces immediate update; sub-0.05 jitter ignored (`desk-index-state.ts`). |

See [04-lifecycle-analytics-kpis.md](04-lifecycle-analytics-kpis.md) for exact KPI formulas · [11-calculation-review.md](11-calculation-review.md) for full calculation audit.
