# 16 — Probability logic by product type (full audit)

**As of:** 2026-08-06 · Verified against `lib/product-dates.ts`, `lib/probability/engine.ts`, `lib/portfolio-observation-metrics.ts`, `lib/product-lifecycle.ts`, `lib/logic-atlas.ts`

This document is the desk’s **source of truth** for how Rollover Phase / product type changes probability. For a shorter layman tour see [12-probability-plain-english.md](12-probability-plain-english.md). For formulas only see [11-calculation-review.md](11-calculation-review.md).

---

## 1. What “product type” means here

On this desk, **product type for probability is Rollover Phase**, not coupon style or issuer.

| Desk label | Internal kind | How it usually appears on the master |
|------------|---------------|--------------------------------------|
| Blank / empty | `blank` | No Phase 1 / Phase 2 / 10 Years label |
| Phase 1 | `phase1` | Phase 1 / Phase I |
| Phase 2 | `phase2` | Phase 2 / Phase II |
| 10 Years | `tenYear` | 10 Years / 10years |

Resolver: `getRolloverPhaseKind` in `lib/product-dates.ts`.

When the same ISIN appears more than once in the merged master, **Phase 2 beats Phase 1 beats 10 Years beats Blank** (`rolloverPhaseRank` in `lib/master/new-primary-merge.ts`).

---

## 2. Layman picture (one sentence per mode)

Imagine the product has several **checkpoint dates** (master Average 1–7; desk tables label them **Observation 1–7**). At each checkpoint the index prints a level. The coupon story usually cares about the **average** of those levels versus a hurdle.

- **Initial Probability** asks: *If this deal had started on every trading day since 2001, with the real spacing of checkpoints from the deal’s start, and a slightly padded start level, how often would the average have beaten Target versus Entry?*
- **Current Probability** asks: *Using the spacing from today’s checking date to those same checkpoints, with no start cushion, how often would history have beaten Target versus today’s index mark?*
- **Effective Target** asks something different: *Given which checkpoints have already printed, what average level do the remaining checkpoints still need so the whole set still averages to Target?*

Rollover Phase only changes **where the deal’s clock starts** and **when the live book considers it finished**. It does **not** invent a different probability formula.

---

## 3. Phase table — Actual Start and schedule end

| Phase | Actual Start (`getWorkingAllotmentDate`) | Phase end for lifecycle / expiry (`getPhaseScheduleEndDate`) | Fallback if end missing |
|-------|------------------------------------------|--------------------------------------------------------------|-------------------------|
| **Blank** | Allotment Date, else Trade Date | Maturity Date | — |
| **Phase 1** | Allotment Date, else Trade Date | POED, but only if POED ≥ Last Observation | Maturity |
| **Phase 2** | **Trade Date only** (Allotment is ignored for start) | Maturity Date | — |
| **10 Years** | Allotment Date, else Trade Date | Rollover C/P Date | Maturity |

**Important:** Probability **day offsets** do not use phase end. They use Average 1–7 versus:

| Mode | Offset base |
|------|-------------|
| Initial | Actual Start (table above) |
| Current | Checking / valuation date (`lib/probability/as-of.ts`) |

---

## 4. What changes by phase inside Initial Probability

Same engine (`runProbabilityBacktest`, `mode: "initial"`). Only the schedule base moves.

### Blank / Phase 1 / 10 Years

1. Take Allotment (or Trade if Allotment blank).  
2. Count calendar days from that date to each filled Average 1–7 date.  
3. For every trading day from **2001-01-01** to the series frontier, pretend the deal started that day.  
4. Project observations forward by those day counts.  
5. Look up the **prior trading close** for each projected date.  
6. Build **Start Level** = path close × bump, then ceiling to next 100:
   - Nifty × **1.01**
   - Sensex × **1.006**
7. Performance = average obs level ÷ Start Level − 1.  
8. Success if performance ≥ **Target ÷ Entry − 1**.  
9. Probability = successes ÷ included paths.

### Phase 2 (the special case Ops feel most)

Identical math, but step 1 uses **Trade Date**, not Allotment. That shortens or lengthens every Initial day offset versus a Blank deal with the same Average dates.

### What does *not* change by phase

- Start bump percentages  
- Target / Entry threshold formula  
- Series floor 2001-01-01  
- Inclusion / frontier trimming rules  
- Nifty-or-Sensex-only gate for path runs  

---

## 5. What changes by phase inside Current Probability

Almost nothing about phase. Current always:

1. Locks checking date (if last observation is already settled as of the requested date, checking date freezes to that last obs day).  
2. Builds day offsets from **checking date → each present Average date** (past slots can be 0 or negative). **Observation Schedule** keeps every present slot.  
3. **Path table** still shows every present slot; passed slots (`days ≤ 0`) render as **ALREADY PASSED** / **—** and are **not** averaged.  
4. Uses **raw path-start close** (no Start Level).  
5. Performance = average of **remaining** obs levels ÷ path close − 1.  
6. Success if performance ≥ **Effective Target ÷ today mark − 1** (falls back to master Target ÷ today when nothing has settled yet).  
7. Today mark = desk mark (prev session before 15:30 IST, today after close), else series close on the checking date.  
8. Path frontier = latest series trading bar ≥ MAX(projected **remaining** obs dates). Path-Taken-No rows past the Yes frontier are kept for the **Excluded** filter; the last Yes final obs lands on/near the latest series session. Default filter is **All**. Probability uses Yes only.

Phase still matters indirectly because **only live-book products** appear in pickers, and live-book uses phase end + last-observation settlement.

**Intentional desk override vs raw NSP Backtesting:** Excel Backtesting still projects every Average offset (including negative) into `AVERAGEIF` and hurdles with master Target / today (`Probability!D33`). This desk averages remaining slots only and hurdles with Effective Target when fixings have settled — per product ops rules. With settled fixings, desk **Target Underlying** defaults to **Effective Target ÷ Entry − 1** (Excel `D22` stays Target÷Entry−1).

---

## 6. Effective Target (not a path engine)

`computeObservationScheduleMetrics` in `lib/portfolio-observation-metrics.ts`:

\[
\text{Effective Target} = \frac{(\text{Total Obs} \times \text{Target Level}) - \sum \text{passed levels}}{\text{Remaining Obs}}
\]

| Piece | Rule |
|-------|------|
| Total Obs | Count of unique present Average dates |
| Passed | Settled through NSE cash close (`isObservationFixingSettled`; same-day waits until 15:30 IST) |
| Remaining | Total − Passed |
| Levels | Bundled Nifty/Sensex valuation history (or custom underlying helper) — **not** the Gift CSV + Mongo path series |
| Blank result | Missing Target, Remaining ≤ 0, or any passed date missing a positive level |

Shown on the lifecycle intelligence table; independent of Initial / Current path KPIs.

---

## 7. Underlying types

| Underlying | Initial / Current path engines | Effective Target / lifecycle levels |
|------------|--------------------------------|-------------------------------------|
| Nifty | Yes | Yes |
| Sensex | Yes | Yes |
| Custom (stocks, gold, etc.) | **No** — API rejects | Yes, via custom history helper when available |

---

## 8. Live book filters (same for every phase)

UI pills: **Ongoing · Obs Due 3M · Obs Due 2M · Obs Due 1M**.

Excluded from every live pill:

1. Phase schedule end already past (`expired`)  
2. Last observation fixing already settled (`hasPassedFinalObservation`)  
3. Invalid / non-Primary master rows  

Obs Due nesting: **1M ⊂ 2M ⊂ 3M** (and those names also sit inside the Ongoing-eligible live set).

There is **no** Expiring 3M / 1M tab on this desk.

---

## 9. Data spine for path runs

| Layer | Role |
|-------|------|
| Gift / NSP Nifty CSV `lib/data/nifty-daily-2001.csv` | Daily Nifty from 2001 |
| Bundled Sensex JSON | Sensex leg + forward-fill onto Nifty calendar |
| Mongo `index_prices` | Overlay when enough rows exist |
| Yahoo `^NSEI` / `^BSESN` | Recent sync + live desk marks |
| Master seed `/data/master-seed.json` | Preferred product bootstrap on Vercel |
| Mongo products / local xlsx | Optional product sources locally |

`SERIES_FLOOR = "2001-01-01"`. Both legs must exist after forward-fill before a day can start a path.

---

## 10. UI / export recent behaviour (do not regress)

- Probability summary: **Observation Schedule above Product Specs**; no path table on summary.  
- Initial / Current: inline **PathLoadProgress** bar (no modal).  
- Path table default filter **All**; Path-Taken-No rows kept past Yes frontier for Excluded.  
- Lifecycle columns include **Initial Level** (renamed from Actual Entry Level), **As of Today's Date**, Trade / Allotment / Actual Start / POED / Rollover Phase / Maturity / Rollover.  
- Desk mark for prices: prev trading day until **15:30 IST**, then today.  
- Excel / PDF: Primary SP–style gold masthead, KPI tiles, disclaimer.  
- Logic Atlas Active pipeline cards carry stage detail, metrics, tags; Module Intelligence / Outputs denser.

---

## 11. Logic Atlas verification (2026-08-04)

Atlas modules were audited against the engine and corrected where copy drifted:

| Topic | Correct desk behaviour now reflected in atlas |
|-------|-----------------------------------------------|
| Offsets | Calendar days from Average dates; trading-day snap at **path lookup**, not before offsets |
| Effective Target levels | Bundled valuation history, not Gift+Mongo path series |
| Current schedule | All **present** Average slots with Remaining / Already passed status; path average uses remaining only |
| Portfolio clock | ~60s poll; advances on IST day / EOD — mark policy is separate |
| Phase end caveats | Phase 1 POED validity; 10Y Rollover fallback to Maturity |
| Bootstrap | Vercel prefers CDN seed; Mongo overlays prices/paths |
| Frontier | Latest **series** trading bar, which may lag “today” before close/sync |
| Initial vs mark | Entry + Actual Start for Initial; desk mark for Current only |

---

## 12. Key file map

| Concern | File |
|---------|------|
| Phase / Actual Start / phase end | `lib/product-dates.ts` |
| Path math | `lib/probability/engine.ts` |
| Series floor / merge | `lib/probability/index-series.ts` |
| Checking date | `lib/probability/as-of.ts` |
| API | `app/api/probability/run/route.ts` |
| Desk mark 15:30 IST | `lib/desk-mark-as-of.ts` |
| Obs settlement | `lib/observation-settlement.ts` |
| Effective Target | `lib/portfolio-observation-metrics.ts` |
| Lifecycle columns | `lib/portfolio-lifecycle-columns.ts` |
| Lifecycle tabs | `lib/product-lifecycle.ts` |
| Logic Atlas copy | `lib/logic-atlas.ts` |
| Probability UI | `components/dashboard/probability-dashboard.tsx` |

---

## 13. Verify after changes

```powershell
npm run verify:probability-desk
npm run verify:phase-logic
npm run verify:rollover-phase
npm run verify:effective-target
```
