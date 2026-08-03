# Master NEW PRIMARY sheet — column logic & edge cases

> **Doc refresh:** 2026-07-21 — Sync from Downloads backup; restore computed Excel formulas on Primary / Rollover / NEW PRIMARY.

Reference file: **`New Product Master_.xlsx`**

| Tab | Role |
|-----|------|
| **Primary** | Merge input (~4,499 rows) — explorer only |
| **Rollover** | Merge input (~635 rows) — explorer + phase enrichment |
| **NEW PRIMARY** | **Desk product book** — parsed into `ProductRecord[]` |

Pipeline: `npm run bake` → `build-new-primary-sheet.ts` → `parseWorkbookBuffer` → `lib/data/master-seed.json`

Parser: `lib/workbook/parser.ts` · SSOT constant: `lib/master-source.ts` · types: `lib/types.ts` · guards: `lib/product-data-guards.ts`

## Column map (Excel → app)

| Master column | `ProductRecord` / `raw` | Used in |
|---------------|-------------------------|---------|
| Month | `month` | Lifecycle, allotment fallback |
| Trade Date/Opening date, Allotment Date | `raw` | Working!F (phase-dependent), IRR elapsed, date picker min |
| Name on Signup Form / Product Name | `name` | Identity, UI |
| Rollover Phase | `rolloverPhase` | Working!F, schedule end, payoff XIRR tenor, lifecycle labels |
| Underlying | `underlying` | Nifty / Sensex / custom stock-commodity series selection |
| Series | `series` | Product code |
| Issuer | `issuer` | Display, **Issuer Exposure** chart (all issuers by AUM) |
| ISIN No. | `isin` | Identity |
| Actual Entry Level, Entry Level | `raw` → entry | Valuation K, payoff fixing |
| Target Nifty / Target Level | `raw` | Target display, entry fallback |
| Average 1, Avg. 2–7, Observation Months | `raw` | Observation schedule, obs-due tabs |
| Last Observation Date | `lastObservationDateRaw` | Obs fallback |
| Trade Amount | `tradeAmount` | Notional, max debentures |
| price per debenture | `pricePerDebenture`, `raw` | U, max debentures |
| Coupon (%) | `couponPercent` | Analytics, Product Specs (**Coupon Percentage**) |
| Coupon / PR / DM | `raw` | **Kept on Primary / Rollover / NEW PRIMARY** (reference parity). Product Specs UI still prefers **Coupon (%)**; `getCouponPercent()` uses this column as CC1 parse fallback |
| Tenor | `tenorDays` | Payoff XIRR tenor |
| Maturity / Maturity date | `maturityRaw` | Expiration lifecycle tabs |
| Rollover C/P Date | `raw` | Rollover phase inference; Maturity Ladder elapsed/remaining windows (10Y) |
| **Formulae** | `formulaText` | Payoff S, valuation S — **required** |
| Product Explanation | `productExplanation`, `raw` | Narrative — warn if missing |
| Principal Protection | `principalProtection` | Routing, specs |
| Listing | `listing` | Specs |
| Product Type | `productType` | Specs |

All other NEW PRIMARY columns are kept in `product.raw`. **NaN / blank cells stay null** — never filled with zeros in Mongo sync (`lib/db/sanitize-for-mongo.ts`).

## Valuation Working sheet

Full column chain: **`docs/02-valuation-excel-parity.md`**

Desk date for parity audits: **31-May-26** (B1 = 46173). No separate 29-May workbook in repo.

### Rollover Phase → calculation dates (SSOT)

| Phase | Working!F start | Path / Days-Left end | Payoff XIRR end |
|-------|-----------------|----------------------|-----------------|
| Blank | Allotment | Maturity | Maturity |
| Phase 1 | Allotment | POED | POED |
| Phase 2 | **Trade Date** | Maturity | **Maturity** (tenor: Trade → Maturity) |
| 10 Years | Allotment | Rollover C/P | Rollover C/P |

Helpers: `getWorkingAllotmentDate`, `getPhaseScheduleEndDate`, `getPhasePayoffTenorDays`, `getElapsedDaysSinceWorkingAllotment`, `computeUnderlyingIrrSincePhaseStart` in `lib/product-dates.ts`. Same-day elapsed = **0**; Underlying IRR = **0%**.

## Payoff (Non-PP SP Details)

| Col | Meaning | Web |
|-----|---------|-----|
| G | Performance sweep | `PAYOFF_SCENARIO_OFFSETS` |
| F | Final fixing | entry × (1+G) |
| Z / H | Formula input / return | `evaluatePayoffFormula` |
| I | Maturity amount | investment × (1+H) |
| XIRR column | Remaining tenor IRR | `irrFromReturn` |

Kink detection: `lib/workbook/payoff-kinks.ts` — highlighted on chart (amber dots) and table (`pivot-row` class).

## Edge cases (app behaviour)

| Condition | Behaviour |
|-----------|-----------|
| Missing **Formulae** | Output blocked; alert; show disclaimer panel |
| Missing **Product Explanation** | Warning disclaimer; optional alert on product select |
| Missing **entry level** | `getIndexEntryLevel` defaults to **10,000**; UI guards may still block output |
| Missing **observation dates** | Warning only; underlying level still fetched for valuation date (Nifty/Sensex or custom series) |
| Missing **trade date** | Warning; valuation date picker unrestricted on min |
| NaN numeric cells | Stored as null; displayed as **—** where applicable |
| Duplicate ISIN (rollover phases) | `pickCanonicalRowsForDesk` keeps Phase II > Phase I > 10years > blank |

## Market data

- Live & historical **Nifty/Sensex**: `lib/market-data.ts`, `/api/market/levels`, `/api/market/index-at-date`
- Resolution order (Nifty/Sensex historical): cache → MongoDB `index_prices` → bundled Nifty → Yahoo close
- **Sensex** has no bundled history — Mongo/Yahoo only
- **Custom underlyings** (Infosys, ITC, MCX Silver, Reliance 24K, …): `/api/market/underlying-at-date` + baked `lib/data/custom-underlying-history.json`
  - Equities: Yahoo NSE closes (`source=yahoo`)
  - Gold/silver: futures × USDINR **estimates** (`source=estimate`) — not official MCX/Reliance prints
  - **Never** silently use Nifty against a stock/gold entry — audit: `npm run verify:custom-underlyings`
- Live desk today: `applyMarket` in `product-selection-provider` — soft Yahoo commit ~5s, localStorage restore on reload, sub-0.05 jitter ignored, Refresh forces immediate commit
- Mongo optional: `index_prices` collection when `MONGODB_URI` set

Full index resolution audit: [11-calculation-review.md](11-calculation-review.md) § 6.

## Computed Excel formulas (desk master)

Beautified Primary / Rollover / NEW PRIMARY keep Excel formulas (with cached results) for:

| Column | Formula pattern |
|--------|-----------------|
| Last Observation Date | `=MAX(Observation Average 1:7)` |
| Observation Months | `=TEXT(Avg1,"dd-mmm-yy")&","&…` |
| Arranger Fees Amount | `=Trade Amount × Arranger Fees %` (when % present) |
| Upfront Fees Amount | `=Trade Amount × Upfront Fees %` (when % present) |

Sync from the Downloads backup (new products + formula patterns):

```bash
npm run sync:master-backup   # reads ~/Downloads/New Product Master_.xlsx by default
npm run bake                 # rebuild NEW PRIMARY formulas + seed + public download copy
```

Intel reference download (`/api/master/download`) and `public/data/New Product Master_.xlsx` serve this formula workbook.

## Verification

```bash
npm run verify:new-primary-source   # NEW PRIMARY required; desk product counts
npm run verify:valuation            # Mode A/B vs Working 31-May-26
npm run verify:coupon-formula       # Coupon Formed === payoff formula
npm run verify:edge-cases           # missing-field scan on desk book
```
