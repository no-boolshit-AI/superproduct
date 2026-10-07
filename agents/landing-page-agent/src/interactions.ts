/**
 * Interaction tester: opens the built site in Chromium and exercises every
 * interactive pattern it can find, so "it looks clickable" always means "it works".
 *
 * Conventions it relies on (the primitives follow them; custom components must too):
 * - tabs: [role=tablist] > [role=tab][aria-controls] → [role=tabpanel]
 * - carousels: [data-carousel][data-active-index] with [data-carousel-next] / [data-carousel-prev]
 * - toggles: [role=radiogroup] > [role=radio][aria-checked]
 * - filters: [data-filter-group] > button[data-filter] (+ [data-filter-item] siblings, hidden when filtered out)
 * - disclosures: button[aria-expanded] or <details><summary>
 * - dialogs: [data-dialog-trigger] opens a <dialog>
 * - sliders: input[type=range] with an [data-range-output] nearby
 * - forms: input[type=email] inside a <form>
 * - in-page links: every href="#id" must point at an element with that id
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import { config } from "./config.js";
import { serveStatic } from "./screenshot.js";

export type Check = { kind: string; label: string; pass: boolean; detail?: string };
export type InteractionReport = { ok: boolean; checks: Check[]; errors: string[] };

async function visible(l: Locator) {
  try {
    return await l.isVisible();
  } catch {
    return false;
  }
}

async function labelOf(l: Locator, fallback: string) {
  const t = (await l.getAttribute("aria-label").catch(() => null)) ?? (await l.innerText().catch(() => ""));
  return (t || fallback).replace(/\s+/g, " ").trim().slice(0, 60);
}

async function testTabs(page: Page, checks: Check[]) {
  const lists = page.locator("[role=tablist]");
  for (let i = 0; i < (await lists.count()); i++) {
    const list = lists.nth(i);
    if (!(await visible(list))) continue;
    const name = await labelOf(list, `tablist ${i + 1}`);
    const tabs = list.locator("[role=tab]");
    let ok = true;
    let detail = "";
    for (let t = 0; t < Math.min(await tabs.count(), 6); t++) {
      const tab = tabs.nth(t);
      await tab.click();
      const selected = await tab.getAttribute("aria-selected");
      const panelId = await tab.getAttribute("aria-controls");
      const panelVisible = panelId ? await visible(page.locator(`[id="${panelId}"]`)) : false;
      if (selected !== "true" || !panelVisible) {
        ok = false;
        detail = `tab ${t + 1}: aria-selected=${selected}, panel visible=${panelVisible}`;
        break;
      }
    }
    if (ok && (await tabs.count()) > 1) {
      // Keyboard: from the first tab, the arrow key along the list selects the second.
      const vertical = (await list.getAttribute("aria-orientation")) === "vertical";
      await tabs.first().click();
      await tabs.first().focus();
      await page.keyboard.press(vertical ? "ArrowDown" : "ArrowRight");
      if ((await tabs.nth(1).getAttribute("aria-selected")) !== "true") {
        ok = false;
        detail = `arrow key (${vertical ? "ArrowDown" : "ArrowRight"}) did not select the next tab`;
      }
    }
    checks.push({ kind: "tabs", label: name, pass: ok, detail });
  }
}

async function testCarousels(page: Page, checks: Check[]) {
  const cars = page.locator("[data-carousel]");
  for (let i = 0; i < (await cars.count()); i++) {
    const car = cars.nth(i);
    if (!(await visible(car))) continue;
    const name = await labelOf(car, `carousel ${i + 1}`);
    const next = car.locator("[data-carousel-next]").first();
    if (!(await next.count())) {
      checks.push({ kind: "carousel", label: name, pass: true, detail: "no arrows (swipe only)" });
      continue;
    }
    await car.scrollIntoViewIfNeeded();
    const before = await car.getAttribute("data-active-index");
    await next.click();
    await page.waitForTimeout(900);
    const after = await car.getAttribute("data-active-index");
    const prev = car.locator("[data-carousel-prev]").first();
    if (await prev.count()) {
      await prev.click();
      await page.waitForTimeout(900);
    }
    const back = await car.getAttribute("data-active-index");
    checks.push({ kind: "carousel", label: name, pass: before !== after && back === before, detail: `index ${before} → ${after} → ${back}` });
  }
}

async function testRadios(page: Page, checks: Check[]) {
  const groups = page.locator("[role=radiogroup]");
  for (let i = 0; i < (await groups.count()); i++) {
    const g = groups.nth(i);
    if (!(await visible(g))) continue;
    const name = await labelOf(g, `toggle ${i + 1}`);
    const radios = g.locator("[role=radio]");
    let ok = true;
    for (let r = 0; r < (await radios.count()); r++) {
      await radios.nth(r).click();
      if ((await radios.nth(r).getAttribute("aria-checked")) !== "true") ok = false;
    }
    await radios.first().click();
    checks.push({ kind: "toggle", label: name, pass: ok });
  }
}

async function testFilters(page: Page, checks: Check[]) {
  const groups = page.locator("[data-filter-group]");
  for (let i = 0; i < (await groups.count()); i++) {
    const g = groups.nth(i);
    if (!(await visible(g))) continue;
    const name = await labelOf(g, `filter ${i + 1}`);
    const scope = g.locator("xpath=ancestor::*[.//*[@data-filter-item]][1]");
    const items = scope.locator("[data-filter-item]");
    const total = await items.count();
    const chips = g.locator("button[data-filter]");
    let ok = true;
    let detail = "";
    for (let c = 1; c < (await chips.count()); c++) {
      await chips.nth(c).click();
      const shown = await items.evaluateAll((els) => els.filter((e) => !(e as HTMLElement).hidden).length);
      const pressed = await chips.nth(c).getAttribute("aria-pressed");
      if (pressed !== "true" || shown === 0 || shown > total) {
        ok = false;
        detail = `chip ${c}: pressed=${pressed}, showing ${shown}/${total}`;
        break;
      }
      detail = `filters narrow the list (e.g. ${shown}/${total})`;
    }
    await chips.first().click();
    const all = await items.evaluateAll((els) => els.filter((e) => !(e as HTMLElement).hidden).length);
    if (all !== total) {
      ok = false;
      detail = `"All" shows ${all}/${total}`;
    }
    checks.push({ kind: "filter", label: name, pass: ok, detail });
  }
}

async function testDisclosures(page: Page, checks: Check[]) {
  // Element handles stay bound to the same node even when attributes change.
  const buttons = await page.locator("button[aria-expanded=false]:not([aria-controls=mobile-menu])").elementHandles();
  let tested = 0;
  let failed = 0;
  for (const b of buttons.slice(0, 12)) {
    if (!(await b.isVisible())) continue;
    await b.click();
    tested++;
    if ((await b.getAttribute("aria-expanded")) !== "true") failed++;
  }
  if (tested) checks.push({ kind: "disclosure", label: `${tested} expandable buttons`, pass: failed === 0, detail: failed ? `${failed} did not expand` : undefined });

  const details = await page.locator("details:not([open])").elementHandles();
  let dt = 0;
  let df = 0;
  for (const d of details.slice(0, 8)) {
    const summary = await d.$("summary");
    if (!summary || !(await summary.isVisible())) continue;
    await summary.click();
    dt++;
    if (!(await d.evaluate((el) => (el as HTMLDetailsElement).open))) df++;
  }
  if (dt) checks.push({ kind: "accordion", label: `${dt} accordion items`, pass: df === 0, detail: df ? `${df} did not open` : undefined });
}

async function testDialogs(page: Page, checks: Check[]) {
  const triggers = page.locator("[data-dialog-trigger]");
  for (let i = 0; i < (await triggers.count()); i++) {
    const t = triggers.nth(i);
    if (!(await visible(t))) continue;
    const name = await labelOf(t, `dialog ${i + 1}`);
    await t.click();
    const opened = await page.locator("dialog[open]").count();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const closed = (await page.locator("dialog[open]").count()) === 0;
    checks.push({ kind: "dialog", label: name, pass: opened > 0 && closed, detail: `opened=${opened > 0}, closes on Escape=${closed}` });
  }
}

async function testRanges(page: Page, checks: Check[]) {
  const ranges = page.locator("input[type=range]");
  for (let i = 0; i < (await ranges.count()); i++) {
    const r = ranges.nth(i);
    if (!(await visible(r))) continue;
    const res = await r.evaluate((el: HTMLInputElement) => {
      const scope = el.closest("section") ?? document.body;
      const out = el.parentElement?.querySelector("[data-range-output]") ?? scope.querySelector("[data-range-output]");
      const result = scope.querySelector("[data-calculator-result]");
      const before = [out?.textContent, result?.textContent].join("|");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      const target = Number(el.value) === Number(el.max) ? el.min : el.max;
      setter.call(el, target);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { before, hasOut: Boolean(out) };
    });
    await page.waitForTimeout(100);
    const after = await r.evaluate((el: HTMLInputElement) => {
      const scope = el.closest("section") ?? document.body;
      const out = el.parentElement?.querySelector("[data-range-output]") ?? scope.querySelector("[data-range-output]");
      const result = scope.querySelector("[data-calculator-result]");
      return [out?.textContent, result?.textContent].join("|");
    });
    checks.push({ kind: "slider", label: await labelOf(r, `slider ${i + 1}`), pass: res.hasOut && after !== res.before, detail: res.hasOut ? undefined : "no [data-range-output] next to the slider" });
  }
}

async function testForms(page: Page, checks: Check[]) {
  const emails = page.locator("form input[type=email]");
  for (let i = 0; i < (await emails.count()); i++) {
    const input = emails.nth(i);
    if (!(await visible(input))) continue;
    await input.fill("not-an-email");
    await input.locator("xpath=ancestor::form[1]").locator("button[type=submit]").first().click();
    const invalid = await input.getAttribute("aria-invalid");
    await input.fill("");
    checks.push({ kind: "form", label: `email form ${i + 1}`, pass: invalid === "true", detail: invalid === "true" ? "rejects invalid input" : "no validation feedback" });
  }
}

async function testAnchors(page: Page, checks: Check[]) {
  const broken = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
      .map((a) => a.getAttribute("href")!)
      .filter((h) => h.length > 1 && !document.getElementById(decodeURIComponent(h.slice(1)))),
  );
  checks.push({ kind: "links", label: "in-page anchors", pass: broken.length === 0, detail: broken.length ? `no target for ${[...new Set(broken)].join(", ")}` : undefined });
}

async function testMobileMenu(page: Page, checks: Check[]) {
  const toggle = page.locator("[aria-controls=mobile-menu]").first();
  if (!(await toggle.count()) || !(await visible(toggle))) return;
  await toggle.click();
  const open = await visible(page.locator("#mobile-menu"));
  await toggle.click();
  const closed = !(await visible(page.locator("#mobile-menu")));
  checks.push({ kind: "nav", label: "mobile menu", pass: open && closed, detail: `opens=${open}, closes=${closed}` });
}

export async function testInteractions(siteDir: string): Promise<InteractionReport> {
  const outDir = path.join(siteDir, "out");
  if (!existsSync(path.join(outDir, "index.html"))) throw new Error("No build output. Run build_site first.");
  const server = await serveStatic(outDir);
  const browser = await chromium.launch({ executablePath: config.chromiumPath });
  const checks: Check[] = [];
  const errors: string[] = [];
  try {
    for (const vp of [{ width: 1440, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, reducedMotion: "reduce" });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`${vp.mobile ? "mobile" : "desktop"}: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`${vp.mobile ? "mobile" : "desktop"} console: ${m.text().slice(0, 200)}`);
      });
      page.on("response", (res) => {
        if (res.status() >= 400 && !/favicon/.test(res.url())) errors.push(`${vp.mobile ? "mobile" : "desktop"}: ${res.status()} for ${new URL(res.url()).pathname}`);
      });
      page.on("dialog", (d) => d.dismiss());
      await page.goto(server.url, { waitUntil: "networkidle" });
      if (vp.mobile) {
        await testMobileMenu(page, checks);
      } else {
        await testAnchors(page, checks);
        await testTabs(page, checks);
        await testCarousels(page, checks);
        await testRadios(page, checks);
        await testFilters(page, checks);
        await testDisclosures(page, checks);
        await testDialogs(page, checks);
        await testRanges(page, checks);
        await testForms(page, checks);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const ok = checks.every((c) => c.pass) && errors.length === 0;
  return { ok, checks, errors: [...new Set(errors)] };
}

export function formatInteractions(r: InteractionReport): string {
  const head = r.ok ? `Interactions OK (${r.checks.length} checks).` : `Interactions FAILED: ${r.checks.filter((c) => !c.pass).length} failing checks, ${r.errors.length} script errors.`;
  const lines = r.checks.map((c) => `- [${c.pass ? "pass" : "FAIL"}] ${c.kind}: ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
  const errs = r.errors.map((e) => `- [error] ${e}`);
  return [head, ...lines, ...errs].join("\n");
}
