# Valuation — Excel Working Sheet Parity

> **Doc refresh:** 2026-08-01 — Jun-26 Logic sheet (avg lock / second-last extrap); live Working!V = grow / 11% discount (no post-obs Y override).  
> **Plain-English guide:** [12-valuation-plain-english.md](12-valuation-plain-english.md)

Reference: `Primary Structured Products Valuation - 31st May 26.xlsm` → sheet **Working**  
Logic path: `Primary Structured Products Valuation - 30th Jun 26.xlsm` → sheet **Logic**  
Valuation date **B1** = 31-May-26 (serial 46173) · Nifty **D1** · Sensex **C1**

## Desk engine vs frozen Working sheet (May-26)

The live desk **extends** the May-26 Excel Working model with the Jun-26 **Logic** sheet path. Mode B parity (`npm run verify:valuation`) passes when Excel row inputs (F, H, I, K, M, U, P, S) are replayed — see [valuation-audit-31-may-26.md](valuation-audit-31-may-26.md) (auto-generated). Live marks use Logic I/II (`resolveValuationExpectedLevel`); Mode B desk-row replay keeps classic Working!N (`computeExpectedUnderlyingLevel`).

**Custom underlyings:** expired stock/commodity products use dedicated Yahoo/estimate series (`verify:custom-underlyings`) — Working sheet Mode A/B audits remain Nifty/Sensex-centric.

| Topic | Frozen Working (May-26) | Live desk (Aug-2026) | Same math? |
|-------|-------------------------|----------------------|------------|
| **Working!I** | 2nd-last observation on/before B1 | **Last** scheduled observation | N/O/V chain **same formulas**, different **I** anchor |
| **Forward path (I ≥ B1)** | XIRR from entry → B1, project to **I** → **N** → **O** → formula **S** | Live Logic II: no-obs spot→**second-last**; Logic I: ≥1 obs = avg of settled fixings (lock) | Classic path for Mode B; Logic path for live |
| **Historical path (I < B1)** | VLOOKUP index at **I** → **N** → **O** | Live: average of all obs fixings locks **N** | **Desk extension** |
| **Full coupon** | Excel ProductReturns / barrier rows | **Projected** (before last obs): locked/extrapolated N ≥ target or flat-coupon band → headline **S**. **Realised** (after last obs): avg levels > target | **Desk extension** |
| **Post last obs** | Excel Working!V discounts @ 11% when I < B1 | Same Working!V path to phase end (Maturity / POED / Rollover) — **not** post-obs Y compounding | Yes (live aligned to Logic + Working!V) |
| **Pre-obs discount** | 11% from maturity to B1 when I < B1 | Same (`computeWorkingFinalValuation`) | Yes |

### Full coupon + extrapolation — confirmed behaviour

| Valuation date vs last obs | Live underlying path | Full coupon? | Post-last-obs quote? |
|----------------------------|----------------------|--------------|----------------------|
| **No obs yet** | Spot IRR → **second-last** obs (Logic II) | **Projected** if extrapolated N clears barrier | No — grow path |
| **≥1 obs passed** | Average of realised fixings (Logic I lock) | **Projected** if locked N clears barrier / flat band | No — grow path |
| **On/after last obs** | Average of realised fixings | **Yes** if avg > target | Working!V: discount @ 11% to phase end (or U·(1+S) if phase end done) |

**Verify:** `npm run verify:full-coupon` · `npm run verify:valuation-pipeline`

---

## Column chain (Working sheet)

| Col | Header | Formula / source |
|-----|--------|------------------|
| **B1** | Valuation date | Desk date (46173 = 31-May-26) |
| **C/D** | Index levels | Sensex / Nifty spot |
| **F** | Phase start | `getWorkingAllotmentDate()` — **Phase 2 → Trade Date**; Blank / Phase 1 / 10 Years → **Allotment** (Trade only if Allotment blank) |
| **G** | Valuation date | `=B$1` |
| **H** | Maturity / phase end | Maturity · Phase 1 POED · 10Y Rollover |
| **I** | Obs date | **Last** scheduled observation (desk policy Jul-2026) |
| **K** | Entry level | Initial fixing |
| **L** | (helper) | `=K*-1` (XIRR outflow) |
| **M** | Current level | `IF(A="Nifty",$D$1,$C$1)` |
| **N** | Exp. underlying @ obs | Mode B: classic XIRR/VLOOKUP. Live: `resolveValuationExpectedLevel` |
| **O** | Underlying perf | `IF(N="NA",M/K-1,N/K-1)` → fed to payoff as **Z** |
| **P** | Formulae | Payoff formula text (Z) |
| **S** | Coupon Formed | Payoff formula at **O** when it evaluates; headline coupon only if formula fails |
| **T** | IRR | `(1+S)^(365/(H-F))-1` |
| **U** | Clients inv. | Debenture deal price (₹1L / ₹1.25L) |
| **V** | Final valuation | See below |
| **X** | Product value | `IF(V>U,V,U)` |
| **Y** | Product IRR | `(X/U)^(365/(G-F))-1` |
| **Z** | Abs. return | `X/U-1` |
| **AJ:AK** | Index history | Nifty closes for historical **N** |

## Working!I — observation date (column I)

**Desk policy (Jul-2026):** `resolveWorkingObservationDate()` returns the **last** observation in the master schedule.

## Desk valuation chain (Aug-2026)

1. Resolve phase start (**Working!F**) and phase schedule end from Rollover Phase (**Working!H**).
2. Build expected underlying **N** via Logic I/II (`resolveValuationExpectedLevel`) → **O** → payoff formula **S**.
3. **V/X** via `computeWorkingFinalValuation` (grow **U** by **T**, or discount **U·(1+S)** @ 11%).
4. **Full coupon:** projected before last obs; realised after last obs when average levels > target.
5. **Past last obs:** lock coupon/IRR; Working!V discounts to phase schedule end (or **U·(1+S)** if phase end is done).

## V — final valuation (column V)

Excel (row *n*):

```
=IF(I_n-$B$1>=0,
    U_n*((1+T_n)^(($B$1-F_n)/365)),
    U_n*(1+((1+S_n)/((1+11%)^((H_n-$B$1)/365))-1)))
```

Where **T** = `(1+S)^(365/(H-F))-1`.

Web implementation: `computeWorkingFinalValuation()` in `lib/workbook/valuation-serial.ts` (live path in `valuation-engine.ts` — no post-obs Y override).

- **True branch** (`I ≥ B1`): forward obs on/after desk date — compound with **T** from allotment to **B1**.
- **False branch** (`I < B1`): discount `(1+S)` from maturity/phase end to **B1** at **11%** using **(H−B1)** serial days.

## Web mapping

| Excel | Web |
|-------|-----|
| I | `resolveWorkingObservationDate()` — last obs |
| N, O | `valuation-performance.ts` |
| S | `tryEvaluatePayoffFormula(P, O)` or full-coupon override |
| V, X, Y, Z | `valuation-engine.ts` + `valuation-serial.ts` |
| AJ:AK (Nifty) | `lib/data/valuation-index-history.json` |
| Sensex historical | `lib/data/sensex-index-history.json` + Mongo/Yahoo |

### Implementation notes (Jul-2026)

| Topic | Behaviour |
|-------|-----------|
| Client investment **U** | Always `getDebenturePrice(product)` |
| Entry level **K** | `getIndexEntryLevel()` — master value or **10,000** default when blank |
| Index guards (UI) | `hasResolvedDeskIndexLevel()` blocks valuation until levels resolve |
| Expired marks | `computeExpiredMarkAtDate()` — obs dates + phase end; Logic lock → Working!V / U·(1+S) at phase end |
| Product value **X** | Rounded to integer rupees before `totalAmount = X × debentures` |
| Coupon Formed **S** | Payoff formula at Working **O** when it evaluates; headline coupon only if formula fails. CC1 parse prefers `CC1:` / first `%` token (`getCouponPercent()`) |
| **Excel Valuation Summary** | Two-row KPI tiles (label + value) — `addKpiHighlight()` in `export-screen.ts`; matches on-screen `KpiBand` |
| Expiration / Maturity | Single **Expiration Date** row when dates match (`valuation-output-fields.ts`) |

## Audit

```bash
npm run verify:valuation    # Mode A/B vs Working sheet (Mode B = Excel inputs)
npm run verify:valuation-pipeline  # Steps A→E full book replay
npm run verify:ongoing      # Ongoing sample + batch MTM
npm run verify:expired      # Expired historical marks + Logic lock → phase end U·(1+S)
npm run verify:expired-phase # Expired Blank/P1/P2 tenure + hist obs/phase-end marks
npm run verify:lifecycle-full  # Full book: all ongoing + all expired
npm run verify:31jul-nav    # 31-Jul NAV vs Logic path (99.26% exact; phaseTenureBad 0)
npm run verify:asof-levels  # Desk today vs 31-Jul index date split
npm run verify:effective-target # Effective Target full ongoing book
npm run verify:all-metrics  # Value, abs, IRR, coupon — full marked book
npm run verify:exports      # Excel/PDF export parity + Valuation Summary KPI tiles
npm run verify:rollover-phase  # Working!F / schedule end / elapsed / Phase IRRs
npm run verify:coupon-formula  # Coupon Formed === payoff formula — live + expired pools
npm run backfill:index-history
```

### Full-book verify (02-Aug-2026)

`npm run verify:lifecycle-full` marks **every** ongoing and expired product (not a 50-product sample). Ongoing and expired pool sizes **move with the calendar day** — re-run scripts for current tallies. Close-out: [13-windup-verification.md](13-windup-verification.md).

Post-last-obs Logic lock: **1,822 / 1,822** PASS (`verify:expired` — phase end U·(1+S), not Working!Y compounding).

## Rollover Phase — Working!F, schedule end, IRRs (Jul-2026)

SSOT: `lib/product-dates.ts` · audit: `npm run verify:rollover-phase`.

| Rollover Phase | Working!F (elapsed / Product & Underlying IRR start) | Schedule / MTM end (Days Left) | Payoff XIRR tenor |
|----------------|------------------------------------------------------|--------------------------------|-------------------|
| **Blank** | Allotment | Maturity | Allotment → Maturity |
| **Phase 1** | Allotment | POED (fallback Maturity) | Allotment → POED |
| **Phase 2** | **Trade Date** | Maturity | **Trade → Maturity** |
| **10 Years** | Allotment | Rollover C/P (fallback Maturity) | Allotment → Rollover |

| Rule | Behaviour |
|------|-----------|
| Valuation date picker | Clamped to phase window `[Working!F … schedule end]` |
| Days elapsed | Calendar days Working!F → valuation; **0** on the start day (not clamped to 1) |
| Underlying IRR | `(M/K)^(365/elapsed)−1`; **0%** when elapsed = 0 |
| Product IRR (live headline) | `irrFromReturn(S, phaseTenor)` — same basis as payoff scenario XIRR |
| Product IRR (Mode B / Excel replay) | Working!Y `(X/U)^(365/elapsed)−1` — Excel row replay only |
| UI labels | “since Trade Date” (Phase 2) / “since Allotment” (other phases) |

**Smoke:** Phase 2 `INE093J074Z3` @ Trade `02-05-2023` → elapsed **0**, Underlying IRR **0%** (not ~−100%).

## Product Details lifecycle metrics (Aug-2026)

| UI label | Source | Notes |
|----------|--------|-------|
| Underlying level / IRR | Spot index on **valuation date** | `M/K` annualised from **Working!F** → G (Trade Date for Phase 2) |
| Coupon formed | Projected **O** from Logic I/II path | Avg of realised fixings when ≥1 obs done; else second-last extrap |
| Absolute return / Product IRR | **V/X** chain + phase-tenure IRR headline | Abs = X/U−1; live Product IRR annualises **S** over phase life (not elapsed Y) |
| Days left | Phase schedule end | Maturity / Phase 1 POED / 10Y Rollover C/P |

**Removed:** Required Underlying IRR for Full Coupon (Jul-2026).

## Expired / post last-obs marks (Working!V)

When the valuation date is **after** the final observation (including **maturity** or **rollover C/P** on 10 Years):

| Step | Behaviour |
|------|-----------|
| 1 | Lock expected Nifty / coupon / IRR from average of realised fixings |
| 2 | Quote via Working!V: discount **U·(1+S)** @ **11%** for remaining days to phase end |
| 3 | If phase end ≤ val date → **U·(1+S)** (realised payoff) |
| Phase end | Blank/Phase 2 Maturity · Phase 1 POED · 10Y Rollover C/P |

**Verify:** `npm run verify:full-coupon` · `npm run verify:valuation-pipeline` · `npm run verify:31jul-nav`

## Screen exports (Excel / PDF)

| Section | Styling |
|---------|---------|
| Banner, KPI band | Maroon + gold Anand Rathi desk palette |
| Desk inputs, Output Sheet | Branded label/value striping |
| **Product Specifications** | **Plain white grid** — no tinted label patch (Jul-2026) |
| Product Overview | Rich prose; PDF uses light border only |
| Payoff scenarios / plot | Maroon headers; current/pivot row highlights |

Files: `lib/workbook/export-screen.ts`, `export-screen-pdf.ts`, `export-screen-shared.ts`.

## Note on 29-May vs 31-May

The repo workbook is frozen at **31-May-26** (B1). All parity runs use **B1 = 31-May-26**.
