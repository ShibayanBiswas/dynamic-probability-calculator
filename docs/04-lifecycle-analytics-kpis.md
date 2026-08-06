# 04 — Lifecycle, analytics & KPIs

**Updated:** 2026-08-04

## UI lifecycle pills

`lib/product-lifecycle.ts` → `UI_LIFECYCLE_FILTERS`:

| Filter | Meaning |
|--------|---------|
| Ongoing | Live book — phase end still ahead **and** last observation has **not** settled yet |
| Observation in 3 / 2 / 1 months | Any upcoming Average date within 90 / 60 / 30 days (same live-observation gate) |

Nesting: **Obs Due 1M ⊂ 2M ⊂ 3M ⊂ Ongoing-eligible live set**.

**Expired never appears.** Internally `filterProductsByLifecycle(..., "expired")` returns `[]`.

**No Expiring 3M / 1M tabs** — near-maturity products stay in Ongoing (and on Obs-due when a fixing is due).

**Past-final observation:** once the last Average fixing has settled (`hasPassedFinalObservation` / `isLiveObservationBookProduct`), the product is excluded from **all** Ongoing / Obs-due pills — even if maturity/POED is still in the future.

Picker pool ≡ filter pool: `getLifecyclePickerPool`. Shared across Home, Probability, Initial, Current, Analytics.

## Phase schedule SSOT

`lib/product-dates.ts` (same intent as Primary SP):

| Rollover Phase | Actual Start (Initial offsets) | Schedule end (lifecycle / expiry) |
|----------------|--------------------------------|-----------------------------------|
| Blank | Allotment, else Trade | Maturity |
| Phase 1 | Allotment, else Trade | POED if ≥ Last Observation, else Maturity |
| Phase 2 | **Trade Date** | Maturity |
| 10 Years | Allotment, else Trade | Rollover C/P if present, else Maturity |

Full probability impact: [16-product-type-probability-logic.md](16-product-type-probability-logic.md).

### Two different “Days Left” concepts

| Surface | Meaning |
|---------|---------|
| Lifecycle table Days Left | Days to **phase schedule end** |
| Probability KPI Days Left | Days to **last observation** |

Do not mix them when debugging.

## Home KPI band

Live Notional, Ongoing, Obs Due 3M/2M/1M.  
No Expired tile. No Expiring 3M/1M tiles. May horizontal-scroll when denser (`.kpi-band-scroll`).

Live Notional = sum of merged-master trade amounts (dash until bootstrap ready).  
Lifecycle tab AUM = deduped desk-canonical rows.

## Desk mark / As of Today's Date

`lib/desk-mark-as-of.ts` + market helpers:

- Before **15:30 IST** → previous trading-day close  
- After cash close → today’s bar when present  

Lifecycle register shows **As of Today's Date** for the mark used. Portfolio probabilities warm against that mark.

## Lifecycle table columns (probability desk)

Key fields in `lib/portfolio-lifecycle-columns.ts` include:

- Identity / issuer / underlying / notional  
- **Initial Level** (formerly “Actual Entry Level”)  
- **Observation 1–7** date columns (master Average fields; desk label Observation)  
- Target Level, Effective Target, Observation Levels 1–7  
- Total / Passed / Remaining Obs  
- Initial Probability, Current Probability  
- **As of Today's Date**  
- Trade Date, Allotment Date, **Actual Start**, POED, Rollover Phase, Maturity Date, Rollover Date  
- Days / Tenure / Years to phase end  

Verify headers: `npm run verify:exports` (screen export parity).

## Effective Target

```
ET = (TotalObs × Target − Σ passed levels) / RemainingObs
```

| Rule | Detail |
|------|--------|
| Passed | Settled after NSE cash close on that IST day (`lib/observation-settlement.ts`) |
| Levels | Bundled Nifty/Sensex valuation history or custom helper — **not** Gift+Mongo path series |
| Blank | Missing Target, Remaining ≤ 0, or missing passed level |

`npm run verify:effective-target` · `npm run verify:obs-settlement`

## Portfolio Analytics Lab

`/portfolio/analytics` — ScienceLab charts on the **same lifecycle tab** as Home:

- Lifecycle universe pie  
- Coupon / protection / underlying / issuer / tenor distributions  
- KPI band parity with Home  
- Weighting by AUM  

## Probability columns warm path

`useLazyPortfolioProbabilities` → batch `POST /api/probability/run` with `includePaths: false`. Soft cap per warm cycle (see hook). Invalidates when valuation date or book revision changes.

## Logic Atlas lifecycle claims

Atlas Lifecycle Filter / Portfolio Clock copy was corrected 2026-08-04 to match: ~60s poll, IST day/EOD advance, separate desk-mark policy, Phase 1/10Y end fallbacks. See doc 16 §11.
