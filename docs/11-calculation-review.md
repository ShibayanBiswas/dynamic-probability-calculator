# 11 — Calculation review (probability)

Engineer-facing math audit. Layman companion: [12-probability-plain-english.md](12-probability-plain-english.md).

## A. Eligibility

1. Resolve by ISIN.  
2. Underlying ∈ {nifty, sensex}.  
3. UI pools exclude expired phase-end products.

## B. Checking date

```
requested = parse(valuationDate) ?? today
checking = getProbabilityCheckingDate(product, requested)
# if final obs settled → startOfDay(finalObs)
```

## C. Initial probability

1. `phaseStart = getWorkingAllotmentDate(product, checking)`  
2. Schedule days from `phaseStart`  
3. Threshold = `target/entry − 1`  
4. Each historical day as path start:  
   - Start Level = ceiling(close × 1.01|1.006, 100)  
   - Project obs by day offsets; prior closes  
   - Avg iff all present slots filled  
   - Perf = avg/startLevel − 1  
   - Include while last series date covers path’s last obs  
5. Prob = successes / included  

## D. Current probability

1. Schedule from `checking`  
2. Threshold = `target/todayLevel − 1`  
3. Same loop without Start Level; perf = avg/close − 1  
4. Past final → do not pass live levels  

## E. Summary surface

Initial + Current probs, Target Underlying, Required Underlying, Days Left to last obs, checking date, levels, obs date strip.

## F. Lifecycle DATA metrics

Days Left / Tenor Left / Years use **phase end**.  
Effective Target uses settled obs levels only.

## G. Intentional Excel deltas

| Topic | Excel | Desk |
|-------|-------|------|
| Initial day base | Allotment | Phase start |
| Initial frontier | Allotment ≥ MAX(Avg1–6) | Latest trade day ≥ MAX(all present) |
| Headers | Nifty / To be taken / (1%) | Layman, no `()` |

## H. Regression

```powershell
npm run verify:probability
npm run verify:effective-target
npm run verify:obs-settlement
npm run verify:exports
npm run bench:probability
```

## I. Performance

`bench:probability` should stay ~ms per product for summary on warm series. Path-inclusive runs are heavier — only Initial/Current detail surfaces request paths.
