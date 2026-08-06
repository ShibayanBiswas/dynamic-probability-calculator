# 15 — Requirements fulfillment board

Five-pass checklist against the inception prompt. Status as of **2026-08-06**.

Deep logic audit: [16-product-type-probability-logic.md](16-product-type-probability-logic.md).

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
| Logic Atlas like Primary SP | **PASS** | Enriched pipeline cards (detail/metrics/tags); verified vs engine 2026-08-04 |

## B. Nav & Probability summary

| Requirement | Status | Where |
|-------------|--------|-------|
| Tabs = Probability / Initial / Current | **PASS** | `lib/navigation.ts`; redirects in `next.config.ts` |
| Probability sheet results on Probability tab | **PASS** | `surface="summary"` dashboard |
| Inputs like Product Details minus debentures | **PASS** | `ExcelInputPanel` `mode="probability"` |

## C. Initial Probability (Initial Prob sheet)

| Requirement | Status | Where |
|-------------|--------|-------|
| Observation / Dates / Days table | **PASS** | `ScheduleCard` (desk labels Observation 1–N) |
| Days from actual phase start | **PASS** | `getWorkingAllotmentDate` |
| Backtest layman headers, no `()` | **PASS** | `PathBacktestTable` |
| Daily paths; last Yes final obs = Actual Start | **PASS** | `lib/probability/engine.ts` Initial frontier |
| Nifty/Sensex Mongo; caching | **PASS** | API series + LRU cache |
| Ceiling Nifty 1.01 / Sensex 1.006 | **PASS** | `ceilingStartLevel` |

## D. Current Probability (Backtesting sheet)

| Requirement | Status | Where |
|-------------|--------|-------|
| Days from valuation date | **PASS** | Current mode base date |
| Full schedule + ALREADY PASSED for settled slots | **PASS** | `schedule` + path placeholders |
| Remaining-only average + Effective Target hurdle | **PASS** | `pathSchedule` + `computeCurrentEffectiveTargetLevel` |
| No Start Level column | **PASS** | `showAdjustedStart={false}` |
| Frontier = latest series session; last Yes ends there | **PASS** | Shared inclusion loop + lag snap |
| Default path filter = All | **PASS** | `PathBacktestTable` |
| Layman headers Observation Date/Level, no `()` | **PASS** | Same path table |

## E. DATA sheet & cross-cutting

| Requirement | Status | Where |
|-------------|--------|-------|
| Yellow columns in lifecycle tables | **PASS** | `portfolio-lifecycle-columns.ts` + Underlying |
| Probs calculated; identity from master | **PASS** | Full-book lazy warm + gated lifecycle Excel downloads |
| No texts in brackets `()` | **PASS** | Display names / headers / atlas scrub |
| Past final obs panels | **PASS** | `as-of.ts` + `past-final-observation-panels.tsx` |
| Docs + local app | **PASS** | `docs/*`, `:3001` |
| Date JSON hydrate | **PASS** | `formatDisplayDate` + `hydrateProbabilityRunResult` |
| Excel/PDF exports | **PASS** | `export-probability-screen.ts` + lifecycle gated workbook |
| Lifecycle download after all probs | **PASS** | `ensurePortfolioProbabilities` + disabled Export until store ready |

## Intentional deltas vs NSP Excel (not bugs)

1. **Initial day base / frontier** = Actual Start by Rollover Phase (Phase 2 = Trade Date), matching NSP Initial Prob `D16` with phase awareness — not a hard-coded allotment-only cell.  
2. **Current remaining + Effective Target** — Excel Backtesting still averages every Average offset (including past) and hurdles with master Target / today; this desk averages remaining slots only and hurdles with Effective Target when fixings have settled.  
3. **Current Target Underlying (settled fixings)** — desk defaults / KPI seed = **Effective Target ÷ Entry − 1**; Excel `Probability!D22` stays Target÷Entry−1. Edits back-solve Target Level. Probability at default matches master-Target math.  
4. **Current path offsets** — Excel checking-date offsets when the series is current; if the series lags the desk clock, remaining offsets snap from the latest series session so the last Yes final obs lands there.  
5. **Path history floor** = hard lock **2001-01-01** (Excel nifty may open ~2000-12-31).  
6. Headers use Observation 1–7 / Observation Date–Level layman English instead of Excel “Average” / “To be taken”.  
7. Path-Taken-No rows past the Yes frontier are kept for the Excluded filter (probability still uses Yes only).

## F. Layout / desk UX (follow-ups)

| Requirement | Status | Where |
|-------------|--------|-------|
| KPI cards full horizontal width like Primary SP | **PASS** | `KpiBand` — 5+ tiles single-row scroll with visible scrollbar |
| Desk tab = Initial + Current Probability only | **PASS** | `components/dashboard/desk-hub.tsx` |
| Probability / Initial / Current = Primary Valuation spine | **PASS** | Filter → Interface/Product List → Inputs → Report as-of → Reveal + downloads in footer |
| Summary Reveal: Specs → Results (H-scroll) → Payoff → Obs | **PASS** | `past-final-observation-panels.tsx` |
| Fast local: summary without paths; paths after Reveal | **PASS** | `includePaths` + AbortController |
| Path backtest full columns with horizontal scroll | **PASS** | `PathBacktestTable` |
| Schedule above specs on Probability summary | **PASS** | `probability-dashboard.tsx` |
| Inline path load progress (no modal) | **PASS** | `PathLoadProgress` |
| Path Yes frontier + Excluded Nos | **PASS** | `engine.ts` + path table filter |
| Desk mark 15:30 IST | **PASS** | `desk-mark-as-of.ts` |
| Lifecycle Initial Level + as-of + phase dates | **PASS** | `portfolio-lifecycle-columns.ts` |
| Observation 1–7 desk labels | **PASS** | `PORTFOLIO_OBS_COLUMN_LABELS` (master Average keys unchanged) |
| Effective Target on specs + register | **PASS** | `product-specifications.ts` + ET columns |
| Primary-grade Excel/PDF | **PASS** | `export-probability-screen.ts` |
| Lifecycle Excel gated on full-book probs | **PASS** | `use-lazy-portfolio-probabilities` + lifecycle list |
| Lifecycle search prioritizes Prob warm | **PASS** | `priorityProducts` → batch size 8 first |
| Editable Target Underlying on inputs | **PASS** | Current+passed defaults ET÷Entry−1; else Target÷Entry−1; ET read-only |
| Target Underlying KPI on Current tab | **PASS** | Current `kpiItems` + horizontal scroll KPI band |
| Vercel harden (CDN seed, includePaths, maxDuration) | **PASS** | bootstrap + `api/probability/run` |
| Docs cover product-type logic | **PASS** | docs 01–16, especially 12 + 16 |
| Final wind-up audit (689 + ET TU) | **PASS** | `npm run windup:final` |

## Wind-up verdict (2026-08-06)

**YES — you can wind up this project** for Primary Probability desk delivery, provided the intentional Excel deltas above are accepted as product rules (not defects).

Evidence gate: `npm run verify:probability-desk` (includes `windup:final`) + `npm run verify:seamlessness` + NSP Excel formula parity (`verify:nsp-excel`) + full-book Effective Target (`verify:effective-target` 2134/2134).

Known accepted deltas vs a stale NSP workbook: ~0.1–0.3 pp Current Prob when the desk series frontier is newer than the workbook nifty sheet; Current remaining+ET hurdle vs Excel all-slot+master-Target Backtesting; desk Current TU = ET÷Entry−1 when fixings settled.

## Verify commands

```powershell
npm run verify:probability-desk
npm run windup:final
npm run verify:seamlessness
npm run verify:phase-logic
npm run verify:rollover-phase
```
