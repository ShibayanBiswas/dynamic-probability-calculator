# 12 — Probability plain English

**Companion deep dive:** [16-product-type-probability-logic.md](16-product-type-probability-logic.md)

## What this desk answers

For a **live Primary** structured product linked to **Nifty** or **Sensex**:

> Looking at every trading day since early 2001, how often would the average of this deal’s observation fixings have cleared the coupon hurdle?

Two different “cameras”:

1. **Initial Probability** — camera at the deal’s **real start** (Allotment or Trade, depending on Rollover Phase), with a slightly **higher padded start level**.  
2. **Current Probability** — camera at the **checking / valuation date** (usually today), with **no pad**, measuring against **today’s index mark**.

A third number on the lifecycle table is **not** a path probability:

3. **Effective Target** — “what average do the **remaining** observations still need?” after some Average dates have already printed.

## Product type in one table (Rollover Phase)

Think of Rollover Phase as the deal’s **calendar personality**. It changes the start and end of the live book — not the probability algebra itself.

| Phase | “Official start” for Initial Probability | When the live book says the phase is over |
|-------|------------------------------------------|-------------------------------------------|
| Blank | Allotment (else Trade) | Maturity |
| Phase 1 | Allotment (else Trade) | POED if it is after the last observation; otherwise Maturity |
| Phase 2 | **Trade Date** | Maturity |
| 10 Years | Allotment (else Trade) | Rollover date if present; otherwise Maturity |

**Phase 2 is the one Ops feel most:** Initial day counts run from Trade Date, so the same Average dates produce different day offsets than a Blank deal.

## How to use the screens

1. Pick a lifecycle tab: **Ongoing**, **Obs Due 3M / 2M / 1M**. Expired names are hidden. Names whose **last observation has already settled** are also hidden from every live tab.  
2. Search by name / ISIN (same pool across Probability / Initial / Current).  
3. Set the valuation date if you are not using today. Nifty / Sensex levels fill automatically from the desk mark rule.  
4. On **Probability** summary: read schedule **above** specs, then Initial / Current KPIs (no path table here).  
5. On **Initial** / **Current**: wait for the inline progress bar, then read schedule + path table.

## Desk mark (why the “today” level sometimes looks like yesterday)

Until **15:30 IST** (NSE cash close), the desk still treats the useful mark as the **previous trading day’s close**. After 15:30, it can roll to **today’s** close when available. That mark feeds **Current** % Required and settlement of same-day observations — not Initial’s Entry/Start Level math.

## Reading the schedule

- **Dates** = Average 1–7 from the master (blank slots skipped).  
- **Days on Initial** = calendar days from **Actual Start** (phase table above) to each Average date.  
- **Days on Current** = calendar days from the **checking date** to each Average date (past dates can show 0 or negative days).

Holiday handling for **levels** happens later on each path: the engine snaps to the nearest **prior trading close**. The day-count itself stays calendar-based from the stored Average date.

## Reading the path table

Each row = “pretend the path started on this historical trading day.”

| Column idea | Meaning |
|-------------|---------|
| Start | Historical path-start date |
| Underlying Closing Level | Index close that day |
| Start Level | **Initial only** — close × 1.01 (Nifty) or × 1.006 (Sensex), rounded up to next 100 |
| Average Date / Level | Where each checkpoint would have landed on that path |
| Average Underlying Level | Mean of those levels |
| Underlying Performance | Average vs Start Level (Initial) or vs raw close (Current) |
| Path Taken | Yes only while history still covers the full observation set |

Default filter is **Included**. The table stops at the frontier — you should not see a long tail of future Path-Taken-No rows.

The last Yes path is built so its final observation lands on the **latest trading bar in the loaded series** (often today after close/sync; sometimes the previous session).

## Success rules (plain words)

- **Initial success:** average path performance beats **Target Level ÷ Entry Level − 1**.  
- **Current success:** average path performance beats **Target Level ÷ today’s mark − 1**.  
- **Probability:** successful included paths ÷ all included paths.

Entry comes from Actual Entry / Entry / Initial / Initial Fixing fields — never from Target.

## Effective Target (lifecycle table)

Once some Average dates have already printed:

1. Count how many observation dates exist and how many have settled.  
2. Subtract the sum of printed levels from (Total × Target).  
3. Divide by remaining observations.

That is the **remaining hurdle average**. It can show for custom underlyings too; Initial/Current path engines cannot.

## After the last observation has passed

Those products leave Ongoing / Obs Due entirely on this web app.  
If you still open a frozen as-of view, numbers lock **as of that last observation**. You still see specs, coupon, payoff shape, and observation levels — not long narratives, scenario grids, or IRR packs.

## Downloads

**Download Excel** / **Download PDF** on probability pages produce a Primary SP–style pack: logo masthead, KPI tiles, specs, schedules, path samples when present, and disclaimer. Exports are memory-safe (no giant full-path dumps by default).

## Logic Atlas (Intelligence)

The Logic Atlas page is a **map of the same logic**, not a second calculator:

- Connected module cards = whole engines.  
- Active pipeline = stage-by-stage cards with detail, metrics, tags.  
- Module Intelligence / Outputs / Primary Portfolio Command explain what each module produces.

Atlas copy was re-verified against the engine on 2026-08-04 (see §11 in doc 16).

## When something looks wrong

1. Confirm Nifty or Sensex for path probability.  
2. Confirm Average dates and Target / Entry on the master row.  
3. For Initial Phase 2, confirm Trade Date is populated.  
4. Confirm you are not looking at a last-observation-settled name in a live tab.  
5. Try another valuation date or wait past 15:30 IST for today’s mark.  
6. Run `npm run verify:probability-desk` — see [08-debug-playbook.md](08-debug-playbook.md).
