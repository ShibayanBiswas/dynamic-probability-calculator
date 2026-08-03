# 04 — Lifecycle, analytics & KPIs

## UI lifecycle pills

`lib/product-lifecycle.ts` → `UI_LIFECYCLE_FILTERS`:

| Filter | Meaning |
|--------|---------|
| Ongoing | Live book — phase end still ahead **and** last observation has **not** settled yet |
| Observation in 3 / 2 / 1 months | Any upcoming Average date within 90 / 60 / 30 days (same live-observation gate) |

**Expired never appears.** Internally `filterProductsByLifecycle(..., "expired")` returns `[]`.  

**No Expiring 3M / 1M tabs** on this probability desk — near-maturity products stay in Ongoing (and appear on Obs-due when a fixing is due).  

**Past-final observation:** once the last Average fixing has settled (`hasPassedFinalObservation` / `isLiveObservationBookProduct`), the product is excluded from **all** Ongoing / Obs-due pills — even if maturity/POED is still in the future. Lifecycle index headline counts use the same filter.

Picker pool ≡ filter pool: `getLifecyclePickerPool`.

## Phase schedule SSOT

`lib/product-dates.ts` (same as Primary SP):

| Rollover Phase | Performance start | Schedule end |
|----------------|-------------------|--------------|
| Blank | Allotment | Maturity |
| Phase 1 | Allotment | POED → Maturity fallback |
| Phase 2 | **Trade Date** | Maturity |
| 10 Years | Allotment | Rollover C/P |

### Two different “Days Left” concepts

| Surface | Meaning |
|---------|---------|
| Lifecycle table Days Left | Days to **phase schedule end** |
| Probability KPI Days Left | Days to **last observation** |

Do not mix them when debugging.

## Home KPI band

Live Notional, Ongoing, Obs Due 3M/2M/1M.  
No Expired tile. No Expiring 3M/1M tiles. May horizontal-scroll when denser (`.kpi-band-scroll`).

## Portfolio Analytics Lab

`/portfolio/analytics` — Primary-style charts on the **live** book only.

## Effective Target

```
ET = (TotalObs × Target − Σ passed levels) / RemainingObs
```

Passed only after NSE cash close on that IST day (`lib/observation-settlement.ts`).  
`npm run verify:effective-target`.

## Probability columns on lifecycle table

Filled by `useLazyPortfolioProbabilities` → batch API `includePaths: false`. Soft cap **400** ISINs per warm cycle.
