# 02 — Probability Excel parity

Reference workbook (local, gitignored): `NSP's under Risk.xlsm`

| Sheet | Desk surface |
|-------|----------------|
| **Data** | Lifecycle / portfolio yellow columns |
| **Probability** | `/probability` summary |
| **Initial Prob** | `/initial-probability` |
| **Backtesting** | `/current-probability` |

Code SSOT: `lib/probability/engine.ts`, `docs/15-requirements-fulfillment.md`.

---

## DATA sheet → lifecycle table

Implemented in `lib/portfolio-lifecycle-columns.ts` (35 columns live):

`No.`, `Status`, `Product Name`, `Initial Prob`, `Current Prob`, `Series`, `Tenor`, `Allotment Date`, `Actual Entry Level`, `Target Level`, `Average 1`…`7`, `Amount`, `Maturity`, `ISIN`, `Days Left`, `Tenor Left`, `Years`, `Underlying`, plus Observation Levels / counts / Effective Target.

| Excel nuance | Desk behaviour |
|--------------|----------------|
| Target Nifty | Header **Target Level** |
| Amount | Shown in ₹ Cr |
| Days Left / Tenor / Years | Phase schedule end vs as-of (Primary SP SSOT), not raw Excel shortcuts |
| Probabilities | Computed via `/api/probability/run`, not stored on master |

---

## Probability sheet → summary KPIs

| Excel idea | Implementation |
|------------|----------------|
| Initial Prob | `initialResult.probability` |
| Current Prob | `currentResult.probability` |
| Target % | `target/entry − 1` → UI **Target Underlying** (`targetUnderlying()`) |
| % Required | `target/todayLevel − 1` → UI **Required Underlying** (`requiredUnderlying()`) |
| Days Left | `daysLeftToLastObservation` from checking date |
| Checking date / levels | Inputs + results panel; clamps after final obs |

---

## Initial Prob sheet

### Schedule

```
Average | 1 … N present slots
Dates   | master Average 1 / Avg. 2–7
Days    | calendarDays(obs, phaseStart)
```

`phaseStart = getWorkingAllotmentDate(product)`  
- Phase 2 → **Trade Date**  
- Blank / Phase 1 / 10 Years → **Allotment**

UI label: **Days from Phase Start**.

**Excel** used allotment always (`Probability!D16`). Desk uses phase start intentionally (Primary SP tenure rules).

### Path table — layman headers (no parentheses)

| Excel | Desk |
|-------|------|
| Start | Start |
| Nifty Closing | Underlying Closing Level |
| Start Level (1%) | Start Level |
| Avg n / Avg n Nifty | Average Date n / Average Level n |
| Avg Nifty | Average Underlying Level |
| Nifty Performance | Underlying Performance |
| To be taken | Path Taken |

### Formulas

- Start Level = `CEILING.MATH(close × factor, 100)`  
  - Nifty **1.01** · Sensex **1.006**
- Performance = `avg / startLevel − 1`
- Blank slots skipped
- Average requires full coverage of present slots
- Include while `lastIndexTime ≥ maxObsTime`; frontier stops when next path needs bars beyond series end

### Intentional Excel deltas

1. Frontier = **latest trading day** (not allotment cutoff).  
2. MAX over **all present** observation slots (Excel Initial used Avg1–6 only in one MAX).  
3. Cleaned headers.

---

## Backtesting sheet → Current Probability

- Days = `obs − valuation/checking date`  
- No Start Level column  
- Performance = `avg / pathStartClose − 1`  
- Threshold = `target / todayLevel − 1` (live levels or prior close on checking date)  
- Same frontier rule as Initial  

UI label: **Days from Valuation Date**.

---

## Past final observation

`lib/probability/as-of.ts`:

- When final obs is settled → checking date = last obs day  
- Drop live levels so Current uses historical close  
- UI: `PastFinalObservationPanels` — specs, coupon, payoff plot, obs table  
- Omit: narrative, scenarios, IRR valuation blocks  

---

## Gift AIF reference

Daily path starts = every trading day in the market calendar.  
DPC iterates every bar in the merged index series the same way (`engine.ts` loop).

---

## Verification

```powershell
npm run verify:probability
npm run verify:nsp-excel
npm run bench:probability
npm run verify:probability-desk
```

`scripts/verify-probability-parity.ts` — ceilings, thresholds, inclusion rules.  
`scripts/verify-nsp-excel-parity.ts` — live compare vs `NSP's under Risk.xlsm` (Nifty Accelerator - 1669) + Mongo from 2001.
