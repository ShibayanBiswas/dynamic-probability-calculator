# Seamless QA report — valuation, payoff, edge cases

> **Auto-generated sections** in this report are refreshed by verify scripts. Authoritative close-out: [13-windup-verification.md](13-windup-verification.md) (02-Aug-2026).

Generated: 2026-07-05 · **Updated 2026-08-02** (Logic sheet path, Effective Target, 31-Jul NAV, wind-up board)

This report consolidates automated parity checks and the UX/data-quality work requested for the Primary book.

**Full calculation audit:** [11-calculation-review.md](11-calculation-review.md) · **Layman valuation:** [12-valuation-plain-english.md](12-valuation-plain-english.md) · **Wind-up:** [13-windup-verification.md](13-windup-verification.md)

## Executive summary

| Area | Status | Detail |
| --- | --- | --- |
| **Live Notional headline** | **Dynamic** | Merged master Trade Amount → desk AUM; shows **—** while bootstrap loads (no manifest fallback) |
| **Master upload persistence** | **Fixed** | IndexedDB wins on reload when newer than baked seed |
| **Market levels offline** | **Fixed** | Bundled Nifty/Sensex fallback when Yahoo fails |
| **Custom underlyings** | **PASS** | `verify:custom-underlyings` — equities Yahoo NSE; gold/silver labelled estimates; **no Nifty bluff** |
| **Valuation pipeline A→E** | **PASS** | `verify:valuation-pipeline` — ongoing@today + historical + expired@obs + maturity anchors |
| **All product metrics** | **PASS** | `verify:all-metrics` — full marked book |
| **Coupon formula parity** | **PASS** | `verify:coupon-formula` — live + expired pools |
| **Payoff input fields** | **Updated** | **Start Date** label (Working!F: Allotment for Blank / P1 / 10Y; Trade Date for Phase 2); Initial Price / Debenture from master — read-only |
| **Product IRR ↔ payoff XIRR** | **PASS** | `verify:irr-phase-tenure` — **4,151/4,151** |
| **Phase logic (Blank/P1/P2/10Y)** | **PASS** | `verify:phase-logic` · `verify:expired-phase` |
| **Post-last-obs Logic lock** | **PASS** | `verify:expired` — **1,822/1,822** → phase end U·(1+S) — **not** Working!Y compounding |
| **31-Jul NAV** | **99.26% exact** | `verify:31jul-nav` — phaseTenureBad **0**; 17 NAV-file residuals accepted |
| **Effective Target** | **PASS** | `verify:effective-target` — **2,324/2,324** |
| **Desk today vs 31-Jul** | **PASS** | `verify:asof-levels` |
| **Tenor Profile ↔ Maturity Ladder** | **PASS** | `verify:analytics` — same phase-schedule-end SSOT on live tabs |
| **Rollover Phase SSOT** | **PASS** | `verify:rollover-phase` — Working!F / schedule end / payoff tenor |
| **Valuation engine vs Excel Working (Mode B)** | **PASS** | See [valuation-audit-31-may-26.md](valuation-audit-31-may-26.md) (auto-generated) |
| **Live desk engine (Aug-2026)** | **Logic sheet** | Second-last extrap / avg lock; Working!V grow / 11% discount; no post-obs Y |
| **Mode A (current master vs May-26 workbook)** | **Expected partial** | Master file updated since May-26 snapshot |
| **Expired valuation UX** | **Fixed** | Obs + phase end; Logic lock to phase end; historical underlying levels |
| **Lifecycle tab defaults** | **Fixed** | Tab switch → longest-tenure product (live) / most recent expired + valuation date today |
| **Required Underlying IRR** | **Removed** | Dropped from Product Details, exports, and verify scripts |
| **Coupon Participation Return** | **Removed** | Raw **Coupon / PR / DM** not shown on desk grids, Product Specs (27 fields), or exports — master column kept for internal CC1 parse |
| **Product search page** | **Removed** | `/products` redirects to `/portfolio/analytics`; dead page stubs deleted |
| **Quick Analytics** | **Ongoing only** | Product Details export — full Ongoing book MTM at selected valuation date |
| **Desk dialogs** | **Fixed (Jul-2026)** | Branded modal replaces `window.alert`; debenture errors inline only |
| **Premium tables** | **Unified (Jul-2026)** | `DataTable` uses gold-maroon `data-table-premium` styling app-wide |
| **Screen Excel exports** | **Fixed (Jul-2026)** | Valuation Summary KPI tiles — two-row label/value layout; specs plain white |
| **Intel Logic Atlas UI** | **Refreshed (Jul-2026)** | Light hero, scrollable logic module cards, pipeline inspector at `/intelligence` |
| **Issuer Exposure chart** | **Updated (Jul-2026)** | All issuers in bucket; formatted axis labels; full names in tooltip |
| **Index level sync** | **Stabilised (Jul-2026)** | Soft Yahoo commit ~5s; localStorage restore; tab-focus refresh when stale (>5 min); Refresh forces immediate; sub-0.05 jitter ignored |
| **Maturity Ladder / Tenor Profile** | **Updated (Jul-2026)** | Single series; **same phase schedule end** — ladder = remaining/elapsed windows; tenor profile = remaining (live) or full phase tenure (expired) |
| **Chart animations** | **Enabled (Jul-2026)** | Home / Analytics entrance motion; respects `prefers-reduced-motion` |
| **Portfolio navigation** | **Improved (Jul-2026)** | Snapshot cache across routes |
| **Engine logic bugs found** | **Fixed** | F column used Trade Date before Allotment; Excel Working uses **Allotment Date** first |
| Payoff formula coverage | **99.3%** | 4151 / 4179 desk-canonical products can value & payoff |
| Missing payoff formula | **28 products** | Blocked in UI with disclaimer + alert |
| Missing entry level | **1 product** | Blocked in UI |
| Missing description | **67 products** | Warning + one-time alert; outputs still compute |
| Observation schedule gaps | **0 blockers** | Warning-only when obs columns blank; Nifty/Sensex from market API |

## Why Mode A “fails” (not an engine bug)

| Audit mode | What it compares | Result |
| --- | --- | --- |
| **Mode B** | App engine vs Excel Working using **same F/H/I/K/M/S as Excel row** | PASS — see [valuation-audit-31-may-26.md](valuation-audit-31-may-26.md) |
| **Mode A** | App using **today’s master file** vs Excel frozen at **31-May-26** | Expected partial — remainder is **data drift** |

Breakdown of Mode A mismatches (diagnostic script):

- **~572 / 580** resolve correctly when Excel May-26 **F/H/I dates** are injected — master on disk has **newer maturity / rollover dates** than the May workbook.
- **One logic fix applied**: Working!**F = Allotment Date**; engine previously preferred Trade Date first (~414 products wrong). Fixed in `valuation-engine.ts`.
- **0 remaining logic bugs** in N/O/S/V chain after date alignment.

**Live desk behaviour:** the app values products from **current master + market levels** — dynamic and correct. Mode A only fails when the master file has moved on since the reference `.xlsm`.

Run: `npx tsx scripts/diagnose-mode-a-failures.ts`

## Documentation

| Doc | Contents |
| --- | --- |
| [09-master-column-logic.md](09-master-column-logic.md) | Primary, Valuation, Payoff sheet columns; NaN → null; market fetch |
| [02-valuation-excel-parity.md](02-valuation-excel-parity.md) | Working V/X/Y/Z chain, serial dates, duplicate ISIN matching |
| [06-payoff-formulas.md](06-payoff-formulas.md) | Z performance, scenario grid, kink detection |

## UX & edge-case handling (implemented)

### Data quality guards

- `assessProductData()` — blockers (missing formula, missing entry) vs warnings (missing description, obs schedule, trade date).
- **Valuation** and **Payoff** tabs: `ProductOutputGuard` shows blocker panel or disclaimer banner; missing values render as **—**.
- **One alert on reveal** (not on every render): missing formula/entry or missing description when user opens output.
- **Product Details** page: same guard + kink legend on payoff table.

### Desk inputs

| Control | Behaviour |
| --- | --- |
| **Debentures** | Keyboard entry, natural numbers ≥ 1 (no zero); **Max** badge from notional ÷ price; popup if over max |
| **Valuation date** | Calendar `type="date"`; min = product launch, max = today |
| **Index levels** | Nifty/Sensex fetched/synced via market API when not overridden |

### Labels (user-requested)

- **Abs. Return vs Deal Price** — no `(U)` suffix
- **Product XIRR at live index move** — product-level XIRR at current index move (not in brackets)

### Payoff kinks (plot turns only)

- Chart: amber reference dots at Z levels where slope changes (`findPayoffPlotKinks`)
- Table: amber **pivot-row** rows at the same kinks only (not every IF branch)
- Legend on Payoff tab and Product Details

### Ongoing vs expired

- Lifecycle filter drives product pool; valuation applicability checked per valuation date (allotment → **final observation**, not rollover alone).
- Expired products: observation date dropdown; Nifty/Sensex from `/api/market/index-at-date` (MongoDB → Yahoo fallback); **no live market badge**.
- `useResyncProductToLifecyclePool()` auto-selects first product in pool when switching tabs if current product is outside the bucket.
- Products with NaN formula/description/levels in Excel: stored as null in app; UI shows **—** or blocker panel.

## Manual smoke checklist

Run `bash start-dashboard.sh` or `npm run dev`, then:

1. **Valuation** — pick an ongoing Nifty product; set valuation date; reveal output → KPIs + output sheet populate.
2. **Payoff** — same product; confirm live index KPIs and amber kink rows in scenario table.
3. **Debentures** — type `500` on keyboard; confirm max badge; try value above max or `0` → desk popup + reset to default.
4. **Valuation date** — open calendar; dates before launch disabled; future dates blocked.
5. **Missing formula** — search `INE915D07IS7` (Nifty Out-performer) → desk popup + blocker panel; selection resets to tab default.
6. **Missing entry level** — hard blocker + popup; selection resets to tab default.
7. **Missing description only** — inline disclaimer banner, no hard block.
8. **Missing obs / maturity** — warning popups when output is revealed (canonical book: obs 0, maturity anchor 0).
9. **Invalid debentures** — type `0` or above max → desk popup; count resets to product default.
10. **Product Details** — lifecycle toggle ongoing/expired; output guard + payoff chart kinks.

## Automated verification commands

```bash
npm run typecheck          # TypeScript clean
npm run verify:valuation   # Working sheet parity (31-May-26)
npm run verify:valuation-pipeline  # Steps A→E full book
npm run verify:lifecycle-full      # all ongoing + expired marks
npm run verify:payoff-xirr         # payoff XIRR tenor
npm run verify:rollover-phase      # Working!F / schedule end SSOT
npm run verify:coupon-formula      # Coupon Formed === payoff formula
npm run verify:seamlessness        # Tab defaults, calendars, expired menus
npm run verify:edge-cases  # Master missing-field scan
```

## Known limitations

1. **Mode A parity** — master file on disk may differ from May-26 `.xlsm` (dates, entry levels, rollover rows). Engine is correct when Excel Working inputs are replayed (Mode B — see auto-generated audit).
2. **28 products without formula** — cannot compute until master is updated; app blocks gracefully.
3. **MongoDB** — optional; requires `docker compose up -d` or Atlas URI for persistent sync.
4. **Observation dates absent in master** — not invented/our fault; warning shown; index levels still from market where valuation date is set.

## Conclusion

The valuation engine matches the Excel Working sheet when row inputs align (Mode B — see auto-generated audit). Live marks follow the Jun-26 Logic sheet Working!V path. Full-book wind-up (02-Aug-2026): desk-canonical **4,179** (≈4,151 formulas) · payoff XIRR **74,718** · Product IRR ↔ XIRR **4,151/4,151** · Logic lock **1,822/1,822** · 31-Jul NAV **99.26%** exact · Effective Target **2,324/2,324** — PASS. Ongoing/expired pool sizes move with calendar day. Remaining gaps are master-data holes (28 formulas, 67 descriptions), Mode A workbook drift, and **17** NAV-file residuals where NAV final quote ≠ Logic — not phase-tenure bugs. See [13-windup-verification.md](13-windup-verification.md).
