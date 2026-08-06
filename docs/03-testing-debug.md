# 03 — Testing & debug

## Desk gate (mandatory after material changes)

```powershell
npm run verify:probability-desk
```

Runs (`package.json` → `verify:probability-desk`):

| Step | Command |
|------|---------|
| Types | `tsc --noEmit` |
| Series floor 2001 | `verify:series-floor` |
| Engine parity | `verify:probability` |
| NSP Excel parity | `verify:nsp-excel` |
| Column / export registry | `verify:exports` |
| Effective Target | `verify:effective-target` |
| Target Underlying override | `verify:target-underlying` |
| Obs settlement 15:30 IST | `verify:obs-settlement` |
| Lifecycle filter pools | `verify:filter-parity` |
| Obs-due nesting | `verify:obs-due` |
| Edge cases (689 + ET) | `audit:probability-edges` |
| Final wind-up (689 dates/ET/TU) | `windup:final` |
| Timing | `bench:probability` |

Also run after phase / Actual Start changes:

```powershell
npm run verify:phase-logic
npm run verify:rollover-phase
```

Expect: all PASS; expired filter count **0**; UI pills exclude expired **and** past-final-observation names.

## Smoke the running app

```powershell
npm run dev   # http://localhost:3001
```

| Route | Expect |
|-------|--------|
| `/` | 200 |
| `/probability` | 200 |
| `/initial-probability` | 200 |
| `/current-probability` | 200 |
| `/intelligence` | 200 |
| `/upload` | 200 |
| `/valuation` | redirect → Initial |
| `/payoff` | redirect → Current |
| `/portfolio/details` | redirect → Probability |

Sample API:

```powershell
$body = @{
  isin = "INE093J074Z3"   # pick a live ongoing ISIN from your book
  mode = "both"
  valuationDate = "03-08-2026"
  niftyLevel = 24500
  includePaths = $false
} | ConvertTo-Json

Invoke-RestMethod http://localhost:3001/api/probability/run -Method POST `
  -Body $body -ContentType "application/json"
```

Expect `ok`, numeric `initial.probability` / `current.probability`.  
If past final obs: `asOfLastObservation=true` and `checkingDate` locked.

## Symptom → file map

| Symptom | Look here first |
|---------|-----------------|
| `date.getDate is not a function` | `lib/workbook/dates.ts` `formatDisplayDate`; `hydrateProbabilityRunResult` |
| Hang / slow paths | `includePaths`, caches, virtualizer, series length |
| Wrong Initial Days | `getWorkingAllotmentDate` / Phase 2 Trade Date |
| Wrong Current Days | valuation parse; `getProbabilityCheckingDate` |
| Prob always null | entry/target missing; custom underlying; empty series |
| Portfolio Prob columns — | `use-lazy-portfolio-probabilities.ts`; batch API; ISIN |
| Expired products appear | `UI_LIFECYCLE_FILTERS`; filter `"expired"` must be `[]` |
| Parentheses in UI | `product-display-name.ts`; atlas; export labels |
| Select hydration flicker | `searchable-select.tsx` |
| Past-final panels missing | `hasPassedFinalObservation`; settlement 15:30 IST |
| Mongo empty | `.env.local`; `verify:mongo`; `sync:seed` |
| Historical levels wrong | `/api/market/index-at-date`; joint Nifty+Sensex series |
| Path table shows future No rows | Frontier trim in `engine.ts`; default Included filter |
| Mark looks like yesterday before 15:30 | `desk-mark-as-of.ts` — expected |
| Logic Atlas thin / wrong copy | `lib/logic-atlas.ts` + doc 16 §11 |
| Phase 2 Initial days wrong | Trade Date must be populated on master |

## Shared spine verifies (optional)

`verify:phase-logic`, `verify:rollover-phase`, `verify:index-levels`, `verify:products`, `verify:edge-cases`

Valuation/payoff verifies (`verify:valuation`, `verify:payoff-xirr`, …) are **not** required to ship the probability desk.

## Manual UI checklist

1. Lifecycle pills — no Expired; no past-final-obs names.  
2. Probability inputs — search, date, levels, **no debentures**.  
3. Probability summary — **schedule above specs**; no path table; KPIs only.  
4. Initial — Days from Actual Start; Start Level column; **inline** path progress.  
5. Current — Days from Valuation Date; no Start Level; inline progress.  
6. Path Taken Yes rows end near latest series trading bar; no long future No tail.  
7. Lifecycle table — Initial Level, As of Today's Date, Actual Start, phase dates.  
8. Past last obs deep-link — coupon in Results; payoff + specs + obs table.  
9. Download Excel / PDF — Primary gold masthead + disclaimer.  
10. Intel — Logic Atlas Connected cards + detailed Active pipeline stages.  
11. Theme toggle; Home KPI band usable.  
12. Phone / small tablet — no horizontal page scroll; nav, lifecycle, and tables scroll inside their rails.

## Small devices

The desk is responsive for phones and small tablets:

- Viewport meta via `export const viewport` in `app/layout.tsx`
- Header wraps; export/upload become icon-first below `sm`
- Nav pills + market strip + lifecycle filters scroll horizontally on narrow widths
- Path / schedule tables keep horizontal + vertical touch scrolling
- KPI cards use Primary SP **full-width fill grid** (not fixed-width scroll chips); phones wrap to 2 columns / dense snap when needed

Debug tip: in Chrome DevTools, toggle device toolbar to 390×844 and verify `/probability`, `/initial-probability`, and `/current-probability`.

