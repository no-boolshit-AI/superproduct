// Zero-cost tests for lib/workspace.mjs and lib/workspace-migrate.mjs:   node --test lib/workspace.test.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { applyMigration, planMigration, sessionKey } from "./workspace-migrate.mjs";
import { KIT_ROOT, createWorkspace, outputDir, referencesDir, workspaceDir, workspacePath } from "./workspace.mjs";

const tmp = (name) => mkdtempSync(path.join(os.tmpdir(), `workspace-test-${name}-`));
const put = (file, text = "x") => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

test("workspaceDir: <kit>/workspace, or $SUPERPRODUCT_WORKSPACE (absolute or relative to the kit)", () => {
  assert.equal(workspaceDir({ env: {} }), path.join(KIT_ROOT, "workspace"));
  assert.equal(workspaceDir({ env: { SUPERPRODUCT_WORKSPACE: "/srv/acme" } }), path.resolve("/srv/acme"));
  assert.equal(workspaceDir({ env: { SUPERPRODUCT_WORKSPACE: "clients/acme" } }), path.join(KIT_ROOT, "clients", "acme"));
  assert.equal(workspaceDir({ env: { SUPERPRODUCT_WORKSPACE: "  " } }), path.join(KIT_ROOT, "workspace"), "blank means the default");
  const env = { SUPERPRODUCT_WORKSPACE: "/srv/acme" };
  assert.equal(outputDir("deck", { env }), path.resolve("/srv/acme/out/deck"));
  assert.equal(referencesDir("collage-post", { env }), path.resolve("/srv/acme/references/collage-post"));
  assert.equal(workspacePath("sites", { env }), path.resolve("/srv/acme/sites"));
});

test("workspaceDir: a symlinked workspace resolves to its real folder (Claude reports real paths)", () => {
  const base = realpathSync(tmp("link"));
  mkdirSync(path.join(base, "clients", "acme"), { recursive: true });
  symlinkSync(path.join(base, "clients", "acme"), path.join(base, "workspace"), "dir");
  const env = { SUPERPRODUCT_WORKSPACE: path.join(base, "workspace") };
  assert.equal(workspaceDir({ env }), path.join(base, "clients", "acme"));
  assert.equal(outputDir("deck", { env }), path.join(base, "clients", "acme", "out", "deck"));
  assert.equal(workspaceDir({ env, real: false }), path.join(base, "workspace"), "real: false keeps the link");
  rmSync(base, { recursive: true, force: true });
});

test("createWorkspace: template files and a git repository, never overwriting", () => {
  const dir = path.join(tmp("create"), "workspace");
  const created = createWorkspace({ dir });
  for (const f of ["README.md", ".gitignore", "briefs/README.md"]) assert.ok(created.includes(f), `${f} created`);
  assert.ok(!existsSync(path.join(dir, "gitignore")), "the template's gitignore becomes .gitignore");
  assert.match(readFileSync(path.join(dir, ".gitignore"), "utf8"), /^secrets\.env$/m);
  if (created.includes(".git/")) assert.ok(existsSync(path.join(dir, ".git")));
  writeFileSync(path.join(dir, "README.md"), "mine");
  assert.deepEqual(createWorkspace({ dir }), [], "a second run adds nothing");
  assert.equal(readFileSync(path.join(dir, "README.md"), "utf8"), "mine", "an existing file is left alone");
  const plain = path.join(tmp("nogit"), "workspace");
  createWorkspace({ dir: plain, git: false });
  assert.ok(!existsSync(path.join(plain, ".git")));
  rmSync(path.dirname(dir), { recursive: true, force: true });
  rmSync(path.dirname(plain), { recursive: true, force: true });
});

test("migration: the old layout moves into the workspace, keeps what belongs to the kit, never overwrites", () => {
  const kit = tmp("kit");
  const workspace = path.join(tmp("ws"), "workspace");
  const claude = tmp("claude");
  const a = (rel) => path.join(kit, "agents", rel);
  // the old layout
  put(path.join(kit, "product", "product.json"), "{}");
  put(path.join(kit, "products", "acme", "product.json"), "{}");
  put(path.join(kit, "briefs", "README.md"), "kit's own");
  put(path.join(kit, "briefs", "2026-10-07-launch.md"));
  put(path.join(kit, "briefs", ".DS_Store"));
  put(a("carousel-agent/out/2026-10-06-14-48-launch/run.json"));
  put(a("carousel-agent/out/2026-10-06-14-50-smoke/run.json"));
  put(a("carousel-agent/out/demo-square/slide.html"));
  put(a("collage-post-agent/output/20261006-182753-swimmer/job.json"));
  put(a("collage-post-agent/reference/01-cover.png"));
  put(a("deck-agent/out/20261008-123538-ai/job.json"), "old");
  put(a("explainer-agent/out/20261009-214912-claude/project/index.html"));
  put(a("landing-page-agent/sites/package.json"), "{}");
  put(a("landing-page-agent/sites/package-lock.json"), "{}");
  put(a("landing-page-agent/sites/node_modules/next/package.json"), "{}");
  put(a("landing-page-agent/sites/launch/app/page.tsx"));
  put(a("dev-agent/projects/shop/project.json"));
  put(a("dev-agent/runs/shop/20261010-export/run.json"));
  // the workspace has a template README in briefs/ and, already, a deck job of the same name
  put(path.join(workspace, "briefs", "README.md"), "workspace's own");
  put(path.join(workspace, "out", "deck", "20261008-123538-ai", "job.json"), "new");
  // Claude's sessions, keyed by the job folders' real paths (os.tmpdir() is a symlink on macOS)
  const explainerJob = realpathSync(a("explainer-agent/out/20261009-214912-claude"));
  const deckJob = realpathSync(a("deck-agent/out/20261008-123538-ai"));
  put(path.join(claude, "projects", `${sessionKey(explainerJob)}-project`, "s1.jsonl"));
  put(path.join(claude, "projects", sessionKey(deckJob), "s2.jsonl"));

  const plan = planMigration({ kit, workspace });
  const from = plan.map((s) => path.relative(kit, s.from).split(path.sep).join("/"));
  assert.ok(from.includes("product"), "product/ moves as a whole");
  assert.ok(!from.includes("briefs/README.md") && !from.includes("briefs/.DS_Store"), "the kit's README and junk stay");
  assert.ok(!from.some((f) => /smoke|demo-/.test(f)), "carousel's smoke and demo output stays with the kit");
  assert.equal(plan.find((s) => s.from === a("landing-page-agent/sites/package.json")).action, "copy", "sites/package.json is copied, not moved");
  assert.equal(plan.find((s) => s.from === a("deck-agent/out/20261008-123538-ai")).conflict, true);

  const done = applyMigration(plan, { claudeDir: claude });
  const ws = (rel) => path.join(workspace, rel);
  assert.ok(existsSync(ws("product/product.json")) && !existsSync(path.join(kit, "product")));
  assert.ok(existsSync(ws("products/acme/product.json")));
  assert.ok(existsSync(ws("briefs/2026-10-07-launch.md")));
  assert.equal(readFileSync(ws("briefs/README.md"), "utf8"), "workspace's own");
  assert.equal(readFileSync(path.join(kit, "briefs", "README.md"), "utf8"), "kit's own");
  assert.ok(existsSync(ws("out/carousel/2026-10-06-14-48-launch/run.json")));
  assert.ok(existsSync(a("carousel-agent/out/2026-10-06-14-50-smoke/run.json")), "smoke output not moved");
  assert.ok(existsSync(ws("out/collage-post/20261006-182753-swimmer/job.json")));
  assert.ok(existsSync(ws("references/collage-post/01-cover.png")));
  assert.ok(existsSync(ws("out/explainer/20261009-214912-claude/project/index.html")));
  assert.ok(existsSync(ws("sites/launch/app/page.tsx")) && existsSync(ws("sites/node_modules/next/package.json")));
  assert.ok(existsSync(ws("sites/package.json")) && existsSync(a("landing-page-agent/sites/package.json")), "package.json in both places");
  assert.ok(existsSync(ws("dev/projects/shop/project.json")) && existsSync(ws("dev/runs/shop/20261010-export/run.json")));
  // the conflict stays where it was, untouched on both sides
  assert.equal(readFileSync(a("deck-agent/out/20261008-123538-ai/job.json"), "utf8"), "old");
  assert.equal(readFileSync(ws("out/deck/20261008-123538-ai/job.json"), "utf8"), "new");
  assert.equal(done.find((s) => s.from === a("deck-agent/out/20261008-123538-ai")).done, "skipped");
  // sessions follow the moved job (copied), and only those
  const movedJob = realpathSync(ws("out/explainer/20261009-214912-claude"));
  assert.ok(existsSync(path.join(claude, "projects", `${sessionKey(movedJob)}-project`, "s1.jsonl")), "session copied to the new path");
  assert.ok(existsSync(path.join(claude, "projects", `${sessionKey(explainerJob)}-project`, "s1.jsonl")), "the original stays");
  assert.deepEqual(done.find((s) => s.to === ws("out/explainer/20261009-214912-claude")).sessions, [`${sessionKey(movedJob)}-project`]);
  // a second plan only has the conflict left
  assert.deepEqual(planMigration({ kit, workspace }).map((s) => s.from), [a("deck-agent/out/20261008-123538-ai")]);
  for (const d of [kit, path.dirname(workspace), claude]) rmSync(d, { recursive: true, force: true });
});

test("migration: nothing to do in a fresh kit", () => {
  const kit = tmp("fresh");
  put(path.join(kit, "agents", "landing-page-agent", "sites", "package.json"), "{}");
  put(path.join(kit, "agents", "landing-page-agent", "sites", "package-lock.json"), "{}");
  mkdirSync(path.join(kit, "briefs"));
  put(path.join(kit, "briefs", "README.md"));
  assert.deepEqual(planMigration({ kit, workspace: path.join(kit, "workspace") }), []);
  rmSync(kit, { recursive: true, force: true });
});
