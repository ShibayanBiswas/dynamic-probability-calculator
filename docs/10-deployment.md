# 10 — Deployment (local)

**Updated:** 2026-08-04

For **Vercel and Render cloud deploy**, use the full guide:

→ **[14-vercel-render-deployment.md](14-vercel-render-deployment.md)**

Example live app: https://dynamic-probability-calculator-9aso.vercel.app

## Local development

| Item | Value |
|------|-------|
| URL | http://localhost:3001 |
| Start | `npm run dev` or `.\start-dashboard.ps1` |
| Stop | Ctrl+C or `.\start-dashboard.ps1 -Stop` |
| Production-like | `npm run build` then `npm start` (honors `PORT`, default 3001) |
| Node | ≥ 20 |

### Environment

Copy `.env.example` → `.env.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=sp_dashboard
```

Mongo optional. Without it, baked `master-seed.json`, Gift `nifty-daily-2001.csv`, and bundled Sensex JSON power the desk. On Vercel, product bootstrap prefers the static CDN seed even when Mongo is configured for prices.

### Docker Mongo

```powershell
docker compose up -d
npm run verify:mongo
npm run sync:seed
```

## Production pointers

- Start script: `node scripts/start-production.mjs` — binds `0.0.0.0` and `process.env.PORT \|\| 3001`.  
- Build runs `copy:assets` so seed + master xlsx are in `public/data`.  
- Python pivot is **not** required.  
- Prefer MongoDB Atlas `sp_dashboard` shared with Primary SP for index history since 2001.

## What not to deploy

- `NSP's under Risk.xlsm` (reference only, gitignored)  
- Local `.env.local`  
- `node_modules`, `.next`  
- Office lock files `~$*`

## Health checks

1. `/` returns 200  
2. `POST /api/probability/run` on a known ISIN  
3. `/intelligence` Master pivot responds  
4. `npm run verify:probability-desk` in CI or pre-release
