# 11 — Calculation review (Initial / Current / Effective Target)

Full product-type narrative: [16-product-type-probability-logic.md](16-product-type-probability-logic.md).  
Engine wiring: [06-probability-path-engine.md](06-probability-path-engine.md).  
Excel sheet map: [02-probability-excel-parity.md](02-probability-excel-parity.md).

## Shared inputs

| Input | Source |
|-------|--------|
| Average 1–7 dates | Master product row |
| Target Level | Master |
| Entry / Initial Level | `getProbabilityEntryLevel` / lifecycle **Initial Level** column |
| Actual Start | `getWorkingAllotmentDate` by Rollover Phase |
| Index series | Gift nifty CSV + Sensex fill + Mongo overlay from `2001-01-01` |
| Desk mark | `lib/desk-mark-as-of.ts` — prev close before 15:30 IST, today after |

## Initial Probability

| Step | Formula / rule |
|------|----------------|
| Base date | Actual Start (Phase 2 = Trade; else Allotment else Trade) |
| Day offset \(d_i\) | `calendarDays(Average_i, base)` for present slots |
| Path start close \(C\) | Series close on path day |
| Start Level \(S\) | `ceil(C × bump / 100) × 100` · Nifty bump 1.01 · Sensex bump 1.006 |
| Simulated obs date | Path start + \(d_i\) days, then prior trading bar |
| Avg level \(A\) | Mean of present obs levels |
| Performance | \(A / S - 1\) |
| Hurdle | \(T / E - 1\) (Target Underlying) |
| Success | Performance ≥ hurdle |
| Probability | Successes / Included |

Included = all present slots resolved **and** series covers the last simulated observation for that path. Frontier stops when the next path would need bars beyond series end.

## Current Probability

| Step | Formula / rule |
|------|----------------|
| Base date | Checking date (valuation date, or locked to final obs if already settled) |
| Day offset \(d_i\) | `calendarDays(Observation_i, checkingDate)` for **all present** slots (schedule card) |
| Path average slots | Only remaining (`daysFromBase > 0`); passed → `ALREADY PASSED` / `—` placeholders |
| Path start close \(C\) | Series close on path day |
| Start Level | **None** |
| Avg level \(A\) | Mean of **remaining** obs levels only |
| Hurdle level | Effective Target when fixings settled, else master Target \(T\) |
| Performance | \(A / C - 1\) |
| Hurdle % | \(\text{hurdle} / M - 1\) (Required Underlying) |
| Mark \(M\) | Request levels (desk mark) else series on checking date |
| Path offsets | Excel `obs − checking` when series ≥ checking date; else remaining offsets from latest series session |
| Frontier | Latest series bar ≥ MAX(projected remaining obs); last Yes final obs lands on that session |
| Success / Probability | Same structure as Initial |

## Effective Target (lifecycle + Current hurdle)

\[
ET = \frac{N \cdot T - \sum_{passed} L_j}{N - P}
\]

| Symbol | Meaning |
|--------|---------|
| \(N\) | Total present observation dates |
| \(P\) | Passed / settled count |
| \(T\) | Target Level |
| \(L_j\) | Level on settled observation date (path series for Current; bundled history on lifecycle) |

Null when \(T\) missing, remaining ≤ 0, or any passed level missing.

Settlement: past calendar days settled; **same day** settles only after **15:30 IST**.

### Desk Target Underlying override

On Probability / Initial / Current inputs, **Target Underlying** is editable (percent points).

| Case | Meaning of the % | Working Target Level |
|------|------------------|----------------------|
| Initial / Summary / Current with 0 passed | Target ÷ Entry − 1 | \(T = E \times (1 + \text{pct})\) |
| Current with ≥1 settled fixing | **Effective Target ÷ Entry − 1** (default) | Back-solve \(T = (\text{ET}\times R + \Sigma P)/N\) so ET = \(E\times(1+\text{pct})\) |

Effective Target stays a **read-only** display when ≥1 fixing has settled. Schedule / frontier / ceiling formulas are otherwise unchanged. Excel `Probability!D22` stays Target÷Entry−1 — the ET÷Entry default is a desk UX rule for Current Prob.

## Phase impact cheat sheet

| Phase | Changes Initial base? | Changes Current formula? | Changes Effective Target formula? | Changes live-book end date? |
|-------|----------------------|---------------------------|-----------------------------------|-----------------------------|
| Blank | Allotment/Trade | No | No | Maturity |
| Phase 1 | Allotment/Trade | No | No | POED if valid else Maturity |
| Phase 2 | **Trade only** | No | No | Maturity |
| 10 Years | Allotment/Trade | No | No | Rollover else Maturity |

## Worked intuition

Suppose Target = 22,000 and Entry = 20,000:

- Initial hurdle = 22,000/20,000 − 1 = **10%**.  
- A path with Start Level 20,200 and average obs 22,500 → performance ≈ 11.4% → **success**.

If today’s mark is 21,000 and no fixings have settled yet:

- Current hurdle = 22,000/21,000 − 1 ≈ **4.76%**.  
- Same average vs raw path closes is judged against that bar.

If 3 of 6 obs have printed at 21,000, 21,500, 22,000 and Target is 22,000:

- Sum passed = 64,500; Total×Target = 132,000; Remaining = 3  
- ET = (132,000 − 64,500) / 3 = **22,500** remaining average needed.  
- Current % Required then uses **22,500 ÷ today’s mark − 1**, and path averages use the three remaining slots only.

## Regression gates

```powershell
npm run verify:probability
npm run verify:nsp-excel
npm run verify:series-floor
npm run verify:effective-target
npm run verify:obs-settlement
npm run verify:phase-logic
npm run verify:probability-desk
```
