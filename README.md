# Dynamic Probability Calculator

Anand Rathi Wealth desk for **live Primary structured-product probability** analytics.

Clones the Primary SP Dashboard visual system, lifecycle book, MongoDB product/index spine, and phase-aware tenure — then replaces Product Details / Valuation / Payoff with:

| Surface | Route | Excel reference |
|---------|-------|-----------------|
| **Probability** | `/probability` | NSP **Probability** sheet |
| **Initial Probability** | `/initial-probability` | **Initial Prob** sheet |
| **Current Probability** | `/current-probability` | **Backtesting** sheet |

Expired products are **excluded** from UI lifecycle pills and the live book.

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
| Architecture / caches | [docs/01-architecture.md](docs/01-architecture.md) |
| Excel parity | [docs/02-probability-excel-parity.md](docs/02-probability-excel-parity.md) |
| Debug symptoms | [docs/08-debug-playbook.md](docs/08-debug-playbook.md) |
| Prompt PASS board | [docs/15-requirements-fulfillment.md](docs/15-requirements-fulfillment.md) |
| Vercel / Render | [docs/14-vercel-render-deployment.md](docs/14-vercel-render-deployment.md) |

## Quick verify

```powershell
npm run verify:probability-desk
```

## Labels policy

User-facing labels must **not** use parentheses `()`. Rollover phase uses ` · Rollover Phase 1` / ` · Rollover Phase 2`.

## References (offline)

| Path | Role |
|------|------|
| `New Product Master_.xlsx` | Master book |
| `NSP's under Risk.xlsm` | Probability formulas |
| Primary SP Dashboard | UI / lifecycle / Mongo clone source |
| Gift AIF Backtester | Daily path frequency reference only |
