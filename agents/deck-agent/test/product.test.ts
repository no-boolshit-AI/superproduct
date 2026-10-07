/**
 * Product folder → deck: brand mapping (colour roles, fonts, marker highlights, dark themes), precedence against brand
 * files, the prompt's product section, and a rendered page that really uses the product's font and colours.
 * Uses the fictional fixture product in lib/fixtures/acme (yellow accent that can't be text, one font with files).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

process.env.OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "deck-product-"));
delete process.env.PRODUCT_DIR;
const { ROOT } = await import("../src/config.js");
const { resolveBrand, productContext } = await import("../src/product.js");
const { brandCss } = await import("../src/themes.js");
const { systemPrompt } = await import("../src/prompt.js");
const { composePage } = await import("../src/compose.js");
const { getBrowser, closeBrowser } = await import("../src/render/renderer.js");
const { contrast } = await import("../../../lib/product.mjs");

const FIXTURE = path.resolve(ROOT, "../../lib/fixtures/acme");

try {
  // ── resolution and precedence ─────────────────────────────────────────────
  const none = resolveBrand({ product: "none" });
  assert.equal(none.product, null, "--product none disables the product folder");
  assert.ok(none.brandFile?.endsWith("brand.json"), "without a product the agent's brand.json applies");

  const r = resolveBrand({ product: FIXTURE });
  assert.equal(r.product?.name, "Acme Bread");
  assert.equal(r.brandFile, null, "the brand comes from the product folder");
  const withFile = resolveBrand({ product: FIXTURE, brandPath: path.join(ROOT, "brands", "example-brand.json") });
  assert.equal(withFile.brand.name, "Northwind Partners", "--brand beats the product's brand");
  assert.equal(withFile.product?.name, "Acme Bread", "…and the product context still applies");

  // ── colours ───────────────────────────────────────────────────────────────
  const b = r.brand;
  const c = b.colors;
  assert.match(b.source ?? "", /product folder: Acme Bread/);
  assert.ok(contrast(c.accentText!, c.pageBg!) >= 4.5, `accent text readable on the page (${c.accentText} on ${c.pageBg})`);
  assert.ok(contrast(c.onAccent!, c.accent!) >= 4.5, "text on accent fills is readable");
  assert.ok(contrast(c.accentOnDark!, c.dark!) >= 3, "accent on dark pages is visible");
  assert.equal(b.highlightStyle, "marker", "a light accent highlights with a marker, not coloured text");
  const d = b.darkColors!;
  assert.equal(d.pageBg, "#2b1d16", "dark themes use the product's inverse colour as the page");
  assert.ok(contrast(d.ink!, d.pageBg!) >= 7, "dark theme ink is readable");
  assert.ok((c.series ?? []).length >= 4, "chart series derived");

  // ── fonts ─────────────────────────────────────────────────────────────────
  assert.match(b.families?.heading ?? "", /^"Acme Sans"/, "headings use the product's sans");
  assert.match(b.families?.body ?? "", /^"Acme Sans"/);
  assert.equal(b.families?.accent, undefined, "a serif without font files is not used (the theme's font stays)");
  assert.match(b.fontFaceCss ?? "", /@font-face\{font-family:"Acme Sans"/);

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = brandCss(b, "editorial");
  assert.ok(css.includes(`--accent-text:${c.accentText}`), "accent text variable set");
  assert.match(css, /\.page\[data-format\]\{--font-head:"Acme Sans"/, "fonts beat the theme's format rules");
  assert.match(css, /\.page:not\(\.inverse\) \.hl\{/, "marker rule for ==highlights==");
  assert.ok(brandCss(b, "executive").includes(`--page-bg:${d.pageBg}`), "dark themes take the dark palette");
  assert.ok(!brandCss(none.brand, "strategy").includes("--accent-text"), "a plain brand file leaves the theme's text colours alone");

  // ── prompt ────────────────────────────────────────────────────────────────
  const context = productContext(r.product!);
  assert.match(context, /Acme Bread/);
  const sp = systemPrompt({ format: "auto", theme: "auto" }, { product: { name: "Acme Bread", context }, houseTheme: "corporate" });
  assert.match(sp, /# 9\. The product/);
  assert.match(sp, /<product_context>[\s\S]*Acme Bread[\s\S]*<\/product_context>/);
  assert.match(sp, /\*\*corporate\*\* is the house theme of Acme Bread/);
  assert.match(sp, /the product context \(section 9\)/, "facts rule names the product context");
  const plain = systemPrompt({ format: "auto", theme: "auto" });
  assert.doesNotMatch(plain, /# 9\. The product/, "no product, no product section");
  assert.match(plain, /Use \*\*strategy\*\* whenever/, "classic theme guidance without a product");

  // ── a rendered page ───────────────────────────────────────────────────────
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-product-page-"));
  const doc = { format: "deck" as const, theme: "editorial" as const, title: "Acme test", language: "en" };
  const ctx = { format: "deck" as const, theme: "editorial" as const, doc, pageNo: 2, total: 3, section: "Why bread", toc: [] };
  const page = composePage({
    runDir: dir,
    doc,
    brand: b,
    spec: { layout: "statement", title: "Fresh bread every Friday", slots: { statement: "Bread is ==back== on Fridays" } },
    ctx,
    elements: {},
  });
  assert.deepEqual(page.errors, []);
  const file = path.join(dir, "page.html");
  fs.writeFileSync(file, page.html);
  const browser = await getBrowser();
  const tab = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await tab.goto(pathToFileURL(file).href);
    await tab.evaluate(() => document.fonts.ready);
    // a string, so the TS transform can't inject helpers that don't exist in the page
    const got: { loaded: boolean; title: string; pageBg: string; tracker: string; hlBg: string; hlColor: string } = await tab.evaluate(`(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      return {
        loaded: document.fonts.check('16px "Acme Sans"'),
        title: cs(".pg-title").fontFamily,
        pageBg: cs(".page").backgroundColor,
        tracker: cs(".tracker").color,
        hlBg: cs(".st-big .hl").backgroundColor,
        hlColor: cs(".st-big .hl").color,
      };
    })()`);
    assert.ok(got.loaded, "the product font loads from the product folder");
    assert.match(got.title, /^"?Acme Sans/, `title font: ${got.title}`);
    assert.equal(got.pageBg, "rgb(250, 247, 242)", "page background is the product's background");
    assert.equal(got.tracker, "rgb(134, 112, 10)", "the tracker uses the readable accent text");
    assert.match(got.hlBg, /^(rgba|color)\(/, `marker behind the highlight: ${got.hlBg}`);
    assert.equal(got.hlColor, "rgb(43, 29, 22)", "highlighted words keep the on-accent ink");
  } finally {
    await tab.close();
  }
  console.log("✓ product: brand mapping, precedence, prompt section and a rendered page");
} finally {
  await closeBrowser();
}
