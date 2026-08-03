# 06 — Probability path engine

| File | Role |
|------|------|
| `lib/probability/engine.ts` | Core math |
| `app/api/probability/run/route.ts` | HTTP + caches + past-final clamp |
| `lib/probability/as-of.ts` | Checking date + hydrate |
| `lib/probability/cache.ts` | LRU results |

## Modes

| Mode | Schedule base | Start Level | Performance ÷ |
|------|---------------|-------------|----------------|
| `initial` | Phase start | Yes — ceiling | Start Level |
| `current` | Checking date | No | Path start close |

## Schedule builder

```ts
buildObservationSchedule(product, baseDate)
```

Each Average 1…7 slot: blank → skipped; else `daysFromBase = calendarDays(obs, base)`.

## Path series floor

Index series load from **2001-01-01** with forward-fill across Nifty/Sensex legs (parity with Gift AIF `nifty_daily.csv` / NSP `nifty` sheet).  

Bundled source: `lib/data/nifty-daily-2001.csv` (Nifty closes from 2001-01-01) + Sensex history; Mongo `index_prices` overlays newer bars when available. Earliest path start is the first trading day where **both** legs exist after fill — typically **2001-01-01** once Sensex is forward-filled onto the Nifty calendar.

1. Underlying close.  
2. Initial: `ceilingStartLevel(close)`.  
3. Project each present slot: `startTime + daysFromBase`; prior-close lookup.  
4. Require all present slots filled for inclusion eligibility.  
5. Average + performance.  
6. Include while series end covers max obs time; stop frontier when next path would need future bars.

## Thresholds

- Initial / Target Underlying: `target/entry − 1`  
- Current / Required Underlying: `target/todayLevel − 1`  
  todayLevel = request levels, else prior close on checking date  

Probability = `successCount / includedCount` when threshold ready.

## API

```http
POST /api/probability/run
Content-Type: application/json

{
  "isin": "…",
  "isins": ["…"],
  "mode": "initial" | "current" | "both",
  "valuationDate": "DD-MM-YYYY",
  "niftyLevel": 24500,
  "sensexLevel": 80000,
  "includePaths": true,
  "bookRevision": "workbook:loadedAt",
  "invalidate": false
}
```

Response: `initial` / `current`, optional `asOfLastObservation`, `checkingDate`.  
**Always hydrate** schedule dates on the client after JSON.

## UI path headers

Start · Underlying Closing Level · Start Level (Initial only) · Average Date/Level N · Average Underlying Level · Underlying Performance · Path Taken

## Debug tips

1. `resolveUnderlyingKind` must be nifty/sensex.  
2. `lastIndexDate` should be recent.  
3. Log `presentSlotCount`, `includedCount`, `threshold`.  
4. Phase 2 Initial → Trade Date base.  
5. After fetch → hydrate before formatting dates.
