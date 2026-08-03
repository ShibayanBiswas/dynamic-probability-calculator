# Testing & Debug Guide

> **Full doc index:** [docs/README.md](README.md) · KPI formulas: [04-lifecycle-analytics-kpis.md](04-lifecycle-analytics-kpis.md)

## Lifecycle KPI audit

```bash
npm run verify:kpis ongoing     # match UI: AUM, Avg Full Coupon, Avg Absolute Return, Listed
npm run verify:kpis             # all four buckets
```

## Full catalog QA (all products · ongoing + expired)

```bash
npm run verify:full    # reads New Product Master_.xlsx (or master-seed.json fallback)
npm run verify         # bake seed + count check + full suite
```

Validates **every Primary product** in lifecycle buckets (Ongoing, Expiring 3M/1M, Expired):

| Check | What it does |
|-------|----------------|
| `FORMULA_EVAL` | Payoff formula compiles and returns finite values across Z sweep |
| `NARRATIVE_FORMAT` | Excel-scale percents (600%, 7500%, 4850%) desk-formatted in UI text |
| `NARRATIVE_FORMULA_MISMATCH` | Participation in description vs formula token (informational) |
| `PAYOFF_TABLE` | Enhanced scenario table builds without error |
| `VALUATION` | `computeValuation` for applicable ongoing products |

**CI gate:** fails only on **ongoing** critical issues + spot checks (Nifty Accelerator 637, 600% decay band).

### Full-book verify scripts (02-Aug-2026 wind-up)

Lifecycle pool sizes (ongoing / expired) drift with the calendar day — scripts below are the SSOT suite.  
Close-out board: [13-windup-verification.md](13-windup-verification.md).

```bash
npm run verify:asof-levels         # Desk today vs 31-Jul index date split
npm run verify:effective-target    # Effective Target full ongoing book
npm run verify:index-levels        # Yahoo ↔ Mongo ↔ bundled Nifty/Sensex
npm run verify:31jul-nav           # 31-Jul NAV vs Logic path + phase tenure
npm run verify:coupon-formula      # Coupon Formed === payoff formula — live + expired pools
npm run verify:valuation-pipeline  # Steps A→E — ongoing@today + historical + expired@obs + expired@maturity
npm run verify:lifecycle-full      # All ongoing + expired marks
npm run verify:custom-underlyings  # Stock/commodity expired marks — no Nifty bluff
npm run verify:all-metrics         # Value, abs, IRR, coupon — full marked book
npm run verify:payoff-xirr         # Payoff XIRR tenor — full book scenario rows
npm run verify:phase-logic         # Blank / P1 / P2 / 10Y — payoff tables + marks
npm run verify:rollover-phase      # Working!F / schedule end / payoff XIRR tenor by phase
npm run verify:expired             # Expired marks + Logic lock → phase end U·(1+S)
npm run verify:expired-phase       # Expired Blank/P1/P2 tenure + hist obs/phase-end marks
npm run verify:analytics           # Charts incl. Tenor Profile ↔ Maturity Ladder parity
npm run verify:irr-phase-tenure    # Product IRR ↔ scenario XIRR
npm run verify:full-coupon         # Logic I/II + Working!V discount path
npm run verify:seamlessness        # Tab defaults, calendars, expired date menus
npm run verify:exports             # Screen export parity + KPI tiles
npm run verify:calc                # Serial math, formula engine, valuation smoke
npm run verify:filter-parity       # Lifecycle filter parity vs UI pools
npm run verify:ui-conservation     # UI/logic conservation gate
npm run bake:underlyings           # Re-fetch Yahoo/estimate history for custom underlyings
```

**Desk UI:** product blockers use styled `deskAlert` modal — not browser `window.alert`.

Spot checks verify 600% → 6.0% per 1% move and formula `(35%-Z)*6` at Z=35/36/40%.

## Quick smoke test

```bash
bash start-dashboard.sh   # or: npm run dev (Next only)
# open http://localhost:3000
```

1. **Home** — Portfolio by Lifecycle shows counts; timestamp updates each minute.
2. **Market** — Valuation inputs show today’s date + Nifty/Sensex (green “Live · Yahoo Finance” badge).
3. **Valuation** — Select Gearing Accelerator INE093JA7Q38 → Click reveal → Current Value ~₹198k on live levels.
4. **Payoff** — Nifty Accelerator INE093JA77C4 → Current Level read-only from Yahoo; Live Index Move uses live Z. Product Overview shows **76.0% — 75.0% participation + 100% coupon** not 7600%. Labels omit Excel cell refs — no `(Z)`, `(S)`, or `(X)` in the UI.
5. **Product lists** — Home lifecycle table, Valuation list, and Payoff search show **all** filtered products (scroll; sticky header). No 500-row cap.
6. **Expired valuation** — Expired tab → Nifty product INE013A07NQ1 (Pure Participation - 4) → date 25-Sep-2014 → Nifty **7911.85** (not live) → reveal shows value ~₹1,67,199. Stock/commodity expired (e.g. Infosys) shows **Infosys Level · Underlying**, not Nifty.
7. **Custom underlying** — Expired Infosys / MCX Silver: level must match Yahoo/estimate series; Z must not look like Nifty÷entry. Run `npm run verify:custom-underlyings`.
7. **Cross-page lifecycle** — Set **Expired** on Valuation → open Payoff or Product Details → tab still **Expired**, product pool matches.
8. **Analytics / Home** — One lifecycle category panel at a time; switching tabs updates AUM, Avg Full Coupon, Avg Absolute Return, Listed. Science Lab **Issuer Exposure** shows all issuers in the bucket.
9. **Export** — “Export view” / “Full workbook” / per-page **Download screen to Excel** produce `.xlsx`. Screen exports show *Building workbook…* and should complete in a few seconds (ExcelJS lazy-loaded).
10. **Intel** — `/intelligence` → light hero banner, scroll Reference Logic Modules horizontally, select module → pipeline diagram + insights update.

## API checks

Local base URL: **http://localhost:3000/api** (not a wildcard — each route is explicit).

```bash
curl http://localhost:3000/api/market/levels
curl http://localhost:3000/api/master/health
curl http://localhost:3000/api/parse/bootstrap
```

| Route | Method | Expect |
|-------|--------|--------|
| `/api/market/levels` | GET | `{ valuationDate, niftyLevel, sensexLevel, source }` |
| `/api/master/health` | GET | Mongo connectivity status |
| `/api/parse/bootstrap` | GET | Product dataset JSON |

Full route list: [07-routes-and-components.md](07-routes-and-components.md) · [10-deployment.md](10-deployment.md).

## Valuation CLI check

```powershell
cd "Primary SP Dashboard"
npx tsx -e "
import seed from './lib/data/master-seed.json';
import { computeValuation } from './lib/workbook/valuation-engine';
const p = seed.products.find(x => x.isin === 'INE093JA7Q38');
const v = computeValuation(p, { valuationDate: '31-May-26', currentLevel: 23547.75, debentures: 100 });
console.log({ pv: v.productValue, abs: (v.absReturn*100).toFixed(2), irr: (v.productIrr*100).toFixed(2) });
"
```

## Payoff pivot rows

- `findPayoffPivotZs(formula)` scans slope changes.
- `buildEnhancedPayoffScenarioTable()` merges Excel offsets + pivots + **current market-move row**.
- Table rows: `.pivot-row` (amber glow), `.current-row` (gold ring).

## Lifecycle debug

| Filter | Rule |
|--------|------|
| Ongoing | Maturity > 90 days |
| Expiring 3M | 0–90 days |
| Expiring 1M | 0–30 days |
| Expired | Maturity < today |

Clock: `usePortfolioClock()` in `lifecycle-product-list.tsx`, `dashboard-shell.tsx`.

## localStorage

Key: `sp-dashboard-product-selection-v2`  
Persists: ISIN, product code, name, debentures — **not** valuation date/levels (always live).

## File map for bugs

| Symptom | Check |
|---------|-------|
| Wrong product value | `valuation-engine.ts`, `getWorkingClientInvestment()` |
| Wrong payoff % | `formula-engine.ts`, `payoff-pivots.ts` |
| Stale lifecycle counts | `product-lifecycle.ts`, `usePortfolioClock` |
| Stale index | `/api/market/levels`, `use-market-sync.ts`, `resolveLiveIndexLevel()` |
| 7600% / 7500% in narrative | `lib/product-narrative-format.ts` |
| Export empty | `export-products.ts`, filter pool size |
| Chart tooltip % on index | `payoff-underlying-chart.tsx` `dataKey === 'underlyingLevel'` |
| Junk rows (`NM - 272`, `PC - 442`) showing | `lib/master-book-filter.ts` — filter runs at parse/sync/load |
| `/api/master/load` slow | Mongo product cache in `sync-master.ts`; `invalidateProductsCache()` on sync |
| Port 3000 busy on start | `start-dashboard.sh` `free_port()` — SIGTERM → wait → SIGKILL |

## Seed refresh

```bash
npm run bake    # rebake master-seed.json from xlsx
npm run verify  # bake + product count checks
```

Reference workbooks are gitignored; place under repo root locally.
