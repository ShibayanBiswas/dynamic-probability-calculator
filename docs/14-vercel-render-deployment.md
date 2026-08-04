# Deploy Dynamic Probability Calculator — Vercel + Render

**Updated:** 2026-08-04

**Repo:** https://github.com/ShibayanBiswas/dynamic-probability-calculator  
**Example production:** https://dynamic-probability-calculator-9aso.vercel.app  
**Env source (local only — never commit secrets):** Primary SP Dashboard `.env.local`  
**Node:** `20.x`

> **Security:** Never put `MONGODB_URI`, passwords, or Atlas connection strings in this repo.  
> Set them only in Vercel / Render project env panels and your local `.env.local` (gitignored).

---

## 1) Env keys (values from Primary SP `.env.local` on your PC only)

| Key | Needed on DPC cloud? | Notes |
|-----|----------------------|--------|
| `MONGODB_URI` | **YES** | Paste from Primary `.env.local` into Vercel/Render only |
| `MONGODB_DB` | **YES** | `sp_dashboard` |
| `PYTHON_API_URL` | **NO** | Not required for this app |
| `NODE_VERSION` | Render only | `20` |
| `NODE_OPTIONS` | Optional (Render) | `--max-old-space-size=1536` |

### Vercel (Production + Preview) — paste values privately in the Vercel UI

```env
MONGODB_URI=<from Primary SP .env.local — do not commit>
MONGODB_DB=sp_dashboard
```

### Render

```env
MONGODB_URI=<from Primary SP .env.local — do not commit>
MONGODB_DB=sp_dashboard
NODE_VERSION=20
```

---

## 2) One-time before deploy (PC)

1. Atlas → Network Access → allow `0.0.0.0/0`  
2. Copy Mongo lines into this project’s `.env.local` (gitignored)  
3. Then:

```powershell
cd "C:\Users\shiba\OneDrive\Desktop\Dynamic Probability Calculator"
npm ci
npm run sync:seed
npm run sync:master
npm run sync:index-2001
```

---

## 3) Vercel steps

1. https://vercel.com → **Add New** → **Project**  
2. Import `ShibayanBiswas/dynamic-probability-calculator`  
3. Settings:

| Field | Value |
|-------|--------|
| Framework | Next.js |
| Build Command | `npm run build` |
| Install Command | `npm install` (from `vercel.json`) |
| Node.js Version | **20.x** |

4. Add env vars in the Vercel UI only (never in git)  
5. Deploy **latest `main`** (not an old failed commit)  
6. Open `https://YOUR-APP.vercel.app/probability`

---

## 4) Render (optional — Vercel alone works)

1. New Web Service → same repo  
2. Build: `npm ci && npm run build` · Start: `npm start` · Health: `/`  
3. Env: `MONGODB_URI`, `MONGODB_DB=sp_dashboard`, `NODE_VERSION=20`

---

## 5) Build notes

- Pinned deps (no `"latest"`)  
- `engines.node` = `20.x`  
- `framer-motion` pinned compatible with `motion-dom`  
- `vercel.json` uses `npm install`  
- Product bootstrap prefers **static CDN master seed** (`USE_STATIC_SEED`) — do not expect a full Mongo product dump in one browser payload  
- Mongo still valuable for `index_prices` overlays and Yahoo sync  
- Probability API: `includePaths` opt-in; route `maxDuration` capped (~60s) for serverless  
- Never commit `MONGODB_URI` or Atlas passwords  

## 6) Post-deploy smoke

1. `/probability` — schedule above specs; KPIs load  
2. `/initial-probability` — inline progress; path frontier near latest series day  
3. `/intelligence` — Logic Atlas Connected + detailed Active pipeline  
4. Lifecycle table — Initial Level + As of Today's Date columns present  
5. Optional: `npm run verify:probability-desk` locally against the same seed  

Product-type logic reference: [16-product-type-probability-logic.md](16-product-type-probability-logic.md)
