# 03 — Testing & debug

## Desk gate (mandatory after material changes)

```powershell
npm run verify:probability-desk
```

Runs:

| Step | Command |
|------|---------|
| Types | `tsc --noEmit` |
| Engine parity | `verify:probability` |
| Column / export registry | `verify:exports` |
| Effective Target | `verify:effective-target` |
| Obs settlement 15:30 IST | `verify:obs-settlement` |
| Lifecycle filter pools | `verify:filter-parity` |
| Obs-due nesting | `verify:obs-due` |
| Timing | `bench:probability` |

Expect: all PASS; expired filter count **0**; UI pills exclude expired.

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

## Shared spine verifies (optional)

`verify:phase-logic`, `verify:rollover-phase`, `verify:index-levels`, `verify:products`, `verify:edge-cases`

Valuation/payoff verifies (`verify:valuation`, `verify:payoff-xirr`, …) are **not** required to ship the probability desk.

## Manual UI checklist

1. Lifecycle pills — no Expired.  
2. Probability inputs — search, date, levels, **no debentures**.  
3. Initial — Days from Phase Start; Start Level column present.  
4. Current — Days from Valuation Date; no Start Level.  
5. Path Taken Yes rows end near latest trading day.  
6. Past last obs — coupon in Probability Results; payoff plot + specs + obs table (no mid-page banner / no Average 1–7 mini-table). Final obs row shows a level, not “Yet to come”.  
7. Download Excel / PDF works.  
8. Intel Master pivot + Logic Atlas load.  
9. Theme toggle; Home KPI band usable.  
10. Phone / small tablet — no horizontal page scroll; nav, lifecycle, and tables scroll inside their rails.

## Small devices

The desk is responsive for phones and small tablets:

- Viewport meta via `export const viewport` in `app/layout.tsx`
- Header wraps; export/upload become icon-first below `sm`
- Nav pills + market strip + lifecycle filters scroll horizontally on narrow widths
- Path / schedule tables keep horizontal + vertical touch scrolling
- KPI cards use Primary SP **full-width fill grid** (not fixed-width scroll chips); phones wrap to 2 columns / dense snap when needed

Debug tip: in Chrome DevTools, toggle device toolbar to 390×844 and verify `/probability`, `/initial-probability`, and `/current-probability`.

