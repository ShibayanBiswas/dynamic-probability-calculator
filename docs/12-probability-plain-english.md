# 12 — Probability plain English

## What this desk answers

For a live Primary structured product linked to Nifty or Sensex:

> How often, in daily history, would the average of the observation fixings have cleared the coupon hurdle?

Two views:

1. **Initial Probability** — as if you started at the product’s real start (allotment or trade date by phase), with a slightly higher “start level” cushion.  
2. **Current Probability** — as if you start from today’s index level (or the level on the date you pick).

## How to use the screens

1. Pick a lifecycle tab (Ongoing, Observation due). Expired deals are hidden. Products whose **last observation has already settled** are also excluded from every live tab on this desk.  
2. Search by name / ISIN.  
3. Set the valuation date if you are not using today. Index levels fill in automatically.  
4. Read the probability KPIs.  
5. On Initial / Current tabs, read the observation schedule, then scroll the path table (each row is one historical starting day).

## Reading the schedule

- **Dates** = observation dates from the master.  
- **Days** on Initial = days from the product’s actual start to each observation.  
- **Days** on Current = days from your selected valuation date to each observation.

## Reading the path table

- **Start** = historical day the path begins.  
- **Underlying Closing Level** = index close that day.  
- **Start Level** (Initial only) = rounded-up entry cushion.  
- **Average Date / Level** = where each observation would have landed on that path.  
- **Average Underlying Level** = mean of those levels.  
- **Underlying Performance** = how that average compares to the start reference.  
- **Path Taken** = Yes if history still covers the full observation set for that path.

The last Yes path is designed so its final observation lands on the latest trading day available.

## After the last observation has passed

Those products leave the Ongoing / Obs-due books entirely on this web app.  
If you still open one via a deep link or frozen as-of view, numbers lock **as of that last observation date**. You still see product specifications, coupon, a payoff shape plot, and the observation level table — not long product stories, scenario grids, or IRR valuations.

## Downloads

Use **Download Excel** / **Download PDF** on the probability pages for a branded pack of KPIs, specs, schedules, and (when present) path samples.

## When something looks wrong

1. Confirm the product is Nifty or Sensex.  
2. Confirm observation dates exist on the master row.  
3. Try another valuation date or refresh market levels.  
4. Ask an engineer to run `npm run verify:probability-desk` — see [08-debug-playbook.md](08-debug-playbook.md).
