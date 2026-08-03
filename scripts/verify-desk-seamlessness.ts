/**
 * Full-book seamlessness audit — Rollover Phase expiration, defaults, calendars,
 * expired date menus, and markability for every ongoing / expired product.
 *
 * Usage: npm run verify:seamlessness
 */
import { differenceInCalendarDays, startOfDay } from "date-fns";

import { pickDefaultLifecycleProduct, productTenureDays } from "../lib/desk-lifecycle-defaults";
import { getExpiredValuationDateOptions, formatExpiredAsOfPatch } from "../lib/expired-valuation-dates";
import {
  getPhase1SchedulePoedDate,
  getPhaseScheduleEndDate,
  getPhaseScheduleEndLabel,
  getProductExpirationDate,
  getProductFinalObservationDate,
  getProductMaturityDate,
  getProductObservationDates,
  getProductPoedDate,
  getProductRolloverScheduleDate,
  getRolloverPhaseKind,
  getWorkingAllotmentDate,
  type RolloverPhaseKind,
} from "../lib/product-dates";
import {
  filterProductsByLifecycle,
  filterValidMasterProducts,
  getPhaseValuationDateBounds,
  getProductLifecycleStatus,
  LIFECYCLE_FILTERS,
  type LifecycleFilter,
} from "../lib/product-lifecycle";
import { formatDeskDate } from "../lib/market-data";
import { loadSeedProducts } from "./lib/load-canonical-dataset";

function assert(ok: boolean, msg: string, fails: string[]) {
  if (!ok) fails.push(msg);
}

function expectedPhaseEnd(product: Parameters<typeof getPhaseScheduleEndDate>[0]) {
  const kind = getRolloverPhaseKind(product);
  switch (kind) {
    case "phase1":
      return getPhase1SchedulePoedDate(product) ?? getProductMaturityDate(product);
    case "tenYear":
      return getProductRolloverScheduleDate(product) ?? getProductMaturityDate(product);
    case "blank":
    case "phase2":
      return getProductMaturityDate(product);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function main() {
  const asOf = startOfDay(new Date());
  const valid = filterValidMasterProducts(loadSeedProducts(), asOf);
  const fails: string[] = [];

  const byKind: Record<RolloverPhaseKind, typeof valid> = {
    blank: [],
    phase1: [],
    phase2: [],
    tenYear: [],
  };
  for (const p of valid) byKind[getRolloverPhaseKind(p)].push(p);

  console.log("=== Desk seamlessness audit ===");
  console.log("As of:", formatDeskDate(asOf));
  console.log("Counts:", {
    valid: valid.length,
    blank: byKind.blank.length,
    phase1: byKind.phase1.length,
    phase2: byKind.phase2.length,
    tenYear: byKind.tenYear.length,
  });

  // 1) Expiration SSOT for every product
  let endOk = 0;
  for (const p of valid) {
    const a = getProductExpirationDate(p)?.getTime();
    const b = expectedPhaseEnd(p)?.getTime();
    if (a === b && a != null) endOk += 1;
    else if (fails.length < 40) {
      fails.push(`expiration-ssot ${p.isin} ${getRolloverPhaseKind(p)} a=${a} b=${b}`);
    }
  }
  console.log(`Expiration SSOT: ${endOk}/${valid.length}`);

  // 2) Lifecycle bucket status uses phase end
  let statusOk = 0;
  for (const p of valid) {
    const end = getProductExpirationDate(p);
    if (!end) continue;
    const days = differenceInCalendarDays(end, asOf);
    const st = getProductLifecycleStatus(p, asOf);
    if (st === "perpetual" || st === "upcoming" || st === "unknown") {
      statusOk += 1;
      continue;
    }
    const expect =
      days < 0 ? "expired" : days <= 30 ? "expiring-1m" : days <= 90 ? "expiring-3m" : "ongoing";
    if (st === expect) statusOk += 1;
    else if (fails.length < 40) fails.push(`status ${p.isin}: got ${st} expect ${expect}`);
  }
  console.log(`Lifecycle status vs phase end: ${statusOk}/${valid.length}`);

  // 3) Filter pools + defaults
  const liveFilters: LifecycleFilter[] = [
    "ongoing",
    "expiring-3m",
    "expiring-1m",
    "obs-due-3m",
    "obs-due-2m",
    "obs-due-1m",
  ];
  for (const filter of liveFilters) {
    const pool = filterProductsByLifecycle(valid, filter, asOf);
    const def = pickDefaultLifecycleProduct(pool, filter, asOf);
    if (!pool.length) {
      console.log(`Default ${filter}: empty pool`);
      continue;
    }
    assert(Boolean(def), `default missing for ${filter}`, fails);
    if (def) {
      const maxTenure = Math.max(...pool.map((p) => productTenureDays(p, asOf)));
      assert(
        productTenureDays(def, asOf) === maxTenure,
        `default ${filter} ${def.isin} tenure ${productTenureDays(def, asOf)} != max ${maxTenure}`,
        fails,
      );
    }
    console.log(`Default ${filter}: ${def?.isin ?? "—"} · pool ${pool.length}`);
  }

  const expiredPool = filterProductsByLifecycle(valid, "expired", asOf);
  const expiredDef = pickDefaultLifecycleProduct(expiredPool, "expired", asOf);
  if (expiredPool.length && expiredDef) {
    const maxEnd = Math.max(
      ...expiredPool.map(
        (p) =>
          getProductExpirationDate(p)?.getTime() ??
          getProductFinalObservationDate(p)?.getTime() ??
          0,
      ),
    );
    const defEnd =
      getProductExpirationDate(expiredDef)?.getTime() ??
      getProductFinalObservationDate(expiredDef)?.getTime() ??
      0;
    assert(defEnd === maxEnd, `expired default ${expiredDef.isin} not most recent phase end`, fails);
    console.log(`Default expired: ${expiredDef.isin} · ${formatDeskDate(new Date(defEnd))} · pool ${expiredPool.length}`);
  }

  // 4) Live calendar bounds — every product on the Ongoing live book
  // (Ongoing already includes expiring-within-3M/1M after filter policy update).
  const liveUnique = filterProductsByLifecycle(valid, "ongoing", asOf);
  let calOk = 0;
  for (const p of liveUnique) {
    const bounds = getPhaseValuationDateBounds(p, asOf);
    const start = getWorkingAllotmentDate(p, asOf);
    const end = getPhaseScheduleEndDate(p);
    if (!start || !bounds.minDate) {
      if (fails.length < 40) fails.push(`calendar missing min ${p.isin}`);
      continue;
    }
    const minOk = formatDeskDate(bounds.minDate) === formatDeskDate(start);
    // max = min(today, phase end)
    let expectMax = asOf;
    if (end && differenceInCalendarDays(end, asOf) < 0) expectMax = startOfDay(end);
    const maxOk = formatDeskDate(bounds.maxDate) === formatDeskDate(expectMax);
    if (minOk && maxOk) calOk += 1;
    else if (fails.length < 40) {
      fails.push(
        `calendar ${p.isin}: min ${bounds.minDate && formatDeskDate(bounds.minDate)} vs ${formatDeskDate(start)}; max ${formatDeskDate(bounds.maxDate)} vs ${formatDeskDate(expectMax)}`,
      );
    }
  }
  console.log(`Live calendar bounds: ${calOk}/${liveUnique.length}`);

  // 5) Expired date menus — every expired product, all phases
  const expiredByKind: Record<RolloverPhaseKind, number> = {
    blank: 0,
    phase1: 0,
    phase2: 0,
    tenYear: 0,
  };
  let expiredDatesOk = 0;
  for (const p of expiredPool) {
    const kind = getRolloverPhaseKind(p);
    expiredByKind[kind] += 1;
    const localFails: string[] = [];
    const opts = getExpiredValuationDateOptions(p);
    const end = getPhaseScheduleEndDate(p);
    const lastObs = getProductFinalObservationDate(p);
    const start = getWorkingAllotmentDate(p);
    assert(opts.length > 0, `expired ${p.isin}: empty date menu`, localFails);

    const beforeStart = start
      ? opts.filter((o) => differenceInCalendarDays(o.date, start) < 0)
      : [];
    assert(beforeStart.length === 0, `expired ${p.isin}: dates before Working!F`, localFails);

    const needExp = Boolean(end && (!lastObs || end.getTime() !== lastObs.getTime()));
    const hasExp = opts.some((o) => o.kind === "expiration");
    if (needExp) {
      assert(hasExp, `expired ${p.isin}: missing phase-end option`, localFails);
      if (hasExp && end) {
        const expOpt = opts.find((o) => o.kind === "expiration")!;
        assert(
          formatDeskDate(expOpt.date) === formatDeskDate(end),
          `expired ${p.isin}: expiration option != phase end`,
          localFails,
        );
        const patch = formatExpiredAsOfPatch(p, expOpt.desk);
        const label = getPhaseScheduleEndLabel(p);
        if (label === "POED") assert(patch.startsWith("As of POED"), `patch POED ${p.isin}: ${patch}`, localFails);
        else if (label === "rollover")
          assert(patch.startsWith("As of rollover"), `patch rollover ${p.isin}: ${patch}`, localFails);
        else assert(patch.startsWith("As of maturity"), `patch maturity ${p.isin}: ${patch}`, localFails);
      }
    }

    const obs = getProductObservationDates(p);
    for (const d of obs) {
      if (start && differenceInCalendarDays(d, start) < 0) continue;
      const hit = opts.some((o) => o.date.getTime() === d.getTime());
      assert(hit, `expired ${p.isin}: missing obs ${formatDeskDate(d)}`, localFails);
    }

    if (localFails.length === 0) expiredDatesOk += 1;
    else fails.push(...localFails);
  }
  console.log("Expired by phase:", expiredByKind);
  console.log(`Expired date menus: ${expiredDatesOk}/${expiredPool.length}`);

  // 6) Phase 1 early-POED data defects tracked (fallback to Maturity)
  let earlyPoed = 0;
  for (const p of byKind.phase1) {
    if (getProductPoedDate(p) && !getPhase1SchedulePoedDate(p)) earlyPoed += 1;
  }
  console.log(`Phase 1 early-POED (use Maturity fallback): ${earlyPoed}`);

  // Tab coverage sanity
  for (const filter of LIFECYCLE_FILTERS) {
    const n = filterProductsByLifecycle(valid, filter, asOf).length;
    console.log(`Pool ${filter}: ${n}`);
  }

  if (fails.length) {
    console.error("\n=== FAIL ===");
    for (const f of fails.slice(0, 60)) console.error(" -", f);
    if (fails.length > 60) console.error(` … +${fails.length - 60} more`);
    process.exit(1);
  }
  console.log("\n=== PASS ===");
}

main();
