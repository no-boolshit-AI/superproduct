/**
 * workspace-migrate.mjs: move your material from the old layout into the workspace (Node 20+, zero dependencies).
 *
 * Before the workspace, it sat next to the kit's code: product/, products/, products-archive/ and briefs/ at the top,
 * and each agent's results inside the agent's folder. planMigration lists the moves; applyMigration makes them (a
 * rename, or copy + remove across disks) and never overwrites anything: a move whose destination exists is skipped.
 *
 * Collage-post, deck, explainer and dev-agent run Claude with a job folder as working directory, and Claude Code keeps
 * each session under ~/.claude/projects/<that path>. A moved job would lose its session, and with it --revise and
 * resume, so applyMigration also copies those session folders to the new path. The originals stay.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { KIT_ROOT, workspaceDir } from "./workspace.mjs";

/**
 * The old locations, relative to the kit, and where their contents go, relative to the workspace. Each entry inside
 * `from` moves on its own (so it merges into a workspace that has content already), except `whole` ones.
 * keep: entries that belong to the kit and stay. copy: kit files the destination needs a copy of.
 * skip: test and demo output that stays with the kit. sessions: Claude ran with these folders as working directory.
 */
export const LEGACY = [
  { from: "product", to: "product", whole: true },
  { from: "products", to: "products" },
  { from: "products-archive", to: "products-archive" },
  { from: "briefs", to: "briefs", keep: ["README.md"] },
  { from: "agents/carousel-agent/out", to: "out/carousel", skip: /-smoke(-product)?$|^demo-/ },
  { from: "agents/collage-post-agent/output", to: "out/collage-post", sessions: true },
  { from: "agents/collage-post-agent/reference", to: "references/collage-post" },
  { from: "agents/deck-agent/out", to: "out/deck", sessions: true },
  { from: "agents/explainer-agent/out", to: "out/explainer", sessions: true },
  { from: "agents/landing-page-agent/sites", to: "sites", keep: ["package.json", "package-lock.json"], copy: ["package.json", "package-lock.json"] },
  { from: "agents/dev-agent/projects", to: "dev/projects", sessions: true },
  { from: "agents/dev-agent/runs", to: "dev/runs", sessions: true },
  { from: "agents/dev-agent/cache", to: "dev/cache" },
  { from: "agents/dev-agent/ask", to: "dev/ask" },
];

const isJunk = (name) => name === ".DS_Store";

/**
 * The steps that bring the old layout into the workspace: [{ from, to, action: "move" | "copy", sessions, conflict }],
 * absolute paths. An empty list means there is nothing left in the old layout.
 */
export function planMigration({ kit = KIT_ROOT, workspace = workspaceDir() } = {}) {
  const plan = [];
  for (const l of LEGACY) {
    const src = path.join(kit, l.from);
    if (!existsSync(src)) continue;
    const dst = path.join(workspace, l.to);
    const step = (from, to, action = "move") => ({ from, to, action, sessions: !!l.sessions && action === "move", conflict: existsSync(to) });
    if (l.whole) {
      if (readdirSync(src).some((n) => !isJunk(n))) plan.push(step(src, dst));
      continue;
    }
    const moves = readdirSync(src)
      .sort()
      .filter((n) => !isJunk(n) && !l.keep?.includes(n) && !l.skip?.test(n))
      .map((n) => step(path.join(src, n), path.join(dst, n)));
    if (!moves.length) continue;
    plan.push(...moves);
    for (const n of l.copy ?? []) if (existsSync(path.join(src, n)) && !existsSync(path.join(dst, n))) plan.push(step(path.join(src, n), path.join(dst, n), "copy"));
  }
  return plan;
}

/** Claude Code's config folder ($CLAUDE_CONFIG_DIR, else ~/.claude). */
export const defaultClaudeDir = (env = process.env) => env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), ".claude");

/** Claude Code's folder name for a working directory: every character other than a letter or digit becomes "-". */
export const sessionKey = (abs) => abs.replace(/[^a-zA-Z0-9]/g, "-");

/**
 * Carry out a plan. Returns its steps, each with `done` ("moved", "copied" or "skipped" when the destination exists)
 * and `sessions` (the session folders copied for it). `claudeDir: null` leaves Claude's sessions alone.
 */
export function applyMigration(plan, { claudeDir = defaultClaudeDir() } = {}) {
  const projects = claudeDir && existsSync(path.join(claudeDir, "projects")) ? path.join(claudeDir, "projects") : null;
  const names = projects ? readdirSync(projects) : [];
  return plan.map((s) => {
    if (existsSync(s.to)) return { ...s, done: "skipped", sessions: [] };
    mkdirSync(path.dirname(s.to), { recursive: true });
    if (s.action === "copy") {
      cpSync(s.from, s.to, { recursive: true });
      return { ...s, done: "copied", sessions: [] };
    }
    // Claude saw the physical path (getcwd resolves symlinks), so match sessions on real paths
    const before = realpathSync(s.from);
    move(s.from, s.to);
    return { ...s, done: "moved", sessions: s.sessions && projects ? copySessions(before, realpathSync(s.to), projects, names) : [] };
  });
}

function move(from, to) {
  try {
    renameSync(from, to);
  } catch (e) {
    if (e.code !== "EXDEV") throw e;
    // another disk: copy, then remove the original
    cpSync(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    rmSync(from, { recursive: true, force: true });
  }
}

/** Claude's session folders (names in <claudeDir>/projects) for `abs` and every folder below it (a job's project/). */
export function matchingSessions(abs, names) {
  const key = sessionKey(abs);
  return names.filter((n) => n === key || n.startsWith(`${key}-`));
}

/** Copy the session folders of `fromAbs` to the names Claude will look for at the moved path. */
function copySessions(fromAbs, toAbs, projects, names) {
  const oldKey = sessionKey(fromAbs);
  const newKey = sessionKey(toAbs);
  const copied = [];
  for (const name of matchingSessions(fromAbs, names)) {
    const target = newKey + name.slice(oldKey.length);
    // Claude Code shortens and hashes names over 200 characters; those can't be predicted here
    if (target.length > 200 || existsSync(path.join(projects, target))) continue;
    cpSync(path.join(projects, name), path.join(projects, target), { recursive: true });
    copied.push(target);
  }
  return copied;
}
