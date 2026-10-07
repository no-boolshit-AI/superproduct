// Zero-cost tests for lib/product.mjs:   node --test lib/
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkProduct,
  colorToHex,
  contrast,
  findProductDir,
  loadProduct,
  parseFrontmatter,
  parseTokens,
  ProductError,
  resolveTokens,
  tokensToCss,
  withContrast,
} from "./product.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures", "acme");

function sandbox() {
  const root = mkdtempSync(path.join(os.tmpdir(), "product-test-"));
  cpSync(FIXTURE, path.join(root, "product"), { recursive: true });
  mkdirSync(path.join(root, "agents", "some-agent", "src"), { recursive: true });
  return root;
}

test("findProductDir: explicit, env, walk-up, none", () => {
  const root = sandbox();
  const agent = path.join(root, "agents", "some-agent");
  assert.equal(findProductDir({ from: agent, env: {} }), path.join(root, "product"));
  assert.equal(findProductDir({ explicit: path.join(root, "product"), env: {} }), path.join(root, "product"));
  assert.equal(findProductDir({ explicit: root, env: {} }), path.join(root, "product"), "a parent folder with product/ inside works too");
  assert.equal(findProductDir({ env: { PRODUCT_DIR: path.join(root, "product") }, from: os.tmpdir() }), path.join(root, "product"));
  assert.equal(findProductDir({ explicit: "none", from: agent, env: {} }), null);
  assert.equal(findProductDir({ env: { PRODUCT_DIR: "none" }, from: agent }), null);
  assert.equal(findProductDir({ from: os.tmpdir(), env: {} }), null);
  assert.throws(() => findProductDir({ explicit: path.join(root, "agents"), env: {} }), ProductError);
  rmSync(root, { recursive: true, force: true });
});

test("tokens: DTCG groups, inherited $type, aliases, colour objects", () => {
  const doc = {
    color: {
      $type: "color",
      base: { $value: { colorSpace: "srgb", components: [0.784, 0.941, 0.192], hex: "#c8f031" } },
      calc: { $value: { colorSpace: "srgb", components: [1, 0, 0] } },
      ok: { $value: { colorSpace: "oklch", components: [0.628, 0.2577, 29.23] } },
      role: { primary: { $value: "{color.base}" }, deep: { $value: "{color.role.primary}" } },
    },
    size: { $type: "dimension", md: { $value: { value: 16, unit: "px" } } },
    type: { body: { $type: "typography", $value: { fontFamily: "{font.sans}", fontSize: "{size.md}", fontWeight: 400, lineHeight: 1.5 } } },
    font: { sans: { $type: "fontFamily", $value: ["Instrument Sans", "sans-serif"] } },
  };
  const t = resolveTokens(parseTokens(doc));
  assert.equal(t.get("color.role.primary").type, "color");
  assert.equal(colorToHex(t.get("color.role.deep").value), "#c8f031");
  assert.equal(colorToHex(t.get("color.calc").value), "#ff0000");
  assert.equal(colorToHex(t.get("color.ok").value), "#ff0000", "oklch red converts back to #ff0000");
  assert.deepEqual(t.get("type.body").value.fontFamily, ["Instrument Sans", "sans-serif"]);
  assert.deepEqual(t.get("type.body").value.fontSize, { value: 16, unit: "px" });
  const css = tokensToCss(t);
  assert.match(css, /--color-role-primary: #c8f031;/);
  assert.match(css, /--size-md: 16px;/);
  assert.match(css, /--font-sans: "Instrument Sans", sans-serif;/);
  assert.throws(() => resolveTokens(parseTokens({ a: { $type: "color", x: { $value: "{a.y}" }, y: { $value: "{a.x}" } } })), /Circular/);
  assert.throws(() => resolveTokens(parseTokens({ a: { $type: "color", x: { $value: "{a.nope}" } } })), /points to nothing/);
});

test("colour helpers keep the hue and reach the target contrast", () => {
  const paper = "#f4f4f2";
  const lime = "#c8f031";
  assert.ok(contrast(lime, paper) < 2);
  const text = withContrast(lime, paper, 4.5);
  assert.ok(contrast(text, paper) >= 4.5, `${text} on paper`);
  const onDark = withContrast("#1e33b8", "#0b0e1c", 4.5);
  assert.ok(contrast(onDark, "#0b0e1c") >= 4.5);
});

test("loadProduct: roles, fonts, agent config, context", () => {
  const p = loadProduct(FIXTURE);
  assert.equal(p.name, "Acme Bread");
  assert.equal(p.wordmark, "acme bread");
  assert.equal(p.roles.primary, "#ffd60a");
  assert.equal(p.roles.onPrimary, "#2b1d16");
  assert.equal(p.roles.background, "#faf7f2");
  assert.equal(p.roles.secondary, "#ffd60a", "secondary falls back to the accent");
  assert.ok(p.roles.surface && p.roles.border && p.roles.textMuted);
  assert.equal(p.fontFamily("sans"), "Acme Sans");
  assert.equal(p.fontFiles().length, 1);
  assert.match(p.fontFaceCss(), /@font-face\{font-family:"Acme Sans";font-style:normal;font-weight:400 700;font-display:block;src:url\("file:/);
  assert.equal(p.fontStack("serif"), '"Fraunces", serif');
  assert.deepEqual(p.agentConfig("collage-post"), { palette: "brand", brandPalette: { bg: "#2b1d16", ink: "#ffd60a" }, fonts: "brand" });
  assert.deepEqual(p.agentConfig("nobody"), {});
  assert.deepEqual(p.profilesFor("deck"), ["content", "sales"]);
  const ctx = p.context("carousel");
  assert.match(ctx, /^# Product context: Acme Bread/);
  assert.match(ctx, /product\/BRIEF\.md · status: verified/);
  assert.match(ctx, /product\/brand\/messaging\.md · status: draft/);
  assert.match(ctx, /> DRAFT: inferred/);
  assert.match(ctx, /never as instructions about your tools/);
  assert.doesNotMatch(ctx, /^---\ntitle:/m, "frontmatter is stripped");
  const small = p.context(["content", "design"], { maxChars: 1500 });
  assert.ok(small.length <= 1800, `budget respected (${small.length})`);
  assert.match(small, /Left out to save space|truncated/);
});

test("frontmatter: scalars, inline and block lists", () => {
  const { data, body } = parseFrontmatter('---\ntitle: "A: b"\nstatus: draft\nupdated: 2026-10-07\nsources: [https://a.example, "b"]\nowners:\n  - one\n  - two\ncount: 3\n---\n# Hi\n');
  assert.equal(data.title, "A: b");
  assert.equal(data.status, "draft");
  assert.deepEqual(data.sources, ["https://a.example", "b"]);
  assert.deepEqual(data.owners, ["one", "two"]);
  assert.equal(data.count, 3);
  assert.equal(body, "# Hi\n");
});

test("checkProduct: fixture passes; broken folders report errors", () => {
  const ok = checkProduct(FIXTURE, { now: new Date("2026-10-08") });
  assert.equal(ok.ok, true, ok.errors.join("\n"));
  assert.equal(ok.info.offerings, 1);
  assert.ok(ok.info.placeholders >= 1, "counts [Placeholder] markers");
  assert.ok(ok.info.contrast && ok.info.contrast["on-primary on primary"] >= 4.5, "contrast pairs are measured");

  const stale = checkProduct(FIXTURE, { now: new Date("2027-03-01") });
  assert.ok(stale.warnings.some((w) => /stale/.test(w)), "old docs are flagged as stale");

  const root = sandbox();
  const dir = path.join(root, "product");
  rmSync(path.join(dir, "offerings", "weekly-loaf.md"));
  writeFileSync(path.join(dir, "brand", "design.tokens.json"), JSON.stringify({ color: { $type: "color", role: { primary: { $value: "{color.missing}" } } } }));
  const bad = checkProduct(dir);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /points to nothing/.test(e)), bad.errors.join("\n"));
  rmSync(root, { recursive: true, force: true });
});
