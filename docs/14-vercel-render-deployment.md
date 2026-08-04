# Deploy Dynamic Probability Calculator — Vercel + Render

**Repo:** https://github.com/ShibayanBiswas/dynamic-probability-calculator  
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
