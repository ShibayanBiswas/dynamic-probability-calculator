# 08 — Debug playbook

**Updated:** 2026-08-04 · Phase audit: [16-product-type-probability-logic.md](16-product-type-probability-logic.md)

Work top-down. Prefer `npm run verify:probability` / `verify:probability-desk` before UI hunting.

---

### 1. App will not start

1. Node **20+** on PATH (`node -v`).  
2. `npm install` / `npm ci`.  
3. Free port 3001: `.\start-dashboard.ps1 -Stop`.  
4. If Mongo in `.env.local` but Docker down — app still runs on baked seed.

---

### 2. Blank product list / zero ongoing

1. Master loaded? Home upload or baked seed.  
2. Lifecycle filter too narrow (Obs-due)? Switch to Ongoing.  
3. `npm run verify:filter-parity` — expect ~thousands ongoing, expired **0**.  
4. Clock as-of / phase end mis-parse → `product-dates.ts`.

---

### 3. Probability API 400 / 503

| Code | Cause | Fix |
|------|-------|-----|
| 400 | Missing ISIN / non Nifty-Sensex | Pick eligible product |
| 404 | ISIN not in live book | Sync master / seed |
| 503 | Empty index series | Mongo history or bundled JSON |

---

### 4. Runtime `date.getDate is not a function`

API JSON stringifies `schedule[].date`.  

1. Client must `hydrateProbabilityRunResult` after fetch.  
2. `formatDisplayDate` accepts strings/serials.  
3. Observation table keys must not call `.getTime()` on raw strings without coerce.

---

### 5. Initial Days ≠ Excel screenshot

Expected for Phase 2: desk uses **Trade Date**; Excel Initial Prob used allotment.  
Confirm `rolloverPhase` and `getWorkingAllotmentDate`.

---

### 6. All Path Taken = No / probability null

1. Threshold null → missing Target or Entry or today level.  
2. Series ends before any full observation span → refresh index history.  
3. All Average slots blank on master row.  
4. Custom underlying — not supported for probability.

---

### 7. Current Prob still uses “today” after last obs

Expect `asOfLastObservation` + checking date = last obs.  
If not: settlement — same calendar day needs **15:30 IST** NSE close (`observation-settlement.ts`).

---

### 8. Portfolio Initial/Current Prob stuck on —

1. Network: batch `POST /api/probability/run` with `isins`.  
2. Soft warm cap **400** ISINs — far rows stay cold until interaction/reload.  
3. Change valuation date to invalidate store.

---

### 9. Parentheses still visible

1. Product name hydrate (` · Rollover Phase n`).  
2. Export “Notional in ₹ Cr”.  
3. Logic Atlas / Effective Target tooltips.  
4. Never reintroduce `(ROLLOVER PHASE n)`.

---

### 10. Excel/PDF export fails

1. Must run in browser (client download).  
2. Hover warm export.  
3. Console: ExcelJS / jsPDF dynamic import errors.

---

### 11. Cloud deploy works locally but 500 on Vercel/Render

1. `MONGODB_URI` set on host? (prices/paths — products may still come from CDN seed)  
2. Cold start / memory — try `includePaths: false`; raise instance size on Render.  
3. Yahoo blocked — rely on Mongo/bundled.  
4. Confirm Node **20.x** on Vercel.  
5. See [14-vercel-render-deployment.md](14-vercel-render-deployment.md).

---

### 12. Path table shows dates far in the future / many Path Taken = No

1. Frontier trim should stop emitting after the last includable path (`engine.ts`).  
2. UI default filter should be **Included**.  
3. If still wrong after deploy, hard-refresh — stale client bundle.  
4. Confirm series `lastIndexDate` is recent (`verify:series-floor` / API debug).

---

### 13. Lifecycle “today” price looks like yesterday

Expected before **15:30 IST**. Desk mark uses previous trading-day close until NSE cash close (`desk-mark-as-of.ts`). After 15:30, expect today’s bar when synced.

---

### 14. Logic Atlas Active pipeline looks thin or wrong

1. Confirm latest `main` deployed (`logic-flow-diagram.tsx` + enriched `logic-atlas.ts`).  
2. Click a stage — Module Intelligence should show detail + metrics + tags.  
3. Cross-check claims against [16 §11](16-product-type-probability-logic.md).

---

### 15. Phase 2 Initial days do not match Blank sibling

Expected if Trade Date ≠ Allotment. Confirm both dates on the master row and `getRolloverPhaseKind` → `phase2`.

---

## Recovery checklist

```powershell
npm run typecheck
npm run verify:probability-desk
npm run bake            # if master changed
npm run sync:seed       # if Mongo should match seed
.\start-dashboard.ps1 -Stop
npm run dev
```

Close Excel if `~$NSP's under Risk.xlsm` lock files linger.
