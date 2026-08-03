# Dynamic Probability Calculator

Anand Rathi Wealth desk for live Primary structured-product **probability** analytics.

Same visual system and dynamic spine as the Primary SP Dashboard — master upload, MongoDB products and index history, lifecycle book, phase-aware tenure — with desk surfaces:

- **Probability** — summary results panel
- **Initial Probability** — path backtest from actual phase start
- **Current Probability** — path backtest from valuation date

## Run locally

```powershell
npm install
npm run dev
```

App: http://localhost:3001

Or full stack:

```powershell
.\start-dashboard.ps1
```

Requires Node 20+. MongoDB optional but recommended (`MONGODB_URI` / `MONGODB_DB=sp_dashboard`) for shared product master and index prices since 2001.
