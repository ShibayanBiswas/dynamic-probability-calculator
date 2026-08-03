# Local development (primary)

> **Doc refresh:** 2026-07-16 — full verify suite commands; lifecycle pools calendar-driven.

The desk runs entirely on **localhost**. Cloud hosting (Vercel / Render / Atlas) is optional and not required for day-to-day use.

| Service | URL | Required |
|---------|-----|----------|
| **Dashboard** | http://localhost:3000 | Yes |
| **Next.js API** | http://localhost:3000/api | Yes |
| **Python pivot API** | http://127.0.0.1:8000 | Optional (Node fallback exists) |
| **MongoDB** | mongodb://127.0.0.1:27017 | Optional (baked `master-seed.json` works offline) |

### Next.js API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/market/levels` | GET | Live Nifty / Sensex |
| `/api/market/index-at-date` | GET | Historical index closes |
| `/api/market/sync-history` | GET, POST | Index history backfill |
| `/api/parse/bootstrap` | GET | Bootstrap dataset |
| `/api/parse` | POST | Upload parse |
| `/api/master/load` | GET | Canonical book |
| `/api/master/sync` | POST | Mongo sync |
| `/api/master/health` | GET | Mongo health |
| `/api/master/download` | GET | Download master xlsx |
| `/api/master/sheets` | GET | Sheet names |
| `/api/valuation` | POST | Valuation |
| `/api/valuation/at-date` | POST | Historical valuation |
| `/api/payoff` | POST | Payoff |
| `/api/pivot` | POST | Pivot (Python fallback) |
| `/api/analytics/category-stats` | GET | Category stats |
| `/api/inputs/config` | GET | Input config |
| `/api/internal/logic` | GET | Logic atlas |
| `/api/internal/appendix` | GET | Appendix |

### Python API (127.0.0.1:8000)

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Health check |
| `/pivot` | POST | Pivot engine |

---

## 1. One-command start

### Windows (PowerShell)

```powershell
.\start-dashboard.ps1
```

Stop:

```powershell
.\start-dashboard.ps1 -Stop
```

### Linux / macOS

```bash
bash start-dashboard.sh
```

Stop:

```bash
bash start-dashboard.sh --stop
```

Both scripts:

1. Install `node_modules` if missing
2. Create `.env.local` from `.env.example` if missing (Windows; bash copies on first run too)
3. Free ports **3000** and **8000** if stale processes are running
4. Start **MongoDB** via Docker when `MONGODB_URI` is set in `.env.local`
5. Start **Python** analytics API (`backend/python`) on port 8000
6. Launch **Next.js** on http://localhost:3000

---

## 2. Environment (`.env.local`)

Copy `.env.example` → `.env.local` (never commit secrets):

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=sp_dashboard
PYTHON_API_URL=http://127.0.0.1:8000
```

| Variable | Local default | Purpose |
|----------|---------------|---------|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | Product cache + index history |
| `MONGODB_DB` | `sp_dashboard` | Database name |
| `PYTHON_API_URL` | `http://127.0.0.1:8000` | Pivot Python fallback |

**Without Mongo:** the app loads the baked master from `/data/master-seed.json` (~12 MB static file). Valuation and payoff work; historical index sync is limited until Mongo is running.

---

## 3. MongoDB (optional, local Docker)

```bash
docker compose up -d
npm run verify:mongo    # connection test
npm run sync:seed       # seed from baked JSON (first time)
```

Upload **New Product Master_.xlsx** from Home to refresh the book, or re-run `npm run sync:seed`.

---

## 4. Next.js only (minimal)

```bash
npm install
npm run dev
```

Open http://localhost:3000 — no Python or Mongo required for basic valuation/payoff.

---

## 5. Smoke test (local)

```bash
npm run verify:stack      # typecheck + lint + build + KPI audit
npm run verify:valuation-pipeline  # Steps A→E full book
npm run verify:lifecycle-full      # all ongoing + expired marks
npm run verify:all-metrics     # full-book metric parity
npm run verify:payoff-xirr     # payoff scenario XIRR (ongoing + expired)
npm run verify:phase-logic     # Blank / P1 / P2 / 10Y payoff + marks
npm run verify:expired         # Expired marks + Logic lock → phase end U·(1+S)
npm run verify:expired-phase   # Expired Blank/P1/P2 tenure + phase-end marks
npm run verify:31jul-nav       # 31-Jul NAV vs Logic path
npm run verify:asof-levels     # desk today vs 31-Jul index split
npm run verify:effective-target # Effective Target full ongoing book
npm run verify:rollover-phase  # Working!F / schedule end SSOT
npm run verify:coupon-formula  # Coupon Formed === payoff formula
npm run verify:seamlessness    # tab defaults, calendars, expired menus
```

Wind-up board: [13-windup-verification.md](13-windup-verification.md).

Manual checks:

1. http://localhost:3000 — Home loads, upload master workbook
2. http://localhost:3000/valuation — live Nifty/Sensex badge, reveal output
3. http://localhost:3000/api/market/levels — JSON with index levels
4. Expired tab — historical levels at chosen observation date

---

## 6. Vercel + Render (production)

Python is already on **Render**; redeploy the Next.js frontend on **Vercel** and point it at Render + MongoDB Atlas.

### Step 1 — MongoDB Atlas (if not already set up)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. **Database Access** → create a user with read/write on `sp_dashboard`.
3. **Network Access** → allow `0.0.0.0/0` (or Vercel IP ranges) for serverless.
4. Copy the connection string, e.g. `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`.

Seed once from your machine (with Atlas URI in `.env.local`):

```bash
npm run sync:seed
```

### Step 2 — Render Python API (already deployed)

Confirm your Render service is live:

- Health: `https://YOUR-SERVICE.onrender.com/health` → `{"status":"ok"}`
- Note the base URL for `PYTHON_API_URL`.

If you need to redeploy: connect the repo, set **Root Directory** to `backend/python`, **Start Command** `uvicorn main:app --host 0.0.0.0 --port $PORT`.

### Step 3 — Vercel project

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import `ShibayanBiswas/sp-dashboard` (or your fork).
2. Framework: **Next.js** (auto-detected). Build command: `npm run build`. Output: default.
3. **Environment variables** (Production + Preview):

| Variable | Value |
|----------|--------|
| `MONGODB_URI` | Your Atlas connection string |
| `MONGODB_DB` | `sp_dashboard` |
| `PYTHON_API_URL` | `https://YOUR-SERVICE.onrender.com` |

4. **Deploy** → Vercel builds and hosts at `https://your-project.vercel.app`.

### Step 4 — Post-deploy checks

1. Open the Vercel URL — Home loads with portfolio counts.
2. `/api/market/levels` returns Nifty/Sensex JSON.
3. `/valuation` — reveal output works.
4. `/portfolio/analytics` — export Excel downloads.
5. Upload master workbook from Home — products refresh without redeploy.

### Step 5 — Custom domain (optional)

Vercel → Project → **Settings → Domains** → add your domain and update DNS.

---

## 7. Optional cloud notes (legacy)

| Layer | Example host | Notes |
|-------|--------------|-------|
| Frontend | Vercel | Env vars above |
| Python API | Render | `backend/python`, health `/health` |
| Database | MongoDB Atlas | Or local Mongo + tunnel |

`vercel.json` only sets cache headers for static seed data — harmless on Vercel.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Port 3000 in use | `bash start-dashboard.sh --stop` or `.\start-dashboard.ps1 -Stop` |
| Mongo connection failed | `docker compose up -d` then `npm run verify:mongo` |
| Pivot slow / fails | Ensure Python API on :8000 or use Node fallback |
| Expired products show live Nifty | Start Mongo + run `npm run sync:seed` for index history |
| Build errors | `npm run typecheck && npm run lint && npm run build` |

See also [03-testing-debug.md](03-testing-debug.md) and [08-debug-playbook.md](08-debug-playbook.md).
