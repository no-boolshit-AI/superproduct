import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBrand, contrast, generateScale, STOPS } from "./brand.js";

test("scale keeps the brand colour at its closest stop and runs light to dark", () => {
  const { scale, anchor } = generateScale("#0f766e");
  assert.equal(scale[anchor], "#0f766e");
  const lums = STOPS.map((s) => contrast(scale[s], "#000000"));
  for (let i = 1; i < lums.length; i++) assert.ok(lums[i]! <= lums[i - 1]! + 0.01, `stop ${STOPS[i]} should be darker`);
});

test("light brand colours get a dark button label and a darker link colour", () => {
  const { report } = buildBrand({ primary: "#C8F031", displayFont: "instrument-sans", bodyFont: "instrument-sans" });
  assert.equal(report.accent, "#c8f031");
  assert.equal(report.onAccent, "#16171a");
  assert.notEqual(report.accentText, "#c8f031");
  for (const c of report.checks) assert.ok(c.pass, `${c.pair} ${c.ratio}`);
});

test("every brand passes the contrast checks and writes its fonts", () => {
  for (const primary of ["#2563eb", "#c2410c", "#7c3aed", "#facc15", "#111827", "#16a34a"]) {
    const { css, fontsTs, report } = buildBrand({ primary, displayFont: "fraunces", bodyFont: "inter", accentFont: "crimson-pro", roundness: "round" });
    for (const c of report.checks) assert.ok(c.pass, `${primary}: ${c.pair} ${c.ratio}`);
    assert.ok(css.includes("--radius-button: 9999px"));
    assert.ok(fontsTs.includes("@fontsource-variable/fraunces") && fontsTs.includes("@fontsource-variable/crimson-pro"));
    assert.ok(!css.includes("DEFAULT BRAND"));
  }
});

test("an off-white brand background replaces the canvas; a dark one is ignored", () => {
  const light = buildBrand({ primary: "#C8F031", background: "#F4F4F2", displayFont: "instrument-sans", bodyFont: "instrument-sans" });
  assert.ok(light.css.includes("--color-canvas: #f4f4f2;"));
  assert.ok(light.css.includes("--color-card: #ffffff;"));
  for (const c of light.report.checks) assert.ok(c.pass, `${c.pair} ${c.ratio}`);
  const dark = buildBrand({ primary: "#C8F031", background: "#1b1b18", displayFont: "inter", bodyFont: "inter" });
  assert.ok(!dark.css.includes("--color-canvas"));
  assert.ok(dark.report.notes.some((n) => n.includes("ignored")));
});
