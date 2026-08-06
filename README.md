# Dynamic Probability Calculator

Anand Rathi Wealth desk for **live Primary structured-product probability** analytics.

Clones the Primary SP Dashboard visual system, lifecycle book, MongoDB product/index spine, and phase-aware tenure — then replaces Product Details / Valuation / Payoff with:

| Surface | Route | Excel reference |
|---------|-------|-----------------|
| **Probability** | `/probability` | NSP **Probability** sheet |
| **Initial Probability** | `/initial-probability` | **Initial Prob** sheet |
| **Current Probability** | `/current-probability` | **Backtesting** sheet |

Expired products and names whose **last observation has already settled** are **excluded** from UI lifecycle pills and the live book.

## Probability by product type (Rollover Phase)

| Phase | Actual Start for Initial | Live-book phase end |
|-------|--------------------------|---------------------|
| Blank | Allotment (else Trade) | Maturity |
| Phase 1 | Allotment (else Trade) | POED if valid, else Maturity |
| Phase 2 | **Trade Date** | Maturity |
| 10 Years | Allotment (else Trade) | Rollover if present, else Maturity |

Initial uses a Start Level cushion (Nifty ×1.01 / Sensex ×1.006, ceiling to 100) vs Target÷Entry.  
Current uses remaining observation averages vs Effective Target÷desk mark when fixings have settled (else Target÷mark; 15:30 IST rule).  
Effective Target on the lifecycle table is the same remaining-hurdle average formula.

**Read:** [docs/12-probability-plain-english.md](docs/12-probability-plain-english.md) · **Deep audit:** [docs/16-product-type-probability-logic.md](docs/16-product-type-probability-logic.md)

## Recent desk behaviour (do not regress)

- Schedule **above** Product Specs on Probability summary; no path table on summary  
- Inline path-load progress on Initial/Current (no modal)  
- Path frontier trimmed; last Yes = Actual Start (Initial) / latest series session (Current); default filter **All**  
- Current: full Observation schedule + ALREADY PASSED placeholders; remaining-only average + Effective Target hurdle  
- Lifecycle columns: **Observation 1–7**, **Initial Level**, **As of Today's Date**, Trade / Allotment / Actual Start / POED / Rollover Phase / Maturity / Rollover / Effective Target  
- **Portfolio by Lifecycle** downloads (**Export view** / **Full workbook**) wait until every product Initial/Current Prob is calculated, then export  
- Primary-grade Excel/PDF exports  
- Logic Atlas Active pipeline cards with detail, metrics, tags  
- Vercel: Node 20, CDN master seed preferred, `includePaths` opt-in, capped probability API duration, full-book slim warm batches 

## Run locally

```powershell
npm install
npm run dev
# → http://localhost:3001
```

Or with optional Mongo:

```powershell
.\start-dashboard.ps1
```

Requires **Node 20+**. MongoDB optional but recommended (`MONGODB_URI`, `MONGODB_DB=sp_dashboard`).

## Documentation

**Start here:** [docs/README.md](docs/README.md)

| Need | Doc |
|------|-----|
| Layman probability | [docs/12-probability-plain-english.md](docs/12-probability-plain-english.md) |
| Product-type / phase audit | [docs/16-product-type-probability-logic.md](docs/16-product-type-probability-logic.md) |
| Path engine | [docs/06-probability-path-engine.md](docs/06-probability-path-engine.md) |
| Math review | [docs/11-calculation-review.md](docs/11-calculation-review.md) |
| Architecture / caches | [docs/01-architecture.md](docs/01-architecture.md) |
| Excel parity | [docs/02-probability-excel-parity.md](docs/02-probability-excel-parity.md) |
| Lifecycle / Effective Target | [docs/04-lifecycle-analytics-kpis.md](docs/04-lifecycle-analytics-kpis.md) |
| Debug symptoms | [docs/08-debug-playbook.md](docs/08-debug-playbook.md) |
| Prompt PASS board | [docs/15-requirements-fulfillment.md](docs/15-requirements-fulfillment.md) |
| Vercel / Render | [docs/14-vercel-render-deployment.md](docs/14-vercel-render-deployment.md) |

## Quick verify

```powershell
npm run verify:probability-desk
npm run verify:phase-logic
```

## Labels policy

User-facing labels must **not** use parentheses `()`. Rollover phase uses ` · Rollover Phase 1` / ` · Rollover Phase 2`.

## Production

Example Vercel app: https://dynamic-probability-calculator-9aso.vercel.app  
Repo: https://github.com/ShibayanBiswas/dynamic-probability-calculator

## References (offline)

| Path | Role |
|------|------|
| `New Product Master_.xlsx` | Master book |
| `NSP's under Risk.xlsm` | Probability formulas |
| Primary SP Dashboard | UI / lifecycle / Mongo clone source |
| Gift AIF Backtester | Daily path frequency reference only |
