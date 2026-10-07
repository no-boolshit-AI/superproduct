/**
 * Deterministic stack detection on a fresh clone. The setup agent gets these facts (and the suggestions derived
 * from them) as a starting point, then confirms or corrects them with the user and by running the workspace.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { git } from "./git.js";
import type { Service, Stack, VerifyStep, WorkspaceConfig } from "./profile.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface Facts {
  topLevel: string[];
  primary: Stack;
  frameworks: string[];
  composer?: { require: Record<string, string>; requireDev: Record<string, string>; platformPhp?: string };
  pkg?: { deps: Record<string, string>; scripts: Record<string, string>; packageManager?: string; engines?: Record<string, string> };
  packageManager?: PackageManager;
  python?: { manager: "uv" | "poetry" | "pipenv" | "pip"; deps: string[]; requiresPython?: string; djangoSettings?: string };
  versions: { php?: string; node: string; python?: string; next?: number; laravel?: number };
  envExample: Record<string, string>;
  testsUseSqliteMemory: boolean;
  composeImages: string[];
  ci: { files: string[]; commands: string[] };
  aiFiles: string[];
  git: { defaultBranch: string; branchPrefixes: string[]; recentSubjects: string[]; conventional: boolean };
  suggested: { workspace: WorkspaceConfig; verify: VerifyStep[]; branchPrefix: string };
}

async function readText(p: string): Promise<string | null> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  const t = await readText(p);
  if (!t) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

function parseEnv(text: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const major = (v?: string | null) => {
  const m = v?.match(/(\d+)/);
  return m ? Number(m[1]) : undefined;
};

/** Picks an image PHP version from a composer constraint (pinned platform wins). */
export function phpVersionFrom(constraint?: string, platform?: string): string {
  const pin = platform?.match(/^(\d+\.\d+)/)?.[1];
  if (pin) return pin;
  const c = constraint ?? "";
  const pinned = c.match(/^[~=]?\s*(\d+\.\d+)(?:\.\d+|\.\*)?$/)?.[1] ?? c.match(/^(\d+\.\d+)\.\*$/)?.[1];
  if (pinned && !c.startsWith("^")) return pinned;
  const upper = c.match(/<\s*(\d+)\.(\d+)/);
  if (upper) {
    const v = Number(upper[1]) * 10 + Number(upper[2]) - 1;
    return `${Math.floor(v / 10)}.${v % 10}`;
  }
  return "8.4";
}

export function nodeMajorFrom(...sources: (string | undefined | null)[]): string {
  for (const s of sources) {
    if (!s) continue;
    if (/lts|node/i.test(s) && !/\d/.test(s)) return "22";
    const m = s.match(/(\d{2})/);
    if (m && Number(m[1]) >= 18 && Number(m[1]) <= 30) return m[1];
  }
  return "22";
}

export function pythonVersionFrom(dotfile?: string | null, requires?: string): string {
  const pin = dotfile?.trim().match(/^(\d+\.\d+)/)?.[1];
  if (pin) return pin;
  const exact = requires?.match(/(?:==|~=)\s*(\d+\.\d+)/)?.[1];
  if (exact) return exact;
  const upper = requires?.match(/<\s*3\.(\d+)/);
  if (upper) return `3.${Math.min(13, Number(upper[1]) - 1)}`;
  return "3.13";
}

function ciCommands(texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) {
    const lines = t.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim();
      if (v && !/^[|>][-+]?$/.test(v)) out.push(v);
      else {
        const indent = m[1].length;
        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          if (l.trim() && l.search(/\S/) <= indent + 1) break;
          if (l.trim()) out.push(l.trim());
        }
      }
    }
  }
  return [...new Set(out)].slice(0, 60);
}

export async function detect(repoDir: string): Promise<Facts> {
  const top = (await readdir(repoDir)).filter((n) => n !== ".git").sort();
  const has = (p: string) => existsSync(path.join(repoDir, p));
  const frameworks = new Set<string>();

  // ---- PHP
  const cj = await readJson<{ require?: Record<string, string>; "require-dev"?: Record<string, string>; config?: { platform?: { php?: string } } }>(
    path.join(repoDir, "composer.json"),
  );
  const composer = cj ? { require: cj.require ?? {}, requireDev: cj["require-dev"] ?? {}, platformPhp: cj.config?.platform?.php } : undefined;
  const php = composer ? { ...composer.require, ...composer.requireDev } : {};
  const phpPkgs: [string, string][] = [
    ["laravel/framework", "laravel"],
    ["livewire/livewire", "livewire"],
    ["inertiajs/inertia-laravel", "inertia"],
    ["filament/filament", "filament"],
    ["pestphp/pest", "pest"],
    ["phpunit/phpunit", "phpunit"],
    ["laravel/pint", "pint"],
    ["larastan/larastan", "larastan"],
    ["nunomaduro/larastan", "larastan"],
    ["phpstan/phpstan", "phpstan"],
    ["laravel/boost", "laravel-boost"],
    ["symfony/framework-bundle", "symfony"],
  ];
  for (const [p, f] of phpPkgs) if (php[p]) frameworks.add(f);

  // ---- JS
  const pj = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    packageManager?: string;
    engines?: Record<string, string>;
  }>(path.join(repoDir, "package.json"));
  const pkg = pj ? { deps: { ...pj.dependencies, ...pj.devDependencies }, scripts: pj.scripts ?? {}, packageManager: pj.packageManager, engines: pj.engines } : undefined;
  let packageManager: PackageManager | undefined;
  if (pkg) {
    const pmField = pkg.packageManager?.split("@")[0];
    packageManager =
      pmField === "pnpm" || pmField === "yarn" || pmField === "bun" || pmField === "npm"
        ? pmField
        : has("pnpm-lock.yaml")
          ? "pnpm"
          : has("yarn.lock")
            ? "yarn"
            : has("bun.lockb") || has("bun.lock")
              ? "bun"
              : "npm";
    const jsPkgs: [string, string][] = [
      ["next", "nextjs"],
      ["react", "react"],
      ["vue", "vue"],
      ["nuxt", "nuxt"],
      ["svelte", "svelte"],
      ["@sveltejs/kit", "sveltekit"],
      ["express", "express"],
      ["@nestjs/core", "nestjs"],
      ["vite", "vite"],
      ["typescript", "typescript"],
      ["prisma", "prisma"],
      ["@prisma/client", "prisma"],
      ["drizzle-orm", "drizzle"],
      ["tailwindcss", "tailwind"],
      ["vitest", "vitest"],
      ["jest", "jest"],
      ["@playwright/test", "playwright"],
      ["eslint", "eslint"],
      ["@biomejs/biome", "biome"],
      ["@inertiajs/react", "inertia"],
      ["@inertiajs/vue3", "inertia"],
    ];
    for (const [p, f] of jsPkgs) if (pkg.deps[p]) frameworks.add(f);
    if (has("components.json")) frameworks.add("shadcn");
  }

  // ---- Python
  const pyproject = await readText(path.join(repoDir, "pyproject.toml"));
  const reqFiles = top.filter((n) => /^requirements.*\.txt$/.test(n));
  let python: Facts["python"];
  if (pyproject || reqFiles.length || has("Pipfile") || has("manage.py")) {
    const reqText = (await Promise.all(reqFiles.map((f) => readText(path.join(repoDir, f))))).join("\n") + "\n" + (pyproject ?? "") + "\n" + ((await readText(path.join(repoDir, "Pipfile"))) ?? "");
    const deps = [...new Set([...reqText.matchAll(/(?:^|["'\s])([A-Za-z][A-Za-z0-9_.-]*)\s*(?:\[[^\]]*\])?\s*(?:[<>=~!]=?|["',]|$)/gm)].map((m) => m[1].toLowerCase()))];
    const manager = has("uv.lock") ? "uv" : has("poetry.lock") || /\[tool\.poetry\]/.test(pyproject ?? "") ? "poetry" : has("Pipfile") ? "pipenv" : pyproject && !reqFiles.length ? "uv" : "pip";
    const managePy = await readText(path.join(repoDir, "manage.py"));
    const djangoSettings = managePy?.match(/DJANGO_SETTINGS_MODULE["']\s*,\s*["']([\w.]+)["']/)?.[1];
    python = { manager, deps, requiresPython: pyproject?.match(/requires-python\s*=\s*["']([^"']+)["']/)?.[1], djangoSettings };
    const pyPkgs: [string, string][] = [
      ["django", "django"],
      ["fastapi", "fastapi"],
      ["flask", "flask"],
      ["pytest", "pytest"],
      ["ruff", "ruff"],
      ["mypy", "mypy"],
      ["sqlalchemy", "sqlalchemy"],
      ["alembic", "alembic"],
      ["celery", "celery"],
    ];
    for (const [p, f] of pyPkgs) if (deps.includes(p)) frameworks.add(f);
    if (managePy) frameworks.add("django");
  }

  // ---- primary stack
  const fw = frameworks;
  const primary: Stack = fw.has("laravel")
    ? "laravel"
    : composer
      ? "php"
      : fw.has("nextjs")
        ? "nextjs"
        : fw.has("django")
          ? "django"
          : fw.has("fastapi")
            ? "fastapi"
            : python
              ? "python"
              : pkg
                ? "node"
                : "other";

  // ---- versions
  const nvm = (await readText(path.join(repoDir, ".nvmrc"))) ?? (await readText(path.join(repoDir, ".node-version")));
  const toolVersions = await readText(path.join(repoDir, ".tool-versions"));
  const versions: Facts["versions"] = {
    node: nodeMajorFrom(nvm, toolVersions?.match(/^nodejs\s+(\S+)/m)?.[1], pkg?.engines?.node),
    next: major(pkg?.deps.next?.replace(/^[\^~>=<\s]+/, "")),
    laravel: major(composer?.require["laravel/framework"]?.replace(/^[\^~>=<\s]+/, "")),
  };
  if (composer) versions.php = phpVersionFrom(composer.require.php, composer.platformPhp);
  if (python) versions.python = pythonVersionFrom(await readText(path.join(repoDir, ".python-version")), python.requiresPython);

  // ---- environment hints
  const envExample = parseEnv((await readText(path.join(repoDir, ".env.example"))) ?? (await readText(path.join(repoDir, ".env.dist"))));
  const phpunit = (await readText(path.join(repoDir, "phpunit.xml"))) ?? (await readText(path.join(repoDir, "phpunit.xml.dist"))) ?? "";
  const testsUseSqliteMemory = /DB_CONNECTION"\s+value="sqlite"/.test(phpunit) && /DB_DATABASE"\s+value=":memory:"/.test(phpunit);
  const composeText =
    (await readText(path.join(repoDir, "docker-compose.yml"))) ??
    (await readText(path.join(repoDir, "docker-compose.yaml"))) ??
    (await readText(path.join(repoDir, "compose.yaml"))) ??
    (await readText(path.join(repoDir, "compose.yml"))) ??
    "";
  const composeImages = [...composeText.matchAll(/image:\s*['"]?([^\s'"]+)/g)].map((m) => m[1]);

  const wfDir = path.join(repoDir, ".github", "workflows");
  const wfFiles = existsSync(wfDir) ? (await readdir(wfDir)).filter((f) => /\.ya?ml$/.test(f)) : [];
  const ci = { files: wfFiles.map((f) => `.github/workflows/${f}`), commands: ciCommands(await Promise.all(wfFiles.map(async (f) => (await readText(path.join(wfDir, f))) ?? ""))) };

  const aiFiles = ["CLAUDE.md", "AGENTS.md", ".claude", ".mcp.json", "boost.json", ".ai", ".cursor", ".cursorrules", ".github/copilot-instructions.md", ".junie"].filter(has);

  // ---- git conventions
  const headRef = (await git(repoDir, ["symbolic-ref", "--short", "HEAD"])).stdout.trim();
  const branches = (await git(repoDir, ["for-each-ref", "--sort=-committerdate", "--count=60", "--format=%(refname:lstrip=3)", "refs/remotes/origin"])).stdout
    .split("\n")
    .filter((b) => b && b !== "HEAD");
  const prefixCounts = new Map<string, number>();
  for (const b of branches) {
    const m = b.match(/^([a-z][\w-]*\/)/i);
    if (m) prefixCounts.set(m[1], (prefixCounts.get(m[1]) ?? 0) + 1);
  }
  const branchPrefixes = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const recentSubjects = (await git(repoDir, ["log", "-n", "40", "--no-merges", "--format=%s"])).stdout.split("\n").filter(Boolean);
  const conventionalCount = recentSubjects.filter((s) => /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\(.+\))?!?:/.test(s)).length;

  const facts: Facts = {
    topLevel: top,
    primary,
    frameworks: [...frameworks].sort(),
    composer,
    pkg,
    packageManager,
    python,
    versions,
    envExample,
    testsUseSqliteMemory,
    composeImages,
    ci,
    aiFiles,
    git: {
      defaultBranch: headRef || "main",
      branchPrefixes,
      recentSubjects: recentSubjects.slice(0, 15),
      conventional: recentSubjects.length > 0 && conventionalCount / recentSubjects.length >= 0.4,
    },
    suggested: { workspace: undefined as unknown as WorkspaceConfig, verify: [], branchPrefix: "feature/" },
  };
  facts.suggested = suggest(facts, has);
  return facts;
}

// ---------------------------------------------------------------- suggestions

const pmRun = (pm: PackageManager | undefined, script: string) => (pm === "npm" || !pm ? `npm run ${script}` : `${pm} run ${script}`);

export function installCommand(pm: PackageManager | undefined): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "yarn":
      return "yarn install --frozen-lockfile || yarn install --immutable";
    case "bun":
      return "bun install --frozen-lockfile";
    default:
      return "if [ -f package-lock.json ]; then npm ci; else npm install; fi";
  }
}

function suggestServices(f: Facts): Service[] {
  const s = new Set<Service>();
  const conn = (f.envExample.DB_CONNECTION ?? "").toLowerCase();
  const dbUrl = (f.envExample.DATABASE_URL ?? "").toLowerCase();
  if (conn === "mysql" || dbUrl.startsWith("mysql")) s.add("mysql");
  if (conn === "mariadb") s.add("mariadb");
  if (conn === "pgsql" || conn === "postgres" || dbUrl.startsWith("postgres")) s.add("postgres");
  for (const img of f.composeImages) {
    if (/^(mysql|.*\/mysql)(:|$)/.test(img)) s.add("mysql");
    if (/mariadb/.test(img)) s.add("mariadb");
    if (/postgres|postgis/.test(img)) s.add("postgres");
    if (/redis|valkey/.test(img)) s.add("redis");
  }
  const redisUsed = ["CACHE_STORE", "CACHE_DRIVER", "QUEUE_CONNECTION", "SESSION_DRIVER"].some((k) => (f.envExample[k] ?? "").toLowerCase() === "redis") || !!f.envExample.REDIS_URL;
  if (redisUsed) s.add("redis");
  // Laravel apps whose tests run on in-memory SQLite don't need a database server
  if (f.primary === "laravel" && f.testsUseSqliteMemory) {
    s.delete("mysql");
    s.delete("mariadb");
    s.delete("postgres");
  }
  return [...s];
}

function suggest(f: Facts, has: (p: string) => boolean): Facts["suggested"] {
  const pm = f.packageManager;
  const scripts = f.pkg?.scripts ?? {};
  const realScript = (n: string) => scripts[n] && !/no test specified/.test(scripts[n]);
  const services = suggestServices(f);
  const env: Record<string, string> = {};
  const bootstrap: string[] = [];
  const verify: VerifyStep[] = [];
  let base: WorkspaceConfig["base"] = "node";
  const phpExtensions: string[] = [];

  if (f.composer) {
    base = "php";
    bootstrap.push("composer install --no-interaction --prefer-dist --no-progress");
    if (f.primary === "laravel") {
      bootstrap.push("[ -f .env ] || cp .env.example .env");
      bootstrap.push("grep -q '^APP_KEY=base64' .env || php artisan key:generate --force");
      const db = services.find((s) => s === "mysql" || s === "mariadb" || s === "postgres");
      if (db) env.DB_CONNECTION = db === "postgres" ? "pgsql" : db;
      else {
        env.DB_CONNECTION = "sqlite";
        env.DB_DATABASE = "/workspace/repo/database/database.sqlite";
        bootstrap.push("mkdir -p database && touch database/database.sqlite");
      }
      bootstrap.push("php artisan migrate --force --graceful");
      verify.push({ name: "tests", command: "php artisan test" });
    } else if (f.frameworks.includes("pest") || f.frameworks.includes("phpunit")) {
      verify.push({ name: "tests", command: f.frameworks.includes("pest") ? "vendor/bin/pest" : "vendor/bin/phpunit" });
    }
    if (f.frameworks.includes("pint")) verify.push({ name: "lint", command: "vendor/bin/pint --test" });
    if (f.frameworks.includes("larastan") || f.frameworks.includes("phpstan"))
      verify.push({ name: "types", command: "vendor/bin/phpstan analyse --no-progress --memory-limit=1G" });
  }

  if (f.pkg) {
    bootstrap.push(installCommand(pm));
    if (f.frameworks.includes("prisma")) bootstrap.push("npx prisma generate");
    if (f.primary === "laravel" && (f.frameworks.includes("vite") || realScript("build"))) {
      // Blade/Inertia views need the Vite manifest in feature tests
      bootstrap.push(pmRun(pm, "build"));
      if (f.frameworks.includes("inertia") || f.frameworks.includes("typescript")) verify.push({ name: "build", command: pmRun(pm, "build") });
    }
    if (!f.composer && !f.python) {
      base = "node";
      if (realScript("test")) verify.push({ name: "tests", command: pm === "npm" || !pm ? "npm test" : `${pm} test` });
      if (realScript("lint")) verify.push({ name: "lint", command: pmRun(pm, "lint") });
      if (realScript("typecheck")) verify.push({ name: "types", command: pmRun(pm, "typecheck") });
      else if (realScript("type-check")) verify.push({ name: "types", command: pmRun(pm, "type-check") });
      else if (f.frameworks.includes("typescript") && has("tsconfig.json") && f.primary !== "nextjs") verify.push({ name: "types", command: "npx tsc --noEmit" });
      if (f.primary === "nextjs" && realScript("build")) verify.push({ name: "build", command: pmRun(pm, "build") });
      env.NEXT_TELEMETRY_DISABLED = "1";
    }
    if (f.frameworks.includes("playwright")) bootstrap.push("npx playwright install chromium");
  }

  if (f.python) {
    base = "python";
    env.VIRTUAL_ENV = "/workspace/repo/.venv";
    env.PATH = "/workspace/repo/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
    const py = f.python;
    if (py.manager === "uv") bootstrap.push("uv sync --all-extras --dev || uv sync");
    else if (py.manager === "poetry") bootstrap.push("pip install -q poetry && poetry config virtualenvs.in-project true && poetry install --no-interaction");
    else if (py.manager === "pipenv") bootstrap.push("pip install -q pipenv && PIPENV_VENV_IN_PROJECT=1 pipenv install --dev");
    else {
      const reqs = f.topLevel.filter((n) => /^requirements.*\.txt$/.test(n)).sort((a, b) => (a === "requirements.txt" ? -1 : b === "requirements.txt" ? 1 : a.localeCompare(b)));
      bootstrap.push(`[ -d .venv ] || python -m venv .venv`);
      if (reqs.length) bootstrap.push(`pip install -q ${reqs.map((r) => `-r ${r}`).join(" ")}`);
      if (has("pyproject.toml") || has("setup.py")) bootstrap.push(`pip install -q -e . || true`);
    }
    const db = services.find((s) => s === "postgres" || s === "mysql" || s === "mariadb");
    if (f.frameworks.includes("django")) {
      bootstrap.push("python manage.py migrate --noinput");
      verify.push({ name: "tests", command: f.frameworks.includes("pytest") ? "pytest -q" : "python manage.py test" });
      if (py.djangoSettings) env.DJANGO_SETTINGS_MODULE = py.djangoSettings;
    } else if (f.frameworks.includes("pytest") || has("tests") || has("test")) {
      verify.push({ name: "tests", command: "pytest -q" });
    }
    if (f.frameworks.includes("ruff")) verify.push({ name: "lint", command: "ruff check ." });
    if (f.frameworks.includes("mypy")) verify.push({ name: "types", command: "mypy ." });
    if (!db && f.frameworks.includes("django")) env.DATABASE_URL = "sqlite:////workspace/repo/db.sqlite3";
  }

  const versions: WorkspaceConfig["versions"] = { node: f.versions.node };
  if (base === "php") versions.php = f.versions.php ?? "8.4";
  if (base === "python") versions.python = f.versions.python ?? "3.13";

  return {
    workspace: {
      base,
      versions,
      aptPackages: [],
      phpExtensions,
      playwright: f.frameworks.includes("playwright"),
      services,
      env,
      bootstrap,
    },
    verify,
    branchPrefix: f.git.branchPrefixes[0] ?? "feature/",
  };
}
