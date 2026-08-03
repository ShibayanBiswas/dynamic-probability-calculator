# Lifecycle Analytics KPIs

> **Doc refresh:** 2026-07-21 — Phase schedule end SSOT (Blank/P2 Maturity · Phase 1 POED · 10Y Rollover); obs-due nested windows; picker = filter pool.

## Live Notional vs tab AUM

| Metric | Source | Typical value |
|--------|--------|---------------|
| **Live Notional** (Home headline KPI) | Sum of **Trade Amount** on Primary master tab | From `categorySummaries` after parse; **—** until book loads |
| **Tab AUM** (Lifecycle Category Analytics) | Sum of `tradeAmount` for products **in that lifecycle bucket** (desk-canonical) | Ongoing ~₹25k Cr; all tabs sum to ~₹34.4k Cr |

The headline uses the full Primary book; valuation/payoff/details use **4,179** deduped NEW PRIMARY rows.

---

Implementation: `components/analytics/lifecycle-lab.tsx`  
Shared logic with Science Lab when the same lifecycle tab is selected.

---

## Ongoing bucket — who is included?

`filterProductsByLifecycle(products, "ongoing", asOf)` in `lib/product-lifecycle.ts`:

| Lifecycle status | In Ongoing tab? |
|------------------|-----------------|
| `ongoing` (phase schedule end still ahead — includes expiring-within-3M/1M) | Yes |
| `perpetual` | Yes |
| `unknown` (no phase schedule end on file) | **No** — excluded from all UI tables via `filterValidMasterProducts` |
| `expiring-1m` / `expiring-3m` | **Yes** on Ongoing (live book); also listed on their dedicated Expiring tabs |
| `expired` | No |
| `upcoming` (phase start / Working!F in future) | No |

**Expiry / tenure anchor (SSOT):** `getProductExpirationDate()` → `getPhaseScheduleEndDate()`:

| Rollover Phase | Phase start (Working!F) | Phase end (ongoing / expired / expiring) |
|----------------|-------------------------|------------------------------------------|
| Blank | Allotment (else Trade) | **Maturity** |
| Phase 1 | Allotment (else Trade) | **POED** (fallback Maturity if POED missing/invalid) |
| Phase 2 | **Trade Date** | **Maturity** |
| 10 Years | Allotment (else Trade) | **Rollover C/P** (fallback Maturity) |

Expiration tabs never use Last Observation alone for bucket membership.

**Observation-due tabs:** `obs-due-1m` / `obs-due-2m` / `obs-due-3m` — live book only (not expired/upcoming), with any upcoming **Average 1 / Avg. 2–7** date within 30 / 60 / 90 calendar days. Nested: 1M ⊆ 2M ⊆ 3M.

**Observation Level columns (live tabs):** fill underlying EOD closes for **settled** fixings only. Same-day (0D) stays blank until NSE cash close **15:30 IST**, then fills; future dates stay blank. See `lib/observation-settlement.ts` · `npm run verify:obs-settlement`.

**Product pickers (Valuation / Payoff / Details / Home / Analytics):** “Select the Primary Structured Product” uses `getLifecyclePickerPool()` — identical to `filterProductsByLifecycle()` for the active tab. The combobox is virtualized + scrollable and lists **every** product in that tab pool (Ongoing includes expiring 3M/1M; Expiring / Obs-due / Expired list only their own bucket). **Selection persists across pages** (Details → Valuation / Payoff) via `ProductSelectionProvider` + localStorage. `useResyncProductToLifecyclePool` only replaces the pick when it is outside the active tab pool (or empty) — it does not reset to the tab default on every navigation.

### Default product on tab change

| Tab | Default pick |
|-----|----------------|
| Ongoing / Obs-due / Expiring | Longest tenure from Working!F (Phase 2 → Trade Date; else Allotment) → today |
| Expired | Most recent phase schedule end (Blank/P2 Maturity · Phase 1 POED · 10Y Rollover) |

**Expiry bucket membership** (Ongoing / Expiring 3M / 1M / Expired / product list days) uses that same phase schedule end — not always master Maturity.

**Audit:** `npm run verify:seamlessness` · `npm run verify:filter-parity` · `npm run verify:obs-due` · `npm run verify:phase-logic`

**Product count** = length of filtered pool.  
**Updated time** = `usePortfolioClock().asOf` (refreshes every 60s).

---

## KPI definitions (Lifecycle Category Analytics band)

Run audit anytime:

```bash
npm run verify:kpis ongoing
npm run verify:kpis          # all four buckets
```

### 1. AUM

```typescript
aum = pool.reduce((sum, p) => sum + (p.tradeAmount ?? 0), 0);
display = formatKpiNotional(aum);  // crores, 2 dp
```

| Field | Excel column | Notes |
|-------|--------------|-------|
| `tradeAmount` | **Trade Amount** | Parsed as number (commas stripped) |

**Not** debenture price × count — book AUM is trade notional from master.

---

### 2. Avg Full Coupon

```typescript
coupons = pool.map(getCouponPercent).filter(isFinite);
avgCoupon = sum(coupons) / coupons.length;  // arithmetic mean
display = formatPercent(avgCoupon);
```

| Source | Priority | Notes |
|--------|----------|-------|
| `product.couponPercent` | 1 | Parsed **Coupon (%)** |
| Raw **Coupon (%)** | 2 | Direct master column |
| Raw **Coupon / PR / DM** or **Product return** | 3 | **Master Excel column kept** (reference parity). Product Specs prefer **Coupon (%)**; CC1 / first `%` token fallback via `getCouponPercent()` |

> This is **average headline coupon** across products with a parseable coupon — **not AUM-weighted**.

---

### 3. Avg Absolute Return

```typescript
// Per product in active / expiring tabs:
absReturn = computeValuation(product, {
  valuationDate, currentLevel: resolveLiveIndexLevel(product, { niftyLevel, sensexLevel }),
  debentures: inferDebentureCount(product),
}).absReturn;

// Panel shows arithmetic mean across pool (finite values only)
display = formatPercent(mean(absReturns), 1);
```

| Tab | Behaviour |
|-----|-----------|
| Ongoing / Expiring | Live mark at desk index levels (Yahoo + selection state) |
| Expired | **AUM-weighted** avg at last observation — historical Nifty/Sensex per product’s final obs date via `/api/analytics/category-stats` (Mongo → bundled history → Yahoo) |

Implementation: `getLifecycleCategoryStats()` in `lib/analytics.ts` · deferred compute in `lifecycle-lab.tsx`.

---

### 4. Listed

```typescript
listedShare = listedCount / pool.length;
listedCount = pool.filter(p => p.listing?.toLowerCase() === "listed").length;
display = formatPercent(listedShare);
```

Excel column: **Listing** (`Listed` / `Unlisted`).

---

### Protected (Home headline only)

`classifyProtection()` in `lib/product-utils.ts` still drives **Home** headline stats via `buildLifecycleIndex()` but is **not** shown in the Lifecycle Category Analytics KPI band (Jul-2026).

1. Empty → `unknown` (not counted as protected)
2. Contains **"non"**, **"npp"** → `exposed` (checked **before** "principal protected")
3. Contains **"principal protected"**, **"capital guarantee"**, **"pp"** → `protected`

---

## Science Lab — Issuer Exposure chart

**File:** `components/analytics/science-lab.tsx` · data: `getIssuerExposure()` in `lib/analytics.ts`

| Property | Behaviour |
|----------|-----------|
| Scope | All distinct issuers in the active lifecycle tab |
| Weight | AUM-weighted (`tradeAmount`) |
| Axis labels | Short formatted names (`lib/issuer-chart-labels.ts`) |
| Tooltip | Full issuer name + notional in crores |
| Chart height | Scales with issuer count (compact bars when > 10 rows) |

Unlike **Underlying Exposure** (top 2 + Other rollup), issuer chart shows **every** counterparty — no Other bucket.

---

## Maturity Ladder (Home) & Tenor Profile (Analytics)

**Jul-2026:** dual-bar / Rollover Tenor ladder removed — both charts are **single series**.

| Chart | Location | Series | Axis / subtitle |
|-------|----------|--------|-----------------|
| **Maturity Ladder** | Home (`dashboard-shell.tsx`) | Notional by remaining window (live tabs) or elapsed window (Expired) to **phase schedule end** | Subtitle: *phase schedule end (Maturity / POED / Rollover)* — not rollover date vs expiration date |
| **Tenor Profile** | Analytics Science Lab (`science-lab.tsx`) | **Live tabs:** notional by **remaining** window to phase schedule end (`getTenorDistribution`). **Expired:** full phase tenure (Working!F → schedule end). Same SSOT as Maturity Ladder — not master Tenor Days when calendar is known. |

Implementation: `getMaturityLadder`, `getMaturityLadderSubtitle`, `getTenorDistribution` in `lib/analytics.ts` · audit: `npm run verify:analytics-plots`.

---

## Coupon spread table (Lifecycle Category Analytics)

Single table grouped by **all distinct underlyings** in the bucket. Each underlying section shows min / max / avg for Initial Level, Target Level, Full Coupon, and Absolute Return.

| Row | Ongoing / Expiring | Expired tab |
|-----|-------------------|-------------|
| Initial Level | Min / max / avg entry from master | Same |
| Target Level | Min / max / avg target (> 0 only) | Same |
| Full Coupon | Headline coupon from master | Same |
| Absolute Return | Live mark `absReturn` across pool | AUM-weighted mark at last observation (historical index) |

Implementation: `buildUnderlyingSpreadSections()` in `lib/analytics.ts` · UI: `AnalyticsSpreadTable` in `lifecycle-lab.tsx`.

---

## UI vs headline Home KPIs

| Location | What it shows |
|----------|----------------|
| **Lifecycle Category Analytics** | AUM, Avg Full Coupon, Avg Absolute Return, Listed — **selected tab only** |
| **Science Lab charts** | Lifecycle pie, coupon, protection, underlying (top 2 + Other), **all issuers**, **Tenor Profile** (single series) |
| **Lifecycle Intelligence table** | **Full book** status breakdown; rows in the active tab are highlighted |
| **Home top band** | Tab-aligned counts via `filterProductsByLifecycle` — includes **Listed** and **Protected** shares from `buildLifecycleIndex` |

Headline **Ongoing** count = Ongoing tab (ongoing + perpetual; **excludes unknown**). **Expiring in 3M** includes 1M + 3M statuses. Matches `npm run verify:kpis`.

### Portfolio product list — Days Left

Column label: **Days Left** (`lib/valuation-labels.ts` → `PORTFOLIO_DAYS_COLUMN_LABEL`).

| Lifecycle | Meaning |
|-----------|---------|
| Ongoing / Expiring | **Days Left to Expiry** — calendar days until phase end (Maturity / Phase 1 POED / 10Y Rollover) |
| Expired | **Days Since Expiry** — calendar days since that same phase end |

Shown in `lifecycle-product-list.tsx` with tooltip; MTM from `loadPortfolioSnapshotMap` (cached across pages).

---

## When KPIs look wrong

| Symptom | Check |
|---------|-------|
| AUM off after upload | Re-upload master; confirm **Trade Amount** column parsed |
| Avg Coupon 0% or NaN | Missing **Coupon (%)** on many rows — run `verify:kpis` |
| Avg Absolute Return — | Expired tab by design; Ongoing needs live index levels |
| Listed always 0% | **Listing** column spelling must be exactly `Listed` (case-insensitive) |
| Issuer chart missing names | All issuers shown — scroll chart; hover for full name |
| Stale timestamp | `usePortfolioClock` — wait 60s or change system date |
| Tab doesn't match list | Same `filter` prop must be passed to `LifecycleProductList` and `LifecycleAnalyticsGrid` |

---

## Code references

```
lib/product-lifecycle.ts     → filterProductsByLifecycle, getProductLifecycleStatus
lib/product-utils.ts         → getCouponPercent, classifyProtection, resolveLiveIndexLevel
lib/analytics.ts             → getLifecycleCategoryStats, getIssuerExposure
lib/issuer-chart-labels.ts   → formatIssuerChartLabel, issuerAxisWidth
lib/portfolio-snapshot-store.ts → cached portfolio MTM across routes
lib/utils.ts                 → formatCrores, formatPercent
components/analytics/lifecycle-lab.tsx
components/analytics/science-lab.tsx
scripts/verify-lifecycle-kpis.ts
scripts/verify-analytics-plots.ts
```

Full calculation audit: [11-calculation-review.md](11-calculation-review.md).
