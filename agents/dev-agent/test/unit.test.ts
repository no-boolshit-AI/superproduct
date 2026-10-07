/** Deterministic pieces: stack detection, catalog, guard, compose, images, git policy, skills, PR text, GitHub API. */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { gitRepo, sh, skillsRepo, writeTree } from "./fixtures.js";

process.env.DEVAGENT_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "devagent-unit-"));
const { detect, phpVersionFrom, nodeMajorFrom, pythonVersionFrom } = await import("../src/detect.js");
const { catalogFor, toolingCommands, catalogMcp, AGENTS_MD_BRIDGE } = await import("../src/catalog.js");
const { bashViolation, guardHook } = await import("../src/agent/guard.js");
const { renderCompose, deepMerge } = await import("../src/workspace/compose.js");
const { buildArgs, imageSpec } = await import("../src/workspace/image.js");
const { applyLocalPolicy, commitAll, status } = await import("../src/git.js");
const { installSkills, skillNames } = await import("../src/skills.js");
const { prBody, prTitle, commitSubject } = await import("../src/publish.js");
const { parseRepo, openOrUpdatePullRequest, resetTokenCache } = await import("../src/github.js");
const { prdSection, renderPlan } = await import("../src/plan.js");
const { ProfileSchema, WorkspaceSchema } = await import("../src/profile.js");

let passed = 0;
async function t(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

// ---------------------------------------------------------------- repo URLs
await t("parseRepo", () => {
  assert.deepEqual(parseRepo("acme/shop"), { url: "https://github.com/acme/shop.git", owner: "acme", name: "shop", github: true });
  assert.equal(parseRepo("https://github.com/acme/shop").url, "https://github.com/acme/shop.git");
  assert.equal(parseRepo("github.com/acme/shop.git").name, "shop");
  assert.equal(parseRepo("git@github.com:acme/shop.git").url, "git@github.com:acme/shop.git");
  assert.equal(parseRepo("/tmp/x/calc.git").github, false);
  assert.equal(parseRepo("/tmp/x/calc.git").name, "calc");
});

// ---------------------------------------------------------------- versions
await t("version pickers", () => {
  assert.equal(phpVersionFrom("^8.2"), "8.4");
  assert.equal(phpVersionFrom("^8.2", "8.3.9"), "8.3");
  assert.equal(phpVersionFrom(">=8.1 <8.4"), "8.3");
  assert.equal(phpVersionFrom("8.2.*"), "8.2");
  assert.equal(nodeMajorFrom("v20.11.1\n"), "20");
  assert.equal(nodeMajorFrom(undefined, undefined, ">=18"), "18");
  assert.equal(nodeMajorFrom("lts/*"), "22");
  assert.equal(pythonVersionFrom("3.12.4\n"), "3.12");
  assert.equal(pythonVersionFrom(null, ">=3.10,<3.13"), "3.12");
  assert.equal(pythonVersionFrom(null, ">=3.11"), "3.13");
});

// ---------------------------------------------------------------- stack detection
await t("detect laravel", async () => {
  const dir = gitRepo({
    "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^12.0", "livewire/livewire": "^3.6" }, "require-dev": { "pestphp/pest": "^3.0", "laravel/pint": "^1.20", "larastan/larastan": "^3.0" } }),
    "package.json": JSON.stringify({ devDependencies: { vite: "^7.0", tailwindcss: "^4.0" }, scripts: { build: "vite build", dev: "vite" } }),
    "package-lock.json": "{}",
    ".env.example": "APP_KEY=\nDB_CONNECTION=sqlite\nQUEUE_CONNECTION=database\n",
    "phpunit.xml": '<phpunit><php><env name="DB_CONNECTION" value="sqlite"/><env name="DB_DATABASE" value=":memory:"/></php></phpunit>',
    "artisan": "#!/usr/bin/env php\n",
    ".github/workflows/tests.yml": "jobs:\n  t:\n    steps:\n      - run: composer install\n      - name: Test\n        run: |\n          php artisan test --parallel\n          vendor/bin/pint --test\n",
  });
  const f = await detect(dir);
  assert.equal(f.primary, "laravel");
  assert.equal(f.versions.php, "8.4");
  assert.equal(f.versions.laravel, 12);
  for (const x of ["laravel", "livewire", "pest", "pint", "larastan", "vite", "tailwind"]) assert.ok(f.frameworks.includes(x), x);
  assert.ok(f.testsUseSqliteMemory);
  assert.deepEqual(f.suggested.workspace.services, []);
  assert.equal(f.suggested.workspace.base, "php");
  assert.equal(f.suggested.workspace.env.DB_CONNECTION, "sqlite");
  assert.ok(f.suggested.workspace.bootstrap[0].startsWith("composer install"));
  assert.ok(f.suggested.workspace.bootstrap.some((c) => c.includes("key:generate")));
  assert.ok(f.suggested.workspace.bootstrap.some((c) => c.includes("npm ci")));
  assert.deepEqual(f.suggested.verify.map((v) => v.name), ["tests", "lint", "types"]);
  assert.ok(f.ci.commands.includes("php artisan test --parallel"));
  const cat = catalogFor(f);
  assert.equal(cat[0].entry.id, "laravel-boost");
  assert.ok(cat.find((c) => c.entry.id === "frontend-design")?.recommended);
  assert.ok(!cat.some((c) => c.entry.id === "next-agents-md"));
  const cmds = toolingCommands(["laravel-boost"], [], f);
  assert.match(cmds[0], /composer require laravel\/boost --dev/);
  assert.match(cmds[1], /claude_code/);
  assert.equal(cmds[2], "php artisan boost:install --no-interaction");
  assert.equal(cmds.at(-1), AGENTS_MD_BRIDGE);
});

await t("detect laravel with boost + mysql", async () => {
  const dir = gitRepo({
    "composer.json": JSON.stringify({ require: { php: "~8.3.0", "laravel/framework": "^11.0" }, "require-dev": { "laravel/boost": "^2.0", "phpunit/phpunit": "^11" } }),
    ".env.example": "DB_CONNECTION=mysql\nREDIS_HOST=127.0.0.1\nCACHE_STORE=redis\n",
  });
  const f = await detect(dir);
  assert.equal(f.versions.php, "8.3");
  assert.deepEqual(f.suggested.workspace.services.sort(), ["mysql", "redis"]);
  assert.equal(f.suggested.workspace.env.DB_CONNECTION, "mysql");
  assert.equal(toolingCommands(["laravel-boost"], [], f)[0], "true", "no composer require when Boost is already a dependency");
});

await t("detect nextjs", async () => {
  const dir = gitRepo({
    "package.json": JSON.stringify({ packageManager: "pnpm@10.2.0", dependencies: { next: "^16.1.0", react: "^19", "@prisma/client": "^7" }, devDependencies: { typescript: "^5", prisma: "^7", vitest: "^3" }, scripts: { test: "vitest run", lint: "next lint", build: "next build", typecheck: "tsc --noEmit" }, engines: { node: ">=20" } }),
    "pnpm-lock.yaml": "",
    "components.json": "{}",
    ".nvmrc": "22\n",
    ".env.example": "DATABASE_URL=postgresql://u:p@localhost:5432/db\n",
  });
  const f = await detect(dir);
  assert.equal(f.primary, "nextjs");
  assert.equal(f.packageManager, "pnpm");
  assert.equal(f.versions.node, "22");
  assert.equal(f.versions.next, 16);
  assert.deepEqual(f.suggested.workspace.services, ["postgres"]);
  assert.deepEqual(f.suggested.verify.map((v) => v.command), ["pnpm test", "pnpm run lint", "pnpm run typecheck", "pnpm run build"]);
  assert.ok(f.suggested.workspace.bootstrap.includes("pnpm install --frozen-lockfile"));
  assert.ok(f.suggested.workspace.bootstrap.includes("npx prisma generate"));
  const ids = catalogFor(f).map((c) => c.entry.id);
  for (const id of ["next-agents-md", "next-devtools-mcp", "vercel-react-skills", "shadcn", "prisma", "superpowers", "context7"]) assert.ok(ids.includes(id), id);
  assert.ok(catalogFor(f).find((c) => c.entry.id === "next-devtools-mcp")?.recommended);
  const mcp = catalogMcp(["next-devtools-mcp", "shadcn", "context7"], f);
  assert.deepEqual(Object.keys(mcp).sort(), ["context7", "next-devtools", "shadcn"]);
});

await t("detect django + fastapi", async () => {
  const dj = await detect(
    gitRepo({
      "manage.py": 'import os\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "shop.settings")\n',
      "requirements.txt": "Django==5.2\npsycopg[binary]>=3.2\npytest-django\npytest==8.3\nruff\n",
      ".python-version": "3.12\n",
      ".env.example": "DATABASE_URL=postgres://app:secret@db:5432/app\n",
    }),
  );
  assert.equal(dj.primary, "django");
  assert.equal(dj.python?.manager, "pip");
  assert.equal(dj.python?.djangoSettings, "shop.settings");
  assert.equal(dj.versions.python, "3.12");
  assert.deepEqual(dj.suggested.workspace.services, ["postgres"]);
  assert.ok(dj.suggested.workspace.bootstrap.some((c) => c.includes("-r requirements.txt")));
  assert.deepEqual(dj.suggested.verify.map((v) => v.command), ["pytest -q", "ruff check ."]);
  const djBoost = catalogMcp(["django-ai-boost"], dj)["django-ai-boost"];
  assert.ok(djBoost && "args" in djBoost && djBoost.args.includes("shop.settings"));
  const fa = await detect(gitRepo({ "pyproject.toml": '[project]\nname="api"\nrequires-python=">=3.11"\ndependencies=["fastapi>=0.115","sqlalchemy"]\n[dependency-groups]\ndev=["pytest","ruff","mypy"]\n', "uv.lock": "", "tests/test_x.py": "" }));
  assert.equal(fa.primary, "fastapi");
  assert.equal(fa.python?.manager, "uv");
  assert.equal(fa.suggested.workspace.base, "python");
  assert.ok(fa.suggested.workspace.bootstrap[0].startsWith("uv sync"));
  assert.ok(catalogFor(fa).some((c) => c.entry.id === "fastapi" && c.recommended));
  assert.ok(catalogFor(fa).some((c) => c.entry.id === "astral" && c.recommended));
});

await t("git conventions", async () => {
  const dir = gitRepo({ "a.txt": "1" });
  for (const s of ["feat: one", "fix(api): two", "chore: three"]) {
    fs.writeFileSync(path.join(dir, "a.txt"), s);
    sh(dir, "git", ["commit", "-qam", s]);
  }
  const f = await detect(dir);
  assert.ok(f.git.conventional);
  assert.equal(f.git.defaultBranch, "main");
});

// ---------------------------------------------------------------- guard
await t("bash guard", () => {
  for (const c of ["git push origin HEAD", "git commit -m x", "cd app && git commit -am 'x'", "git -C . push", "git checkout main", "git switch -c x", "git rebase main", "git reset --hard HEAD~1", "git remote add x y", "gh pr create"])
    assert.ok(bashViolation(c), c);
  for (const c of ["git status", "git diff --stat", "git log --oneline -5", "git checkout -- src/a.js", "git checkout HEAD -- src/a.js", "git restore src/a.js", "git stash", "npm test", "echo 'git push is blocked'"])
    assert.equal(bashViolation(c), c.startsWith("echo") ? bashViolation(c) : null, c);
  assert.ok(bashViolation("sudo apt-get install x", { hostShell: true }));
  assert.equal(bashViolation("sudo apt-get install x"), null, "sudo is fine inside the container");
});

await t("file guard", async () => {
  const h = guardHook({ cwd: "/workspace/repo", writable: ["/workspace/repo"], readable: "any" });
  const call = (tool_name: string, tool_input: Record<string, unknown>) => h({ hook_event_name: "PreToolUse", tool_name, tool_input } as never, undefined, { signal: new AbortController().signal });
  const decision = async (n: string, i: Record<string, unknown>) => ((await call(n, i)) as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision ?? "allow";
  assert.equal(await decision("Write", { file_path: "src/a.ts" }), "allow");
  assert.equal(await decision("Edit", { file_path: "/workspace/repo/app/Models/User.php" }), "allow");
  assert.equal(await decision("Write", { file_path: "/etc/passwd" }), "deny");
  assert.equal(await decision("Write", { file_path: "../escape.txt" }), "deny");
  assert.equal(await decision("Write", { file_path: ".git/config" }), "deny");
  assert.equal(await decision("Read", { file_path: "/etc/hosts" }), "allow");
  const ro = guardHook({ cwd: "/r", writable: [], readable: ["/r"], noBash: true });
  const r = (await ro({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "/etc/hosts" } } as never, undefined, { signal: new AbortController().signal })) as { hookSpecificOutput?: { permissionDecision?: string } };
  assert.equal(r.hookSpecificOutput?.permissionDecision, "deny");
});

// ---------------------------------------------------------------- compose + image
await t("compose", () => {
  const doc = renderCompose({ name: "devagent-x", containerName: "devagent-x-ws", image: "img:1", repoDir: "/h/repo", homeDir: "/h/home", cacheDir: "/h/cache", pluginDir: "/h/plugin", services: ["mysql", "redis"], env: { DB_CONNECTION: "mysql", DB_HOST: "custom", PRICE: "$5 #x" }, secrets: { STRIPE: "sk_$abc" }, gitDir: "/h/git", user: "501:20" }) as any;
  const ws = doc.services.workspace;
  assert.equal(ws.environment.DB_HOST, "custom", "profile env wins over service defaults");
  assert.equal(ws.environment.REDIS_HOST, "redis");
  assert.equal(ws.environment.HOME, "/workspace/.home");
  assert.deepEqual(ws.depends_on, { mysql: { condition: "service_healthy" }, redis: { condition: "service_healthy" } });
  assert.equal(ws.environment.STRIPE, "sk_$$abc", "$ escaped for compose interpolation");
  assert.equal(ws.environment.PRICE, "$$5 #x");
  assert.equal(ws.environment.HUSKY, "0");
  assert.deepEqual(ws.volumes[1], { type: "bind", source: "/h/git", target: "/h/git", read_only: true }, "git dir read-only at the same path");
  assert.deepEqual(ws.volumes.at(-1), { type: "bind", source: "/h/plugin", target: "/opt/devagent/plugin", read_only: true });
  assert.equal(doc.services.mysql.image, "mysql:8.4");
  const merged = deepMerge(doc, { services: { workspace: { init: null, "volumes+": ["/x:/x"], environment: { A: "1" } } } }) as any;
  assert.equal(merged.services.workspace.init, undefined);
  assert.equal(merged.services.workspace.volumes.at(-1), "/x:/x");
  assert.equal(merged.services.workspace.volumes.length, 6);
  assert.equal(merged.services.workspace.environment.A, "1");
  assert.equal(merged.services.workspace.environment.HOME, "/workspace/.home");
});

await t("image args + Dockerfiles", () => {
  const ws = WorkspaceSchema.parse({ base: "php", versions: { php: "8.3", node: "22" }, phpExtensions: ["imagick", "bcmath"], aptPackages: ["libmagickwand-dev"] });
  const a = buildArgs(ws, "0.3.291");
  assert.equal(a.PHP_VERSION, "8.3");
  assert.match(a.PHP_EXTENSIONS, /\bimagick\b/);
  assert.equal(a.PHP_EXTENSIONS.split(" ").filter((x) => x === "bcmath").length, 1);
  assert.equal(a.CLAUDE_SDK_VERSION, "0.3.291");
  const s1 = imageSpec("shop", ws, "0.3.291");
  const s2 = imageSpec("shop", { ...ws, aptPackages: [] }, "0.3.291");
  assert.match(s1.tag, /^devagent-shop:[0-9a-f]{12}$/);
  assert.notEqual(s1.tag, s2.tag);
  assert.equal(imageSpec("shop", ws, "0.3.291").tag, s1.tag, "stable");
  for (const base of ["php", "node", "python"]) {
    const df = fs.readFileSync(path.join("docker", `${base}.Dockerfile`), "utf8");
    const firstFrom = df.indexOf("\nFROM ");
    for (const m of df.matchAll(/^FROM\s+\S*\$\{(\w+)\}/gm)) assert.ok(df.slice(0, firstFrom).includes(`ARG ${m[1]}`), `${base}: ARG ${m[1]} declared before the first FROM`);
    for (const arg of Object.keys(buildArgs(WorkspaceSchema.parse({ base }), "1.0.0"))) assert.ok(df.includes(`ARG ${arg}`), `${base}: ARG ${arg}`);
    assert.match(df, /install-claude "\$\{CLAUDE_SDK_VERSION\}"/);
  }
});

// ---------------------------------------------------------------- git local policy
await t("local tooling policy keeps tooling out of commits", async () => {
  const dir = gitRepo({ "composer.json": '{"require":{}}\n', "CLAUDE.md": "# Team notes\n", "src/a.php": "<?php\n" });
  writeTree(dir, { "composer.json": '{"require":{},"require-dev":{"laravel/boost":"^2"}}\n', "CLAUDE.md": "# Team notes\n<laravel-boost-guidelines>…</laravel-boost-guidelines>\n", ".claude/skills/pest/SKILL.md": "x", ".mcp.json": "{}", "boost.json": "{}" });
  const r = await applyLocalPolicy(dir);
  assert.deepEqual(r.restored, ["composer.json"]);
  assert.deepEqual(r.hidden, ["CLAUDE.md"]);
  assert.deepEqual(r.excluded.sort(), [".claude/", ".mcp.json", "boost.json"]);
  assert.equal(fs.readFileSync(path.join(dir, "composer.json"), "utf8"), '{"require":{}}\n', "manifest restored");
  assert.match(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), /laravel-boost-guidelines/, "tooling content still in the working tree");
  assert.deepEqual(await status(dir), []);
  assert.equal(await commitAll(dir, "nothing"), null);
  writeTree(dir, { "src/b.php": "<?php // feature\n" });
  const c = await commitAll(dir, "feat: b\n\nbody");
  assert.deepEqual(c?.files, ["src/b.php"]);
  assert.equal(sh(dir, "git", ["log", "-1", "--format=%B"]).trim(), "feat: b\n\nbody");
});

// ---------------------------------------------------------------- skills
await t("install skills from a git repo", async () => {
  const plugin = path.join(process.env.DEVAGENT_HOME!, "plugin");
  const repo = skillsRepo();
  const r = await installSkills(plugin, "demo", [{ repo, paths: ["skills/tdd-lite", "skills/no-skill", "skills/missing"] }]);
  assert.deepEqual(r.installed.map((s) => s.name), ["tdd-lite"]);
  assert.equal(r.installed[0].description, "Write the failing test first, then the code.");
  assert.equal(r.errors.length, 2);
  assert.deepEqual(await skillNames(plugin), ["tdd-lite"]);
  assert.ok(fs.existsSync(path.join(plugin, ".claude-plugin", "plugin.json")));
  assert.ok(fs.existsSync(path.join(plugin, "skills", "tdd-lite", "reference.md")));
});

// ---------------------------------------------------------------- PR text + GitHub API
const now = new Date().toISOString();
const profile = ProfileSchema.parse({
  version: 1, slug: "shop", name: "Shop", repo: { url: "https://github.com/acme/shop.git", owner: "acme", name: "shop", github: true, defaultBranch: "main" },
  stack: { primary: "laravel" }, git: { baseBranch: "main" }, publish: { reviewers: ["octocat"], labels: ["ai"] }, autonomy: {}, docs: {}, tooling: { recipes: ["laravel-boost"] },
  workspace: { base: "php" }, createdAt: now, updatedAt: now,
});
const run = {
  id: "r1", project: "shop", request: "Add CSV export", title: "Add CSV export to invoices", status: "done", step: "publish", runtime: "docker", model: "opus", budgetUsd: 30, costUsd: 4.2, sessionCosts: {},
  baseBranch: "main", baseSha: "abc", branch: "feature/csv-export", issue: { number: 42, url: "u" },
  milestones: [{ id: "M1", title: "Export endpoint", goal: "g", tasks: [], acceptance: [], status: "done", attempts: 1, commit: "0123456789abcdef", summary: "Added the export." }],
  verification: { at: now, ok: false, checks: [{ name: "tests", command: "php artisan test", ok: true, code: 0, durationMs: 1, tail: "" }, { name: "lint", command: "vendor/bin/pint --test", ok: false, code: 1, durationMs: 1, tail: "src/X.php" }] },
  review: { verdict: "approve", summary: "Looks good.", findings: [{ severity: "nit", title: "Rename var", detail: "" }], rounds: 1 },
  revisions: [], createdAt: now, updatedAt: now,
} as any;
const PRD = "# X\n\n## Summary\nExport invoices as CSV.\n\n## Acceptance criteria\n- AC-1\n\n## Assumptions and open questions\n- UTF-8 with BOM for Excel.\n";

await t("PR body", () => {
  const b = prBody(run, profile, parseRepo("acme/shop"), PRD);
  assert.match(b, /^## Summary\n\nExport invoices as CSV\./);
  assert.match(b, /Closes #42/);
  assert.match(b, /- \[x\] \*\*M1: Export endpoint\*\* \(\[`0123456`\]\(https:\/\/github\.com\/acme\/shop\/commit\/0123456789abcdef\)\)/);
  assert.match(b, /\| lint \| `vendor\/bin\/pint --test` \| ❌ failed \(exit 1\) \|/);
  assert.match(b, /UTF-8 with BOM/);
  assert.match(b, /Rename var/);
  assert.match(b, /<summary>PRD<\/summary>/);
  assert.equal(prTitle(run, profile), "feat: add CSV export to invoices");
  assert.equal(commitSubject("Add export endpoint.", "conventional"), "feat: add export endpoint");
  assert.equal(commitSubject("fix(api): handle nulls", "conventional"), "fix(api): handle nulls");
  assert.equal(commitSubject("Add export", "plain"), "Add export");
  assert.equal(prdSection(PRD, "Summary"), "Export invoices as CSV.");
  assert.match(renderPlan(run), /## \[x\] M1: Export endpoint \(0123456\)/);
});

await t("GitHub PR create/update", async () => {
  const calls: { method: string; url: string; body: any; auth: string }[] = [];
  let existing = false;
  const srv = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    calls.push({ method: req.method!, url: req.url!, body: raw ? JSON.parse(raw) : null, auth: String(req.headers.authorization) });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") return res.end(JSON.stringify(existing ? [{ number: 7, html_url: "https://github.com/acme/shop/pull/7" }] : []));
    res.end(JSON.stringify({ number: 7, html_url: "https://github.com/acme/shop/pull/7" }));
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  process.env.GITHUB_API_URL = `http://127.0.0.1:${(srv.address() as any).port}`;
  process.env.GITHUB_TOKEN = "ghp_test";
  resetTokenCache();
  const repo = parseRepo("acme/shop");
  const a = await openOrUpdatePullRequest(repo, { head: "feature/x", base: "main", title: "feat: x", body: "b", draft: true, reviewers: ["octocat"], labels: ["ai"] });
  assert.equal(a.created, true);
  assert.equal(calls[0].url, "/repos/acme/shop/pulls?state=open&head=acme%3Afeature%2Fx");
  assert.deepEqual(calls[1].body, { title: "feat: x", head: "feature/x", base: "main", body: "b", draft: true, maintainer_can_modify: true });
  assert.equal(calls[1].auth, "Bearer ghp_test");
  assert.deepEqual(calls[2].body, { reviewers: ["octocat"] });
  assert.deepEqual(calls[3].body, { labels: ["ai"] });
  existing = true;
  const b = await openOrUpdatePullRequest(repo, { head: "feature/x", base: "main", title: "feat: x", body: "b2", draft: true });
  assert.equal(b.created, false);
  assert.equal(calls.at(-1)!.method, "PATCH");
  assert.equal(calls.at(-1)!.url, "/repos/acme/shop/pulls/7");
  srv.close();
});

console.log(`✓ unit: ${passed} groups passed`);
