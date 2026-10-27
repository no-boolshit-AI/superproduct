/**
 * agents.mjs: the agents in ./agents as the helpers see them (Node 20+, ESM, zero dependencies): the registry
 * (agents.json), each agent's environment and readiness, its results, the workspace and product summaries, and the
 * dev-agent relay. Shared by scripts/agents.mjs (the CLI) and scripts/dashboard.mjs (the web dashboard).
 *
 * It never returns secret values: readiness reports which variable names are set, nothing more.
 *
 * Registry entries are resolved from the kit, so an entry whose `dir` is absolute (tests) works too.
 */
import { execFile, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readEnvFile } from "./env-file.mjs";
import { checkProduct, findProductDir } from "./product.mjs";
import { planMigration } from "./workspace-migrate.mjs";
import { KIT_ROOT, workspaceDir } from "./workspace.mjs";

const manifest = JSON.parse(readFileSync(path.join(KIT_ROOT, "agents.json"), "utf8"));
export const REGISTRY = manifest.agents;

/** The keys the agents use (agents.json → keys): what each is for, its cost, how to get it. */
export const KEYS = Object.fromEntries(Object.entries(manifest.keys ?? {}).filter(([k]) => !k.startsWith("$")));
export const CLAUDE_KEYS = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"];
export const keyLabel = (name) => KEYS[name]?.label ?? name;

/** An agent by id, folder name ("deck-agent") or folder path; undefined when there is none. */
export const findAgent = (id, registry = REGISTRY) => registry.find((x) => x.id === id || path.basename(x.dir) === id || x.dir === id || `${x.id}-agent` === id);

/** The agent's folder (absolute). */
export const agentPath = (a) => path.resolve(KIT_ROOT, a.dir);

/** The Cowork VM (Linux) shares this folder with the user's computer: installing or running there breaks its node_modules. */
export const coworkVm = process.platform === "linux" && (os.homedir().startsWith("/sessions/") || /^\/sessions\/[^/]+\/mnt\//.test(KIT_ROOT));

/** The environment an agent runs with: its .env, overridden by real environment variables. */
export function agentEnv(a, env = process.env) {
  return { ...readEnvFile(path.join(agentPath(a), ".env")), ...Object.fromEntries(Object.entries(env).filter(([, v]) => v)) };
}

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function age(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// ---------------------------------------------------------------- tools on this computer

const mac = process.platform === "darwin";
const win = process.platform === "win32";
export const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);

/** Programs the agents and the setup need, with the command that proves each one works. */
const PROGRAMS = {
  git: ["git", ["--version"]],
  dockerInstalled: ["docker", ["--version"]],
  docker: ["docker", ["version", "--format", "{{.Server.Version}}"]],
  ffmpeg: ["ffmpeg", ["-version"]],
  claude: ["claude", ["--version"]],
  claudeLoggedIn: ["claude", ["auth", "status"]],
  claudeAuthCommand: ["claude", ["auth", "--help"]],
  ...(mac && { brew: ["brew", ["--version"]] }),
};

const runs = (cmd, args) => {
  try {
    return spawnSync(cmd, args, { stdio: "ignore", timeout: 15000 }).status === 0;
  } catch {
    return false;
  }
};
const runsAsync = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { timeout: 15000 }, (err) => resolve(!err)));

export function chromiumInstalled() {
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), "Library", "Caches", "ms-playwright"), path.join(os.homedir(), ".cache", "ms-playwright")].filter(Boolean);
  return dirs.some((d) => existsSync(d) && readdirSync(d).some((n) => n.startsWith("chromium")));
}

/** The Chrome HyperFrames renders with (`hyperframes browser ensure`), or HYPERFRAMES_BROWSER_PATH from the agent's env. */
export function hyperframesChromeInstalled(env) {
  if (env.HYPERFRAMES_BROWSER_PATH) return existsSync(env.HYPERFRAMES_BROWSER_PATH);
  const dirs = [path.join(os.homedir(), ".cache", "hyperframes", "chrome"), path.join(os.homedir(), ".cache", "puppeteer", "chrome-headless-shell")];
  return dirs.some((d) => existsSync(d) && readdirSync(d).length > 0);
}

/** Claude Code on this computer: "logged-in", "logged-out", "missing", or "unknown" (an older CLI, only the editor extension, the Cowork VM). */
export function claudeCodeState(tools) {
  if (coworkVm) return "unknown";
  if (!tools.claude) return existsSync(path.join(os.homedir(), ".claude")) ? "unknown" : "missing";
  if (tools.claudeLoggedIn) return "logged-in";
  return tools.claudeAuthCommand ? "logged-out" : "unknown";
}

/**
 * What's installed on this computer, checked lazily (only what a status needs, once): the PROGRAMS, chromium, and
 * claudeCode (claudeCodeState). The CLI uses this; the dashboard uses probeToolsAsync, which doesn't block while checking.
 */
export function probeTools() {
  const memo = {};
  const cache = {};
  const lazy = (key, fn) => Object.defineProperty(memo, key, { enumerable: true, get: () => (key in cache ? cache[key] : (cache[key] = fn())) });
  for (const [key, [cmd, args]] of Object.entries(PROGRAMS)) lazy(key, () => runs(cmd, args));
  if (!mac) memo.brew = false;
  lazy("chromium", chromiumInstalled);
  lazy("claudeCode", () => claudeCodeState(memo));
  return memo;
}

/** The same checks as probeTools, all at once and without blocking. */
export async function probeToolsAsync() {
  const entries = await Promise.all(Object.entries(PROGRAMS).map(async ([key, [cmd, args]]) => [key, await runsAsync(cmd, args)]));
  const tools = { brew: false, ...Object.fromEntries(entries), chromium: chromiumInstalled() };
  return { ...tools, claudeCode: claudeCodeState(tools), checkedAt: Date.now() };
}

/** How to get a missing program: a command Claude can run once the user agrees (by "claude"), or a step for the user. */
export function toolFix(tool, tools = probeTools()) {
  switch (tool) {
    case "node":
      if (tools.brew) return { fix: "brew install node", by: "claude" };
      if (win) return { fix: "winget install OpenJS.NodeJS.LTS", by: "claude" };
      return { fix: "download the LTS installer from https://nodejs.org, run it, then reopen your terminal or editor", by: "you" };
    case "git":
      if (mac) return { fix: "xcode-select --install  (a window asks to install the developer tools: click Install)", by: "you" };
      return win ? { fix: "winget install Git.Git", by: "claude" } : { fix: "sudo apt install git  (asks for your password)", by: "you" };
    case "ffmpeg":
      if (tools.brew) return { fix: "brew install ffmpeg", by: "claude" };
      if (win) return { fix: "winget install Gyan.FFmpeg", by: "claude" };
      if (mac) return { fix: "install Homebrew: paste the command from https://brew.sh into Terminal (it asks for your Mac password); then Claude runs brew install ffmpeg", by: "you" };
      return { fix: "sudo apt install ffmpeg  (asks for your password)", by: "you" };
    case "docker":
      return { fix: "install Docker Desktop from https://www.docker.com/products/docker-desktop/, open it once and accept its terms", by: "you" };
    case "docker-start":
      return mac ? { fix: "open -a Docker  (then about a minute until it's running)", by: "claude" } : { fix: "start Docker Desktop and wait until it says it's running", by: "you" };
  }
}

/** A missing key: the user adds it through a window that asks for it, so it never goes through the chat. */
export const keyFix = (name) => ({ topic: "key", key: name, fix: `node scripts/agents.mjs keys ask ${name}`, by: "you" });

// ---------------------------------------------------------------- results

/**
 * Where an agent's results are: <workspace>/<outputs.dir>, unless the variable named in outputs.env (VAR, or
 * VAR/subfolder) is set; the agent resolves that one from its own folder.
 */
export function outputRoot(a, env = agentEnv(a)) {
  const [name, ...sub] = (a.outputs.env ?? "").split("/");
  return name && env[name] ? path.resolve(agentPath(a), env[name], ...sub) : path.join(workspaceDir({ env }), a.outputs.dir);
}

/** Every result folder of an agent (one per run), in no particular order. */
export function outputFolders(a, env = agentEnv(a)) {
  const base = outputRoot(a, env);
  if (!existsSync(base)) return [];
  const ignore = new Set([...(a.outputs.ignore ?? []), ".DS_Store"]);
  let dirs = [base];
  for (let d = 0; d < a.outputs.depth; d++)
    dirs = dirs.flatMap((p) =>
      readdirSync(p, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !ignore.has(e.name) && !e.name.startsWith("_") && !e.name.startsWith("."))
        .map((e) => path.join(p, e.name)),
    );
  return dirs;
}

/** The status a run record states, whatever the agent calls the field. */
export const recordStatus = (rec) => rec?.status ?? rec?.state ?? (rec?.ok === true ? "success" : rec?.ok === false ? "failed" : undefined);

/** Latest output folders of an agent, newest first, with their key files and recorded status. */
export function outputsOf(a, limit = 5, env = agentEnv(a)) {
  const base = outputRoot(a, env);
  return outputFolders(a, env)
    .map((dir) => {
      const rec = readJson(path.join(dir, a.outputs.record));
      const files = a.outputs.files.filter((f) => existsSync(path.join(dir, f))).map((f) => path.join(dir, f));
      const mtime = Math.max(statSync(dir).mtimeMs, existsSync(path.join(dir, a.outputs.record)) ? statSync(path.join(dir, a.outputs.record)).mtimeMs : 0);
      return {
        id: path.relative(base, dir),
        dir,
        mtime,
        status: recordStatus(rec),
        detail: rec ? (rec.publish?.prUrl ?? rec.publish?.branchUrl ?? rec.branch ?? rec.error ?? undefined) : undefined,
        costUsd: rec?.costUsd ?? rec?.cost ?? undefined,
        files,
      };
    })
    .sort((x, y) => y.mtime - x.mtime)
    .slice(0, limit);
}

// ---------------------------------------------------------------- readiness

/**
 * Is an agent ready to run, and if not, what's missing. `checks` lists every requirement ({ id, label, ok, problem });
 * `fixes` says what to do about the failing ones, in plain words: a command Claude can run once the user agrees
 * (by "claude") or a step for the user (by "you"); `problems` is the same list as text. `tools` comes from
 * probeTools() or probeToolsAsync().
 */
export function statusOf(a, { tools = probeTools(), env: baseEnv = process.env } = {}) {
  const dir = agentPath(a);
  if (!existsSync(dir)) {
    const fix = { topic: "kit", problem: `the folder ${a.dir} is missing`, fix: "update the kit (git pull) or download it again", by: "you" };
    return { id: a.id, dir: a.dir, ready: false, problems: [fix.problem], fixes: [fix], checks: [{ id: "folder", label: "Agent folder", ok: false, problem: fix.problem }], claude: null, optionalMissing: [], latest: null };
  }
  const env = agentEnv(a, baseEnv);
  const set = (k) => !!env[k];
  const installed = existsSync(path.join(dir, "node_modules"));
  const checks = [];
  const fixes = [];
  // `listed: false` keeps a failing check out of the fixes when another fix covers it (install downloads the browsers)
  const check = (id, label, ok, found, { listed = true } = {}) => {
    const list = [found].flat();
    checks.push({ id, label, ok, ...(!ok && { problem: list.map((f) => f.problem).join(" · ") }) });
    if (!ok && listed) fixes.push(...list);
  };

  check("installed", "Installed", installed, { topic: "install", problem: "not installed yet", fix: `node scripts/agents.mjs install ${a.id}`, by: "claude" });
  if (existsSync(path.join(dir, ".env.example")))
    check("env", "Settings file (.env)", existsSync(path.join(dir, ".env")), { topic: "env", problem: "no settings file (.env) yet", fix: `node scripts/agents.mjs setup ${a.id}`, by: "claude" }, { listed: installed });
  const keys = a.env.required.filter((k) => !CLAUDE_KEYS.includes(k));
  if (keys.length)
    check(
      "keys",
      "Required keys",
      keys.every(set),
      keys.filter((k) => !set(k)).map((k) => ({ problem: `needs ${/^[aeiou]/i.test(keyLabel(k)) ? "an" : "a"} ${keyLabel(k)} (${k})`, ...keyFix(k) })),
    );

  const cc = tools.claudeCode ?? claudeCodeState(tools);
  let claude = null;
  if (set("ANTHROPIC_API_KEY")) claude = "API key";
  else if (set("CLAUDE_CODE_OAUTH_TOKEN") && a.claudeAuth !== "key") claude = "subscription token";
  else if (a.claudeAuth === "login-or-key")
    claude = { "logged-in": "Claude Code login", unknown: coworkVm ? "Claude Code login on the computer (not checkable from the Cowork VM)" : "Claude Code login (assumed)" }[cc] ?? null;
  let claudeFix;
  if (a.claudeAuth === "key") claudeFix = { problem: "needs a Claude API key (ANTHROPIC_API_KEY): it can't use your Claude login", ...keyFix("ANTHROPIC_API_KEY") };
  else if (a.claudeAuth === "token-or-key")
    claudeFix = { problem: "needs a Claude subscription token or API key: its Docker runs can't use your Claude login", ...keyFix("CLAUDE_CODE_OAUTH_TOKEN"), fix: "node scripts/agents.mjs keys ask CLAUDE_CODE_OAUTH_TOKEN  (or keys ask ANTHROPIC_API_KEY to pay per use)" };
  else if (cc === "logged-out") claudeFix = { topic: "claude", problem: "Claude Code isn't logged in", fix: "claude auth login  (in a terminal; it opens your browser), or keys ask ANTHROPIC_API_KEY to pay per use", by: "you" };
  else claudeFix = { topic: "claude", problem: "no Claude login found", fix: "install Claude Code (https://claude.com/claude-code) and log in, or keys ask ANTHROPIC_API_KEY to pay per use", by: "you" };
  check("claude", "Claude", !!claude, claudeFix);

  // Programs on the user's computer; the Cowork VM can't see them
  if (!coworkVm) {
    if (a.needs.includes("node22")) check("node22", "Node 22 or newer", nodeMajor >= 22, { topic: "node", problem: `needs Node 22 or newer (this computer has ${process.versions.node})`, ...toolFix("node", tools) });
    if (a.needs.includes("ffmpeg")) check("ffmpeg", "FFmpeg", tools.ffmpeg, { topic: "ffmpeg", problem: "FFmpeg, a free tool for video files, isn't installed", ...toolFix("ffmpeg", tools) });
    if (a.needs.includes("docker"))
      check("docker", "Docker", tools.docker, tools.dockerInstalled ? { topic: "docker", problem: "Docker Desktop isn't running", ...toolFix("docker-start", tools) } : { topic: "docker", problem: "Docker Desktop isn't installed", ...toolFix("docker", tools) });
    // install downloads these; only worth a fix of their own once the agent is installed
    const reinstall = { topic: "install", fix: `node scripts/agents.mjs install ${a.id}`, by: "claude" };
    if (a.needs.includes("chromium")) check("chromium", "Chromium", tools.chromium, { problem: "the browser it draws with isn't downloaded", ...reinstall }, { listed: installed });
    if (a.needs.includes("hyperframes-chrome")) check("hyperframes-chrome", "HyperFrames' Chrome", hyperframesChromeInstalled(env), { problem: "the browser it renders video with isn't downloaded", ...reinstall }, { listed: installed });
  }
  const latest = outputsOf(a, 1, env)[0];
  return {
    id: a.id,
    dir: a.dir,
    ready: checks.every((c) => c.ok),
    problems: fixes.map((f) => f.problem),
    fixes,
    checks,
    claude,
    optionalMissing: a.env.optional.filter((k) => !set(k)),
    latest: latest ? { id: latest.id, status: latest.status, age: age(latest.mtime) } : null,
  };
}

// ---------------------------------------------------------------- workspace and product

/** The workspace: where it is, whether it's a git repository, and what's still in the old layout. */
export function workspaceStatus({ env = process.env } = {}) {
  const dir = workspaceDir({ env });
  const exists = existsSync(dir);
  const git = exists && existsSync(path.join(dir, ".git"));
  const old = planMigration({ workspace: dir }).filter((s) => s.action === "move").map((s) => path.relative(KIT_ROOT, s.from));
  return {
    dir: path.relative(KIT_ROOT, dir).startsWith("..") ? dir : path.relative(KIT_ROOT, dir),
    exists,
    git,
    old,
    summary: !exists ? "not created yet: node scripts/workspace.mjs init" : git ? "its own git repository · node scripts/workspace.mjs show" : "not a git repository yet: node scripts/workspace.mjs init",
  };
}

/** The product folder the agents will use (PRODUCT_DIR, else workspace/product), with a validation summary. */
export function productStatus({ env = process.env } = {}) {
  try {
    const dir = findProductDir({ from: KIT_ROOT, env, workspace: workspaceDir({ env }) });
    if (!dir) return { dir: null, name: null, ok: null, summary: "no product folder (node scripts/product.mjs init --name … --website …)" };
    const r = checkProduct(dir);
    const docs = r.info.docs ?? {};
    return {
      dir: path.relative(KIT_ROOT, dir) || ".",
      name: r.product?.name ?? null,
      ok: r.ok,
      errors: r.errors.length,
      warnings: r.warnings.length,
      docs,
      summary: `${r.ok ? "check OK" : `${r.errors.length} error(s)`}, ${r.warnings.length} warning(s) · docs ${docs.verified ?? 0} verified, ${docs.draft ?? 0} draft, ${docs.template ?? 0} template · node scripts/product.mjs check`,
    };
  } catch (e) {
    return { dir: null, name: null, ok: false, summary: `product folder problem: ${e.message}` };
  }
}

// ---------------------------------------------------------------- dev-agent relay

/** Where dev-agent writes its questions: DEVAGENT_ASK_DIR, else <DEVAGENT_HOME>/ask, else workspace/dev/ask. */
export function askDir({ registry = REGISTRY, env: baseEnv = process.env } = {}) {
  const dev = findAgent("dev", registry);
  const env = dev ? agentEnv(dev, baseEnv) : baseEnv;
  const from = dev ? agentPath(dev) : KIT_ROOT;
  if (env.DEVAGENT_ASK_DIR) return path.resolve(from, env.DEVAGENT_ASK_DIR);
  return path.join(env.DEVAGENT_HOME ? path.resolve(from, env.DEVAGENT_HOME) : path.join(workspaceDir({ env }), "dev"), "ask");
}

/** Open questions and plan approvals, oldest first (a plain file protocol, so it also works in the Cowork VM). */
export function listPending(dir = askDir()) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".pending.json"))
    .map((f) => readJson(path.join(dir, f)))
    .filter((x) => x && !existsSync(path.join(dir, `${x.id}.answer.json`)))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/** Answer value meaning "the person added this secret to the project's secrets.env themselves". */
export const IN_SECRETS_FILE = "__in_secrets_file__";

/**
 * Answer one open item: { decision: "approve" | "revise" | "cancel", feedback } for a plan approval,
 * { answers: { <questionId>: "label" | ["a", "b"] | "text" } } for questions. Throws with a helpful message on mistakes.
 */
export function writeAnswer(id, payload, dir = askDir()) {
  const item = id && listPending(dir).find((x) => x.id === id || x.id.startsWith(id));
  if (!item) throw new Error(`No open question with id ${id ?? "(none)"}. See: node scripts/agents.mjs pending`);
  let answer;
  if (item.kind === "approval") {
    const { decision, feedback } = payload;
    if (!["approve", "revise", "cancel"].includes(decision ?? "")) throw new Error("Plan approval: --decision approve | revise | cancel (with --feedback for revise)");
    if (decision === "revise" && !feedback?.trim()) throw new Error("--decision revise needs --feedback");
    answer = { decision, feedback };
  } else {
    const answers = payload.answers;
    if (!answers || typeof answers !== "object") throw new Error(`Questions: --json '{"<questionId>": "<answer>", …}' (ids: ${(item.questions ?? []).map((q) => q.id).join(", ")})`);
    const missing = (item.questions ?? []).filter((q) => !(q.id in answers)).map((q) => q.id);
    if (missing.length) throw new Error(`Missing answers for: ${missing.join(", ")}. Use "" to skip a question.`);
    for (const q of item.questions ?? [])
      if (q.secretEnv && typeof answers[q.id] === "string" && answers[q.id] && answers[q.id] !== IN_SECRETS_FILE)
        throw new Error(`Don't pass secret values through answers. Have ${q.secretEnv}=… added to ${item.secretsFile}, then answer "${IN_SECRETS_FILE}".`);
    answer = { answers };
  }
  const file = path.join(dir, `${item.id}.answer.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(answer, null, 2));
  renameSync(`${file}.tmp`, file);
  return item;
}
