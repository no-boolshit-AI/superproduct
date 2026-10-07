/** Product folder → brand palette, masthead, brand fonts and context (fixture product, no network, no Claude). */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../lib/fixtures/acme");
process.env.OUTPUT_DIR = mkdtempSync(path.join(os.tmpdir(), "collage-product-"));
process.env.PRODUCT_DIR = FIXTURE;
const { defaults } = await import("../src/config.js");
const { contrast, getPalette, palettesCss, PALETTE_NAMES } = await import("../src/palettes.js");
const { systemPrompt } = await import("../src/prompt.js");
const { brandFontKit, productAt, productContext } = await import("../src/product.js");
const { prepareJobDir } = await import("../src/workspace.js");
const { LAYOUTS_DIR, SAMPLES_DIR } = await import("../src/paths.js");
const { closeBrowser, renderSlides } = await import("../src/tools/render.js");

const o = defaults();
assert.equal(o.product, FIXTURE, "product folder from PRODUCT_DIR");
assert.equal(o.brand, "acme bread", "masthead is the product wordmark");
assert.equal(o.palette, "brand", "the product's default palette");
assert.equal(o.brandFonts, true);
assert.ok(PALETTE_NAMES.includes("brand"));
const pal = getPalette("brand")!;
assert.equal(pal.bg, "#2b1d16", "pinned colours from product.json");
assert.equal(pal.ink, "#ffd60a");
assert.ok(contrast(pal.ink, pal.loud) >= 4.5 && contrast(pal.ink2, pal.loud) >= 4.5, "the loud slide keeps type readable");
assert.match(palettesCss(), /\[data-palette="brand"\]\{/);

const p = productAt(o.product)!;
const kit = brandFontKit(p);
assert.equal(kit.sans, "Acme Sans");
assert.equal(kit.serif, undefined, "no serif files in the fixture: the collage serif stays");
const prompt = systemPrompt("/tmp/job", o, { name: p.name, context: productContext(p), serif: kit.serif, sans: kit.sans });
assert.match(prompt, /# The product/);
assert.match(prompt, /A weekly sourdough subscription/);
assert.match(prompt, /The user chose the palette `brand`/);
assert.match(prompt, /Roboto Serif 300, class \.hl\) \+ one small sans block \(Acme Sans/);

// a job folder with the brand palette and fonts renders cleanly
const dir = mkdtempSync(path.join(os.tmpdir(), "collage-product-job-"));
await prepareJobDir(dir, { fontFiles: kit.files, css: kit.css });
assert.ok(existsSync(path.join(dir, "_design", "fonts", "brand", "acme-sans.woff2")), "font copied into the job");
const css = readFileSync(path.join(dir, "_design", "palettes.css"), "utf8");
assert.match(css, /font-family:"Acme Sans"/);
assert.match(css, /html:root\{--sans:"Acme Sans"/);
copyFileSync(path.join(SAMPLES_DIR, "sample-portrait.jpg"), path.join(dir, "assets", "p.jpg"));
const tpl = readFileSync(path.join(LAYOUTS_DIR, "01-cover-portrait.html"), "utf8")
  .replace(/<!--[\s\S]*?-->\n/, "")
  .replace('data-palette="orchid"', 'data-palette="brand"')
  .replace("assets/sample-portrait.jpg", "assets/p.jpg")
  .replace("Your Brand", o.brand);
writeFileSync(path.join(dir, "slide-01.html"), tpl);
try {
  const out = await renderSlides([path.join(dir, "slide-01.html")], path.join(dir, "png"), { scale: 1 });
  assert.equal(out.length, 1);
  assert.equal(out[0].warnings.length, 0, out[0].warnings.join("\n"));
  console.log(`✓ product: brand palette, masthead "${o.brand}", ${kit.sans} body, slide renders → ${out[0].image}`);
} finally {
  await closeBrowser();
}
