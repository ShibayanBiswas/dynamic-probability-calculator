# Complete Deployment Guide — Vercel + Render

**App:** Dynamic Probability Calculator (Next.js)  
**Repo:** `https://github.com/ShibayanBiswas/dynamic-probability-calculator`  
**Local:** `http://localhost:3001`  
**Node:** `20`  
**Database:** MongoDB Atlas — same as Primary SP Dashboard → DB name **`sp_dashboard`**

Copy blocks below as-is. Replace only `PASTE_YOUR_ATLAS_URI_HERE` with your real Atlas URI (from Primary SP `.env.local` or Atlas UI).

---

## 0) One-time: get your Mongo URI

1. Open **Primary SP Dashboard** `.env.local` **or** Atlas → Connect → Drivers.  
2. Copy `MONGODB_URI`. It looks like:

```
mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

3. If the password has `@`, encode it as `%40` inside the URI.  
4. Atlas → **Network Access** → Add IP → **`0.0.0.0/0`** (Allow from Anywhere) so Vercel + Render can connect.

### Seed Atlas once (from your PC, before or after first deploy)

Put this in **this project’s** `.env.local`:

```env
MONGODB_URI=PASTE_YOUR_ATLAS_URI_HERE
MONGODB_DB=sp_dashboard
```

Then run:

```powershell
cd "C:\Users\shiba\OneDrive\Desktop\Dynamic Probability Calculator"
npm ci
npm run sync:seed
npm run sync:master
npm run sync:index-2001
npm run refresh:index-levels
npm run verify:mongo
```

---

## 1) COPY-PASTE — ALL ENVIRONMENT VARIABLES

### Required (both Vercel and Render)

```env
MONGODB_URI=PASTE_YOUR_ATLAS_URI_HERE
MONGODB_DB=sp_dashboard
```

### Render only (extra)

```env
NODE_VERSION=20
```

### Optional (Render — if path backtest OOMs on small instance)

```env
NODE_OPTIONS=--max-old-space-size=1536
```

### Do NOT set (auto / unused)

| Variable | Why skip |
|----------|----------|
| `NODE_ENV` | Platform sets `production` |
| `PORT` | Render sets automatically; `npm start` binds `0.0.0.0:$PORT` |
| `VERCEL` | Set automatically by Vercel |
| `PYTHON_API_URL` | Not needed (Node pivot only) |
| `MONGODB_HOST` / `MONGODB_PORT` / `MONGODB_USER` / `MONGODB_PASSWORD` / `MONGODB_AUTH_SOURCE` / `MONGODB_TLS` / `MONGODB_SRV` | Only if you are **not** using `MONGODB_URI` |

### Full optional Mongo “parts” form (only if you refuse a single URI)

```env
MONGODB_HOST=cluster0.xxxxx.mongodb.net
MONGODB_PORT=27017
MONGODB_USER=YOUR_USER
MONGODB_PASSWORD=YOUR_PASSWORD
MONGODB_AUTH_SOURCE=admin
MONGODB_TLS=true
MONGODB_SRV=true
MONGODB_DB=sp_dashboard
```

Prefer **`MONGODB_URI` + `MONGODB_DB`** only. That is what Primary SP uses.

---

## 2) VERCEL — exact clicks + paste

### Step 1 — Import

1. Go to [https://vercel.com](https://vercel.com) → **Add New…** → **Project**  
2. Import GitHub repo: **`ShibayanBiswas/dynamic-probability-calculator`**  
3. Use these settings (copy exactly):

| Field | Paste / select |
|-------|----------------|
| Framework Preset | `Next.js` |
| Root Directory | `.` (leave default) |
| Build Command | `npm run build` |
| Output Directory | *(leave default — do not set)* |
| Install Command | `npm ci` |
| Node.js Version | `20.x` (Settings → General after create) |

### Step 2 — Environment Variables (paste)

**Project → Settings → Environment Variables**

Add **both** for **Production** and **Preview** (and Development if you want):

```
MONGODB_URI
```

Value:

```
PASTE_YOUR_ATLAS_URI_HERE
```

```
MONGODB_DB
```

Value:

```
sp_dashboard
```

**Vercel bulk paste (if UI supports “Import .env”):**

```env
MONGODB_URI=PASTE_YOUR_ATLAS_URI_HERE
MONGODB_DB=sp_dashboard
```

Save → **Redeploy**.

### Step 3 — Deploy

- Push to `main`, **or**  
- Dashboard → **Deployments** → **Redeploy**

CLI optional:

```powershell
npm i -g vercel
vercel login
vercel --prod
```

### Step 4 — Smoke test

Replace host with yours:

```
https://YOUR-APP.vercel.app/
https://YOUR-APP.vercel.app/probability
https://YOUR-APP.vercel.app/initial-probability
https://YOUR-APP.vercel.app/current-probability
https://YOUR-APP.vercel.app/intelligence
```

PowerShell API check:

```powershell
$body = @{
  isin = "INE093JA77O9"
  mode = "both"
  valuationDate = "03-08-2026"
  includePaths = $false
} | ConvertTo-Json

Invoke-RestMethod `
  "https://YOUR-APP.vercel.app/api/probability/run" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"
```

### Vercel checklist

- [ ] Node **20.x**  
- [ ] `MONGODB_URI` set (Production + Preview)  
- [ ] `MONGODB_DB=sp_dashboard`  
- [ ] Atlas Network Access allows `0.0.0.0/0`  
- [ ] Atlas seeded (`sync:seed` + `sync:index-2001`)  
- [ ] `/probability` loads after Reveal  

---

## 3) RENDER — exact clicks + paste

### Step 1 — New Web Service

1. Go to [https://render.com](https://render.com) → **New +** → **Web Service**  
2. Connect GitHub → **`ShibayanBiswas/dynamic-probability-calculator`**  
3. Paste these settings **exactly**:

| Field | Paste / select |
|-------|----------------|
| Name | `dynamic-probability-calculator` |
| Region | Singapore (or nearest) |
| Branch | `main` |
| Root Directory | *(leave empty)* |
| Runtime | `Node` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Instance Type | `Starter` or higher (not Free if you need always-on) |

### Step 2 — Environment (paste block)

**Environment → Add Environment Variable** (or **Bulk Editor** / raw paste):

```env
MONGODB_URI=PASTE_YOUR_ATLAS_URI_HERE
MONGODB_DB=sp_dashboard
NODE_VERSION=20
```

Optional if memory errors on path table:

```env
NODE_OPTIONS=--max-old-space-size=1536
```

### Step 3 — Health / auto-deploy

| Field | Value |
|-------|--------|
| Health Check Path | `/` |
| Auto-Deploy | `Yes` / On Commit |

### Step 4 — Deploy

Click **Create Web Service** / **Manual Deploy → Deploy latest commit**.

URL shape:

```
https://dynamic-probability-calculator.onrender.com
```

Smoke same routes as Vercel, swap host:

```
https://YOUR-SERVICE.onrender.com/probability
```

PowerShell:

```powershell
$body = @{
  isin = "INE093JA77O9"
  mode = "both"
  valuationDate = "03-08-2026"
  includePaths = $false
} | ConvertTo-Json

Invoke-RestMethod `
  "https://YOUR-SERVICE.onrender.com/api/probability/run" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"
```

### Render checklist

- [ ] Build: `npm ci && npm run build`  
- [ ] Start: `npm start`  
- [ ] `NODE_VERSION=20`  
- [ ] `MONGODB_URI` + `MONGODB_DB=sp_dashboard`  
- [ ] Paid/always-on if you hate cold starts  
- [ ] Atlas Network Access `0.0.0.0/0`  
- [ ] Atlas seeded from PC  

---

## 4) Side-by-side env (same values both places)

| Key | Vercel | Render | Exact value |
|-----|--------|--------|-------------|
| `MONGODB_URI` | ✅ | ✅ | your Atlas `mongodb+srv://…` |
| `MONGODB_DB` | ✅ | ✅ | `sp_dashboard` |
| `NODE_VERSION` | ❌ (use UI 20.x) | ✅ | `20` |
| `NODE_OPTIONS` | optional | optional | `--max-old-space-size=1536` |

**Identical production pair (copy twice):**

```env
MONGODB_URI=PASTE_YOUR_ATLAS_URI_HERE
MONGODB_DB=sp_dashboard
```

---

## 5) What the app uses in production

```
Browser
  → Vercel OR Render (Next.js)
       → baked seed (lib/data/master-seed.json + public/data)
       → MongoDB Atlas DB = sp_dashboard
            products
            index_prices   (from 2001-01-01 via sync:index-2001)
```

- No Python service.  
- No `NSP's under Risk.xlsm` on the server (local verify only).  
- Path history floor: **2001-01-01** (CSV + Mongo overlay).

---

## 6) After you change the master book

On your PC (`.env.local` → Atlas):

```powershell
npm run bake
npm run sync:seed
npm run sync:master
npm run sync:index-2001
```

Then push / redeploy so the **built** seed matches Mongo.

---

## 7) Rollback

- **Vercel:** Deployments → previous → **Promote to Production**  
- **Render:** Deploys → **Rollback**  
- Keep `MONGODB_DB=sp_dashboard` forever so Primary SP + this desk share one book  

---

## 8) Local pre-flight (optional before deploy)

```powershell
npm ci
npm run typecheck
npm run verify:series-floor
npm run verify:probability-desk
npm run build
$env:PORT="3001"; npm start
```

Open `http://localhost:3001`.

---

## Related

- Local runbook: `docs/10-deployment.md`  
- Architecture: `docs/01-architecture.md`  
- Testing: `docs/03-testing-debug.md`
