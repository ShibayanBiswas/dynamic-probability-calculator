# Deploy Dynamic Probability Calculator — Vercel + Render

**Repo:** https://github.com/ShibayanBiswas/dynamic-probability-calculator  
**Env source (local only, never commit):** Primary SP Dashboard `.env.local`  
**Node:** `24.x`

---

## 1) Env keys (copy values from Primary SP `.env.local`)

| Key | Needed on DPC cloud? | Notes |
|-----|----------------------|--------|
| `MONGODB_URI` | **YES** | Paste from Primary SP `.env.local` |
| `MONGODB_DB` | **YES** | Must be `sp_dashboard` |
| `PYTHON_API_URL` | **NO** | Primary-only; DPC uses Node pivot |
| `NODE_VERSION` | Render only | `24` |
| `NODE_OPTIONS` | Optional (Render) | `--max-old-space-size=1536` |

Do **not** commit real URIs/passwords. Set them only in Vercel / Render / local `.env.local`.

### Vercel env (Production + Preview)

```env
MONGODB_URI=<paste from Primary SP .env.local>
MONGODB_DB=sp_dashboard
```

### Render env

```env
MONGODB_URI=<paste from Primary SP .env.local>
MONGODB_DB=sp_dashboard
NODE_VERSION=24
```

---

## 2) One-time before deploy (PC)

1. Atlas → Network Access → allow `0.0.0.0/0`  
2. Point this project’s `.env.local` at the same Atlas URI as Primary  
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
| Node.js Version | **24.x** |

4. Add `MONGODB_URI` + `MONGODB_DB` (Production + Preview)  
5. Deploy the **latest `main`** commit (not an old failed deployment)  
6. Open `https://YOUR-APP.vercel.app/probability`

---

## 4) Render steps (optional — Vercel alone is enough)

1. https://render.com → **New** → **Web Service**  
2. Connect same repo  
3. Build: `npm ci && npm run build` · Start: `npm start` · Health: `/`  
4. Paste Render env block  
5. Deploy

---

## 5) Vercel build notes

- Pinned deps (no `"latest"` drift)  
- `engines.node` = `24.x`  
- `@emnapi/*` locked in `package-lock.json`  
- `vercel.json` uses `npm install`
