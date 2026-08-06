# Dynamic Probability Calculator — Documentation Index

All desk reference docs live in **`docs/`**. This index is the single entry point for debugging, onboarding, Excel/Mongo parity, product-type logic, and cloud deploy.

**Last documentation sweep:** 2026-08-06 (full-book lifecycle probability warm + gated Excel downloads + Observation 1–7 / Effective Target / Vercel smoothness).

## Document map

| # | Document | Use when you need… |
|---|----------|-------------------|
| 01 | [Architecture](01-architecture.md) | Stack, folders, data flow, caches, API map |
| 02 | [Probability Excel parity](02-probability-excel-parity.md) | NSP Data / Probability / Initial Prob / Backtesting → code |
| 03 | [Testing & debug](03-testing-debug.md) | Verify scripts, smoke routes, symptom → file |
| 04 | [Lifecycle, analytics & KPIs](04-lifecycle-analytics-kpis.md) | Pills, Days/Tenor/Years, Effective Target, columns, Home KPIs |
| 05 | [Narrative & master Excel](05-narrative-master-excel.md) | Bake/sync, Intel explorer, specs, display names |
| 06 | [Probability path engine](06-probability-path-engine.md) | Schedule, ceilings, path inclusion, frontier, API |
| 07 | [Routes & components](07-routes-and-components.md) | Page → file map, inputs, redirects, exports |
| 08 | [Debug playbook](08-debug-playbook.md) | Step-by-step troubleshooting by symptom |
| 09 | [Master column logic](09-master-column-logic.md) | NEW PRIMARY fields, NaN, market fallbacks |
| 10 | [Local deployment](10-deployment.md) | localhost :3001 runbook |
| 11 | [Calculation review](11-calculation-review.md) | Full Initial / Current / Effective Target math |
| 12 | [Probability plain English](12-probability-plain-english.md) | Layman desk guide |
| 14 | [Vercel & Render](14-vercel-render-deployment.md) | Complete cloud deployment |
| 15 | [Requirements fulfillment](15-requirements-fulfillment.md) | Prompt checklist PASS board |
| **16** | **[Product-type probability logic](16-product-type-probability-logic.md)** | **Blank / Phase 1 / Phase 2 / 10Y audit + Logic Atlas verify** |

## Quick commands

```powershell
npm run dev                         # http://localhost:3001
.\start-dashboard.ps1               # optional Mongo + Next.js
.\start-dashboard.ps1 -Stop

npm run typecheck
npm run verify:probability-desk     # full desk gate
npm run verify:probability
npm run verify:nsp-excel
npm run verify:phase-logic
npm run verify:rollover-phase
npm run bench:probability
npm run verify:exports
npm run verify:effective-target
npm run verify:obs-settlement
npm run verify:filter-parity
npm run verify:obs-due
npm run verify:series-floor

npm run bake                        # master xlsx → seed + public copy
npm run verify:mongo
npm run sync:seed
```

## Local services

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3001 |
| Next.js API | http://localhost:3001/api/* |
| MongoDB optional | mongodb://127.0.0.1:27017 · DB `sp_dashboard` |
| Production (example) | https://dynamic-probability-calculator-9aso.vercel.app |

## Locked product rules (do not regress)

1. **No expired products** in UI pills or picker pools (`UI_LIFECYCLE_FILTERS`; `filterProductsByLifecycle("expired")` → `[]`).  
2. **No past-final-observation** names in live pills (`isLiveObservationBookProduct`).  
3. Nav surfaces: **Probability / Initial Probability / Current Probability** — Valuation/Payoff/Details redirect.  
4. **Initial** schedule days from **Actual Start** (`getWorkingAllotmentDate`: Phase 2 → Trade Date).  
5. **Current** schedule days from **valuation / checking date** (all present Average slots).  
6. Path frontier both modes: last included path’s last observation ≈ **latest trading bar in series**.  
7. **No parentheses `()`** in user-facing labels.  
8. Past final observation → metrics **as of last obs**; show specs, coupon, payoff plot, obs table — not narrative / scenarios / IRR.  
9. Inputs: smart search, dynamic valuation date, auto Nifty/Sensex — **no debentures**.  
10. Ceilings: Nifty **×1.01**, Sensex **×1.006**, CEILING to 100.  
11. Desk mark: **prev session before 15:30 IST**, today after close.  
12. Lifecycle **Initial Level** column name (not “Actual Entry Level”).  
13. Probability summary: schedule **above** specs; path load = inline progress (no modal).  
14. Index/master: Vercel prefers CDN seed; Mongo overlays prices/paths when configured.  
15. Logic Atlas pipeline cards stay detailed (detail + metrics + tags) and must match engine truth (doc 16 §11).

## Reference folders / files

| Path | Role |
|------|------|
| `C:\Users\shiba\OneDrive\Desktop\Primary SP Dashboard` | UI/lifecycle/Mongo clone source |
| `New Product Master_.xlsx` | Master book (gitignored locally) |
| `NSP's under Risk.xlsm` | Probability formula reference |
| `C:\Users\shiba\OneDrive\Desktop\Gift AIF Backtester` | Daily path-start frequency reference only |

## After any feature change

```powershell
npm run verify:probability-desk
# then smoke http://localhost:3001/probability and POST /api/probability/run
# for phase changes also: npm run verify:phase-logic
```

See [03-testing-debug.md](03-testing-debug.md) and [08-debug-playbook.md](08-debug-playbook.md).
