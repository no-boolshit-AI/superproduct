/**
 * Product folder → site: set_brand values from the tokens, PRODUCT.md and logo files in the scaffold, the product mark
 * as favicon, the read-only guard, and product words allowed by the denylist. Uses a temp copy of the fictional fixture
 * in lib/fixtures/acme with a logo added; never the repo's own product/ folder.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

process.env.LPA_SITES_DIR = mkdtempSync(path.join(tmpdir(), "lpa-product-sites-"));
const { ROOT } = await import("./config.js");
const { brandInputFor, fontIdFor, resolveProduct } = await import("./product.js");
const { scaffoldSite } = await import("./scaffold.js");
const { writeBrand } = await import("./brand.js");
const { confineTo } = await import("./agent.js");
const { lintSite } = await import("./lint.js");

const fixture = mkdtempSync(path.join(tmpdir(), "lpa-product-"));
cpSync(path.resolve(ROOT, "../../lib/fixtures/acme"), fixture, { recursive: true });
mkdirSync(path.join(fixture, "assets", "logo"), { recursive: true });
const svg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 24"><rect width="120" height="24" fill="${fill}"/></svg>\n`;
writeFileSync(path.join(fixture, "assets", "logo", "wordmark.svg"), svg("#2b1d16"));
writeFileSync(path.join(fixture, "assets", "logo", "mark.svg"), svg("#ffd60a"));
const manifest = JSON.parse(readFileSync(path.join(fixture, "product.json"), "utf8"));
manifest.brand.logo = { primary: "assets/logo/wordmark.svg", mark: "assets/logo/mark.svg" };
writeFileSync(path.join(fixture, "product.json"), JSON.stringify(manifest, null, 2));

test("set_brand values come from the product's tokens", () => {
  const p = resolveProduct(fixture)!;
  assert.equal(p.name, "Acme Bread");
  const { input, notes } = brandInputFor(p);
  assert.equal(input.primary, "#ffd60a");
  assert.equal(input.dark, "#2b1d16", "inverse colour → dark sections");
  assert.equal(input.background, "#faf7f2", "off-white page background kept");
  assert.equal(input.bodyFont, "inter", "a font outside the set gets the nearest stand-in…");
  assert.match(notes.join(" "), /Acme Sans isn't in set_brand's font list/, "…and a note says so");
  assert.equal(input.accentFont, "fraunces", "the product serif is in the set");
  assert.equal(input.roundness, "soft");
  assert.equal(fontIdFor("Instrument Sans"), "instrument-sans");
  assert.equal(fontIdFor("Crimson Pro"), "crimson-pro");
  assert.equal(resolveProduct("none"), null);
});

test("explicit set_brand values in product.json win", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lpa-product-cfg-"));
  cpSync(fixture, dir, { recursive: true });
  const m = JSON.parse(readFileSync(path.join(dir, "product.json"), "utf8"));
  m.agents = { "landing-page": { brand: { primary: "{color.crust}", displayFont: "fraunces", bodyFont: "dm-sans", roundness: "round", headingWeight: 500 } } };
  writeFileSync(path.join(dir, "product.json"), JSON.stringify(m, null, 2));
  const { input } = brandInputFor(resolveProduct(dir)!);
  assert.equal(input.primary, "#2b1d16", "{token} references resolve");
  assert.equal(input.displayFont, "fraunces");
  assert.equal(input.bodyFont, "dm-sans");
  assert.equal(input.roundness, "round");
  assert.equal(input.headingWeight, 500);
});

test("the scaffold writes PRODUCT.md and copies the logos; set_brand uses the mark as favicon", () => {
  const p = resolveProduct(fixture)!;
  const site = scaffoldSite({ slug: "acme-test", brief: "Acme Bread: a weekly sourdough subscription page.", product: p });
  const doc = readFileSync(path.join(site.dir, "PRODUCT.md"), "utf8");
  assert.match(doc, /^# Product: Acme Bread/);
  assert.match(doc, /## Brand for set_brand[\s\S]*- primary: #ffd60a/);
  assert.match(doc, /\/assets\/brand\/logo\.svg: the logo for light backgrounds/);
  assert.match(doc, /\*\*Start a subscription\*\* → https:\/\/acme\.example\/start/, "main action from product.json → cta");
  assert.match(doc, /# Product context: Acme Bread/, "compiled context appended");
  assert.ok(existsSync(path.join(site.dir, "public", "assets", "brand", "logo.svg")));
  assert.ok(existsSync(path.join(site.dir, "public", "assets", "brand", "mark.svg")));
  assert.match(readFileSync(path.join(site.dir, "BRIEF.md"), "utf8"), /## Product folder\nPRODUCT\.md holds Acme Bread's/);
  writeBrand(site.dir, { primary: "#ffd60a", displayFont: "inter", bodyFont: "inter" });
  assert.equal(readFileSync(path.join(site.dir, "app", "icon.svg"), "utf8"), svg("#ffd60a"), "favicon is the product's mark");
});

test("without a product nothing product-specific is written", () => {
  const site = scaffoldSite({ slug: "plain-test", brief: "A plain page with no product folder." });
  assert.equal(site.product, undefined);
  assert.equal(existsSync(path.join(site.dir, "PRODUCT.md")), false);
  assert.equal(existsSync(path.join(site.dir, "public", "assets", "brand")), false);
});

test("PRODUCT.md and the brand files are read-only for the agent", async () => {
  const site = mkdtempSync(path.join(tmpdir(), "lpa-product-hook-"));
  mkdirSync(path.join(site, "styles"));
  writeFileSync(path.join(site, "PLAN.md"), "# Plan");
  writeFileSync(path.join(site, "styles", "brand.css"), ":root { --color-brand-500: #c2410c; }");
  const hook = confineTo(site);
  const call = (tool_name: string, tool_input: Record<string, unknown>) =>
    hook({ hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: "t", session_id: "s", transcript_path: "", cwd: site } as never, "t", { signal: new AbortController().signal });
  const denied = (r: unknown) => (r as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision === "deny";
  assert.equal(denied(await call("Read", { file_path: `${site}/PRODUCT.md` })), false);
  assert.equal(denied(await call("Write", { file_path: `${site}/PRODUCT.md`, content: "" })), true);
  assert.equal(denied(await call("Write", { file_path: `${site}/public/assets/brand/logo.svg`, content: "" })), true);
  assert.equal(denied(await call("Write", { file_path: `${site}/public/assets/hero.svg`, content: "" })), false);
});

test("terms from PRODUCT.md are not flagged by the denylist", () => {
  const p = resolveProduct(fixture)!;
  const site = scaffoldSite({ slug: "acme-lint", brief: "Acme Bread page.", product: p });
  mkdirSync(path.join(site.dir, "components", "custom"), { recursive: true });
  writeFileSync(path.join(site.dir, "components", "custom", "note.tsx"), `export function Note() { return <p>Sourdough every week, no blockchain.</p>; }`);
  const flagged = (list: string[]) => lintSite(site.dir, { denylist: list }).issues.filter((i) => i.rule === "denylist").length;
  assert.equal(flagged(["sourdough"]), 0, "sourdough is in PRODUCT.md, so it's the product's own word");
  assert.equal(flagged(["blockchain"]), 1, "a denylisted term in neither file is still flagged");
});
