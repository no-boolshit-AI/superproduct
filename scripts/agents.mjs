#!/usr/bin/env node
/**
 * Helper for the main agent (and humans) in this folder. Zero dependencies, Node 20+.
 *
 *   node scripts/agents.mjs init                      once, on your computer: link skills/ into .claude/skills + permissions, create workspace/
 *   node scripts/agents.mjs list                      agents, what they do, how to run them
 *   node scripts/agents.mjs status [agent] [--json]   installed? keys present? Chromium/Docker/FFmpeg? latest output
 *   node scripts/agents.mjs outputs [agent] [-n 5] [--json]   latest results with their key files
 *   node scripts/agents.mjs install <agent|all>       npm install + setup steps (on your computer, not in the Cowork VM)
 *   node scripts/agents.mjs test <agent|all>          zero-cost test of an agent (no Claude spend)
 *   node scripts/agents.mjs run <agent> [args…]       run the agent's main command with args
 *   node scripts/agents.mjs web <agent>               start the agent's web UI
 *   node scripts/agents.mjs pending                   dev-agent relay: open questions/approvals (JSON)
 *   node scripts/agents.mjs answer <id> [args…]       dev-agent relay: answer one (same flags as the dev-agent CLI)
 *
 * Everything the agents make, and the product they work for, lives in the workspace (workspace/, see
 * lib/workspace.mjs and node scripts/workspace.mjs show | init | migrate). `status` shows it and the product;
 * node scripts/product.mjs show | check | context <agent> | tokens | index | init   manages the product.
 *
 * It never prints secret values: `status` only reports which variable names are set.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkProduct, findProductDir } from "../lib/product.mjs";
import { planMigration } from "../lib/workspace-migrate.mjs";
import { createWorkspace, workspaceDir } from "../lib/workspace.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = JSON.parse(readFileSync(path.join(ROOT, "agents.json"), "utf8")).agents;

const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1), dim = c(2), green = c(32), red = c(31), yellow = c(33);

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const json = flags.has("--json");

function agent(id) {
  const a = REGISTRY.find((x) => x.id === id || path.basename(x.dir) === id || x.dir === id || `${x.id}-agent` === id);
  if (!a) die(`Unknown agent "${id}". Agents: ${REGISTRY.map((x) => x.id).join(", ")}`);
  return a;
}
function targets(id) {
  return !id || id === "all" ? REGISTRY : [agent(id)];
}
function die(msg) {
  console.error(red(`✗ ${msg}`));
  process.exit(1);
}

/** The Cowork VM (Linux) shares this folder with the user's computer: installing or running there breaks its node_modules. */
const coworkVm = process.platform === "linux" && (os.homedir().startsWith("/sessions/") || /^\/sessions\/[^/]+\/mnt\//.test(ROOT));
function guardHost(action) {
  if (coworkVm && !flags.has("--force"))
    die(`Don't ${action} from the Cowork VM: the agents run on the user's computer (Chromium, Docker, native binaries in node_modules). Run it in a terminal there or ask the user to. --force overrides.`);
}

function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

const has = (cmd, args = ["--version"]) => {
  try {
    return spawnSync(cmd, args, { stdio: "ignore", timeout: 15000 }).status === 0;
  } catch {
    return false;
  }
};

function chromiumInstalled() {
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), "Library", "Caches", "ms-playwright"), path.join(os.homedir(), ".cache", "ms-playwright")].filter(Boolean);
  return dirs.some((d) => existsSync(d) && readdirSync(d).some((n) => n.startsWith("chromium")));
}

/** The Chrome HyperFrames renders with (`hyperframes browser ensure`), or HYPERFRAMES_BROWSER_PATH from the agent's env. */
function hyperframesChromeInstalled(env) {
  if (env.HYPERFRAMES_BROWSER_PATH) return existsSync(env.HYPERFRAMES_BROWSER_PATH);
  const dirs = [path.join(os.homedir(), ".cache", "hyperframes", "chrome"), path.join(os.homedir(), ".cache", "puppeteer", "chrome-headless-shell")];
  return dirs.some((d) => existsSync(d) && readdirSync(d).length > 0);
}

function age(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** The environment an agent runs with: its .env, overridden by real environment variables. */
function agentEnv(a) {
  return { ...parseEnvFile(path.join(ROOT, a.dir, ".env")), ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
}

/**
 * Where an agent's results are: <workspace>/<outputs.dir>, unless the variable named in outputs.env (VAR, or
 * VAR/subfolder) is set; the agent resolves that one from its own folder.
 */
function outputRoot(a, env = agentEnv(a)) {
  const [name, ...sub] = (a.outputs.env ?? "").split("/");
  return name && env[name] ? path.resolve(ROOT, a.dir, env[name], ...sub) : path.join(workspaceDir({ env }), a.outputs.dir);
}

/** Latest output folders of an agent, newest first, with their key files and recorded status. */
function outputsOf(a, limit = 5, env = agentEnv(a)) {
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
  return dirs
    .map((dir) => {
      const rec = readJson(path.join(dir, a.outputs.record));
      const files = a.outputs.files.filter((f) => existsSync(path.join(dir, f))).map((f) => path.join(dir, f));
      const mtime = Math.max(statSync(dir).mtimeMs, existsSync(path.join(dir, a.outputs.record)) ? statSync(path.join(dir, a.outputs.record)).mtimeMs : 0);
      return {
        id: path.relative(base, dir),
        dir,
        mtime,
        status: rec?.status ?? rec?.state ?? (rec?.ok === true ? "success" : rec?.ok === false ? "failed" : undefined),
        detail: rec ? (rec.publish?.prUrl ?? rec.publish?.branchUrl ?? rec.branch ?? rec.error ?? undefined) : undefined,
        costUsd: rec?.costUsd ?? rec?.cost ?? undefined,
        files,
      };
    })
    .sort((x, y) => y.mtime - x.mtime)
    .slice(0, limit);
}

function statusOf(a) {
  const dir = path.join(ROOT, a.dir);
  const env = agentEnv(a);
  const set = (k) => !!env[k];
  const missing = a.env.required.filter((k) => !set(k));
  const optionalMissing = a.env.optional.filter((k) => !set(k));
  let claude;
  if (set("ANTHROPIC_API_KEY")) claude = "API key";
  else if (set("CLAUDE_CODE_OAUTH_TOKEN")) claude = "OAuth token";
  else if (a.claudeAuth === "login-or-key") claude = coworkVm ? "Claude Code login on the computer (not checkable from the Cowork VM)" : existsSync(path.join(os.homedir(), ".claude")) || has("claude") ? "Claude Code login (assumed)" : null;
  else claude = null;
  const problems = [];
  if (!existsSync(dir)) return { id: a.id, dir: a.dir, ready: false, problems: [`folder ${a.dir} is missing`], claude: null, optionalMissing: [], latest: null };
  if (!existsSync(path.join(dir, "node_modules"))) problems.push(`not installed (node scripts/agents.mjs install ${a.id})`);
  if (!existsSync(path.join(dir, ".env")) && existsSync(path.join(dir, ".env.example"))) problems.push("no .env (copy .env.example)");
  if (missing.length) problems.push(`missing ${missing.join(", ")}`);
  if (!claude) problems.push(a.claudeAuth === "token-or-key" ? "needs ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env (containers can't use the Claude Code login)" : a.claudeAuth === "key" ? "needs ANTHROPIC_API_KEY" : "no Claude credentials found");
  // Chromium and Docker live on the user's computer; the Cowork VM can't see them
  if (!coworkVm && a.needs.includes("chromium") && !chromiumInstalled()) problems.push("Chromium not downloaded (install runs it)");
  if (!coworkVm && a.needs.includes("docker") && !has("docker", ["version", "--format", "{{.Server.Version}}"])) problems.push("Docker not running");
  if (!coworkVm && a.needs.includes("ffmpeg") && !has("ffmpeg", ["-version"])) problems.push("FFmpeg not found (brew install ffmpeg)");
  if (!coworkVm && a.needs.includes("node22") && Number(process.versions.node.split(".")[0]) < 22) problems.push(`Node ${process.versions.node}: needs Node 22 or newer`);
  if (!coworkVm && a.needs.includes("hyperframes-chrome") && !hyperframesChromeInstalled(env)) problems.push("HyperFrames' Chrome not downloaded (install runs it)");
  const latest = outputsOf(a, 1, env)[0];
  return { id: a.id, dir: a.dir, ready: problems.length === 0, problems, claude, optionalMissing, latest: latest ? { id: latest.id, status: latest.status, age: age(latest.mtime) } : null };
}

/** The workspace: where it is, whether it's a git repository, and what's still in the old layout. */
function workspaceStatus() {
  const dir = workspaceDir();
  const exists = existsSync(dir);
  const git = exists && existsSync(path.join(dir, ".git"));
  const old = planMigration({ workspace: dir }).filter((s) => s.action === "move").map((s) => path.relative(ROOT, s.from));
  return {
    dir: path.relative(ROOT, dir).startsWith("..") ? dir : path.relative(ROOT, dir),
    exists,
    git,
    old,
    summary: !exists ? "not created yet: node scripts/workspace.mjs init" : git ? "its own git repository · node scripts/workspace.mjs show" : "not a git repository yet: node scripts/workspace.mjs init",
  };
}

/** The product folder the agents will use (PRODUCT_DIR, else workspace/product), with a validation summary. */
function productStatus() {
  try {
    const dir = findProductDir({ from: ROOT });
    if (!dir) return { dir: null, name: null, ok: null, summary: "no product folder (node scripts/product.mjs init --name … --website …)" };
    const r = checkProduct(dir);
    const docs = r.info.docs ?? {};
    return {
      dir: path.relative(ROOT, dir) || ".",
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

function runIn(a, cmd, extra = []) {
  const full = [cmd, ...extra.map((x) => (/^[\w./:=@%+-]+$/.test(x) ? x : `'${x.replace(/'/g, `'\\''`)}'`))].join(" ");
  console.log(dim(`$ cd ${a.dir} && ${full}`));
  const r = spawnSync(full, { cwd: path.join(ROOT, a.dir), shell: true, stdio: "inherit" });
  return r.status ?? 1;
}

const [cmd, ...rest] = argv.filter((x) => !["--json", "--force"].includes(x));

switch (cmd) {
  case undefined:
  case "help":
  case "--help": {
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    console.log(src.slice(src.indexOf(" *   node"), src.indexOf(" * It never")).replace(/^ \* ?/gm, ""));
    break;
  }
  case "init": {
    // Claude Code discovers project skills in .claude/skills; the canonical copies live in skills/ (editable, also read by Cowork).
    const dotClaude = path.join(ROOT, ".claude");
    mkdirSync(dotClaude, { recursive: true });
    const link = path.join(dotClaude, "skills");
    const st = (() => {
      try {
        return lstatSync(link);
      } catch {
        return null;
      }
    })();
    if (!st) {
      symlinkSync("../skills", link, "dir");
      console.log(green("✓ .claude/skills → ../skills"));
    } else if (st.isSymbolicLink()) console.log(dim("· .claude/skills already linked"));
    else console.log(yellow("! .claude/skills is a real folder; skills/ is the canonical copy, merge by hand if needed"));
    const settings = path.join(dotClaude, "settings.json");
    if (!existsSync(settings)) {
      copyFileSync(path.join(ROOT, "scripts", "claude-settings.json"), settings);
      console.log(green("✓ .claude/settings.json (read-only helper commands allowed, .env reads denied)"));
    } else console.log(dim("· .claude/settings.json exists; compare with scripts/claude-settings.json"));
    // The workspace holds the product, briefs and results; it's its own git repository, outside the kit's
    const ws = workspaceDir();
    const created = createWorkspace({ dir: ws });
    console.log(created.length ? green(`✓ ${path.relative(ROOT, ws) || ws}/ (${created.join(", ")})`) : dim(`· ${path.relative(ROOT, ws) || ws}/ exists`));
    const old = planMigration({ workspace: ws }).filter((s) => s.action === "move").length;
    if (old) console.log(yellow(`! ${old} item(s) still in the old layout (product/, briefs/, agents' results): node scripts/workspace.mjs migrate --dry-run`));
    break;
  }
  case "list": {
    if (json) {
      console.log(JSON.stringify(REGISTRY, null, 2));
      break;
    }
    for (const a of REGISTRY) {
      console.log(`${bold(a.id.padEnd(13))} ${a.title}`);
      console.log(`${"".padEnd(14)}${dim(a.summary)}`);
      console.log(`${"".padEnd(14)}cd ${a.dir} && ${a.command} …${a.web ? `   ·  web: ${a.web.command} → ${a.web.url}` : ""}`);
    }
    break;
  }
  case "status": {
    const rows = targets(rest[0]).map(statusOf);
    const product = productStatus();
    if (coworkVm && !json) console.log(dim("(Cowork VM: Chromium, Docker, FFmpeg and the Claude login are on your computer and aren't checked here)"));
    if (json) {
      // agents only, as before; the product's own report: node scripts/product.mjs check --json; the workspace's: node scripts/workspace.mjs show --json
      console.log(JSON.stringify(rows, null, 2));
      break;
    }
    const ws = workspaceStatus();
    console.log(`${ws.exists && ws.git ? green("✓") : yellow("·")} ${bold("workspace".padEnd(13))} ${ws.dir}/ ${dim(ws.summary)}`);
    if (ws.old.length) console.log(yellow(`! ${"old layout".padEnd(13)} ${ws.old.length} item(s) outside the workspace (${ws.old.slice(0, 3).join(", ")}${ws.old.length > 3 ? ", …" : ""}): node scripts/workspace.mjs migrate --dry-run`));
    console.log(`${product.ok === false ? red("✗") : product.ok ? green("✓") : yellow("·")} ${bold("product".padEnd(13))} ${product.name ? `${product.name} ${dim(`(${product.dir}/)`)}` : ""}`);
    console.log(dim(`  ${"".padEnd(13)} ${product.summary}`));
    for (const r of rows) {
      console.log(`${r.ready ? green("✓") : red("✗")} ${bold(r.id.padEnd(13))} ${r.ready ? green("ready") : yellow(r.problems.join(" · "))}`);
      const bits = [r.claude ? `Claude: ${r.claude}` : null, r.optionalMissing.length ? `optional not set: ${r.optionalMissing.join(", ")}` : null, r.latest ? `latest: ${r.latest.id} (${r.latest.status ?? "?"}, ${r.latest.age})` : "no outputs yet"].filter(Boolean);
      console.log(dim(`  ${"".padEnd(13)} ${bits.join(" · ")}`));
    }
    break;
  }
  case "outputs": {
    const nIdx = argv.findIndex((x) => x === "-n" || x === "--limit");
    const n = nIdx >= 0 ? Number(argv[nIdx + 1]) || 5 : 5;
    const id = rest[0] && !/^\d+$/.test(rest[0]) && rest[0] !== "-n" ? rest[0] : undefined;
    const all = targets(id).flatMap((a) => outputsOf(a, n).map((o) => ({ agent: a.id, ...o })));
    all.sort((x, y) => y.mtime - x.mtime);
    if (json) {
      console.log(JSON.stringify(all.slice(0, id ? n : n * 2).map((o) => ({ ...o, age: age(o.mtime) })), null, 2));
      break;
    }
    if (!all.length) console.log("No outputs yet.");
    for (const o of all.slice(0, id ? n : n * 2)) {
      console.log(`${bold(o.agent)} ${o.id} ${dim(`${o.status ?? ""} ${age(o.mtime)}${o.costUsd ? ` · $${Number(o.costUsd).toFixed(2)}` : ""}${o.detail ? ` · ${o.detail}` : ""}`)}`);
      for (const f of o.files) console.log(dim(`    ${f}`));
    }
    break;
  }
  case "install": {
    guardHost("install agents");
    if (!rest[0]) die("install <agent|all>");
    let failed = 0;
    for (const a of targets(rest[0])) {
      console.log(bold(`\n▸ ${a.id}`));
      for (const step of a.install) if (runIn(a, step) !== 0) {
        failed++;
        break;
      }
      const dir = path.join(ROOT, a.dir);
      if (!existsSync(path.join(dir, ".env")) && existsSync(path.join(dir, ".env.example"))) console.log(yellow(`  Next: copy ${a.dir}/.env.example to .env and fill in the keys.`));
    }
    process.exit(failed ? 1 : 0);
  }
  case "test": {
    guardHost("run agent tests");
    if (!rest[0]) die("test <agent|all>");
    const results = targets(rest[0]).map((a) => (console.log(bold(`\n▸ ${a.id}: ${a.test}`)), [a.id, runIn(a, a.test)]));
    for (const [id, code] of results) console.log(`${code === 0 ? green("✓") : red("✗")} ${id}`);
    process.exit(results.some(([, code]) => code !== 0) ? 1 : 0);
  }
  case "run": {
    guardHost("run agents");
    if (!rest[0]) die("run <agent> [args…]");
    const a = agent(rest[0]);
    const args = argv.slice(argv.indexOf(rest[0]) + 1).filter((x) => x !== "--force");
    process.exit(runIn(a, a.command, args));
  }
  case "web": {
    guardHost("start web UIs");
    const a = agent(rest[0] ?? "");
    if (!a.web) die(`${a.id} has no web UI`);
    console.log(dim(`${a.web.url}`));
    spawn(a.web.command, { cwd: path.join(ROOT, a.dir), shell: true, stdio: "inherit" }).on("close", (code) => process.exit(code ?? 0));
    break;
  }
  case "pending":
  case "answer": {
    // Plain file protocol (same as dev-agent's `pending`/`answer`), so it also works in the Cowork VM.
    // Same folder as the agent: DEVAGENT_ASK_DIR, else <DEVAGENT_HOME>/ask, else workspace/dev/ask.
    const dev = agent("dev");
    const env = agentEnv(dev);
    const ask = env.DEVAGENT_ASK_DIR ? path.resolve(ROOT, dev.dir, env.DEVAGENT_ASK_DIR) : path.join(env.DEVAGENT_HOME ? path.resolve(ROOT, dev.dir, env.DEVAGENT_HOME) : path.join(workspaceDir({ env }), "dev"), "ask");
    const open = existsSync(ask)
      ? readdirSync(ask)
          .filter((f) => f.endsWith(".pending.json"))
          .map((f) => readJson(path.join(ask, f)))
          .filter((x) => x && !existsSync(path.join(ask, `${x.id}.answer.json`)))
          .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      : [];
    if (cmd === "pending") {
      console.log(JSON.stringify(open, null, 2));
      break;
    }
    const id = rest[0];
    const item = id && open.find((x) => x.id === id || x.id.startsWith(id));
    if (!item) die(`No open question with id ${id ?? "(none)"}. See: node scripts/agents.mjs pending`);
    const opt = (name) => {
      const i = argv.indexOf(name);
      return i >= 0 ? argv[i + 1] : undefined;
    };
    let payload;
    if (item.kind === "approval") {
      const decision = opt("--decision");
      const feedback = opt("--feedback");
      if (!["approve", "revise", "cancel"].includes(decision ?? "")) die("Plan approval: --decision approve | revise | cancel (with --feedback for revise)");
      if (decision === "revise" && !feedback?.trim()) die("--decision revise needs --feedback");
      payload = { decision, feedback };
    } else {
      let answers;
      try {
        answers = JSON.parse(opt("--json") ?? "");
      } catch {
        die(`Questions: --json '{"<questionId>": "<answer>", …}' (ids: ${item.questions.map((q) => q.id).join(", ")})`);
      }
      const missing = item.questions.filter((q) => !(q.id in answers)).map((q) => q.id);
      if (missing.length) die(`Missing answers for: ${missing.join(", ")}. Use "" to skip a question.`);
      for (const q of item.questions)
        if (q.secretEnv && typeof answers[q.id] === "string" && answers[q.id] && answers[q.id] !== "__in_secrets_file__")
          die(`Don't pass secret values through answers. Have ${q.secretEnv}=… added to ${item.secretsFile}, then answer "__in_secrets_file__".`);
      payload = { answers };
    }
    const file = path.join(ask, `${item.id}.answer.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(payload, null, 2));
    renameSync(`${file}.tmp`, file);
    console.log(green(`✓ Answered ${item.id} (${item.kind}, ${item.scope})`));
    break;
  }
  default:
    die(`Unknown command "${cmd}". Try: node scripts/agents.mjs help`);
}
