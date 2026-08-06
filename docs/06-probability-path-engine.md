# 06 — Probability path engine

| File | Role |
|------|------|
| `lib/probability/engine.ts` | Core math (`runProbabilityBacktest`, schedule, ceilings) |
| `lib/probability/index-series.ts` | `SERIES_FLOOR`, merge + forward-fill |
| `lib/probability/as-of.ts` | Checking date + past-final lock |
| `lib/probability/cache.ts` | LRU result cache |
| `lib/probability/portfolio-prob-store.ts` | Client portfolio probability cache |
| `app/api/probability/run/route.ts` | HTTP, Gift CSV + Mongo + Yahoo, past-final clamp |
| `lib/product-dates.ts` | Actual Start / phase end by Rollover Phase |
| `lib/desk-mark-as-of.ts` | 15:30 IST mark policy for live levels |
| `components/ui/path-load-progress.tsx` | Inline path-load progress (no modal) |

Deep product-type audit: [16-product-type-probability-logic.md](16-product-type-probability-logic.md).

## Modes

| Mode | Schedule base | Start Level | Performance ÷ | Threshold | Path frontier |
|------|---------------|-------------|----------------|-----------|--------------|
| `initial` | Actual Start (`getWorkingAllotmentDate`) | Yes — ceiling | Start Level | `target/entry − 1` | Actual Start ≥ MAX(projected obs) |
| `current` | Checking date; **full** Observation Schedule; average uses remaining (`days > 0`) | No (`null`) | Path start close | `EffectiveTarget/todayLevel − 1` | Latest series bar ≥ MAX(projected obs) |

Path rows carry one column per full-schedule slot. Current renders already-passed slots as
`ALREADY PASSED` / `—` placeholders (`observationDates[i] = observationLevels[i] = null`) — they are
excluded from the average, frontier and probability, but keep their column position. Default path
filter is **All**. Path-Taken-No rows past the frontier are omitted so the **last path** in the
table is the last Yes: final observation = **Actual Start** (Initial) or **latest series session**
(Current). Current path day offsets follow Excel (`obs − checking date`) when the series is
current; if the series lags the desk clock, remaining path offsets are measured from the latest
series session so that final obs lands on it. The Observation Schedule card always shows days
from the valuation date.

### Actual Start by phase

| Phase | Actual Start |
|-------|--------------|
| Blank / Phase 1 / 10 Years | Allotment, else Trade |
| Phase 2 | Trade Date only |

## Schedule builder

```ts
buildObservationSchedule(product, baseDate)
```

Each Average 1…7 slot: blank → skipped; else `daysFromBase = differenceInCalendarDays(obsDate, base)`.

**Offsets are calendar days.** Trading-day snap to prior close happens later inside each path row via `lookupPriorBar`, not when offsets are built.

## Path series floor

Index series load from **2001-01-01** with forward-fill across Nifty/Sensex legs (Gift AIF `nifty_daily` / NSP `nifty` parity).

Sources (API route):

1. Gift CSV `lib/data/nifty-daily-2001.csv`  
2. Bundled Sensex history  
3. Mongo `index_prices` overlay when dense enough  
4. Yahoo recent sync / live marks  

Earliest path start = first day where **both** legs exist after fill.

## Path loop (both modes)

1. For each trading day from series start → frontier: take underlying close.  
2. Initial only: `ceilingStartLevel(close)` — Nifty ×1.01, Sensex ×1.006, `ceil(/100)*100`.  
3. Project each present slot: `startTime + daysFromBase`; prior-close lookup for date + level.  
4. Require all present slots filled for inclusion eligibility.  
5. Average + performance vs mode divisor.  
6. Compare to threshold when ready.  
7. Include while series covers max simulated obs time; **stop emitting** when the next path would need future bars (`!stillEligible && !pathIncluded`).  
8. Trim Path-Taken-No rows past the frontier — last table row is the last Yes (Actual Start / latest session).

## Thresholds

- **Target Underlying (Initial):** `target / entry − 1`  
  Entry = `getProbabilityEntryLevel` (Actual Entry / Entry / Initial / Initial Fixing only — **no Target fallback**).  
- **Required Underlying (Current):** `effectiveTarget / todayLevel − 1`  
  Effective Target matches lifecycle: `(Total×Target − Σpassed levels) / Remaining` when fixings have settled; else master Target.  
  `todayLevel` = request `niftyLevel`/`sensexLevel` (desk mark), else series close on checking date.  

Probability = `successCount / includedCount` when threshold ready; otherwise not ready.

## Checking date / past final observation

`resolveProbabilityCheckingDate` (`lib/probability/as-of.ts`):

- If final observation fixing is already settled as of the requested valuation date → lock checking date to that final obs day.  
- Else use requested valuation date.  

API clears live levels after final obs so Current uses history close on the locked date.

## Underlying gate

`resolveUnderlyingKind`: Sensex if labelled Sensex; else Nifty if empty/Nifty; else **null** → API error *Probability is available only for Nifty and Sensex*.

Custom underlyings may still show Effective Target on the lifecycle table via a separate metrics path.

## API

```http
POST /api/probability/run
Content-Type: application/json

{
  "isin": "…",
  "isins": ["…"],
  "mode": "initial" | "current" | "both",
  "valuationDate": "DD-MM-YYYY",
  "niftyLevel": 24500,
  "sensexLevel": 80000,
  "includePaths": true,
  "bookRevision": "workbook:loadedAt",
  "invalidate": false
}
```

Notes:

- On Vercel, prefer `includePaths` only when the UI needs the table (summary can skip).  
- `maxDuration` on the route is capped for serverless.  
- Response: `initial` / `current`, optional `asOfLastObservation`, `checkingDate`.  
- **Always hydrate** schedule dates on the client after JSON.

## UI behaviour

| Surface | Behaviour |
|---------|-----------|
| `/probability` | Schedule above specs; Initial + Current KPIs; no path table |
| `/initial-probability` | Inline progress → schedule + path table |
| `/current-probability` | Same with Current mode |
| Exports | Primary-grade Excel/PDF via `lib/workbook/export-probability-screen.ts` |

## Effective Target (separate from this engine)

See [04-lifecycle-analytics-kpis.md](04-lifecycle-analytics-kpis.md) and doc 16. Uses bundled valuation history + settlement clock, not this path series.

## Debug tips

1. `resolveUnderlyingKind` must be nifty/sensex.  
2. `lastIndexDate` / series frontier should be recent.  
3. Log `presentSlotCount`, `includedCount`, `threshold`, `phaseStart`.  
4. Phase 2 Initial → Trade Date base.  
5. After fetch → hydrate before formatting dates.  
6. If frontier looks “stuck yesterday”, check 15:30 IST + Yahoo/Mongo sync.
