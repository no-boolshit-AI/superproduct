#!/usr/bin/env node
/**
 * Workspace helper: the folder that holds everything you make with the kit (see lib/workspace.mjs). Zero dependencies.
 *
 *   node scripts/workspace.mjs show [--json]                       where it is, what's in it, anything left in the old layout
 *   node scripts/workspace.mjs init [--no-git]                     create it (README, .gitignore, briefs/; a git repository unless --no-git)
 *   node scripts/workspace.mjs migrate [--dry-run] [--no-sessions] move product/, briefs/ and the agents' results from the old layout into it
 *
 * Location: $SUPERPRODUCT_WORKSPACE (absolute, or relative to the kit), else ./workspace, which may be a symlink.
 */
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigration, defaultClaudeDir, matchingSessions, planMigration } from "../lib/workspace-migrate.mjs";
import { KIT_ROOT, WORKSPACE_ENV, createWorkspace, workspaceDir } from "../lib/workspace.mjs";

const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1), dim = c(2), green = c(32), red = c(31), yellow = c(33);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const [cmd] = argv.filter((a) => !a.startsWith("--"));

/** The Cowork VM's home isn't the computer's, so Claude sessions there aren't the ones the agents made. */
const coworkVm = process.platform === "linux" && (os.homedir().startsWith("/sessions/") || /^\/sessions\/[^/]+\/mnt\//.test(KIT_ROOT));

const rel = (abs) => {
  const r = path.relative(KIT_ROOT, abs);
  return r && !r.startsWith("..") ? r : abs;
};
const list = (dir, skip = []) => (existsSync(dir) ? readdirSync(dir).filter((n) => !n.startsWith(".") && !skip.includes(n)) : []);

function git(dir, args) {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

/** What the workspace holds: counts per part, for `show`. */
function contents(dir) {
  const perAgent = (sub) => Object.fromEntries(list(path.join(dir, sub)).map((a) => [a, list(path.join(dir, sub, a)).length]));
  return {
    product: existsSync(path.join(dir, "product", "product.json")) ? JSON.parse(readFileSync(path.join(dir, "product", "product.json"), "utf8")).name ?? "?" : null,
    products: list(path.join(dir, "products")).length,
    briefs: list(path.join(dir, "briefs"), ["README.md"]).length,
    out: perAgent("out"),
    sites: list(path.join(dir, "sites"), ["node_modules", "package.json", "package-lock.json"]).length,
    dev: { projects: list(path.join(dir, "dev", "projects")).length, runs: list(path.join(dir, "dev", "runs")).flatMap((p) => list(path.join(dir, "dev", "runs", p))).length },
    references: perAgent("references"),
  };
}

function die(msg) {
  console.error(red(`✗ ${msg}`));
  process.exit(1);
}

switch (cmd) {
  case undefined:
  case "help": {
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    console.log(src.slice(src.indexOf(" *   node"), src.indexOf(" * Location")).replace(/^ \* ?/gm, ""));
    break;
  }

  case "show": {
    const configured = workspaceDir({ real: false });
    const dir = workspaceDir();
    const exists = existsSync(dir);
    const isGit = exists && existsSync(path.join(dir, ".git"));
    const info = {
      dir: configured,
      from: process.env[WORKSPACE_ENV]?.trim() ? WORKSPACE_ENV : "default",
      linkedTo: exists && lstatSync(configured).isSymbolicLink() ? dir : null,
      exists,
      git: isGit ? { remote: git(dir, ["remote", "get-url", "origin"]) || null, changes: git(dir, ["status", "--porcelain"]).split("\n").filter(Boolean).length } : null,
      contents: exists ? contents(dir) : null,
      oldLayout: planMigration({ workspace: dir }).filter((s) => s.action === "move").map((s) => rel(s.from)),
    };
    if (flag("--json")) {
      console.log(JSON.stringify(info, null, 2));
      break;
    }
    console.log(`${bold("Workspace")} ${rel(configured)}/${info.linkedTo ? dim(` → ${info.linkedTo}`) : ""}${info.from !== "default" ? dim(` (from $${WORKSPACE_ENV})`) : ""}`);
    if (!exists) console.log(yellow("  doesn't exist yet: node scripts/workspace.mjs init"));
    else {
      const g = info.git;
      console.log(dim(`  ${g ? `git repository · ${g.remote ? `origin ${g.remote}` : "no remote yet"} · ${g.changes} uncommitted change(s)` : "not a git repository (node scripts/workspace.mjs init adds one)"}`));
      const k = info.contents;
      const agents = (o) => Object.entries(o).map(([a, n]) => `${a} ${n}`).join(", ") || "none";
      console.log(`  product/      ${k.product ?? dim("none (node scripts/product.mjs init --name … --website …)")}`);
      console.log(`  products/     ${k.products}`);
      console.log(`  briefs/       ${k.briefs}`);
      console.log(`  out/          ${agents(k.out)}`);
      console.log(`  sites/        ${k.sites}`);
      console.log(`  dev/          ${k.dev.projects} project(s), ${k.dev.runs} run(s)`);
      console.log(`  references/   ${agents(k.references)}`);
    }
    if (info.oldLayout.length) console.log(yellow(`! ${info.oldLayout.length} item(s) still in the old layout (${info.oldLayout.slice(0, 3).join(", ")}${info.oldLayout.length > 3 ? ", …" : ""}): node scripts/workspace.mjs migrate`));
    break;
  }

  case "init": {
    const dir = workspaceDir();
    const created = createWorkspace({ dir, git: !flag("--no-git") });
    console.log(created.length ? green(`✓ ${rel(dir)}/: created ${created.join(", ")}`) : dim(`· ${rel(dir)}/ already has everything`));
    if (existsSync(path.join(dir, ".git")) && !git(dir, ["remote", "get-url", "origin"]))
      console.log(dim(`To keep it in a private repository: cd ${rel(dir)} && git remote add origin <your private repo> && git add -A && git commit -m "Workspace" && git push -u origin HEAD`));
    const left = planMigration({ workspace: dir }).filter((s) => s.action === "move").length;
    if (left) console.log(yellow(`! ${left} item(s) still in the old layout: node scripts/workspace.mjs migrate --dry-run`));
    break;
  }

  case "migrate": {
    const dir = workspaceDir();
    const plan = planMigration({ workspace: dir });
    if (!plan.length) {
      console.log(green(`✓ Nothing left in the old layout; everything is in ${rel(dir)}/.`));
      break;
    }
    const claudeDir = flag("--no-sessions") || coworkVm ? null : defaultClaudeDir();
    const sessionNames = claudeDir && existsSync(path.join(claudeDir, "projects")) ? readdirSync(path.join(claudeDir, "projects")) : [];
    if (flag("--dry-run")) {
      console.log(bold(`Would move into ${rel(dir)}/:`));
      for (const s of plan) {
        const n = s.sessions ? matchingSessions(realpathSync(s.from), sessionNames).length : 0;
        const what = `${rel(s.from)} → ${rel(s.to)}${s.action === "copy" ? dim(" (copy)") : ""}${n ? dim(` + ${n} Claude session folder(s)`) : ""}`;
        console.log(s.conflict ? yellow(`  ! ${what}: already exists there, would be skipped`) : `  ${what}`);
      }
      console.log(dim(`Nothing is deleted or overwritten. Run it without --dry-run when no agent is running.`));
      break;
    }
    if (coworkVm && !flag("--no-sessions")) console.log(dim("(Cowork VM: Claude's sessions are on your computer; run it there to keep --revise working on moved jobs)"));
    const created = createWorkspace({ dir, git: !flag("--no-git") });
    if (created.length) console.log(green(`✓ ${rel(dir)}/: created ${created.join(", ")}`));
    let moved = 0, copied = 0, skipped = 0, sessions = 0;
    for (const r of applyMigration(plan, { claudeDir })) {
      if (r.done === "skipped") {
        skipped++;
        console.log(yellow(`  ! ${rel(r.from)}: ${rel(r.to)} already exists, left where it is`));
        continue;
      }
      if (r.done === "copied") copied++;
      else moved++;
      sessions += r.sessions.length;
      console.log(`  ${green("✓")} ${rel(r.from)} → ${rel(r.to)}${r.done === "copied" ? dim(" (copied)") : ""}${r.sessions.length ? dim(` + ${r.sessions.length} Claude session folder(s)`) : ""}`);
    }
    console.log(`${green(`✓ ${moved} moved${copied ? `, ${copied} copied` : ""}`)}${skipped ? yellow(` · ${skipped} skipped (move or merge those by hand)`) : ""}${sessions ? dim(` · ${sessions} Claude session folder(s) copied so --revise keeps working`) : ""}`);
    console.log(dim("The emptied folders stay where they were. Next: node scripts/agents.mjs status"));
    if (skipped) process.exitCode = 1;
    break;
  }

  default:
    die(`Unknown command "${cmd}". Try: node scripts/workspace.mjs help`);
}
