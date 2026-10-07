import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { confineTo } from "./agent.js";

const site = mkdtempSync(path.join(tmpdir(), "lpa-hook-"));
mkdirSync(path.join(site, "styles"));
const setBrand = () => writeFileSync(path.join(site, "styles", "brand.css"), ":root { --color-brand-500: #c2410c; }");
const hook = confineTo(site);
const call = (tool_name: string, tool_input: Record<string, unknown>) =>
  hook(
    { hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: "t", session_id: "s", transcript_path: "", cwd: site } as never,
    "t",
    { signal: new AbortController().signal },
  );
const denied = (r: unknown) => (r as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision === "deny";

test("blocks code writes until PLAN.md exists", async () => {
  assert.equal(denied(await call("Read", { file_path: `${site}/BRIEF.md` })), false);
  assert.equal(denied(await call("Write", { file_path: `${site}/app/page.tsx`, content: "" })), true);
  assert.equal(denied(await call("Write", { file_path: `${site}/PLAN.md`, content: "# Plan" })), false);
});

test("blocks code writes until the brand is set", async () => {
  writeFileSync(path.join(site, "PLAN.md"), "# Plan");
  writeFileSync(path.join(site, "styles", "brand.css"), "/* DEFAULT BRAND */");
  assert.equal(denied(await call("Write", { file_path: `${site}/components/custom/hero.tsx`, content: "" })), true);
  assert.equal(denied(await call("Edit", { file_path: `${site}/PLAN.md`, old_string: "a", new_string: "b" })), false);
  setBrand();
  assert.equal(denied(await call("Write", { file_path: `${site}/components/custom/hero.tsx`, content: "" })), false);
});

test("allows reads and writes inside the site once planned and branded", async () => {
  writeFileSync(path.join(site, "PLAN.md"), "# Plan");
  setBrand();
  assert.equal(denied(await call("Write", { file_path: `${site}/app/page.tsx`, content: "" })), false);
  assert.equal(denied(await call("Write", { file_path: "components/custom/pricing.tsx", content: "" })), false);
  assert.equal(denied(await call("Glob", { pattern: "**/*.tsx" })), false);
});

test("blocks paths outside the site", async () => {
  assert.equal(denied(await call("Read", { file_path: "/etc/passwd" })), true);
  assert.equal(denied(await call("Read", { file_path: `${site}/../other/BRIEF.md` })), true);
  assert.equal(denied(await call("Grep", { pattern: "key", path: "/home" })), true);
  assert.equal(denied(await call("Glob", { pattern: "../../**/.env" })), true);
});

test("design system, library, brand output, brief and run data are read-only", async () => {
  writeFileSync(path.join(site, "PLAN.md"), "# Plan");
  setBrand();
  assert.equal(denied(await call("Read", { file_path: `${site}/styles/tokens.css` })), false);
  assert.equal(denied(await call("Edit", { file_path: `${site}/styles/tokens.css`, old_string: "a", new_string: "b" })), true);
  assert.equal(denied(await call("Write", { file_path: `${site}/components/ui/button.tsx`, content: "" })), true);
  assert.equal(denied(await call("Write", { file_path: `${site}/components/site/nav.tsx`, content: "" })), true);
  assert.equal(denied(await call("Edit", { file_path: `${site}/components/library/heroes/hero-split.tsx`, old_string: "a", new_string: "b" })), true);
  assert.equal(denied(await call("Read", { file_path: `${site}/components/library/heroes/hero-split.tsx` })), false);
  assert.equal(denied(await call("Write", { file_path: `${site}/styles/brand.css`, content: "" })), true);
  assert.equal(denied(await call("Write", { file_path: `${site}/app/fonts.ts`, content: "" })), true);
  assert.equal(denied(await call("Edit", { file_path: `${site}/BRIEF.md`, old_string: "a", new_string: "b" })), true);
});
