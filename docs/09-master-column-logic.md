# 09 — Master column logic & edge cases

**Updated:** 2026-08-04

## Fields that drive probability

| Master field | Use |
|--------------|-----|
| Name on Signup Form | Display name |
| Rollover Phase | Phase start/end SSOT (`blank` / `phase1` / `phase2` / `tenYear`) |
| Underlying | Nifty / Sensex gate for path engines; custom → Effective Target only |
| ISIN No. | API key + merge key |
| Actual Entry Level / Entry / Initial / Initial Fixing | Entry for Initial threshold; lifecycle column **Initial Level** |
| Target Nifty / Target Level | Target for thresholds + Effective Target |
| Average 1 … Avg. 7 | Observation schedule |
| Last Observation Date | Final obs / past-final clamp / live-book gate |
| Trade Amount | Amount / AUM |
| Maturity / POED / Rollover C/P | Phase end by Rollover Phase |
| Allotment / Trade Date | Actual Start (Phase 2 = Trade only) |
| Coupon (%) | Specs + past-final coupon |
| Formulae | Payoff plot only |
| Tenor | Display tenor days |

See phase impact: [16-product-type-probability-logic.md](16-product-type-probability-logic.md).

## Parsing

- Dates: `parseExcelishDate` — `dd-MM-yyyy`, Excel serials, slash forms.  
- Numbers: strip commas; empty / `-` → missing.  
- Blank Average → skipped slot.  
- Custom underlyings → probability API rejects (Nifty/Sensex only).  
- Duplicate ISIN merge: Phase 2 > Phase 1 > 10Y > Blank.

## Missing → result

| Missing | Result |
|---------|--------|
| Entry or Target | Initial threshold null → prob null |
| Today level (Current) | Prior close / desk mark fallback; still null if no bar |
| No observation dates | No includable paths |
| Past final obs | Clamp checking date; drop live levels; leave live pills |
| Phase 2 without Trade Date | Actual Start falls through poorly — fix master Trade Date |
| Phase 1 POED before Last Obs | Schedule end falls back to Maturity |

## Market level fallbacks

1. Live Yahoo (`^NSEI` / `^BSESN`) with desk-mark session rule  
2. Last good desk/localStorage state  
3. Bundled on-or-before date  
4. Probability series: Gift CSV + Sensex fill; Mongo range overlay preferred  

## Audits

```powershell
npm run verify:edge-cases
npm run verify:data-quality
npm run verify:phase-logic
npm run verify:rollover-phase
npm run verify:new-primary
```

## Display hygiene

No `()` in headers or desk labels. Specs use `Trade Amount in Rupees`. Phase: ` · Rollover Phase n`. Lifecycle entry column label is **Initial Level**.
