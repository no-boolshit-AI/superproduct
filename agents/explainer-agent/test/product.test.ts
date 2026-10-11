/**
 * The product folder → brand kit → HyperFrames project, on lib/fixtures/acme: colours in roles, the brand fonts the
 * way a website capture leaves them, design.md for workflows without build-frame, and merging into a real website
 * capture for product-launch-video. (pipeline.test.ts renders the same brand.)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PRODUCT_DIR = "none";
const { ROOT } = await import("../src/config.js");
const { BRAND_MARKER, brandKit, brandSection, resolveProduct, tokensJson } = await import("../src/product.js");
const { setupProject, writeBrandCapture } = await import("../src/project.js");

const ACME = path.resolve(ROOT, "../../lib/fixtures/acme");
assert.equal(resolveProduct(undefined), null, "PRODUCT_DIR=none means no product");
assert.equal(resolveProduct("none"), null);

const product = resolveProduct(ACME)!;
const kit = brandKit(product);
assert.equal(kit.source, "product folder: Acme Bread");
assert.deepEqual(kit.colors, { canvas: "#faf7f2", ink: "#2b1d16", muted: kit.colors!.muted, accent: "#ffd60a", onAccent: "#2b1d16", accentText: "#86700a", band: "#2b1d16", onBand: "#ffffff" });
assert.deepEqual(kit.fonts, { display: "Acme Sans", body: "Acme Sans", accent: undefined, weights: [400, 500, 600, 700] });
assert.deepEqual(kit.fontFiles.map((f) => f.name), ["acme-sans.woff2"]);
assert.match(kit.fontFaceCss, /src:url\("assets\/fonts\/captured-acme-sans\.woff2"\) format\("woff2"\)/);
assert.match(kit.captureFontFaceCss, /src:url\("assets\/fonts\/acme-sans\.woff2"\)/);
assert.deepEqual(kit.cta, { label: "Start a subscription", url: "https://acme.example/start" });
assert.equal(kit.imageStyle, "warm daylight, flour dust, crusty loaves");

// build-frame reads roles from colorStats: ground = most background area, ink = most text, accent = interactive fills
const t = tokensJson(kit, "T", "D") as { colors: string[]; colorStats: { hex: string; areaBg: number; textCount: number; interactiveBg: number }[] };
const top = (k: "areaBg" | "textCount" | "interactiveBg") => [...t.colorStats].sort((a, b) => b[k] - a[k])[0].hex;
assert.equal(top("areaBg"), "#faf7f2");
assert.equal(top("textCount"), "#2b1d16");
assert.equal(top("interactiveBg"), "#ffd60a");

// the yellow can't be text on the paper ground: the Brand kit says so and names the readable variant
const section = brandSection(kit, {});
assert.ok(section.startsWith(BRAND_MARKER));
assert.match(section, /Accent `#ffd60a` is a fill, not a text colour/);
assert.match(section, /as text or a thin line on this ground: `#86700a`/);
assert.match(section, /Wordmark\.\*\* "acme bread"/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-product-"));

// product.json → agents.explainer: a dark ground, a {token} colour, a preferred preset, art direction
const darkDir = path.join(tmp, "acme-dark");
fs.cpSync(ACME, darkDir, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(darkDir, "product.json"), "utf8"));
manifest.agents.explainer = { ground: "dark", colors: { accent: "{color.yellow}" }, preset: "cobalt-grid", notes: "Flour-dust grain on dark bands." };
fs.writeFileSync(path.join(darkDir, "product.json"), JSON.stringify(manifest, null, 2));
const dark = brandKit(resolveProduct(darkDir));
assert.equal(dark.ground, "dark");
assert.equal(dark.colors?.canvas, "#2b1d16");
assert.equal(dark.colors?.ink, "#ffffff");
assert.equal(dark.colors?.accent, "#ffd60a");
assert.equal(dark.colors?.accentText, "#ffd60a", "on a dark ground the yellow reads as text");
assert.equal(dark.preset, "cobalt-grid");
assert.match(brandSection(dark, {}), /Art direction\.\*\* Flour-dust grain/);
const o = { brief: "# Why sourdough takes time\n\nFor home bakers.", format: "portrait" as const };

// general-video: no build-frame, so the brand kit is design.md, the design source that workflow reads first after frame.md
const gv = await setupProject(path.join(tmp, "gv"), o, kit, "general-video");
const design = fs.readFileSync(path.join(gv.projectDir, "design.md"), "utf8");
assert.match(design, /^# Design\n\n<!-- explainer-agent:brand-kit -->/);
assert.match(design, /captured-acme-sans\.woff2/);
assert.ok(fs.existsSync(path.join(gv.projectDir, "assets", "fonts", "captured-acme-sans.woff2")));
assert.ok(!fs.existsSync(path.join(gv.projectDir, "frame.md")));

// product-launch-video with a URL: capture/ is left to `hyperframes capture`; the brand merges in before build-frame
const pl = await setupProject(path.join(tmp, "pl"), { ...o, workflow: "product-launch-video", url: "https://acme.example" }, kit, "product-launch-video");
const extracted = path.join(pl.projectDir, "capture", "extracted");
assert.ok(!fs.existsSync(path.join(extracted, "tokens.json")), "no pre-written capture");
fs.mkdirSync(extracted, { recursive: true });
fs.writeFileSync(path.join(extracted, "tokens.json"), JSON.stringify({ title: "Acme — fresh bread", description: "From the site", colors: ["#123456"], fonts: [{ family: "Site Sans" }], extra: 1 }));
fs.writeFileSync(path.join(extracted, "page.html"), "<html><head><style>@font-face{font-family:'Site Sans';src:url(assets/fonts/site.woff2)}</style></head><body>site</body></html>");
writeBrandCapture(pl.projectDir, kit, { title: "x", description: "y" });
const merged = JSON.parse(fs.readFileSync(path.join(extracted, "tokens.json"), "utf8"));
assert.equal(merged.title, "Acme — fresh bread", "the captured title stays");
assert.equal(merged.extra, 1);
assert.deepEqual(merged.colors, ["#faf7f2", "#2b1d16", "#ffd60a", "#86700a"], "the product's colours win");
assert.deepEqual(merged.fonts.map((f: { family: string }) => f.family), ["Acme Sans"]);
const page = fs.readFileSync(path.join(extracted, "page.html"), "utf8");
assert.match(page, /Site Sans[\s\S]*explainer-agent: brand fonts[\s\S]*Acme Sans[\s\S]*<\/head>/, "brand faces appended inside the captured page's head");
assert.ok(fs.existsSync(path.join(pl.projectDir, "capture", "assets", "fonts", "acme-sans.woff2")));

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✓ product OK");
