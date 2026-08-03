# Deploy Dynamic Probability Calculator — Vercel + Render

**Repo:** https://github.com/ShibayanBiswas/dynamic-probability-calculator  
**Source of env values:** Primary SP Dashboard  
`C:\Users\shiba\OneDrive\Desktop\Primary SP Dashboard\.env.local`

---

## 1) Every env key from Primary SP

### What Primary actually has in `.env.local` (use these)

| Key | Value (from Primary SP) | Needed on DPC cloud? |
|-----|-------------------------|----------------------|
| `MONGODB_URI` | `mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority` | **YES** |
| `MONGODB_DB` | `sp_dashboard` | **YES** |
| `PYTHON_API_URL` | `http://127.0.0.1:8000` | **NO** for this app (Node pivot is enough) |

> Password in the URI is `Sb@04052003` with `@` written as `%40`.

### Optional keys Primary documents in `.env.example` (not set in their `.env.local`)

Only needed if you build the URI from parts instead of `MONGODB_URI`:

| Key | Example | Needed? |
|-----|---------|---------|
| `MONGODB_HOST` | `cluster0.lvoycia.mongodb.net` | No if using `MONGODB_URI` |
| `MONGODB_PORT` | `27017` | No |
| `MONGODB_USER` | `ae21b109` | No |
| `MONGODB_PASSWORD` | `Sb@04052003` | No |
| `MONGODB_AUTH_SOURCE` | `admin` | No |
| `MONGODB_TLS` | `true` | No |
| `MONGODB_SRV` | `true` | No |

### Extra keys for Render / Vercel (not in Primary `.env.local`)

| Key | Value | Where |
|-----|-------|--------|
| `NODE_VERSION` | `20` | **Render only** |
| `NODE_OPTIONS` | `--max-old-space-size=1536` | Optional (Render), if path table OOMs |
| `NODE_ENV` | *(auto)* | Do not set |
| `PORT` | *(auto on Render)* | Do not set |
| `VERCEL` | *(auto on Vercel)* | Do not set |

---

## 2) COPY-PASTE BLOCKS (exact)

### A — Local file  
`Dynamic Probability Calculator\.env.local`

```env
MONGODB_URI=mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sp_dashboard
```

### B — Vercel (Production + Preview)

```env
MONGODB_URI=mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sp_dashboard
```

### C — Render

```env
MONGODB_URI=mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sp_dashboard
NODE_VERSION=24
```

Optional on Render:

```env
NODE_OPTIONS=--max-old-space-size=1536
```

---

## 3) One-time before deploy (on your PC)

1. Atlas → **Network Access** → Add IP → **Allow from Anywhere** (`0.0.0.0/0`)  
2. In PowerShell:

```powershell
cd "C:\Users\shiba\OneDrive\Desktop\Dynamic Probability Calculator"
npm ci
npm run sync:seed
npm run sync:master
npm run sync:index-2001
npm run refresh:index-levels
```

---

## 4) Vercel steps

1. Open https://vercel.com → **Add New** → **Project**  
2. Import GitHub repo: **`ShibayanBiswas/dynamic-probability-calculator`**  
3. Fill settings:

| Field | Paste this |
|-------|------------|
| Framework Preset | `Next.js` |
| Root Directory | leave empty / `.` |
| Build Command | `npm run build` |
| Install Command | `npm ci` |
| Node.js Version | `24.x` (Project Settings → General) |

4. **Settings → Environment Variables** → add for **Production** and **Preview**:

| Name | Value |
|------|--------|
| `MONGODB_URI` | `mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority` |
| `MONGODB_DB` | `sp_dashboard` |

5. Click **Deploy**  
6. Open: `https://YOUR-APP.vercel.app/probability`

---

## 5) Render steps

1. Open https://render.com → **New +** → **Web Service**  
2. Connect GitHub → **`ShibayanBiswas/dynamic-probability-calculator`**  
3. Fill settings:

| Field | Paste this |
|-------|------------|
| Name | `dynamic-probability-calculator` |
| Branch | `main` |
| Runtime | `Node` |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/` |
| Instance | Starter or higher (Free sleeps when idle) |

4. **Environment** → Bulk / raw paste:

```env
MONGODB_URI=mongodb+srv://ae21b109:Sb%4004052003@cluster0.lvoycia.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=sp_dashboard
NODE_VERSION=24
```

5. Click **Create Web Service** / Deploy  
6. Open: `https://YOUR-SERVICE.onrender.com/probability`

---

## 6) After deploy — quick check

Open these URLs (swap your host):

- `/`
- `/probability`
- `/initial-probability`
- `/current-probability`
- `/intelligence`

PowerShell API test:

```powershell
$body = @{ isin = "INE093JA77O9"; mode = "both"; valuationDate = "03-08-2026"; includePaths = $false } | ConvertTo-Json
Invoke-RestMethod "https://YOUR-HOST/api/probability/run" -Method POST -Body $body -ContentType "application/json"
```

---

## 7) Cheat sheet

| Platform | Must paste |
|----------|------------|
| **Vercel** | `MONGODB_URI` + `MONGODB_DB` + Node 24.x in UI |
| **Render** | `MONGODB_URI` + `MONGODB_DB` + `NODE_VERSION=24` |
| **Skip** | `PYTHON_API_URL`, `PORT`, `NODE_ENV` |

Same Mongo as Primary SP = same book (`sp_dashboard` on `cluster0.lvoycia.mongodb.net`).
