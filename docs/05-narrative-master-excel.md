# 05 — Narrative & master Excel

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

## Display names — no parentheses

`lib/product-display-name.ts`:

- Appends ` · Rollover Phase 1` / ` · Rollover Phase 2`
- Strips legacy `(ROLLOVER PHASE n)` on hydrate

## Intel `/intelligence`

- Logic Atlas modules (`lib/logic-atlas.ts`) — probability-oriented copy  
- Category lanes / primitives  
- **MasterSheetPivot** — same explorer pattern as Primary SP  
- Pivot API `POST /api/pivot` → Node engine (`lib/pivot/engine.ts`)

## Product Specifications

`lib/product-specifications.ts` — ordered rail including Coupon Percentage, Target Level, Last Observation Date, Trade Amount in Rupees, etc.  
Used on past-final panels and probability Excel/PDF exports.
