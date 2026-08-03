# Debug Playbook

> **Doc refresh:** 2026-07-16 — index level jitter / stale refresh; maturity ladder single series.

Step-by-step fixes for common desk issues. Cross-reference [03-testing-debug.md](03-testing-debug.md) for commands.

---

## 1. Lifecycle KPIs wrong (AUM / Full Coupon / Absolute Return / Listed)

1. Run `npm run verify:kpis ongoing` — compare to UI  
2. Confirm tab matches (Ongoing vs Expired)  
3. Check master **Trade Amount**, **Coupon (%)**, **Listing**  
4. **Avg Absolute Return** is **—** on Expired tab by design  
5. Confirm `usePortfolioClock` — KPI timestamp should update every minute  

→ Details: [04-lifecycle-analytics-kpis.md](04-lifecycle-analytics-kpis.md)

---

## 2. Valuation numbers wrong

1. Confirm product is **not expired** (`isValuationApplicableAt`)  
2. Check **face** = ₹1L via `getWorkingClientInvestment()` / `getDebenturePrice()` — not raw debenture price  
3. Verify Nifty vs Sensex for underlying (`resolveLiveIndexLevel`)  
4. CLI test INE093JA7Q38 — see [02-valuation-excel-parity.md](02-valuation-excel-parity.md)  

| Wrong X | Likely cause |
|---------|--------------|
| ~₹198 vs ~₹198k | Using price not face |
| IRR extreme | Allotment date = val date |
| Zero | Missing formula or level |
| Coupon 100% but abs return lower | Expected — **Coupon Formed** = payoff formula at projected **O** (headline only if formula fails); abs return is discounted present value **Z** |
| CC1 parse wrong | Check master **Coupon / PR / DM** column (internal only — not shown in specs); `getCouponPercent()` prefers `CC1:` / first `%` token — run `npm run verify:coupon-formula` |

---

## 2b. Master Pivot Explorer breaks while scrolling

1. Virtualized rows must use **`data-table-row-alt`** on `<tr>` (index % 2) — never rely on `tbody tr:nth-child(even)` with virtualization  
2. Sticky `#` column: remove `bg-inherit`; striping comes from `.data-table-row-alt td.col-pinned` in `globals.css`  
3. File: `components/ui/virtual-table-body.tsx` + `components/reference/master-sheet-pivot.tsx`

---

## 3. Payoff / narrative wrong

1. **7600% / 600% in UI** → `lib/product-narrative-format.ts`  
2. **Wrong live move** → Payoff level must be Yahoo (`resolveLiveIndexLevel`)
3. **Stock/commodity expired looking like Nifty Z** → Confirm `getUnderlyingKind` is `custom`; run `npm run verify:custom-underlyings`; UI label must show Infosys/Silver/etc., not Nifty
4. **Missing formula popup** → `isHardBlockedProduct` + `deskAlert` — expected for blank Formulae  
3. **132–133% band** → index move +32–33%, not 132% move  
4. Run `npm run verify:full` for product-specific formula errors  

→ [05-narrative-master-excel.md](05-narrative-master-excel.md), [06-payoff-formulas.md](06-payoff-formulas.md)

---

## 4. After uploading new master

```bash
npm run verify          # full pipeline
npm run verify:kpis     # KPI audit all buckets
npm run verify:coupon-formula   # Coupon Formed === payoff formula
npm run verify:all-metrics      # full-book metric parity
npm run verify:lifecycle-full   # all ongoing + expired marks
npm run verify:custom-underlyings  # stock/commodity — no Nifty bluff
npm run verify:rollover-phase   # Working!F / schedule end SSOT
```

Upload from Home also triggers client-side parse. If counts wrong:

```bash
npm run bake            # refresh seed
npm run bake:underlyings  # refresh stock/commodity history
```

Expected desk canonical count: **4244** products, **4216** formulas (`lib/workbook/expected-counts.ts` / `canonical-manifest.json`). Source tab: **NEW PRIMARY** (Primary + Rollover merged). Run `npm run bake` after editing Primary or Rollover rows.

---

## 5. Build / dev failures

| Error | Fix |
|-------|-----|
| Google Fonts fetch | Retry `npm run build` online |
| Port 3000 / 8000 in use | `bash start-dashboard.sh` (stops stale ports) or `bash start-dashboard.sh --stop` |
| Python venv missing | First run of `start-dashboard.sh` creates `backend/python/.venv` |
| Type errors | `npm run typecheck` |

---

## 6. Ongoing products failing QA

Current known master issues (re-run `verify:full` to refresh):

- **Nifty Accelerator 407** — bad formula `(Z%)*100%`  
- **Protected call 431-434** — Formulae cell is ISIN only  

Fix in Excel **Formulae** column, then `npm run verify`.

---

## Symptom → file quick map

| Symptom | First file to open |
|---------|-------------------|
| Lifecycle count | `lib/product-lifecycle.ts` |
| AUM / coupon KPI | `lifecycle-lab.tsx`, `product-utils.ts` |
| Valuation X / IRR | `valuation-engine.ts` |
| Payoff formula | `formula-engine.ts` |
| Narrative text | `product-narrative-format.ts` |
| Live Nifty | `market-data.ts`, `/api/market/levels`, `product-selection-provider.tsx` (soft commit, localStorage) |
| Export Excel | `export-products.ts` (portfolio) · `export-screen.ts` (per-page screen) |
| Slow / stuck screen Excel | `use-screen-excel-export.ts`, `excel-runtime.ts` — wait for *Building workbook…*; do not double-click |
| Parse upload | `parser.ts` |
