#!/usr/bin/env node
/**
 * Helper for the main agent (and humans) in this folder. Zero dependencies, Node 20+.
 *
 *   node scripts/agents.mjs setup [agent…] [--json]   first time, or something missing: checks this computer and the agents, says what Claude can install and what needs you
 *   node scripts/agents.mjs init                      once, on your computer: link skills/ into .claude/skills + permissions, create workspace/ (setup does this too)
 *   node scripts/agents.mjs list                      agents, what they do, how to run them
 *   node scripts/agents.mjs status [agent] [--json]   installed? keys present? Chromium/Docker/FFmpeg? latest output; every problem with its fix
 *   node scripts/agents.mjs outputs [agent] [-n 5] [--json]   latest results with their key files
 *   node scripts/agents.mjs install <agent…|all>      npm install + setup steps, then the agent's .env (on your computer, not in the Cowork VM)
 *   node scripts/agents.mjs keys [--json]             the keys: what each is for, how to get it, which agents need it, where it's set (names only)
 *   node scripts/agents.mjs keys ask <NAME> [agent…]  opens the key's web page and a Terminal window that asks for the key (macOS; elsewhere prints the steps)
 *   node scripts/agents.mjs keys set <NAME> [agent…]  saves a key in every agent that needs it: asks for it (hidden), or reads it from stdin
 *   node scripts/agents.mjs keys remove <NAME> [agent…]   empties it again
 *   node scripts/agents.mjs test <agent|all>          zero-cost test of an agent (no Claude spend)
 *   node scripts/agents.mjs run <agent> [args…]       run the agent's main command with args
 *   node scripts/agents.mjs web <agent>               start the agent's web UI
 *   node scripts/agents.mjs pending                   dev-agent relay: open questions/approvals (JSON)
 *   node scripts/agents.mjs answer <id> [args…]       dev-agent relay: answer one (same flags as the dev-agent CLI)
 *   node scripts/dashboard.mjs [--open]               the same in your browser, with results and setup (keys, installs)
 *
 * Everything the agents make, and the product they work for, lives in the workspace (workspace/, see
 * lib/workspace.mjs and node scripts/workspace.mjs show | init | migrate). `status` shows it and the product;
 * node scripts/product.mjs show | check | context <agent> | tokens | index | init   manages the product.
 *
 * It never prints secret values: `status` and `keys` only report which variable names are set.
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLAUDE_KEYS, KEYS, REGISTRY, age, agentEnv, agentPath, askDir, coworkVm, findAgent, keyLabel, listPending, nodeMajor, nodeMinor, outputsOf, probeTools, productStatus, statusOf, toolFix, workspaceStatus, writeAnswer } from "../lib/agents.mjs";
import { ensureEnvFile, writeEnvValue } from "../lib/env-file.mjs";
import { planMigration } from "../lib/workspace-migrate.mjs";
import { KIT_ROOT as ROOT, createWorkspace, workspaceDir } from "../lib/workspace.mjs";

const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1), dim = c(2), green = c(32), red = c(31), yellow = c(33);

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const json = flags.has("--json");

const mac = process.platform === "darwin";
const win = process.platform === "win32";
/** What's installed on this computer, checked when first asked (lib/agents.mjs). */
const tools = probeTools();

function agent(id) {
  const a = findAgent(id);
  if (!a) die(`Unknown agent "${id}". Agents: ${REGISTRY.map((x) => x.id).join(", ")}`);
  return a;
}
function targets(ids) {
  ids = [ids].flat().filter(Boolean);
  return !ids.length || ids.includes("all") ? REGISTRY : ids.map(agent);
}
function die(msg) {
  console.error(red(`✗ ${msg}`));
  process.exit(1);
}

function guardHost(action) {
  if (coworkVm && !flags.has("--force"))
    die(`Don't ${action} from the Cowork VM: the agents run on the user's computer (Chromium, Docker, native binaries in node_modules). Give the user the command to paste into Terminal there. --force overrides.`);
}

/** Node, git, Homebrew, Claude Code, and Docker/FFmpeg when one of the agents needs them. Fixes only where no agent row has one. */
function computerChecks(list) {
  if (coworkVm) return [];
  const needs = (n) => list.some((a) => a.needs.includes(n));
  const nodeOk = nodeMajor > 20 || (nodeMajor === 20 && nodeMinor >= 12);
  const out = [
    { name: "Node", ok: nodeOk, detail: nodeOk ? process.versions.node : `${process.versions.node}, needs 20.12 or newer`, ...(!nodeOk && { topic: "node", problem: "Node is too old", ...toolFix("node", tools) }) },
    { name: "git", ok: tools.git, ...(!tools.git && { topic: "git", problem: "git isn't installed", ...toolFix("git", tools) }) },
  ];
  if (mac) out.push({ name: "Homebrew", ok: tools.brew, optional: true, detail: tools.brew ? "" : "not installed (optional: lets Claude install FFmpeg, Node and other free tools · https://brew.sh)" });
  const cc = tools.claudeCode;
  out.push({ name: "Claude Code", ok: cc === "logged-in" || cc === "unknown", optional: true, detail: { "logged-in": "logged in", unknown: "found (login not checked)", "logged-out": "not logged in", missing: "not found (fine if you use API keys)" }[cc] });
  if (needs("docker")) out.push({ name: "Docker Desktop", ok: tools.docker, detail: !tools.dockerInstalled ? "not installed" : tools.docker ? "running" : "installed, not running" });
  if (needs("ffmpeg")) out.push({ name: "FFmpeg", ok: tools.ffmpeg, detail: tools.ffmpeg ? "" : "not installed" });
  return out;
}

/** One to-do list from the computer, the agents and the product: the same fix once, with the agents it's for; one install command for all. */
function todoList(computer, rows, product) {
  const items = new Map();
  const add = (f, agentId) => {
    const item = items.get(f.fix) ?? { by: f.by, topic: f.topic, key: f.key, problem: f.problem, fix: f.fix, agents: [] };
    if (agentId) item.agents.push(agentId);
    items.set(f.fix, item);
  };
  for (const c of computer) if (!c.ok && c.fix) add(c);
  for (const r of rows) for (const f of r.fixes) add(f, r.id);
  const installs = [...items.values()].filter((i) => i.topic === "install");
  for (const i of installs) items.delete(i.fix);
  const ids = [...new Set(installs.flatMap((i) => i.agents))];
  const todo = [...items.values()];
  if (ids.length) todo.unshift({ by: "claude", topic: "install", problem: `install ${ids.join(", ")} (a few minutes each; downloads what they draw and render with)`, fix: `node scripts/agents.mjs install ${ids.join(" ")}`, agents: ids });
  if (product && !product.dir)
    todo.push({ by: "you", topic: "product", problem: "no product folder yet: the brand, voice and facts the agents work from", fix: 'tell Claude your website and share any documents: "Set up our product from <website>"', agents: [] });
  return todo;
}

/** Optional keys not set, once each, with the agents that would use them. */
function optionalKeys(rows) {
  const by = new Map();
  for (const r of rows) for (const k of r.optionalMissing) by.set(k, [...(by.get(k) ?? []), r.id]);
  return [...by].map(([key, agents]) => ({ key, label: keyLabel(key), for: KEYS[key]?.for ?? "", agents }));
}

/** How an agent uses a key: "needed", "either" (one of the two Claude keys), "optional", "login" (a Claude key where the Claude Code login works too) or null. */
function keyRole(a, name) {
  if (CLAUDE_KEYS.includes(name)) {
    if (a.claudeAuth === "key") return name === "ANTHROPIC_API_KEY" ? "needed" : null;
    if (a.claudeAuth === "token-or-key") return "either";
    return a.claudeAuth === "login-or-key" ? "login" : null;
  }
  return a.env.required.includes(name) ? "needed" : a.env.optional.includes(name) ? "optional" : null;
}

/**
 * Where `keys set` puts a key by default: every agent that reads it, but a Claude key skips agents that already have
 * Claude: through the Claude Code login, or (dev) through the other Claude key. It would change how they're billed.
 */
function keyTargets(name) {
  const loginWorks = !["logged-out", "missing"].includes(tools.claudeCode);
  return REGISTRY.filter((a) => {
    const role = keyRole(a, name);
    if (role === "login") return !loginWorks;
    if (role === "either") return !CLAUDE_KEYS.some((k) => k !== name && agentEnv(a)[k]);
    return !!role;
  });
}

/** What the key is for, what it costs and the steps to get one. */
function printHow(name, list) {
  const k = KEYS[name];
  if (!k) return;
  console.log(`${bold(k.label)} ${dim(`(${name})`)}${list.length ? ` for ${list.map((a) => a.id).join(", ")}` : ""}`);
  console.log(dim(`${k.for} · cost: ${k.cost}`));
  console.log("How to get it:");
  k.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
}

/** A value typed or pasted at the prompt (hidden unless `visible`), or piped on stdin. Never echoed back. */
function readValue(prompt, visible) {
  const stdin = process.stdin;
  return new Promise((resolve) => {
    let value = "";
    stdin.setEncoding("utf8");
    if (!stdin.isTTY) {
      // piped in; a stdin that never sends anything (no terminal) counts as nothing after 10 s
      const idle = setTimeout(() => (stdin.destroy(), resolve(value)), 10000);
      stdin.on("data", (d) => (value += d)).on("end", () => (clearTimeout(idle), resolve(value)));
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.off("data", onData);
          stdin.pause();
          process.stdout.write(visible ? "\n" : dim(value ? "(received)\n" : "\n"));
          return resolve(value);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value && visible) process.stdout.write("\b \b");
          value = value.slice(0, -1);
        } else if (ch >= " ") {
          value += ch;
          if (visible) process.stdout.write(ch);
        }
      }
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

const shq = (s) => (/^[\w./:=@%+-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

function openUrl(url) {
  const [cmd, ...args] = mac ? ["open", url] : win ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
}

/** macOS: a new Terminal window running `command`, in front. */
function openTerminal(command) {
  const script = `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(command)}\nend tell`;
  return mac && spawnSync("osascript", ["-e", script], { stdio: "ignore" }).status === 0;
}

/**
 * Link skills/ into .claude/skills (Claude Code finds project skills there; skills/ is the canonical copy, also read by
 * Cowork), add .claude/settings.json and create the workspace. Returns [kind, text] lines: "done", "same" or "warn".
 */
function initKit() {
  const lines = [];
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
    lines.push(["done", ".claude/skills → ../skills"]);
  } else if (st.isSymbolicLink()) lines.push(["same", ".claude/skills already linked"]);
  else lines.push(["warn", ".claude/skills is a real folder; skills/ is the canonical copy, merge by hand if needed"]);
  const settings = path.join(dotClaude, "settings.json");
  if (!existsSync(settings)) {
    copyFileSync(path.join(ROOT, "scripts", "claude-settings.json"), settings);
    lines.push(["done", ".claude/settings.json (read-only helper commands allowed, .env reads denied)"]);
  } else lines.push(["same", ".claude/settings.json exists; compare with scripts/claude-settings.json"]);
  // The workspace holds the product, briefs and results; it's its own git repository, outside the kit's
  const ws = workspaceDir();
  const created = createWorkspace({ dir: ws });
  lines.push(created.length ? ["done", `${path.relative(ROOT, ws) || ws}/ (${created.join(", ")})`] : ["same", `${path.relative(ROOT, ws) || ws}/ exists`]);
  const old = planMigration({ workspace: ws }).filter((s) => s.action === "move").length;
  if (old) lines.push(["warn", `${old} item(s) still in the old layout (product/, briefs/, agents' results): node scripts/workspace.mjs migrate --dry-run`]);
  return lines;
}
const printInit = (lines) => lines.forEach(([kind, text]) => console.log(kind === "done" ? green(`✓ ${text}`) : kind === "warn" ? yellow(`! ${text}`) : dim(`· ${text}`)));

function runIn(a, cmd, extra = []) {
  const full = [cmd, ...extra.map(shq)].join(" ");
  console.log(dim(`$ cd ${a.dir} && ${full}`));
  const r = spawnSync(full, { cwd: agentPath(a), shell: true, stdio: "inherit" });
  return r.status ?? 1;
}

const [cmd, ...rest] = argv.filter((x) => !["--json", "--force", "--window"].includes(x));

switch (cmd) {
  case undefined:
  case "help":
  case "--help": {
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    console.log(src.slice(src.indexOf(" *   node"), src.indexOf(" * It never")).replace(/^ \* ?/gm, ""));
    break;
  }
  case "init": {
    printInit(initKit());
    break;
  }
  case "setup": {
    const list = targets(rest);
    const did = coworkVm ? [] : initKit().filter(([kind]) => kind !== "same");
    for (const a of list) if (ensureEnvFile(agentPath(a))) did.push(["done", `${a.dir}/.env (its settings, from .env.example)`]);
    const rows = list.map((a) => statusOf(a, { tools }));
    const computer = computerChecks(list);
    const product = productStatus();
    const todo = todoList(computer, rows, product);
    // a key that is a to-do for one agent and optional for others is one step: the to-do, which saves it for all of them
    const optional = [];
    for (const o of optionalKeys(rows)) {
      const t = todo.find((x) => x.key === o.key);
      if (t) t.alsoFor = o.agents;
      else optional.push(o);
    }
    if (json) {
      console.log(JSON.stringify({ cowork: coworkVm, done: did.map(([, text]) => text), computer, product, agents: rows, todo, optional }, null, 2));
      break;
    }
    printInit(did);
    if (computer.length) {
      console.log(bold("\nThis computer"));
      for (const x of computer) console.log(`  ${x.ok ? green("✓") : x.optional ? yellow("·") : red("✗")} ${x.name}${x.detail ? dim(`  ${x.detail}`) : ""}`);
    } else console.log(dim("\n(Cowork VM: the computer's programs and Claude login aren't checked from here)"));
    console.log(bold("\nYour product"));
    console.log(`  ${product.ok === false ? red("✗") : product.ok ? green("✓") : yellow("·")} ${product.name ? `${product.name} ${dim(`(${product.dir}/)`)}` : dim(product.summary)}`);
    console.log(bold("\nAgents"));
    for (const r of rows) console.log(`  ${r.ready ? green("✓") : red("✗")} ${r.id.padEnd(13)} ${r.ready ? green("ready") : yellow(r.problems.join(" · "))}`);
    let n = 0;
    const show = (t) => {
      const who = t.agents.length && t.topic !== "install" ? `${[...new Set(t.agents)].join(", ")}: ` : "";
      console.log(`  ${++n}. ${who}${t.problem}${t.alsoFor ? dim(` (also used by ${t.alsoFor.join(", ")})`) : ""}`);
      console.log(`     ${dim("→")} ${t.fix}`);
    };
    const mine = todo.filter((t) => t.by === "claude");
    const yours = todo.filter((t) => t.by === "you");
    if (mine.length) console.log(bold(coworkVm ? "\nTo do: run these in Terminal on your computer" : "\nTo do: Claude can do these for you (it asks first)"));
    mine.forEach(show);
    if (yours.length) console.log(bold("\nTo do: these need you"));
    yours.forEach(show);
    if (optional.length) {
      console.log(bold("\nOptional extras"));
      for (const o of optional) console.log(`  · ${o.label}: ${o.for.split(/\.\s/)[0]} ${dim(`(${o.agents.join(", ")}) → keys ask ${o.key}`)}`);
    }
    if (todo.some((t) => t.topic === "key") || optional.length)
      console.log(dim("\nkeys ask opens the key's web page and a small Terminal window to paste it into, so the key never goes through the chat."));
    if (!todo.length) console.log(green("\n✓ All set. Ask Claude for a LinkedIn carousel, a collage post, a deck, an explainer video, a landing page or a feature in your app."));
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
    const rows = targets(rest[0]).map((a) => statusOf(a, { tools }));
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
      console.log(`${r.ready ? green("✓") : red("✗")} ${bold(r.id.padEnd(13))} ${r.ready ? green("ready") : yellow("needs setup")}`);
      for (const f of r.fixes) console.log(`  ${"".padEnd(13)} ${yellow("·")} ${f.problem} ${dim("→")} ${f.fix}`);
      const bits = [r.claude ? `Claude: ${r.claude}` : null, r.optionalMissing.length ? `optional not set: ${r.optionalMissing.join(", ")}` : null, r.latest ? `latest: ${r.latest.id} (${r.latest.status ?? "?"}, ${r.latest.age})` : "no outputs yet"].filter(Boolean);
      console.log(dim(`  ${"".padEnd(13)} ${bits.join(" · ")}`));
    }
    if (rows.some((r) => !r.ready)) console.log(dim("\nClaude can set these up for you (it asks first). The full list, with what needs you: node scripts/agents.mjs setup"));
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
    if (!rest.length) die("install <agent…|all>");
    let failed = 0;
    for (const a of targets(rest)) {
      console.log(bold(`\n▸ ${a.id}`) + dim(` · ${a.title}`));
      if (a.needs.includes("node22") && nodeMajor < 22) {
        console.log(red(`✗ ${a.id} needs Node 22 or newer; this computer has ${process.versions.node}. Fix: ${toolFix("node", tools).fix}`));
        failed++;
        continue;
      }
      const stopped = a.install.find((step) => runIn(a, step) !== 0);
      if (stopped) {
        console.log(red(`✗ ${a.id}: stopped at "${stopped}" (the error is above). A network hiccup is the usual cause: run the same install again.`));
        failed++;
        continue;
      }
      if (ensureEnvFile(agentPath(a))) console.log(dim(`  created ${a.dir}/.env, its settings, from .env.example`));
      const r = statusOf(a, { tools });
      console.log(r.ready ? green(`✓ ${a.id} installed and ready`) : yellow(`✓ ${a.id} installed. Still needed:`));
      for (const f of r.fixes) console.log(`    · ${f.problem} ${dim("→")} ${f.fix}`);
    }
    process.exit(failed ? 1 : 0);
  }
  case "keys": {
    const [sub = "list", name, ...ids] = rest;
    if (sub === "list") {
      const envs = new Map(REGISTRY.map((a) => [a.id, agentEnv(a)]));
      const report = Object.entries(KEYS).map(([key, k]) => {
        const agents = REGISTRY.map((a) => ({ id: a.id, role: keyRole(a, key), set: !!envs.get(a.id)[key] })).filter((x) => x.role);
        // dev takes either Claude key, so the other one also counts
        for (const x of agents) if (x.role === "either") x.ok = x.set || CLAUDE_KEYS.some((ck) => envs.get(x.id)[ck]);
        return { name: key, ...k, agents };
      });
      if (json) {
        console.log(JSON.stringify(report, null, 2));
        break;
      }
      console.log(dim("Keys the agents use (names only; values are never shown)\n"));
      for (const r of report) {
        const missing = r.agents.filter((x) => (x.role === "needed" && !x.set) || (x.role === "either" && !x.ok)).map((x) => x.id);
        const setFor = r.agents.filter((x) => x.set).map((x) => x.id);
        const needed = r.agents.filter((x) => x.role === "needed" || x.role === "either").map((x) => x.id);
        const optional = r.agents.filter((x) => x.role === "optional" || x.role === "login").map((x) => x.id);
        console.log(`${missing.length ? red("✗") : setFor.length ? green("✓") : dim("·")} ${bold(r.label)} ${dim(r.name)}`);
        console.log(dim(`    ${r.for}`));
        console.log(`    ${[needed.length ? `needed by ${needed.join(", ")}` : null, optional.length ? `optional for ${optional.join(", ")}` : null].filter(Boolean).join(" · ")}`);
        console.log(`    set for: ${setFor.join(", ") || "none"}${missing.length ? red(` · missing for ${missing.join(", ")}`) : ""}`);
        console.log(dim(`    get it: ${r.open ?? r.run ?? r.steps[0]} · cost: ${r.cost}`));
      }
      console.log(`\nAdd one: ${bold("node scripts/agents.mjs keys ask <NAME>")} opens its web page and a window to paste it into.`);
      console.log(dim("Or, in a terminal: node scripts/agents.mjs keys set <NAME>  (shows the steps, then asks for the key)."));
      break;
    }
    if (!["ask", "set", "remove"].includes(sub)) die("keys | keys ask <NAME> | keys set <NAME> [agent…] | keys remove <NAME> [agent…]");
    // Never echo what comes after "keys set": a value pasted in the wrong place would end up on screen
    if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) die(`keys ${sub} takes the key's NAME (${Object.keys(KEYS).join(", ")}); the key itself is typed or pasted when asked.`);
    if (ids.some((id) => !REGISTRY.some((a) => a.id === id))) die(`After the NAME come only agent ids (${REGISTRY.map((a) => a.id).join(", ")}). The key itself is typed or pasted when asked, never put on the command line.`);
    if (!KEYS[name] && !ids.length) die(`${name} isn't one of the keys (${Object.keys(KEYS).join(", ")}). For another setting, name the agents: keys ${sub} ${name} <agent…>`);
    const list = ids.length ? ids.map(agent) : sub === "remove" ? REGISTRY.filter((a) => keyRole(a, name)) : keyTargets(name);
    if (!list.length) {
      const reads = REGISTRY.filter((a) => keyRole(a, name));
      const readers = (reads.some((a) => keyRole(a, name) !== "login") ? reads.filter((a) => keyRole(a, name) !== "login") : reads).map((a) => a.id);
      die(readers.length ? `${readers.join(", ")} already ${readers.length > 1 ? "have" : "has"} Claude through another login or key. To use ${name} anyway, name the agents: keys ${sub} ${name} ${readers.join(" ")}` : `No agent uses ${name}.`);
    }
    const info = KEYS[name] ?? {};
    if (sub === "ask") {
      const setCmd = `node scripts/agents.mjs keys set ${name}${ids.length ? ` ${ids.join(" ")}` : ""}`;
      printHow(name, list);
      if (coworkVm) {
        console.log(`\nThe Cowork VM can't open windows on the computer. Have the user open Terminal there and run:\n  cd <this folder on their computer> && ${info.run ? `${info.run}; ` : ""}${setCmd}`);
        if (info.open) console.log(`Key page: ${info.open}`);
        break;
      }
      const page = info.open && openUrl(info.open);
      const term = openTerminal(`clear; cd ${shq(ROOT)} && ${info.run ? `${info.run}; ` : ""}${shq(process.execPath)} scripts/agents.mjs keys set ${name}${ids.length ? ` ${ids.join(" ")}` : ""} --window`);
      console.log("");
      if (page) console.log(green(`✓ Opened ${info.open} in the browser`));
      else if (info.open) console.log(`Key page: ${info.open}`);
      if (term) console.log(green(`✓ Opened a Terminal window that ${info.run ? `runs ${info.run}, then ` : ""}asks for the key (hidden) and saves it`));
      else console.log(`Open a terminal in this folder and run: ${info.run ? `${info.run}; ` : ""}${setCmd}`);
      console.log(dim("Then: node scripts/agents.mjs keys   to check it's set."));
      break;
    }
    let value = "";
    if (sub === "set") {
      if (process.stdin.isTTY) {
        printHow(name, list);
        console.log("");
      }
      value = (await readValue(info.secret === false ? "Type it and press Enter: " : "Paste the key and press Enter (nothing shows while you paste): ", info.secret === false)).trim();
      value = value.replace(new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*`), "").replace(/^(["'])(.*)\1$/, "$2").trim();
      if (!value) die("Nothing received, so nothing was saved. Run it in a terminal to paste the key, or pipe it in: printf '%s' '<key>' | node scripts/agents.mjs keys set " + name);
      if (info.prefix && !info.prefix.some((p) => value.startsWith(p)))
        console.log(yellow(`! That doesn't look like a ${info.label} (those start with ${info.prefix.join(" or ")}). Saved anyway; if the agent can't sign in, set it again.`));
    }
    for (const a of list) writeEnvValue(agentPath(a), name, value);
    const where = list.map((a) => a.id).join(", ");
    console.log(green(sub === "set" ? `✓ ${keyLabel(name)} saved for ${where}` : `✓ ${name} emptied for ${where}`));
    const skipped = sub === "set" && !ids.length ? REGISTRY.filter((a) => keyRole(a, name) === "login" && !list.includes(a)) : [];
    if (skipped.length) console.log(dim(`  ${skipped.map((a) => a.id).join(", ")} keep using your Claude Code login. To bill one of them to this key instead: keys set ${name} <agent>`));
    if (flags.has("--window")) console.log(`\nDone. You can close this window and go back to Claude.`);
    break;
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
    spawn(a.web.command, { cwd: agentPath(a), shell: true, stdio: "inherit" }).on("close", (code) => process.exit(code ?? 0));
    break;
  }
  case "pending":
  case "answer": {
    // Plain file protocol (same as dev-agent's `pending`/`answer`), so it also works in the Cowork VM.
    // Same folder as the agent: DEVAGENT_ASK_DIR, else <DEVAGENT_HOME>/ask, else workspace/dev/ask.
    agent("dev");
    const ask = askDir();
    if (cmd === "pending") {
      console.log(JSON.stringify(listPending(ask), null, 2));
      break;
    }
    const opt = (name) => {
      const i = argv.indexOf(name);
      return i >= 0 ? argv[i + 1] : undefined;
    };
    let answers;
    try {
      answers = JSON.parse(opt("--json") ?? "");
    } catch {
      /* writeAnswer says what questions expect */
    }
    try {
      const item = writeAnswer(rest[0], { decision: opt("--decision"), feedback: opt("--feedback"), answers }, ask);
      console.log(green(`✓ Answered ${item.id} (${item.kind}, ${item.scope})`));
    } catch (e) {
      die(e.message);
    }
    break;
  }
  default:
    die(`Unknown command "${cmd}". Try: node scripts/agents.mjs help`);
}
