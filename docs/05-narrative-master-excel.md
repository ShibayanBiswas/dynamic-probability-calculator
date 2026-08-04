# 05 — Narrative & master Excel

**Updated:** 2026-08-04

## Master workbook

Local (gitignored): `New Product Master_.xlsx`

| Sheet | Use |
|-------|-----|
| NEW PRIMARY / Primary | Product rows |
| Formulae / Product Explanation | Formula text for past-final payoff plot; narrative **not** shown on past-final probability panel |

### Bake pipeline

```powershell
npm run bake
# build-new-primary-sheet → bake-master-seed → copy-master-to-public
```

Outputs: `lib/data/master-seed.json`, `master-sheet-grids.json`, `public/data/New Product Master_.xlsx`.

Upload from Home / `/upload` parses client-side → IndexedDB → optional Mongo sync.

On **Vercel**, product bootstrap prefers the **CDN/static seed** (`USE_STATIC_SEED`) rather than shipping a full Mongo product dump in one response. Mongo still overlays index prices / path history when configured.

### ISIN merge precedence

When multiple master rows share an ISIN: **Phase 2 > Phase 1 > 10 Years > Blank** (`lib/master/new-primary-merge.ts`).

## Display names — no parentheses

`lib/product-display-name.ts`:

- Appends ` · Rollover Phase 1` / ` · Rollover Phase 2`
- Strips legacy `(ROLLOVER PHASE n)` on hydrate

## Intel `/intelligence`

- **Logic Atlas** (`lib/logic-atlas.ts` + `logic-atlas-console.tsx` + `logic-flow-diagram.tsx`)
  - Connected module cards with metric chips
  - Active pipeline stage cards with **detail / metrics / tags / stage index**
  - Module Intelligence (purpose + insights or selected-stage deep dive)
  - Module Outputs (numbered deliverables)
  - Primary Portfolio Command (category routing + support layers)
  - Verified against engine 2026-08-04 — see [16 §11](16-product-type-probability-logic.md)
- Category lanes / computation primitives table
- **MasterSheetPivot** — same explorer pattern as Primary SP
- Pivot API `POST /api/pivot` → Node engine (`lib/pivot/engine.ts`)

## Product Specifications

`lib/product-specifications.ts` — ordered rail including Coupon Percentage, Target Level, Last Observation Date, Trade Amount in Rupees, etc.  
Used on past-final panels and probability Excel/PDF exports.

On Probability summary, **Observation Schedule sits above** Product Specs.

## Exports

`lib/workbook/export-probability-screen.ts` — Primary SP–style Excel/PDF:

- Logo / gold masthead  
- KPI tiles  
- Specs + schedule  
- Path samples when present  
- Disclaimer stack  

Memory-safe: summary/path exports do not dump unbounded full history by default.
