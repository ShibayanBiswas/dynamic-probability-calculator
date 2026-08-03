# 02 — Probability Excel parity

Reference workbook (local, gitignored): `NSP's under Risk.xlsm`

## Unhidden sheets (hard reference)

| Sheet | Visible | Desk surface |
|-------|---------|----------------|
| **Probability** | Yes | `/probability` summary KPIs / inputs |
| **Backtesting** | Yes | `/current-probability` (Current Prob paths) |
| **Initial Prob** | Yes | `/initial-probability` |
| **Data** | Yes | Lifecycle / portfolio yellow columns |

Hidden sheets (`nifty`, Client Data, Product Summary, …) feed VLOOKUPs but are not desk surfaces.

Code SSOT: `lib/probability/engine.ts` · verify: `npm run verify:nsp-excel`

---

## Probability sheet — anchors used by Backtesting / Initial

| Cell / label | Role |
|--------------|------|
| `D14` | Product key (VLOOKUP into Data) |
| `D16` | Allotment / phase start (Initial days base + Initial path frontier) |
| `D19` / `D20` | Entry / Target |
| `D22` | Target % = `D20/D19−1` |
| `D23`…`D29` | Observation dates Average 1…7 (from Data) |
| `D33` | % Required = `Target / today's level − 1` (Current threshold) |
| `D34` | Probability checking date (Current days base) |
| `D35` / `D36` | Today's Nifty / Sensex levels |

---

## Backtesting sheet → Current Probability (exact Excel formulas)

### Schedule block (rows Average / Dates / Days)

Matches the desk **Observation Schedule** card:

```
Average | 1 … N   (Excel may paint a duplicate "6" on the last header; desk shows 1…N present slots)
Dates   | Probability!D23…D29
Days    | IF(date=0,0, date − Probability!$D$34)
```

Hard Excel day formula (column B example):

```excel
=IF(B5=0,0,-Probability!$D$34+Backtesting!B5)
```

→ **calendar days from checking/valuation date to each observation date**.

Desk: `buildObservationSchedule(product, checkingDate)` · UI label **Days from Valuation Date**.

### Path table

| Excel column idea | Formula (pattern) | Desk |
|-------------------|-------------------|------|
| Start | nifty trading day | `pathStartDate` |
| Nifty Closing | exact VLOOKUP on start date | `underlyingClosingLevel` |
| Avg n date | `IF(days=0,0, Start + days)` | projected obs date |
| Avg n level | approximate VLOOKUP (prior close) on nifty/Sensex | `observationLevels` |
| Avg Nifty | `AVERAGEIF(levels,">0")` | average of present slots (full coverage required) |
| Nifty Performance | `Avg / Closing − 1` | `underlyingPerformance` |
| To be taken | cascade: once No stays No; else `MAX(nifty dates) ≥ MAX(path obs dates)` | `pathIncluded` |

KPI block:

```excel
Total Count  = COUNTIFS(PathTaken,"Yes")
Successes    = COUNTIFS(PathTaken,"yes", Performance, ">="&Probability!$D$33)
Probability  = Successes / Total Count
```

Desk: `mode: "current"` in `runProbabilityBacktest` — **no Start Level column**; threshold = Required Underlying.

### Path history floor

Excel `nifty` may start ~2000-12-31. Desk **hard-locks** path starts at **2001-01-01** (`SERIES_FLOOR` + Gift CSV). Intentional.

### Frontier

Excel Backtesting: `MAX(nifty!A:A)` (last date on nifty sheet).  
Desk: last bar of merged series (Mongo overlay + Gift CSV) — usually **newer** → small included-count deltas vs a stale workbook are expected.

---

## Initial Prob sheet (contrast)

| Topic | Excel | Desk |
|-------|-------|------|
| Days base | `Probability!$D$16` (allotment) | Phase start (`getWorkingAllotmentDate`) |
| Start Level | `CEILING.MATH(close×1.01,100)` (Nifty) / `×1.006` (Sensex) | Same |
| Performance | `Avg / StartLevel − 1` | Same |
| Path frontier | `Probability!$D$16 ≥ MAX(obs dates)` (allotment cutoff) | Latest index bar (same as Current) |
| MAX slots | Often Avg 1–6 only in one MAX | All **present** slots |

---

## DATA sheet → lifecycle table

`lib/portfolio-lifecycle-columns.ts` — live yellow columns (Target Level header, ₹ Cr amount, etc.).

---

## Past final observation

`lib/probability/as-of.ts`: after final obs settles → checking date clamps to last obs; Current uses historical close (no live level).

---

## Verification

```powershell
npm run verify:nsp-excel
npm run verify:probability
npm run verify:series-floor
npm run verify:probability-desk
```

`verify-nsp-excel-parity.ts` asserts:

1. Backtesting Days = obs − checking date (serial-safe)  
2. Target % / % Required formulas  
3. Current Prob within band of Backtesting `S4/S3`  
4. Series / paths from **2001-01-01**
