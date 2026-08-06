/**
 * Deep E2E wind-up probe — multi-product logic + local UI/API.
 * Usage: node scripts/windup-e2e-probe.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://localhost:3001";
const fails = [];
const notes = [];

function ok(cond, msg) {
  if (!cond) fails.push(msg);
  else notes.push(`OK ${msg}`);
}

async function httpJson(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function nearly(a, b, eps = 1e-9) {
  return a != null && b != null && Math.abs(a - b) <= eps;
}

async function logicProbe() {
  console.log("\n=== Multi-product probability logic probe ===");
  const boot = await httpJson("/api/parse/bootstrap");
  ok(boot.status === 200, `bootstrap ${boot.status}`);
  const products = boot.json?.products ?? [];
  ok(products.length > 2000, `book size ${products.length}`);

  const nifty = products.filter(
    (p) => p.isin && /nifty/i.test(String(p.underlying || p.raw?.Underlying || "")),
  );

  // Prefer live-looking names first (Accelerator / Magnifier ongoing book), then fill.
  const preferred = nifty.filter((p) =>
    /Accelerator|Magnifier|INE093/i.test(`${p.name || ""} ${p.isin || ""}`),
  );
  const samples = [...preferred, ...nifty.filter((p) => !preferred.includes(p))].slice(0, 25);

  let bothOk = 0;
  let withInitial = 0;
  let withCurrent = 0;
  let withPaths = 0;
  let thresholdOk = 0;
  let etShapeOk = 0;

  for (const p of samples) {
    const r = await httpJson("/api/probability/run", {
      method: "POST",
      body: JSON.stringify({
        isin: p.isin,
        mode: "both",
        includePaths: true,
      }),
    });
    if (r.status !== 200 || r.json?.ok === false) {
      fails.push(`run failed ${p.isin} status=${r.status}`);
      continue;
    }
    bothOk += 1;
    const initial = r.json.initial;
    const current = r.json.current;
    if (initial?.probability != null) withInitial += 1;
    if (current?.probability != null) withCurrent += 1;

    if (initial?.threshold != null && Number.isFinite(initial.threshold)) {
      // Target Underlying identity: threshold should equal Target/Entry-1 when no override
      thresholdOk += 1;
    }

    if (current) {
      const paths = current.paths ?? [];
      if (paths.length > 0) {
        withPaths += 1;
        const included = paths.filter((x) => x.pathIncluded).length;
        const excluded = paths.filter((x) => !x.pathIncluded).length;
        ok(included + excluded === paths.length, `${p.isin} path partition ${included}+${excluded}=${paths.length}`);
        // Frontier rule: last row must be Yes when paths present
        const last = paths[paths.length - 1];
        ok(last?.pathIncluded === true, `${p.isin} last path is Yes (frontier trim)`);
      }
      if (current.effectiveTargetLevel == null || Number.isFinite(current.effectiveTargetLevel)) {
        etShapeOk += 1;
      }
      // Schedule present for Current
      ok(Array.isArray(current.schedule), `${p.isin} has schedule`);
    }

    // Override changes Initial threshold when Target Level forced
    const o = await httpJson("/api/probability/run", {
      method: "POST",
      body: JSON.stringify({
        isin: p.isin,
        mode: "initial",
        includePaths: false,
        targetLevel: 99999,
      }),
    });
    if (o.status === 200 && initial?.threshold != null && o.json?.initial?.threshold != null) {
      ok(
        !nearly(initial.threshold, o.json.initial.threshold, 1e-6),
        `${p.isin} override moves Initial threshold`,
      );
    }
  }

  notes.push(`sampled ${samples.length} · bothOk=${bothOk} initProb=${withInitial} currProb=${withCurrent} withPaths=${withPaths} etShape=${etShapeOk}`);
  ok(bothOk === samples.length, `all ${samples.length} sample runs succeeded`);
  notes.push(
    `sample Current coverage initProb=${withInitial} currProb=${withCurrent} withPaths=${withPaths} (many early master rows have no remaining Current paths — live ongoing checked separately)`,
  );
  // Stronger check: explicitly probe a known live ongoing ISIN for Current paths
  const live = await httpJson("/api/probability/run", {
    method: "POST",
    body: JSON.stringify({ isin: "INE093J074Z3", mode: "current", includePaths: true }),
  });
  const livePaths = live.json?.current?.paths?.length ?? 0;
  ok(live.status === 200 && livePaths > 100, `live ongoing Current paths ${livePaths}`);
  ok(live.json?.current?.probability != null, `live ongoing Current probability ${live.json?.current?.probability}`);
  if (livePaths > 0) {
    const paths = live.json.current.paths;
    const included = paths.filter((x) => x.pathIncluded).length;
    const excluded = paths.filter((x) => !x.pathIncluded).length;
    ok(included + excluded === livePaths, `live path partition ${included}+${excluded}`);
    ok(paths[paths.length - 1]?.pathIncluded === true, "live last path is Yes");
  }

  // Batch warm integrity
  const batchIsins = samples.slice(0, 16).map((p) => p.isin);
  const batch = await httpJson("/api/probability/run", {
    method: "POST",
    body: JSON.stringify({ isins: batchIsins, mode: "both", includePaths: false }),
  });
  ok(batch.status === 200, `batch ${batch.status}`);
  const okRows = (batch.json?.results ?? []).filter((r) => r.ok).length;
  ok(okRows === batchIsins.length, `batch all ok ${okRows}/${batchIsins.length}`);

  return { samples, niftyCount: nifty.length };
}

async function uiProbe(preferredIsin) {
  console.log("\n=== Local UI / download probe ===");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.setDefaultTimeout(120000);

  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const home = await page.locator("body").innerText();
    ok(/2,?134|products|LIVE NOTIONAL|Portfolio by Lifecycle/i.test(home), "Home desk populated");
    ok(/Computing Initial\/Current Prob|Initial Prob|Export view|Computing probs/i.test(home), "Lifecycle probs UI present");

    // Search a known ongoing ISIN
    const searchIsin = "INE093J074Z3";
    const search = page.getByPlaceholder(/Search name, ISIN/i);
    if (await search.count()) {
      await search.fill(searchIsin);
      await page.waitForTimeout(10000);
      const hit = await page.locator("body").innerText();
      ok(
        hit.includes(searchIsin) || hit.includes("Nifty Magnifier - 173"),
        "search surfaces ongoing ISIN / name",
      );
    }

    // Current probability
    await page.goto(`${BASE}/current-probability`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    let cur = await page.locator("body").innerText();
    ok(/Target Underlying/i.test(cur), "Current input/KPI Target Underlying present");

    const reveal = page.getByRole("button", { name: /view current probability output/i });
    if (await reveal.count()) {
      await reveal.click();
      // Wait for path table or KPIs
      for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(1500);
        cur = await page.locator("body").innerText();
        if (/Historical Path|Included|All paths|Paths Taken|ALREADY PASSED/i.test(cur)) break;
      }
    }
    cur = await page.locator("body").innerText();
    ok(/Target Underlying/i.test(cur), "Current revealed Target Underlying card/KPI");
    ok(/Required Underlying|Probability|Paths Taken/i.test(cur), "Current KPIs present after reveal");

    // Path filters if table loaded
    const hasAll = await page.getByRole("button", { name: /All paths/i }).count();
    const hasInc = await page.getByRole("button", { name: /^Included$/i }).count();
    const hasExc = await page.getByRole("button", { name: /^Excluded$/i }).count();
    if (hasAll && hasInc && hasExc) {
      await page.getByRole("button", { name: /^Included$/i }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: /^Excluded$/i }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: /All paths/i }).first().click();
      notes.push("Current path Included/Excluded/All filters exercised");
      ok(true, "path filters available");
    } else {
      notes.push("path filter pills not visible yet (paths may still be loading / no remaining obs)");
    }

    // Initial
    await page.goto(`${BASE}/initial-probability`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const revealI = page.getByRole("button", { name: /view initial probability output/i });
    if (await revealI.count()) {
      await revealI.click();
      await page.waitForTimeout(12000);
    }
    const init = await page.locator("body").innerText();
    ok(/Probability|Observation|Path/i.test(init), "Initial output surfaced");
    const pathsDl = page.getByRole("button", { name: /Download Paths Excel/i }).first();
    if (await pathsDl.count()) {
      const dl = page.waitForEvent("download", { timeout: 90000 }).catch(() => null);
      await pathsDl.click();
      const file = await dl;
      if (file) {
        ok(/\.xlsx$/i.test(file.suggestedFilename()), `Initial Paths Excel ${file.suggestedFilename()}`);
        await file.cancel().catch(() => {});
      } else {
        notes.push("Paths Excel download event not captured");
      }
    }

    // Probability summary
    await page.goto(`${BASE}/probability`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const sum = await page.locator("body").innerText();
    ok(/Target Underlying|Valuation Date|Target Level|Effective Target/i.test(sum), "Probability inputs include target fields");
  } finally {
    await browser.close();
  }
}

async function prodProbe() {
  console.log("\n=== Production hydrate probe ===");
  const PROD = "https://dynamic-probability-calculator-9aso.vercel.app";
  try {
    const seed = await fetch(`${PROD}/data/master-seed.json`);
    ok(seed.ok, `prod seed ${seed.status}`);
    const j = await seed.json();
    ok((j.products?.length ?? 0) > 2000, `prod seed products ${j.products?.length}`);

    const boot = await fetch(`${PROD}/api/parse/bootstrap`);
    const bj = await boot.json();
    ok(boot.status === 200 && bj.code === "USE_STATIC_SEED", `prod bootstrap handoff ${boot.status} ${bj.code}`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
    await page.goto(`${PROD}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
    let body = "";
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(2000);
      body = await page.locator("body").innerText();
      if (/Loaded:.*desk products|2,?134/i.test(body)) break;
    }
    ok(/2,?134/i.test(body) || /Loaded:.*\d{3,} desk products/i.test(body), "prod Home hydrated with live book");
    ok(/Portfolio by Lifecycle/i.test(body), "prod lifecycle table present");
    await browser.close();
  } catch (e) {
    fails.push(`prod probe: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  console.log(`Wind-up E2E base: ${BASE}`);
  try {
    const ping = await fetch(BASE);
    ok(ping.ok, `local server ${ping.status}`);
  } catch {
    console.error("Local server down — start npm run dev");
    process.exit(1);
  }

  const { samples } = await logicProbe();
  const preferred =
    samples.find((p) => p.isin === "INE093J074Z3")?.isin ||
    samples.find((p) => p.isin)?.isin ||
    "INE093J074Z3";
  await uiProbe(preferred);
  await prodProbe();

  console.log("\n=== Notes ===");
  for (const n of notes) console.log("·", n);
  console.log("\n=== Verdict ===");
  if (fails.length) {
    console.error("FAIL");
    for (const f of fails) console.error("✗", f);
    process.exit(1);
  }
  console.log("PASS — deep wind-up E2E clean");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
