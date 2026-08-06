# Deploy Dynamic Probability Calculator — Vercel + Render

**Updated:** 2026-08-06

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
- `vercel.json` uses `npm install` + function budgets (`probability/run` **60s / 1024MB**, sheets **60s**, bootstrap **30s**)  
- Product bootstrap prefers **static CDN master seed** (`USE_STATIC_SEED`) — do not expect a full Mongo product dump in one browser payload  
- Mongo still valuable for **recent** `index_prices` overlays and background Yahoo sync  
- Probability API: `includePaths` opt-in; Yahoo sync is **background-only** (never blocks the response); Mongo overlay is recent-window + timed  
- Summary results are LRU-cached; **full path tables are not cached** (avoids serverless OOM)  
- Portfolio warm-up batches slim payloads (probabilities only), pauses when the tab is hidden, and covers the **full lifecycle book** (no soft ISIN cap)
- Lifecycle **Export view / Full workbook** wait until every product Initial/Current Prob is stored, then download client-side
- Client path/headline fetches abort on hard ceilings (55s / 20s) so the UI never hangs forever  
- Never commit `MONGODB_URI` or Atlas passwords  

## 6) Smoothness checklist (do not regress)

| Surface | Expectation |
|---------|-------------|
| First paint / Home | CDN seed → KPIs without waiting on Mongo bootstrap |
| Probability KPIs | Summary POST < ~3–8s cold; cached thereafter |
| Initial / Current paths | Only after Reveal; virtualized table; progress bar clears on finish/timeout |
| Lifecycle Initial/Current Prob | Lazy batches of ~20 ISINs; slim payloads; full-book warm |
| Lifecycle Excel downloads | Buttons gated until probs ready; progress in subtitle; deferred blob revoke |
| Intel master sheets | maxDuration 60s; prefer cached sheet payload |

If a deploy feels “stuck”, check Vercel function logs for `mongo index overlay` timeouts (safe fallback to Gift CSV) and confirm Hobby vs Pro plan supports `maxDuration: 60`.

## 7) Post-deploy smoke

1. `/probability` — schedule above specs; KPIs load  
2. `/initial-probability` — inline progress; path frontier near latest series day  
3. `/intelligence` — Logic Atlas Connected + detailed Active pipeline  
4. Lifecycle table — Initial Level + As of Today's Date columns present  
5. Optional: `npm run verify:probability-desk` locally against the same seed  

Product-type logic reference: [16-product-type-probability-logic.md](16-product-type-probability-logic.md)
