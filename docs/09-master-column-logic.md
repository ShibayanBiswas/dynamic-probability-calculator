# 09 — Master column logic & edge cases

## Fields that drive probability

| Master field | Use |
|--------------|-----|
| Name on Signup Form | Display name |
| Rollover Phase | Phase start/end SSOT |
| Underlying | Nifty / Sensex gate |
| ISIN No. | API key |
| Actual Entry Level | Entry / Initial threshold |
| Target Nifty / Target Level | Target |
| Average 1 … Avg. 7 | Observation schedule |
| Last Observation Date | Final obs / past-final clamp |
| Trade Amount | Amount / AUM |
| Maturity / POED / Rollover C/P | Phase end |
| Allotment / Trade Date | Phase start |
| Coupon (%) | Specs + past-final coupon |
| Formulae | Payoff plot only |
| Tenor | Display tenor days |

## Parsing

- Dates: `parseExcelishDate` — `dd-MM-yyyy`, Excel serials, slash forms.  
- Numbers: strip commas; empty / `-` → missing.  
- Blank Average → skipped slot.  
- Custom underlyings → probability API rejects (Nifty/Sensex only).

## Missing → result

| Missing | Result |
|---------|--------|
| Entry or Target | Initial threshold null → prob null |
| Today level (Current) | Prior close fallback; still null if no bar |
| No observation dates | No includable paths |
| Past final obs | Clamp checking date; drop live levels |

## Market level fallbacks

1. Live Yahoo  
2. Last good desk/localStorage state  
3. Bundled on-or-before date  
4. Probability series: Mongo range preferred; else bundled merge  

## Audits

```powershell
npm run verify:edge-cases
npm run verify:data-quality
npm run verify:products
```

## Display hygiene

No `()` in headers or desk labels. Specs use `Trade Amount in Rupees`. Phase: ` · Rollover Phase n`.
