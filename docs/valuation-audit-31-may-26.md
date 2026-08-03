# Valuation parity audit — 31 May 2026

Generated: 2026-08-01T19:15:57.351Z

## Reference

- Workbook: `Dashboards - 31st May 26/Primary Structured Products Valuation - 31st May 26.xlsm`
- Sheet: **Working** (X = Product Value, Y = Product IRR, Z = Abs. Return)
- Valuation date: **31-May-26** (Excel serial 46173)
- Nifty (D1): **23547.75** · Sensex (C1): **74775.74**
- Universe: **2399** ongoing desk products (NEW PRIMARY) with formula, applicable at valuation date

## Summary

| Mode | Pass | Fail | Tested | Notes |
| --- | ---: | ---: | ---: | --- |
| **A — Current master file** | **2126** | 269 | 2395 | Uses NEW PRIMARY desk book dates & entry levels |
| **B — Excel Working row inputs** | **2395** | 0 | 2395 | F/H/I/K/M/U + P/S from matched Working row |

| Other | Count |
| Missing in Excel Working | 4 |
| Excel rows not in ongoing master | 1468 |

**Master-file overall: PARTIAL**
**Formula replay (Excel row inputs): PASS**

## Engine — Working column chain

| Col | Field | Source |
| --- | --- | --- |
| B1 | Valuation date | Desk input |
| C/D | Sensex / Nifty | Market levels |
| F | Allotment date | Master / Working row |
| G | Valuation date | =B$1 |
| H | Maturity date | Master / Working row |
| I | 2nd-last obs date | Master obs schedule |
| K | Entry level | Master |
| L | =−K | Cashflow for XIRR |
| M | Current index | IF(Nifty,D1,C1) |
| N | Exp. underlying @ obs | XIRR forward or AJ:AK VLOOKUP |
| O | Underlying perf | N/K−1 or M/K if NA |
| P | Payoff formula (Z) | Master / Working row |
| S | ProductReturns | EVALUATE Working(2)!R (ProductReturns) |
| T | IRR tenor | (1+S)^(365/(H−F))−1 |
| U | Client investment | Debenture price |
| V | Final valuation | IF(I−B1≥0,U(1+T)^((B1−F)/365), U(1+(1+S)/1.11^((H−B1)/365)−1)) |
| X | Product value | max(V,U) |
| Y | Product IRR | (X/U)^(365/(G−F))−1 |
| Z | Abs. return | X/U−1 |
| AJ:AK | Index history | Nifty closes for VLOOKUP |

## Engine fixes in this build

- **Working!I**: full-schedule 2nd-last obs when B1 is between fixings; 2nd-last on/before B1 when B1 is an observation date
- **V column**: exact Excel IF branch with serial (I−B1), T=(1+S)^(365/(H−F))−1
- **N column**: XIRR(L:M,F:G) forward branch with serial day fractions
- **S column**: Mode B uses Working ProductReturns value; Mode A uses master P formula
- **Duplicate ISIN**: match rollover phase by name + maturity ≥ B1
- **U column**: client investment = debenture price (₹1L / ₹1.25L)

## Mode A — failures (first 30)

| ISIN | Product | Notes |
| --- | --- | --- |
| INE093JA7ZR4 | Range Bound Magnifier - 12 | PV Δ -59468; IRR Δ -5.242 pp; Abs Δ -47.574 pp |
| INE093JA7ZS2 | Range Bound Magnifier - 13 | PV Δ -61206; IRR Δ -5.415 pp; Abs Δ -48.965 pp |
| INE093JA7A02 | Range Bound Magnifier - 14 | PV Δ -59434; IRR Δ -5.240 pp; Abs Δ -47.547 pp |
| INE093JA7B35 | Range Bound Magnifier - 16 | PV Δ -61048; IRR Δ -5.408 pp; Abs Δ -48.839 pp |
| INE093JA7H47 | Range Bound Magnifier - 21 | PV Δ -58738; IRR Δ -5.165 pp; Abs Δ -46.991 pp |
| INE093JA7Q20 | Nifty Accelerator - 593 | IRR Δ -0.051 pp |
| INE093JA7Q38 | Gearing Accelerator - 20 | IRR Δ -0.057 pp |
| INE093JA7Q46 | Gearing Accelerator - 21 | IRR Δ -0.054 pp |
| INE093JA7Q79 | Nifty Accelerator - 595 | IRR Δ -0.063 pp |
| INE093JA7Q87 | Gearing Accelerator - 22 | IRR Δ -0.067 pp |
| INE093JA7Q95 | Nifty Accelerator - 596 | IRR Δ -0.070 pp |
| INE093JA7R94 | Nifty Accelerator - 598 | IRR Δ -0.078 pp |
| INE093JA7S02 | Gearing Accelerator - 23 | IRR Δ -0.082 pp |
| INE093JA7S51 | Nifty Accelerator - 600 | IRR Δ -0.085 pp |
| INE093JA7S85 | Gearing Accelerator - 24 | IRR Δ -0.093 pp |
| INE093JA7S93 | Nifty Accelerator - 601 | IRR Δ -0.088 pp |
| INE093JA7T43 | Protected Magnifier - 87 | PV Δ -60612; IRR Δ -5.450 pp; Abs Δ -48.490 pp |
| INE093JA7T76 | Nifty Accelerator - 603 | IRR Δ -0.101 pp |
| INE093JA7T84 | Nifty Accelerator - 604 | IRR Δ -0.119 pp |
| INE093JA7U24 | Nifty Accelerator - 605 | IRR Δ -0.102 pp |
| INE093JA7U99 | Nifty Accelerator - 608 | IRR Δ -0.115 pp |
| INE093JA7V15 | Nifty Accelerator - 609 | IRR Δ -0.122 pp |
| INE093JA7V56 | Nifty Accelerator - 611 | IRR Δ -0.128 pp |
| INE093JA7V64 | Gearing Accelerator - 25 | IRR Δ -0.135 pp |
| INE093JA7V72 | Nifty Accelerator - 612 | IRR Δ -0.128 pp |
| INE093JA7W06 | Nifty Accelerator - 613 | IRR Δ -0.130 pp |
| INE093JA7W14 | Gearing Accelerator - 26 | IRR Δ -0.137 pp |
| INE093JA7W71 | Nifty Accelerator - 615 | IRR Δ -0.139 pp |
| INE093JA7W89 | Gearing Accelerator - 27 | IRR Δ -0.146 pp |
| INE093JA7X05 | Nifty Magnifier - 531 | PV Δ -63833; IRR Δ -5.854 pp; Abs Δ -51.066 pp |

_Remaining master-file failures: 239_

## Mode B — failures (first 30)

_None — engine matches Working sheet row-for-row._

## Spot checks

| ISIN | Product | Excel PV | App PV (master) | App PV (excel row) | Excel IRR | App IRR (master) | Match UI? |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| INE093JA70T3 | Nifty Accelerator - 715 | ₹1,43,321 | ₹1,44,497 | ₹1,43,321 | 3.2% | 3.4% | Master (UI) |
| INE093JA7Q38 | Gearing Accelerator - 20 | ₹2,47,865 | ₹2,47,865 | ₹2,47,865 | 14.5% | 14.4% | PV only |
| INE093JA7Y79 | Nifty Accelerator - 621 | ₹2,39,788 | ₹2,39,788 | ₹2,39,788 | 14.3% | 14.1% | PV only |
| INE093JA7ZS2 | Range Bound Magnifier - 13 | ₹2,03,679 | ₹1,42,473 | ₹2,03,679 | 9.4% | 4.0% | Master (UI) |

## Method

- Run: `npx tsx scripts/verify-valuation-working-parity.ts`
- Engine: `lib/workbook/valuation-engine.ts` + `lib/workbook/valuation-performance.ts`
- Index history for Working!N lookup: `lib/data/valuation-index-history.json` (from Working!AJ:AK)
- Tolerances: Product Value ±₹1; IRR and Abs Return ±0.05 pp
- Mode A mismatches often mean **master file drift** vs the May-26 workbook Primary snapshot (allotment/maturity/entry)
