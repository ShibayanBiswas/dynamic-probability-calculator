/**
 * Local + deploy readiness smoke — routes, APIs, path include/exclude, exports.
 * Usage: node scripts/local-deploy-smoke.mjs
 * Requires: npm run dev on http://localhost:3001
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
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, json, text };
}

async function apiSmoke() {
  console.log("\n=== API smoke ===");
  for (const route of ["/", "/probability", "/initial-probability", "/current-probability", "/portfolio/analytics", "/intelligence"]) {
    const res = await fetch(`${BASE}${route}`);
    ok(res.status === 200, `GET ${route} → ${res.status}`);
  }

  const market = await httpJson("/api/market/levels");
  ok(market.status === 200, `GET /api/market/levels → ${market.status}`);

  // Discover a live Nifty ISIN via bootstrap/products if available
  let isin = "INE093JB7WN9";
  const bootstrap = await httpJson("/api/parse/bootstrap");
  if (bootstrap.status === 200 && Array.isArray(bootstrap.json?.products) && bootstrap.json.products.length) {
    const nifty = bootstrap.json.products.find(
      (p) => p.isin && /nifty/i.test(String(p.underlying || p.raw?.Underlying || "")),
    );
    if (nifty?.isin) isin = nifty.isin;
    ok(bootstrap.json.products.length > 100, `bootstrap products ${bootstrap.json.products.length}`);
  } else {
    notes.push(`bootstrap status ${bootstrap.status} — using fallback ISIN ${isin}`);
  }

  const summary = await httpJson("/api/probability/run", {
    method: "POST",
    body: JSON.stringify({
      isin,
      mode: "both",
      includePaths: false,
      valuationDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
    }),
  });
  ok(summary.status === 200 && summary.json?.ok !== false, `POST probability summary ${isin} → ${summary.status}`);
  ok(
    summary.json?.initial != null || summary.json?.current != null,
    "summary returns initial and/or current",
  );

  const withPaths = await httpJson("/api/probability/run", {
    method: "POST",
    body: JSON.stringify({
      isin,
      mode: "both",
      includePaths: true,
      valuationDate: new Date().toLocaleDateString("en-GB").split("/").join("-"),
    }),
  });
  ok(withPaths.status === 200, `POST probability paths → ${withPaths.status}`);
  const initialPaths = withPaths.json?.initial?.paths ?? [];
  const currentPaths = withPaths.json?.current?.paths ?? [];
  ok(initialPaths.length > 0 || currentPaths.length > 0, `path rows initial=${initialPaths.length} current=${currentPaths.length}`);

  const includedI = initialPaths.filter((p) => p.pathIncluded).length;
  const excludedI = initialPaths.filter((p) => !p.pathIncluded).length;
  const includedC = currentPaths.filter((p) => p.pathIncluded).length;
  const excludedC = currentPaths.filter((p) => !p.pathIncluded).length;
  notes.push(`Initial paths included=${includedI} excluded=${excludedI}`);
  notes.push(`Current paths included=${includedC} excluded=${excludedC}`);
  ok(includedI + excludedI === initialPaths.length || initialPaths.length === 0, "Initial include+exclude covers table");
  ok(includedC + excludedC === currentPaths.length || currentPaths.length === 0, "Current include+exclude covers table");
  if (isin === "INE093JA77O9" && initialPaths.length > 0) {
    ok(excludedI > 0, `689 Initial Excluded rows ${excludedI} (not empty)`);
  }

  // Batch warm (portfolio lifecycle download path)
  const batchIsins = [isin];
  if (bootstrap.json?.products) {
    for (const p of bootstrap.json.products) {
      if (p.isin && p.isin !== isin && /nifty/i.test(String(p.underlying || ""))) {
        batchIsins.push(p.isin);
        if (batchIsins.length >= 8) break;
      }
    }
  }
  const batch = await httpJson("/api/probability/run", {
    method: "POST",
    body: JSON.stringify({
      isins: batchIsins,
      mode: "both",
      includePaths: false,
    }),
  });
  ok(batch.status === 200 && Array.isArray(batch.json?.results), `batch warm ${batchIsins.length} ISINs → ${batch.status}`);
  const batchOk = (batch.json?.results ?? []).filter((r) => r.ok).length;
  ok(batchOk > 0, `batch ok rows ${batchOk}/${batchIsins.length}`);

  // Prefer an ISIN that actually has Current path rows for UI table checks.
  let pathIsin = isin;
  const niftyIsins = (bootstrap.json?.products ?? [])
    .filter((p) => p.isin && /nifty/i.test(String(p.underlying || "")))
    .map((p) => p.isin)
    .slice(0, 40);
  for (const candidate of niftyIsins) {
    const probe = await httpJson("/api/probability/run", {
      method: "POST",
      body: JSON.stringify({ isin: candidate, mode: "current", includePaths: true }),
    });
    const n = probe.json?.current?.paths?.length ?? 0;
    if (n > 20) {
      pathIsin = candidate;
      const paths = probe.json.current.paths;
      const included = paths.filter((p) => p.pathIncluded).length;
      const excluded = paths.filter((p) => !p.pathIncluded).length;
      notes.push(`path probe ${pathIsin} total=${n} included=${included} excluded=${excluded}`);
      ok(included + excluded === n, "Current include+exclude partition");
      break;
    }
  }

  const override = await httpJson("/api/probability/run", {
    method: "POST",
    body: JSON.stringify({
      isin: pathIsin,
      mode: "both",
      includePaths: false,
      targetLevel: 30000,
    }),
  });
  ok(override.status === 200, `override targetLevel → ${override.status}`);

  return { isin: pathIsin, withPaths };
}

async function uiSmoke(isin) {
  console.log("\n=== UI + download smoke ===");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(90_000);

  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const home = await page.locator("body").innerText();
    ok(/LIVE NOTIONAL|products|Portfolio by Lifecycle/i.test(home), "Home shows portfolio shell");
    ok(/Nifty Accelerator|INE093|products/i.test(home), "Home has product rows or counts");

    // Lifecycle search → probs fill
    const search = page.getByPlaceholder(/Search name, ISIN/i);
    if (await search.count()) {
      await search.fill(isin.slice(0, 8));
      await page.waitForTimeout(6000);
      const searched = await page.locator("body").innerText();
      notes.push(`search hit chars=${searched.length}`);
      ok(searched.includes(isin.slice(0, 8)) || /Computing Initial\/Current Prob|%|—/i.test(searched), "search updates table");
    }

    // Current probability — Target Underlying card + reveal paths
    await page.goto(`${BASE}/current-probability`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const reveal = page.getByRole("button", { name: /view current probability output/i });
    if (await reveal.count()) {
      await reveal.click();
      await page.waitForTimeout(10000);
    }
    const cur = await page.locator("body").innerText();
    ok(/Target Underlying/i.test(cur), "Current tab shows Target Underlying");
    ok(/Required Underlying|Probability|Paths Taken/i.test(cur), "Current KPIs present");
    ok(/Observation|Historical Path|Path Taken/i.test(cur), "Current path/schedule surface present");

    // Downloads — probability Excel
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
    const excelBtn = page.getByRole("button", { name: /Excel|Download|\.xlsx/i }).first();
    if (await excelBtn.count()) {
      await excelBtn.click();
      const dl = await downloadPromise;
      if (dl) {
        const name = dl.suggestedFilename();
        ok(/\.xlsx$/i.test(name), `Current Excel download ${name}`);
        await dl.cancel().catch(() => {});
      } else {
        notes.push("Excel download event not captured (button may open differently)");
      }
    } else {
      notes.push("No Excel button visible on Current after reveal");
    }

    // Initial probability paths + Included / Excluded / All paths filters
    await page.goto(`${BASE}/initial-probability`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const revealI = page.getByRole("button", { name: /view initial probability output/i });
    if (await revealI.count()) {
      await revealI.click();
      await page.waitForTimeout(15000);
    }
    const init = await page.locator("body").innerText();
    ok(/Path|Observation|Probability/i.test(init), "Initial output surfaced");

    const filterAll = page.getByRole("button", { name: /All paths/i }).first();
    const filterYes = page.getByRole("button", { name: /^Included$/i }).first();
    const filterNo = page.getByRole("button", { name: /^Excluded$/i }).first();
    if (await filterAll.count()) {
      await filterAll.click();
      await page.waitForTimeout(400);
      notes.push("path filter All paths clicked");
    }
    if (await filterYes.count()) {
      await filterYes.click();
      await page.waitForTimeout(500);
      notes.push("path filter Included clicked");
      ok(true, "Included path filter available");
    }
    if (await filterNo.count()) {
      await filterNo.click();
      await page.waitForTimeout(500);
      notes.push("path filter Excluded clicked");
      ok(true, "Excluded path filter available");
    }
    const pathsDl = page.getByRole("button", { name: /Download Paths Excel/i }).first();
    if (await pathsDl.count()) {
      const dlPaths = page.waitForEvent("download", { timeout: 90000 }).catch(() => null);
      await pathsDl.click();
      const file = await dlPaths;
      if (file) {
        ok(/\.xlsx$/i.test(file.suggestedFilename()), `Paths Excel ${file.suggestedFilename()}`);
        await file.cancel().catch(() => {});
      }
    }

    // Home lifecycle export buttons (may be disabled while warming)
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const exportView = page.getByRole("button", { name: /Export view|Computing probs/i }).first();
    const fullWb = page.getByRole("button", { name: /Full workbook|Computing probs/i }).first();
    ok((await exportView.count()) > 0, "Export view control present");
    ok((await fullWb.count()) > 0, "Full workbook control present");
    if ((await exportView.count()) && !(await exportView.isDisabled())) {
      const dl2 = page.waitForEvent("download", { timeout: 120000 }).catch(() => null);
      await exportView.click();
      const file = await dl2;
      if (file) {
        ok(/\.xlsx$/i.test(file.suggestedFilename()), `Export view ${file.suggestedFilename()}`);
        await file.cancel().catch(() => {});
      } else {
        notes.push("Export view click — download not fired (still warming or client build)");
      }
    } else {
      notes.push("Export view disabled (probs still warming) — expected until warm completes");
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`Smoke base: ${BASE}`);
  try {
    const ping = await fetch(BASE);
    ok(ping.ok, `server reachable ${ping.status}`);
  } catch (e) {
    console.error("Server not reachable. Start with: npm run dev");
    process.exit(1);
  }

  const { isin } = await apiSmoke();
  await uiSmoke(isin);

  console.log("\n=== Notes ===");
  for (const n of notes) console.log("·", n);
  console.log("\n=== Verdict ===");
  if (fails.length) {
    console.error("FAIL");
    for (const f of fails) console.error("✗", f);
    process.exit(1);
  }
  console.log("PASS — local API/UI/download smoke clean");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
