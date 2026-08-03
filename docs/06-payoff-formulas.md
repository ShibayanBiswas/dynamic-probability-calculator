# Payoff & Formula Engine

> **Doc refresh:** 2026-07-20 — Payoff inputs: Working!F phase start; Initial Price / Debenture read-only.

## Core symbol

**Z** = underlying performance vs initial fixing (decimal):

```
Z = (currentOrFinalLevel / entryLevel) − 1
```

Example: Nifty 23,548 vs entry 16,800 → Z ≈ **0.402** (+40.2%).

Payoff page **Current Level** = live Yahoo Nifty/Sensex (`resolveLiveIndexLevel`) — read-only.

---

## Formula engine

File: `lib/workbook/formula-engine.ts`

1. Strip leading `=`
2. Replace `%` tokens → decimal (`7500%` → `75.0` in expression after ÷100 — actually `7500%` → `75` wait)

Tokenization: `7500%` → `75` (7500/100). So `(Z-32%)*7500%` → `(z-0.32)*75`.

3. Replace `IF(cond, a, b)` → ternary (supports chained IFs via `parseAllIfs`)
4. `AND` / `OR` → `&&` / `||` (nested via `replaceAndOrCalls`)
5. `MIN`/`MAX`/`ABS` → `Math.min`/`Math.max`/`Math.abs`
6. Evaluate with `new Function("z", "Math", ...)`

Public API:

| Function | Use |
|----------|-----|
| `evaluatePayoffFormula(formula, z)` | Returns number; errors → 0 |
| `tryEvaluatePayoffFormula(formula, z)` | QA — returns `{ ok, value \| error }` |
| `buildPayoffCurve(formula)` | Chart points — Z from **−0.5 to +0.75** (41 steps) |

**Entry level for scenarios:** `getIndexEntryLevel(product)` (index fixing; defaults to **10,000** if master blank). `getPayoffEntryLevel()` exists but is **not** used in scenario builders.

---

## Scenario table XIRR tenor

File: `lib/workbook/payoff-scenarios.ts` — `resolvePayoffScenarioTenorDays()` · SSOT: `getPhasePayoffTenorDays()` in `lib/product-dates.ts`

| Rollover Phase | Working!F | Schedule end | Payoff XIRR tenor |
|----------------|-----------|--------------|-------------------|
| **Blank** | Allotment | Maturity | Allotment → Maturity |
| **Phase 1** | Allotment | POED (fallback Maturity) | Allotment → POED |
| **Phase 2** | Trade Date | Maturity | **Trade → Maturity** |
| **10 Years** | Allotment | Rollover C/P | Allotment → Rollover |

UI + Excel exports pass `{ expired, valuationDate }` via `payoffInputsFromDesk()`. **Ongoing and expired** both annualise over the same contractual phase span (`getPhasePayoffTenorDays`) — expired is **not** truncated to last observation.

Verify:

| Script | Scope |
|--------|--------|
| `npm run verify:payoff-xirr` | **72,954** scenario rows (4,151 formula products × 18 offsets) |
| `npm run verify:rollover-phase` | Working!F / schedule end / payoff tenor — 4,179 products |
| `npm run verify:phase-logic` | Blank / P1 / P2 / 10Y — payoff tables + marks — **PASS** |
| `npm run verify:irr-phase-tenure` | Product IRR ↔ scenario XIRR — **4,053/4,053** |

---

`buildEnhancedPayoffScenarioTable(product, inputs, marketMove)`:

- Standard Excel offset rows
- **Initial Level** row at Z = 0 (always)
- **Target Level** row at Z = Target/Entry − 1 whenever master Target is distinct and &gt; 0
- **Pivot rows** at formula kinks (32%, 33%, −15%, …)
- **Current row** highlighted at live `marketMove`

Verify: `npm run verify:payoff-levels`

CSS: `.pivot-row`, `.current-row` in `app/globals.css` · Initial/Target badges in `payoff-scenarios-table.tsx`

---

## Inputs (payoff)

| Field | Source |
|-------|--------|
| Product | Lifecycle-filtered pool (`getLifecyclePickerPool` — dynamic from uploaded master) |
| Index levels | Yahoo live / historical on observation date — **read-only**. Custom underlyings use dedicated series (not Nifty). |
| Allotment / Trade Date | Working!F as **Start Date** — Allotment for Blank / Phase 1 / 10 Years; Trade Date for Phase 2 — **read-only** |
| No. of Debentures | Editable; defaults from `inferDebentureCount()` |
| Initial Price / Debenture | Master `getDebenturePrice()` — **read-only** (not editable) |

---

## Known formula limitations

Some master rows reference Excel-only tokens — engine cannot evaluate:

| Token | Example product | QA code |
|-------|-----------------|--------|
| ISIN as formula | Protected call row | `FORMULA_EVAL` |
| `(Z%)*100%` typo | Nifty Accelerator 407 | `FORMULA_EVAL` |
| `MAZ`, `C2`, `Z0` | Legacy workbook refs | `FORMULA_EVAL` |

Fix in **Formulae** column in master Excel, then rebake.

---

## Debug payoff

```bash
npx tsx -e "
import seed from './lib/data/master-seed.json';
import { evaluatePayoffFormula } from './lib/workbook/formula-engine';
const p = seed.products.find(x => x.isin === 'INE093JA77C4');
for (const z of [0, 0.32, 0.33, 0.40]) {
  console.log('Z', z, '→', (evaluatePayoffFormula(p.formulaText, z)*100).toFixed(1)+'%');
}
"
```

| Symptom | File |
|---------|------|
| Wrong move % | `resolveLiveIndexLevel`, entry level |
| Missing pivot rows | `findPayoffPivotZs` |
| Chart vs table mismatch | Same `marketMove` prop to both |
| Payoff anchor date | Rollover-schedule → last obs; else maturity (`productHasRolloverSchedule`) |

## Screen Excel export (Payoff + Product Details)

`downloadPayoffScreenExcel` / `downloadProductDetailsScreenExcel` in `lib/workbook/export-screen.ts`:

- Main sheet: desk inputs, KPIs, specifications, observation dates, payoff scenario table (Excel formulas for performance / XIRR)
- **Payoff Curve** sheet — index-move sweep with hover notes on kink rows
- **Formula Guide** sheet on portfolio / full-workbook exports — column logic for Days Left, Observation Levels (0D EOD), Effective Target, IRR
- Static payoff plot PNG embedded on main sheet
- Filenames: `SP-{Screen}-{ISIN}-{DD-MM-YYYY}.{xlsx|pdf}` via `buildDeskExportFilename`
- Lazy-loaded via `lib/workbook/excel-runtime.ts`; UI guard in `useScreenExcelExport()`
