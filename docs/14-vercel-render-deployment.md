# Deploy Dynamic Probability Calculator — Vercel + Render

**Repo:** https://github.com/ShibayanBiswas/dynamic-probability-calculator  
**Source of env values:** Primary SP Dashboard  
`C:\Users\shiba\OneDrive\Desktop\Primary SP Dashboard\.env.local`  
**Node:** `24.x` (required by Vercel as of 2026)

---

## 1) Every env key from Primary SP

### What Primary actually has in `.env.local` (use these)

| Key | Value (from Primary SP) | Needed on DPC cloud? |
|-----|-------------------------|----------------------|
| `MONGODB_URI` | `mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority` | **YES** |
| `MONGODB_DB` | `sp_dashboard` | **YES** |
| `PYTHON_API_URL` | `http://127.0.0.1:8000` | **NO** for this app (Node pivot is enough) |

> Password in the URI is `Sb@04052003` with `@` written as `%40`.

### Extra keys for Render / Vercel

| Key | Value | Where |
|-----|-------|--------|
| `NODE_VERSION` | `24` | **Render only** |
| `NODE_OPTIONS` | `--max-old-space-size=1536` | Optional (Render) |
| `NODE_ENV` / `PORT` / `VERCEL` | auto | Do not set |

---

## 2) COPY-PASTE BLOCKS

### Vercel (Production + Preview)

```env
MONGODB_URI=mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sp_dashboard
```

### Render

```env
MONGODB_URI=mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sp_dashboard
NODE_VERSION=24
```

---

## 3) One-time before deploy (PC)

1. Atlas → Network Access → allow `0.0.0.0/0`  
2. Then:

```powershell
cd "C:\Users\shiba\OneDrive\Desktop\Dynamic Probability Calculator"
npm ci
npm run sync:seed
npm run sync:master
npm run sync:index-2001
```

---

## 4) Vercel steps

1. https://vercel.com → **Add New** → **Project**  
2. Import `ShibayanBiswas/dynamic-probability-calculator`  
3. Settings:

| Field | Value |
|-------|--------|
| Framework | Next.js |
| Build Command | `npm run build` |
| Install Command | `npm install` (from `vercel.json`) |
| Node.js Version | **24.x** |

4. Add the two env vars above (Production + Preview)  
5. Deploy  
6. Open `https://YOUR-APP.vercel.app/probability`

If an old deploy failed: open **Deployments** → latest on `main` (`6af992b`+) → Redeploy.

---

## 5) Render steps (optional — Vercel alone is enough)

1. https://render.com → **New** → **Web Service**  
2. Connect same repo  
3. Build: `npm ci && npm run build` · Start: `npm start` · Health: `/`  
4. Paste Render env block (`NODE_VERSION=24`)  
5. Deploy

---

## 6) What we fixed for Vercel build

- Pinned all deps (no more `"latest"` drift)  
- `engines.node` = `24.x`  
- Locked `@emnapi/core` / `@emnapi/runtime` `1.11.3` into `package-lock.json`  
- `vercel.json` uses `npm install` so install cannot fail on stale `npm ci` sync  

Keep the repo **private** — the URI includes your Atlas password.
