# Layman Deployment Guide — Vercel + Render

**What you are deploying:** Dynamic Probability Calculator  
**GitHub:** `https://github.com/ShibayanBiswas/dynamic-probability-calculator`  
**Same database as:** Primary SP Dashboard (`MONGODB_DB=sp_dashboard`)

> **Secrets:** Never commit `.env.local` to Git. Copy values from  
> `C:\Users\shiba\OneDrive\Desktop\Primary SP Dashboard\.env.local`  
> into Vercel / Render env panels (and into this app’s `.env.local` on your PC).

---

## A) Upload Master button — where it lives (Primary SP parity)

| Place | Primary SP | This app |
|-------|------------|----------|
| **Home** header | Yes — `Upload Master Workbook` | Yes |
| **Upload** page (`/upload`) | Yes (big button) | Yes |
| Valuation / Payoff / Desk / Analytics / Intel | **No** | **No** (same as Primary) |
| Probability / Initial / Current | N/A (Primary has Valuation/Payoff) | Yes (header) — desk convenience |

**Conclusion:** Primary does **not** put Upload on every tab. We match that: Home + Upload page (+ Probability surfaces for this desk).

---

## B) Environment variables — copy from Primary SP

Open this file on your PC:

```
C:\Users\shiba\OneDrive\Desktop\Primary SP Dashboard\.env.local
```

You will see (keys only listed here — paste the **values** from that file):

| Key | Required? | Where |
|-----|-----------|--------|
| `MONGODB_URI` | **Yes** | Vercel + Render + local `.env.local` |
| `MONGODB_DB` | **Yes** | Must be exactly `sp_dashboard` |
| `PYTHON_API_URL` | No for this app | Primary uses it; DPC Node pivot works without it |
| `NODE_VERSION` | Render only | Set to `20` |
| `NODE_OPTIONS` | Optional | `--max-old-space-size=1536` if path table runs out of memory |

### Exact blocks to paste (fill URI from Primary `.env.local`)

**Local `.env.local` (this project) — same as Primary Mongo lines:**

```env
MONGODB_URI=<paste MONGODB_URI from Primary SP .env.local>
MONGODB_DB=sp_dashboard
```

**Vercel → Settings → Environment Variables** (Production + Preview):

```env
MONGODB_URI=<paste MONGODB_URI from Primary SP .env.local>
MONGODB_DB=sp_dashboard
```

**Render → Environment** (Bulk Editor):

```env
MONGODB_URI=<paste MONGODB_URI from Primary SP .env.local>
MONGODB_DB=sp_dashboard
NODE_VERSION=20
```

Optional on Render:

```env
NODE_OPTIONS=--max-old-space-size=1536
```

### Do not set

- `PORT` — Render sets it  
- `NODE_ENV` — platform sets `production`  
- `PYTHON_API_URL` — not required for Dynamic Probability Calculator  

### Atlas network (one-time)

1. [MongoDB Atlas](https://cloud.mongodb.com) → Network Access  
2. Add IP → **Allow Access from Anywhere** → `0.0.0.0/0`  
3. Save (needed for Vercel + Render)

---

## C) One-time seed on your PC (before first cloud use)

```powershell
cd "C:\Users\shiba\OneDrive\Desktop\Dynamic Probability Calculator"
```

Make sure `.env.local` has the same `MONGODB_URI` / `MONGODB_DB` as Primary, then:

```powershell
npm ci
npm run sync:seed
npm run sync:master
npm run sync:index-2001
npm run refresh:index-levels
npm run verify:mongo
```

This loads products + index history from **2001-01-01** into Atlas `sp_dashboard`.

---

## D) Deploy on Vercel (click-by-click)

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**  
2. Import: `ShibayanBiswas/dynamic-probability-calculator`  
3. Settings:

| Field | Value |
|-------|--------|
| Framework | Next.js |
| Build Command | `npm run build` |
| Install Command | `npm ci` |
| Node.js Version | `20.x` |

4. Add env vars from section B  
5. Deploy  
6. Open `https://YOUR-APP.vercel.app/probability`

---

## E) Deploy on Render (click-by-click)

1. Go to [render.com](https://render.com) → **New** → **Web Service**  
2. Connect the same GitHub repo  
3. Settings:

| Field | Value |
|-------|--------|
| Name | `dynamic-probability-calculator` |
| Branch | `main` |
| Runtime | Node |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/` |

4. Paste env block from section B (include `NODE_VERSION=20`)  
5. Create / Deploy  
6. Open `https://YOUR-SERVICE.onrender.com/probability`

---

## F) Quick smoke test (either host)

```powershell
$body = @{
  isin = "INE093JA77O9"
  mode = "both"
  valuationDate = "03-08-2026"
  includePaths = $false
} | ConvertTo-Json

Invoke-RestMethod "https://YOUR-HOST/api/probability/run" -Method POST -Body $body -ContentType "application/json"
```

Also open: `/` · `/probability` · `/initial-probability` · `/current-probability` · `/intelligence`

---

## G) Side-by-side checklist

| Item | Vercel | Render |
|------|--------|--------|
| `MONGODB_URI` from Primary `.env.local` | ✅ | ✅ |
| `MONGODB_DB=sp_dashboard` | ✅ | ✅ |
| `NODE_VERSION=20` | use UI 20.x | ✅ env |
| Upload Master on Home | ✅ | ✅ |
| Paths from 2001 | after `sync:index-2001` | same |

---

## Related

- Full detail: this file  
- Excel Current Prob parity: `docs/02-probability-excel-parity.md`  
- Local run: `docs/10-deployment.md`
