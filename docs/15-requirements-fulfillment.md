# 15 — Requirements fulfillment board

Five-pass checklist against the inception prompt. Status as of the Dynamic Probability Calculator desk.

## A. Shell, lifecycle, master, Intel

| Requirement | Status | Where |
|-------------|--------|-------|
| Dashboard same format/styling as Primary SP | **PASS** | Shared `--ar-*` tokens, KpiBand motion/grid, Desk Category Lanes, Absolute Return analytics, nav/brand shell |
| Tabs: ongoing, obs 3m/2m/1m | **PASS** | `UI_LIFECYCLE_FILTERS` in `lib/product-lifecycle.ts` |
| Forget expired products | **PASS** | Lifecycle index skip; filter `"expired"` → `[]` |
| No Expiring 3M / 1M tabs | **PASS** | Removed from UI pills, headline KPIs, market strip, status enum |
| Exclude past-final-observation from live pills | **PASS** | `isLiveObservationBookProduct` / `hasPassedFinalObservation` gate on Ongoing, Obs-due |
| Master from New Product Master_ / Mongo | **PASS** | Upload + `resolve-master-products` + Atlas/local Mongo |
| Blank / Phase1 / Phase2 / 10Y actual starts & ends | **PASS** | `lib/product-dates.ts` |
| Days Left, Tenure, Years as-of selected date | **PASS** | Phase schedule end SSOT; portfolio columns |
| Intel product master same formatting | **PASS** | `MasterSheetPivot` on `/intelligence` |
| Logic Atlas like Primary SP | **PASS** | `lib/logic-atlas.ts` + `logic-atlas-console.tsx` |

## B. Nav & Probability summary

| Requirement | Status | Where |
|-------------|--------|-------|
| Tabs = Probability / Initial / Current | **PASS** | `lib/navigation.ts`; redirects in `next.config.ts` |
| Probability sheet results on Probability tab | **PASS** | `surface="summary"` dashboard |
| Inputs like Product Details minus debentures | **PASS** | `ExcelInputPanel` `mode="probability"` |

## C. Initial Probability (Initial Prob sheet)

| Requirement | Status | Where |
|-------------|--------|-------|
| Average / Dates / Days table | **PASS** | `ScheduleCard` |
| Days from actual phase start | **PASS** | `getWorkingAllotmentDate` |
| Backtest layman headers, no `()` | **PASS** | `PathBacktestTable` |
| Daily paths; last path last obs ≈ latest trading day | **PASS** | `lib/probability/engine.ts` |
| Nifty/Sensex Mongo; caching | **PASS** | API series + LRU cache |
| Ceiling Nifty 1.01 / Sensex 1.006 | **PASS** | `ceilingStartLevel` |

## D. Current Probability (Backtesting sheet)

| Requirement | Status | Where |
|-------------|--------|-------|
| Days from valuation date | **PASS** | Current mode base date |
| No Start Level column | **PASS** | `showAdjustedStart={false}` |
| Same frontier rule | **PASS** | Shared inclusion loop |
| Layman headers, no `()` | **PASS** | Same path table |

## E. DATA sheet & cross-cutting

| Requirement | Status | Where |
|-------------|--------|-------|
| Yellow columns in lifecycle tables | **PASS** | `portfolio-lifecycle-columns.ts` + Underlying |
| Probs calculated; identity from master | **PASS** | Lazy portfolio probs + master fields |
| No texts in brackets `()` | **PASS** | Display names / headers / atlas scrub |
| Past final obs panels | **PASS** | `as-of.ts` + `past-final-observation-panels.tsx` |
| Docs + local app | **PASS** | `docs/*`, `:3001` |
| Date JSON hydrate | **PASS** | `formatDisplayDate` + `hydrateProbabilityRunResult` |
| Excel/PDF exports | **PASS** | `export-probability-screen.ts` |

## Intentional deltas vs NSP Excel (not bugs)

1. **Initial day base** = phase start (Phase 2 Trade Date), not hard-coded allotment cell.  
2. **Path frontier** = latest trading day for **both** Initial and Current (prompt override of Excel Initial allotment cutoff / Avg1–6-only MAX).  
3. Headers use layman English instead of Excel “To be taken” / “Start Level (1%)”.

## F. Layout / desk UX (follow-ups)

| Requirement | Status | Where |
|-------------|--------|-------|
| KPI cards full horizontal width like Primary SP | **PASS** | Primary `KpiBand` motion + dense fill grid restored |
| Desk tab = Initial + Current Probability only | **PASS** | `components/dashboard/desk-hub.tsx` |
| Probability / Initial / Current = Primary Valuation spine | **PASS** | Filter → Interface/Product List → Inputs → Report as-of → Reveal + downloads in footer |
| Summary Reveal: Specs → Results (H-scroll) → Payoff → Obs | **PASS** | `past-final-observation-panels.tsx` |
| Fast local: summary without paths; paths after Reveal | **PASS** | `includePaths` + AbortController |
| Path backtest full columns with horizontal scroll | **PASS** | `PathBacktestTable` |

## Verify commands

```powershell
npm run verify:probability-desk
```
