# Wind-up Verification Report

> **Status:** READY TO WIND UP  
> **Verified:** 02-Aug-2026  
> **Repo tip:** `b1cf869` and later on `master`

This is the definitive close-out checklist for the Primary SP Dashboard. All items below were re-run on the full book before wind-up.

---

## Verdict

**Yes — the project can be wound up.**

Core desk logics are conserved, verified, and documented:

- Rollover Phase tenure Blank / Phase 1 / Phase 2 / 10 Years
- Payoff scenario XIRR on the same tenure
- Jun-26 Logic sheet valuation path Working!V grow / 11% discount
- Effective Target schedule math
- Desk default clock = **today**; 31-Jul NAV audit uses **31-Jul** Nifty/Sensex only

Accepted non-blockers: Mode A master-vs-frozen-Excel gaps; **17** 31-Jul NAV residuals where the NAV file final quote drifts from Logic while phase tenure remains correct; **54** NAV ISINs not on the desk book.

---

## Date and index policy

| Path | Valuation date | Index levels |
|------|----------------|--------------|
| Live desk default | **Today** portfolio clock | Live / bundled as-of today |
| 31-Jul NAV audit | **31-07-2026** only | Nifty **24,383.6** · Sensex **78,094.64** |

Prove separation: `npm run verify:asof-levels`  
Index parity Yahoo ↔ Mongo ↔ bundled: `npm run verify:index-levels`

---

## Phase tenure SSOT

| Phase | Start | End | Payoff XIRR / Product IRR tenor |
|-------|-------|-----|----------------------------------|
| Blank | Allotment | Maturity | Allotment → Maturity |
| Phase 1 | Allotment | POED | Allotment → POED |
| Phase 2 | Trade Date | Maturity | Trade → Maturity |
| 10 Years | Allotment | Rollover C/P | Allotment → Rollover |

Audits: `verify:phase-logic` · `verify:rollover-phase` · `verify:irr-phase-tenure` · `verify:payoff-xirr` · `verify:expired-phase`

---

## Valuation Logic path

1. **No obs yet:** spot IRR → second-last observation  
2. **≥1 obs done:** average of realised fixings locks expected Nifty  
3. **Quote:** last obs ahead → grow U by product IRR T; last obs done and phase end ahead → discount U·(1+S) @ 11%; both done → U·(1+S)  
4. **Not used on live path:** post-obs Working!Y compounding  

Guides: [12-valuation-plain-english.md](12-valuation-plain-english.md) · [02-valuation-excel-parity.md](02-valuation-excel-parity.md)

---

## Effective Target

```
ET = (TotalObs × TargetLevel − Σ levels at settled passed obs) / RemainingObs
```

- 0D observation stays remaining until NSE cash close 15:30 IST  
- Full ongoing book: `npm run verify:effective-target`  
- Snapshot: **2,324/2,324** parity · **2,134/2,134** algebraic identity on computable rows  

---

## Verified snapshot (02-Aug-2026)

| Check | Result |
|-------|--------|
| Desk-canonical products | **4,179** (**4,151** with formulas) |
| Ongoing / expired | **2,324** / **1,855** |
| Payoff XIRR scenario rows | **74,718** PASS |
| Product IRR ↔ scenario XIRR | **4,151/4,151** PASS |
| Phase logic Blank/P1/P2/10Y | PASS |
| Valuation pipeline A→E | Ongoing 2,324 · hist 6,584 · expired obs 6,171 · expiry 1,827 PASS |
| Full-coupon / Logic path | PASS |
| Mode B Excel Working | **2,395/2,395** PASS |
| 31-Jul NAV exact | **99.26%** · 2,294/2,311 · phaseTenureBad **0** |
| Expired-by-phase | Tenure/obs/phase-end marks **1,827/1,827** PASS |
| Post-last-obs Logic lock | **1,822/1,822** → phase end U·(1+S) |
| Effective Target | **2,324/2,324** PASS |
| Index levels | Yahoo↔Mongo↔bundled PASS |
| Today vs 31-Jul split | PASS |
| Screen exports | PASS |
| Typecheck | PASS |

---

## Wind-up command pack

```bash
npm run verify:asof-levels
npm run verify:effective-target
npm run verify:index-levels
npm run verify:ui-conservation
npm run verify:payoff-xirr
npm run verify:rollover-phase
npm run verify:phase-logic
npm run verify:irr-phase-tenure
npm run verify:valuation-pipeline
npm run verify:full-coupon
npm run verify:31jul-nav
npm run verify:expired-phase
npm run verify:expired
npm run verify:703-obs
npm run verify:kpis
npm run verify:filter-parity
npm run verify:exports
npm run typecheck
```

---

## Related docs

| Doc | Role |
|-----|------|
| [12-valuation-plain-english.md](12-valuation-plain-english.md) | Layman valuation |
| [02-valuation-excel-parity.md](02-valuation-excel-parity.md) | Working / Logic parity |
| [03-testing-debug.md](03-testing-debug.md) | Verify command map |
| [11-calculation-review.md](11-calculation-review.md) | Full math audit |
| [seamless-qa-report.md](seamless-qa-report.md) | Consolidated QA |
