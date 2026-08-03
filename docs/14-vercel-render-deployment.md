# 14 — Deploy on Vercel and Render

Complete production guide for **Dynamic Probability Calculator** (Next.js 16, Node 20+, optional MongoDB Atlas).

Local desk stays on **http://localhost:3001**. Cloud hosts inject their own `PORT`.

---

## Architecture for production

```
Browser
   │
   ▼
Next.js app  ── Vercel (serverless)  OR  Render Web Service (long-lived Node)
   │
   ├── Baked seed: lib/data/master-seed.json + public/data/*
   ├── Bundled index JSON fallback
   └── Optional MongoDB Atlas  (MONGODB_URI, MONGODB_DB=sp_dashboard)
         ├── products
         └── index_prices  (Nifty/Sensex daily ideally from 2001)
```

| Piece | Required? | Notes |
|-------|-----------|-------|
| Node 20+ | Yes | `engines.node` in package.json |
| MongoDB Atlas | Strongly recommended | Shared Primary SP DB `sp_dashboard` |
| Python API | **No** | Removed; Intel pivot is Node-only |
| `NSP's under Risk.xlsm` | No | Local reference only; gitignored |
| Env secrets in Git | **Never** | Use platform env panels |

---

## Shared prerequisites (both platforms)

### 1. GitHub repo

Push this project to a private GitHub repo (example already used: `dynamic-probability-calculator`).

Confirm these are **committed**:

- `app/`, `components/`, `lib/` (including `lib/data/master-seed.json`, index JSON)
- `public/data/New Product Master_.xlsx` (allowed by `.gitignore` exception)
- `package.json`, `package-lock.json`, `next.config.ts`, `vercel.json`
- `scripts/start-production.mjs`

Do **not** commit `.env.local`, `*.xlsm`, backups, `node_modules`, `.next`.

### 2. MongoDB Atlas (recommended)

1. Create a free/paid Atlas cluster.  
2. Database user + password.  
3. Network Access → allow `0.0.0.0/0` for Vercel/Render egress **or** tighten later.  
4. Connection string:

```
mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

5. Database name: **`sp_dashboard`** (same as Primary SP).  
6. Seed once from a machine that can reach Atlas:

```powershell
# .env.local temporarily pointed at Atlas
npm run sync:seed
# optional: sync live master
npm run sync:master
# optional: backfill / refresh index history
npm run backfill:index-history
npm run refresh:index-levels
```

Without Mongo the app still boots on **baked seed + bundled indexes** (`lib/data/nifty-daily-2001.csv` from **2001-01-01** + Sensex ~2000+). Mongo `index_prices` overlays newer bars when present.

### 3. Environment variables (complete list)

Set these in **Vercel → Settings → Environment Variables** and/or **Render → Environment**.  
Never commit secrets. Copy values from Primary SP Dashboard `.env.local` when sharing Atlas.

| Name | Required | Production value | Purpose |
|------|----------|------------------|---------|
| `MONGODB_URI` | **Yes (recommended)** | `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority` | Products + `index_prices` (share Primary SP cluster) |
| `MONGODB_DB` | **Yes with URI** | `sp_dashboard` | Same DB name as Primary SP |
| `NODE_VERSION` | Render only | `20` | Pin Node 20 on Render |
| `NODE_ENV` | Auto | `production` | Set by platforms |
| `PORT` | Auto on Render | platform-assigned | `npm start` binds `0.0.0.0:$PORT` |
| `NODE_OPTIONS` | Optional | `--max-old-space-size=1536` | Extra heap for large path series |
| `MONGODB_HOST` | Optional | — | Only if not using full URI |
| `MONGODB_PORT` | Optional | `27017` | Non-SRV |
| `MONGODB_USER` | Optional | — | Non-URI auth |
| `MONGODB_PASSWORD` | Optional | — | Non-URI auth |
| `MONGODB_AUTH_SOURCE` | Optional | `admin` | Non-URI auth |
| `MONGODB_TLS` | Optional | `true` | Non-URI TLS |
| `PYTHON_API_URL` | **No** | — | Unused (Node pivot only) |

**Atlas password tip:** if the password contains `@`, URL-encode it as `%40` inside `MONGODB_URI`.

**Network Access:** Atlas → Network Access → allow `0.0.0.0/0` (or Vercel/Render egress IPs) so serverless / Render can connect.

### 4. Index history from 2001 (required for path parity)

Once per environment (or after wiping `index_prices`), from a machine with `.env.local` pointed at Atlas:

```powershell
# Uses Gift/NSP Nifty CSV (lib/data/nifty-daily-2001.csv) + Sensex JSON
npm run sync:index-2001

# Optional: overlay latest Yahoo closes
npm run refresh:index-levels

# Confirm
npm run verify:mongo
npm run verify:nsp-excel
```

Expected: Mongo `index_prices` earliest ≈ `2001-01-02`, ≥6000 rows.

### 5. Pre-flight locally

```powershell
npm ci
npm run typecheck
npm run verify:probability-desk
npm run build
$env:PORT="3001"; npm start
# open http://localhost:3001
```

Parity gate vs `NSP's under Risk.xlsm` + Gift path calendar:

```powershell
npm run verify:nsp-excel
```

---

## Option A — Vercel (frontend + serverless API)

Best for: marketing URL, preview deploys, GitHub PR previews.  
Watch: cold starts and memory on `POST /api/probability/run` (loads index series). Prefer **Pro** plan or keep Mongo warm; for heavy desk use consider Render as primary.

### A1. Import project

1. [vercel.com](https://vercel.com) → Add New Project → Import GitHub repo.  
2. Framework Preset: **Next.js** (auto).  
3. Root Directory: `.`  
4. Build Command: `npm run build` (default uses `package.json` `build`, which runs `copy:assets`).  
5. Output: Next default (no static export).  
6. Install Command: `npm ci`  
7. Node.js Version: **20.x** (Project Settings → General).

### A2. Environment

Project → Settings → Environment Variables → add for Production + Preview:

```
MONGODB_URI=mongodb+srv://...
MONGODB_DB=sp_dashboard
```

Redeploy after saving env.

### A3. vercel.json

Repo already has `vercel.json` for `/data/*` cache headers. No rewrite to Python needed.

### A4. Deploy

- Push to `main` → Production deploy, **or**  
- Vercel CLI:

```powershell
npm i -g vercel
vercel login
vercel          # preview
vercel --prod   # production
```

### A5. Post-deploy checks

```
https://YOUR-APP.vercel.app/
https://YOUR-APP.vercel.app/probability
https://YOUR-APP.vercel.app/intelligence
```

API smoke (PowerShell):

```powershell
$body = @{ isin = "INE093J074Z3"; mode = "both"; valuationDate = "03-08-2026"; includePaths = $false } | ConvertTo-Json
Invoke-RestMethod "https://YOUR-APP.vercel.app/api/probability/run" -Method POST -Body $body -ContentType "application/json"
```

### A6. Vercel caveats & mitigations

| Issue | Mitigation |
|-------|------------|
| Function timeout on big path runs | Call API with `includePaths: false` for summary; Initial/Current UI only loads paths for one ISIN |
| Cold start / memory | Upgrade plan; or host API-heavy desk on Render |
| Yahoo blocked from cloud IP | Desk falls back to Mongo / bundled levels |
| Large JSON in serverless bundle | Already using baked seed; keep master xlsx under `public/data` only |

Custom domain: Vercel → Domains → add DNS as instructed.

---

## Option B — Render (recommended for desk API)

Best for: long-lived Node process, fewer cold starts, `$PORT` friendly via `npm start` → `scripts/start-production.mjs`.

### B1. New Web Service

1. [render.com](https://render.com) → New → **Web Service**.  
2. Connect the GitHub repo.  
3. Settings:

| Field | Value |
|-------|--------|
| Name | `dynamic-probability-calculator` |
| Region | Choose nearest (e.g. Singapore / Frankfurt) |
| Runtime | **Node** |
| Branch | `main` |
| Root Directory | empty |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Instance | Starter or higher for probability series memory |

`npm start` runs `node scripts/start-production.mjs`, which binds `0.0.0.0:$PORT` (default 3001 locally).

### B2. Environment

Render → Environment:

```
MONGODB_URI=mongodb+srv://...
MONGODB_DB=sp_dashboard
NODE_VERSION=20
```

Optional:

```
NODE_OPTIONS=--max-old-space-size=1536
```

if large series loads OOM on small instances.

### B3. Health

- Health Check Path: `/`  
- Auto-Deploy: On Commit  

### B4. Post-deploy checks

Same route + API smoke as Vercel, using `https://YOUR-SERVICE.onrender.com`.

### B5. Render free tier note

Free instances spin down after idle → first request slow. For a live desk, use a paid always-on instance.

---

## Option C — Hybrid (common)

| Tier | Host |
|------|------|
| Public UI + light traffic | **Vercel** |
| Heavy probability / shared Mongo | Same Mongo Atlas for both |

Or run **only on Render** for simplicity.

---

## Mongo sync after master / index changes

From a trusted workstation (credentials = Primary SP `.env.local` / this app `.env.local`):

```powershell
# Point .env.local at Atlas (same cluster0 as Primary SP)
npm run bake
npm run sync:seed
npm run sync:master
npm run sync:index-2001      # Nifty+Sensex from 2001 into index_prices
npm run refresh:index-levels # optional Yahoo overlay
npm run verify:nsp-excel
```

Then redeploy (or wait for auto-deploy) so `public/data` + seed in the build match the book.

---

## CI suggestion (GitHub Actions sketch)

```yaml
name: desk-gate
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
      - run: npm ci
      - run: npm run verify:probability-desk
      - run: npm run build
```

Add Atlas secrets only if CI must hit live Mongo; default gate uses baked seed.

---

## Rollback

1. Vercel: Deployments → Promote previous.  
2. Render: Deploys → Rollback.  
3. Keep `MONGODB_DB=sp_dashboard` stable so Primary SP and this desk share one book.

---

## Security checklist

- [ ] `.env.local` never committed  
- [ ] Atlas user is least-privilege read/write on `sp_dashboard` only  
- [ ] Repo is private if master data is confidential  
- [ ] HTTPS only on custom domains  
- [ ] No `PYTHON_API_URL` pointing at untrusted hosts  

---

## Quick decision matrix

| Goal | Choose |
|------|--------|
| Fastest public URL + previews | **Vercel** |
| Stable desk / fewer cold starts | **Render** |
| Full history since 2001 | **Atlas Mongo** + sync |
| Offline demo | Baked seed only (no Mongo) |

---

## Related docs

- [10-deployment.md](10-deployment.md) — local runbook  
- [01-architecture.md](01-architecture.md) — data flow  
- [03-testing-debug.md](03-testing-debug.md) — verify gate  
- [08-debug-playbook.md](08-debug-playbook.md) — production symptoms
