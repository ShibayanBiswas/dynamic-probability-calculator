# Master edge-case audit

Generated: 2026-07-30T11:30:42.902Z

## Summary

| Metric | Count |
| --- | ---: |
| Valid desk products (NEW PRIMARY) | 4179 |
| Ongoing | 2399 |
| Expired | 1774 |
| Can value / payoff | 4151 |
| Missing formula | 28 |
| Missing entry level | 1 |
| Missing obs schedule | 0 |
| Missing description | 67 |

## Sample blockers

| ISIN | Product | Blocker |
| --- | --- | --- |
| INE915D07IS7 | Nifty Out-performer | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE521E07AD0 | Nifty Linked Structure | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE521E07AE8 | Nifty Level Allocator | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE521E07AH1 | Portfolio Hedger 3 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE521E07A19 | Yield Enhancer | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE144H07AF9 | Knock Out - 1 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE804I07660 | DRAN - 1 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE144H07AG7 | Knock Out - 2 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE144H07AI3 | Knock Out - 3 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE804I07AE9 | Binary - 1 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE804I07AP5 | Knock In - 1 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE804I07CF2 | AutoCall 17% - 2 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE804I07DB9 | Autocall - 3 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE804I07DD5 | Autocall - 4 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |
| INE013A07NO6 | Autocall - 5 | Payoff formula is missing in the master file — valuation and payoff cannot be computed. |

## App handling

- Missing formula or entry → output blocker + desk popup; selection resets to tab default
- Missing obs schedule → warning popup on output reveal; index from Yahoo/Mongo
- Missing maturity → warning popup on output reveal; engine uses expiry / final obs / tenor fallback
- Invalid debenture count → desk popup; count resets to product default (engine floors to ≥ 1)
- NaN cells → null in DB, **—** in UI
