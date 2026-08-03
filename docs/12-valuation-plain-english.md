# Valuation Logic — Complete Guide

> **For:** Relationship managers, ops, and anyone who does not live in Excel formulas.  
> **Technical deep-dive:** [02-valuation-excel-parity.md](02-valuation-excel-parity.md) · [11-calculation-review.md](11-calculation-review.md)  
> **Last updated:** 02-Aug-2026 (Jun-26 Logic sheet · avg-lock expected Nifty · Working!V 11% discount · wind-up board)  
> **Close-out:** [13-windup-verification.md](13-windup-verification.md)

---

## What the desk answers

> *“If we marked this structured product on the chosen date, what is each debenture worth, and what return has the client earned?”*

Three inputs from master drive everything:

1. **Payoff formula** — IF bands, coupons, protection (`formulaText`)
2. **Fixings & schedule** — initial fixing, target level, observation dates 1–7
3. **Calendar anchors** — allotment/trade, maturity, POED, rollover C/P (Rollover Phase)

---

## Rollover Phase tenure (valuation window)

| Phase | Valuation start (Working!F) | Schedule end | Tenure used for growth / IRR |
|-------|-----------------------------|--------------|------------------------------|
| **Blank** | Allotment | Maturity | Allotment → Maturity |
| **Phase 1** | Allotment | POED (fallback Maturity) | Allotment → POED |
| **Phase 2** | **Trade Date** | Maturity | Trade → Maturity |
| **10 Years** | Allotment | Rollover C/P | Allotment → Rollover |

Live Working!H (the tenor used to turn Coupon Formed **S** into Product IRR **T**, then grow price/debenture to the valuation date) is this same schedule end — not the longer calendar Maturity on 10Y / Phase 1 rows when POED or Rollover C/P applies.

Valuation is blocked before phase start (“Not yet started” in Quick Analytics) and after phase end.

## Complete pipeline (Steps A → E)

This is the exact chain in `computeValuation()` — verified via `npm run verify:valuation-pipeline`.

```
INPUTS (master)
        ↓
STEP A — Index at valuation date
        ↓
STEP B — Obs-aware underlying path (Logic I/II → N → O → Z)
        ↓
STEP C — Full coupon check (projected or realised)
        ↓
STEP D — Coupon Formed (S)
        ↓
STEP E — Debenture price today (Working!V grow / 11% discount → X)
        ↓
OUTPUTS — Value, Abs Return, Product IRR, Coupon Formed, Total Amount
```

### Step A — Index / underlying at valuation date

| Book | Valuation date | Level source |
|------|----------------|--------------|
| **Ongoing, today** | Desk today | Live Yahoo Nifty/Sensex (`useMarketSync`) |
| **Ongoing, historical** | Any past date ≥ phase start | `resolveIndexLevelsForDate` → API / bundled history |
| **Expired · Nifty/Sensex** | Selected observation date | Historical index close on that date — never live Yahoo |
| **Expired · stock/commodity** | Selected observation date | Dedicated series (Yahoo NSE closes or labelled gold/silver estimate) — **never** Nifty |

Files: `lib/market-index-at-date.ts`, `lib/underlying-benchmark.ts`, `lib/custom-underlying-history.ts`, `lib/hooks/use-index-at-date.ts`, `lib/desk-index-guards.ts`, `lib/market-data.ts`.

Valuation is **blocked** until the product’s linked underlying has a positive level.

### Step B — Obs-average underlying path (`resolveValuationExpectedLevel`)

**Anchor:** **last** scheduled observation. Live desk marks use the obs-average path below. Excel Mode B desk-row replay still uses classic Working!N (`computeExpectedUnderlyingLevel`).

| Obs state | Expected underlying **N** | Performance **O** (→ **Z**) |
|-----------|---------------------------|-------------------------------|
| **No obs yet** | Annualise entry→spot from Working!F→val; extrapolate to **second-last** obs | `N/K − 1` (or spot `M/K − 1` if `"NA"`) |
| **≥1 obs passed** | Average of **realised** observation levels (expected Nifty at maturity) | `N/K − 1` |
| **Past last obs** | Same average of all realised fixings (coupon path locked) | `N/K − 1` |

Source: Logic sheet in *Primary Structured Products Valuation* (Jun-26). Future observation slots still appear on the Observation Dates table as blank / “Yet to come”.

**Underlying IRR** (entry → val date from Working!F) is used for lifecycle display and for the **no-obs** extrapolation — not for growing debenture price in Step E. Phase 2 measures from **Trade Date**; other phases from **Allotment**.

### Step C — Full coupon check

| Timing | Rule | Function |
|--------|------|----------|
| **Before last obs** | Locked/projected index path ≥ target **or** formula flat-coupon band | `qualifiesForProjectedFullCoupon()` |
| **After last obs** | Average of realised index levels at all elapsed fixings > target | `qualifiesForFullCoupon()` |

Combined gate: `qualifiesForAnyFullCoupon()`.

### Step D — Coupon Formed (S)

- Evaluate the payoff formula at Working **O** / **Z** when it evaluates (same engine as the Payoff Scenarios table)
- Headline coupon from master (`CC1:` / first `%` token) **only if** the formula cannot evaluate
- Never replace a valid formula result with headline — upside-decay / `CC2` bands must keep the formula payoff
- **After last obs:** coupon / IRR / related metrics are **locked**; value uses Working!V discount (not Y compounding)

### Step E — Today's debenture price (V → X)

Working!V / Logic sheet I.4 (`computeWorkingFinalValuation`) — phase end **H** is Blank Maturity · Phase 1 POED · Phase 2 Maturity · 10Y Rollover:

| Last obs vs val | Phase end vs val | Quote |
|-----------------|------------------|-------|
| Still ahead | — | Grow **U** by product IRR **T** from allotment → val date |
| Done | Still ahead | Maturity payoff **U·(1+S)** discounted @ **11%** for remaining tenure to phase end |
| Done | Done | **U·(1+S)** realised payoff |

**Floor:** `X = max(V, U)` — never below initial investment.

### Outputs

| Metric | Formula | Notes |
|--------|---------|-------|
| **Current Value** | Rounded **X** | Per debenture |
| **Absolute Return** | `X/U − 1` | PV vs investment |
| **Product IRR** | `irrFromReturn(S, phaseTenor)` | Annualises **Coupon Formed** over phase life (Working!F → schedule end) — same basis as payoff XIRR. Mode B Excel replay still uses Working!Y. |
| **Underlying IRR** | `(M/K)^(365/elapsed) − 1` | Same Working!F start; same-day → **0%** |
| **Coupon Formed** | **S** from Step D | Can differ from abs return while obs ahead |
| **Total Amount** | `X × debentures` | |

---

## Ongoing historical valuation

Pick any past date on an ongoing product:

1. Step A loads **that day’s** Nifty/Sensex (not today’s live level)
2. Step B applies the Logic-sheet obs path for that date (avg lock or second-last extrap)
3. Steps C–E produce mark, abs return, IRR for **that** date
4. Products not yet started at that date show **Not yet started** in Quick Analytics Excel

Verified via `verify:valuation-pipeline` (historical mark count varies with book and calendar).

---

## Expired book

- Default mark = selected **observation date** with historical index on that date
- Same pipeline at **each** observation date and at maturity/rollover anchor
- Past last obs: average of all fixings locks Z/coupon/IRR; Working!V discounts U·(1+S) @ 11% until phase end
- Expired pool size moves with calendar day — re-run `verify:valuation-pipeline` for current tallies

---

## Payoff scenario XIRR (separate from valuation)

Payoff table XIRR uses `resolvePayoffScenarioTenorDays()` / `getPhasePayoffTenorDays()`:


| Rollover Phase | Payoff XIRR / calculation tenor |
|----------------|------------------------------|
| **Blank** | Allotment → Maturity |
| **Phase 1** | Allotment → POED |
| **Phase 2** | **Trade → Maturity** |
| **10 Years** | Allotment → Rollover C/P |

Verified: **74,718** scenario rows (`verify:payoff-xirr`) · **4,151/4,151** Product IRR ↔ XIRR parity (`verify:irr-phase-tenure`).

---

## Screen labels

| Label | Meaning |
|-------|---------|
| **Current Value** | Mark-to-market per debenture |
| **Absolute Return** | `X/U − 1` |
| **Coupon Formed** | Payoff **S** on projected/realised path |
| **Product IRR** | Annualised Coupon Formed to maturity / POED / rollover (phase tenure) |
| **Total Amount** | Value × debenture count |
| **Expiration Date** | Lifecycle anchor (rollover C/P for 10Y, else maturity). **Maturity Date** shown only when it differs. |

---

## Downloads (Excel & PDF)

**Valuation Summary** KPI band matches on-screen `KpiBand`:

| Tile | Source |
|------|--------|
| Current Value | `formatProductUnitValue(productValue)` |
| Absolute Return | `formatPercent(absReturn)` |
| Coupon Formed | `formatFormulaReturn(formulaReturn)` |
| Product IRR | `formatPercent(productIrr)` |
| Total Amount | `formatCurrency(totalAmount, false)` |

**Excel layout (Jul-2026 fix):** two-row tiles per KPI pair — label row (small caps, gray) + value row (bold maroon, 14pt) on uniform gold background. Section title: **VALUATION SUMMARY**. Product Specifications remain plain white.

**Payoff plot:** same `buildPayoffCurve()` as on-screen chart — embedded in Excel and PDF exports.

---

## Verification commands

```bash
npm run verify:valuation-pipeline  # Steps A–E replay — full book
npm run verify:lifecycle-full      # All ongoing + expired marks
npm run verify:all-metrics         # Value, abs, IRR, coupon — 4585 products
npm run verify:full-coupon         # Extrapolation vs full coupon gates
npm run verify:payoff-xirr         # Scenario XIRR tenor — 72954 rows
npm run verify:phase-logic         # Blank/P1/P2/10Y payoff + marks — full book
npm run verify:irr-phase-tenure     # Product IRR ↔ scenario XIRR — 4151/4151
npm run verify:coupon-formula      # Coupon Formed === payoff formula
npm run verify:rollover-phase      # Working!F / schedule end / payoff tenor SSOT
npm run verify:31jul-nav           # 31-Jul NAV vs Logic path
npm run verify:asof-levels         # Desk today vs 31-Jul index split
npm run verify:effective-target    # Effective Target full ongoing book
npm run verify:expired-phase       # Expired Blank/P1/P2 tenure + phase-end marks
npm run verify:seamlessness        # Tab defaults, calendars, expired menus
npm run verify:valuation           # Excel Working row replay (Mode B — see valuation-audit artifact)
npm run verify:exports             # Export payload parity + KPI structure
```

**Snapshot (02-Aug-2026 wind-up):** Desk-canonical **4,179** (≈4,151 formulas) · Payoff XIRR **74,718** rows · Product IRR ↔ XIRR **4,151/4,151** · Logic lock **1,822/1,822** · 31-Jul NAV **99.26%** · Effective Target **2,324/2,324** · Phase logic **PASS** — see [13-windup-verification.md](13-windup-verification.md).

---

## Dynamic / seamless behaviour

| Feature | Behaviour |
|---------|-----------|
| **Master upload** | Formulas live immediately; saved to IndexedDB |
| **Reload** | Browser upload restored if newer than baked seed |
| **Live Notional KPI** | From uploaded Primary tab notional → desk AUM → manifest fallback |
| **Market levels** | Yahoo with soft ~5s commit; localStorage restore on reload; bundled fallback if offline; Refresh forces immediate update |
| **Lifecycle clock** | Portfolio `asOf` drives expired vs ongoing consistently |
| **MTM cache** | Invalidates on book change (`dataset.loadedAt`) |

See [seamless-qa-report.md](seamless-qa-report.md) · [01-architecture.md](01-architecture.md).

---

## FAQ

**Why Coupon Formed ≠ Absolute Return?**  
Coupon Formed is formula output on projected path to last obs. Absolute Return is today's PV mark.

**Why Live Notional ≠ tab AUM?**  
Live Notional = Primary master tab total. Tab AUM = deduped desk-canonical book.

**Excel vs desk observation anchor?**  
May-26 Working used 2nd-last obs. Live desk uses **last** obs by product-owner spec (Mode B parity unchanged).
