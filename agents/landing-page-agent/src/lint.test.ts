import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeBrand } from "./brand.js";
import { config } from "./config.js";
import { lintSite } from "./lint.js";

const goodConfig = `export const site = { brand: { name: "Acme" }, footer: { legal: ["© 2026 Acme"] } };`;

function makeSite(page: string, opts: { siteConfig?: string; custom?: Record<string, string>; plan?: boolean; brand?: boolean } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "lpa-lint-"));
  cpSync(config.templateDir, dir, { recursive: true, filter: (s) => !/node_modules|\.next|\/out$/.test(s) });
  cpSync(path.join(config.styleguideDir, "tokens.css"), path.join(dir, "styles", "tokens.css"));
  writeFileSync(path.join(dir, "app", "page.tsx"), page);
  writeFileSync(path.join(dir, "site.config.ts"), opts.siteConfig ?? goodConfig);
  writeFileSync(path.join(dir, "BRIEF.md"), "# Brief\nAcme makes rockets.");
  if (opts.plan !== false) writeFileSync(path.join(dir, "PLAN.md"), "# Plan");
  if (opts.brand !== false) writeBrand(dir, { primary: "#c2410c", displayFont: "fraunces", bodyFont: "inter", roundness: "soft" });
  mkdirSync(path.join(dir, "components", "custom"), { recursive: true });
  const custom = opts.custom ?? {
    "launch-hero.tsx": `import { Display } from "@/components/ui";\nexport function LaunchHero() { return <Display>Rockets, on time.</Display>; }`,
    "manifest.tsx": `import { Section } from "@/components/ui";
export function Manifest() { return <Section tone="inverse"><ol className="divide-y divide-border border-y border-border"><li className="py-6 text-body text-fg-muted">One</li></ol></Section>; }`,
    "pricing.tsx": `export function Pricing() { return <section className="bg-brand-50 section-y"><div className="container-page grid gap-6 lg:grid-cols-12"><p className="text-title text-fg rounded-lg shadow-md lg:col-span-4">From $9</p></div></section>; }`,
  };
  for (const [name, src] of Object.entries(custom)) writeFileSync(path.join(dir, "components", "custom", name), src);
  return dir;
}

const goodPage = `import { LaunchHero } from "@/components/custom/launch-hero";
export default function Page() { return <main><LaunchHero /></main>; }`;

test("template, library and a well-formed page pass the checker", () => {
  const r = lintSite(makeSite(goodPage), { includeSystem: true });
  assert.equal(r.errors, 0, JSON.stringify(r.issues, null, 2));
  assert.equal(r.warnings, 0, JSON.stringify(r.issues, null, 2));
});

test("flags off-token styling in custom sections", () => {
  const bad = `export function Bad() {
  return (
    <section className="bg-blue-500 text-[#ff0000] font-black shadow-xl rounded-2xl text-xl" style={{ color: "red" }}>
      <img src="/x.png" />
    </section>
  );
}`;
  const r = lintSite(makeSite(goodPage, { custom: { "launch-hero.tsx": `import { Display } from "@/components/ui";\nexport function LaunchHero() { return <Display>A</Display>; }`, "bad.tsx": bad } }));
  const rules = new Set(r.issues.map((i) => i.rule));
  for (const rule of ["palette", "arbitrary-value", "raw-color", "font-weight", "shadow", "radius", "text-size", "inline-style", "img-alt", "container"]) {
    assert.ok(rules.has(rule), `expected ${rule} in ${[...rules].join(", ")}`);
  }
  assert.equal(r.ok, false);
});

test("counts the H1 across page and custom sections", () => {
  const twoH1 = goodPage.replace("<LaunchHero />", '<LaunchHero /><h1 className="text-title">Again</h1>');
  assert.ok(lintSite(makeSite(twoH1)).issues.some((i) => i.rule === "h1"));
  const noH1 = `export default function Page() { return <main /> }`;
  assert.ok(lintSite(makeSite(noH1, { custom: {} })).issues.some((i) => i.rule === "h1"));
  const libHero = `import { HeroSplit } from "@/components/library";\nexport default function Page() { return <main><HeroSplit title="A" lead="B" /></main>; }`;
  const custom = { "a.tsx": "export const A = () => null;", "b.tsx": "export const B = () => null;" };
  assert.equal(lintSite(makeSite(libHero, { custom })).issues.filter((i) => i.rule === "h1").length, 0);
  const libHeroPlusDisplay = libHero.replace("</main>", '<Display>Again</Display></main>');
  assert.ok(lintSite(makeSite(libHeroPlusDisplay, { custom })).issues.some((i) => i.rule === "h1"));
});

test("an unset brand is an error", () => {
  const r = lintSite(makeSite(goodPage, { brand: false }));
  assert.ok(r.issues.some((i) => i.rule === "brand" && i.severity === "error"));
});

test("starter content, missing plan and too few custom sections are reported", () => {
  const starter = `/* STARTER PAGE — replace */\nimport { Display } from "@/components/ui";\nexport default function Page() { return <Display>Starter page.</Display>; }`;
  const r = lintSite(makeSite(starter, { siteConfig: `export const site = { brand: { name: "Your brand" } };`, custom: { "only.tsx": "export const O = () => null;" }, plan: false }));
  const rules = r.issues.map((i) => i.rule);
  assert.ok(rules.includes("starter-leftover"));
  assert.ok(rules.includes("plan"));
  assert.ok(rules.includes("custom-sections"));
  assert.equal(r.ok, false);
});

test("ignores copy that merely looks like class names", () => {
  const custom = {
    "launch-hero.tsx": `import { Display, Lead } from "@/components/ui";\nexport function LaunchHero() { return <><Display>A well-rounded shadow of doubt.</Display><Lead>Bold text-heavy pages, rounded edges.</Lead></>; }`,
    "a.tsx": "export const A = () => null;",
    "b.tsx": "export const B = () => null;",
  };
  const r = lintSite(makeSite(goodPage, { custom }));
  assert.equal(r.errors, 0, JSON.stringify(r.issues, null, 2));
});

test("denylist blocks terms not present in the brief", () => {
  const r = lintSite(makeSite(goodPage.replace("<main>", "<main><p>Better than Globex.</p>")), { denylist: ["Globex"] });
  assert.ok(r.issues.some((i) => i.rule === "denylist"));
});
