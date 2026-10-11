/**
 * workspace.mjs: where everything you make with the kit lives (Node 20+, ESM, zero dependencies).
 *
 * The kit (this repository) is code, templates and docs, and it is public. Everything that is yours lives in one
 * folder, the workspace, which the kit's .gitignore leaves out and which is meant to be its own private repository:
 *
 *   workspace/
 *   ├─ product/              the product the agents work for (spec: templates/product/README.md)
 *   ├─ products/             other products or clients (--product <id>)
 *   ├─ products-archive/     products replaced by `node scripts/product.mjs init --archive`
 *   ├─ briefs/               briefs and campaign records
 *   ├─ out/<agent>/          results of carousel, collage-post, deck and explainer
 *   ├─ sites/                landing pages (sources, static builds, their shared node_modules)
 *   ├─ dev/                  dev-agent: projects/, runs/, cache/, ask/
 *   └─ references/<agent>/   your reference images (collage-post)
 *
 * Location: $SUPERPRODUCT_WORKSPACE (absolute, or relative to the kit), else <kit>/workspace, which may be a symlink
 * (one workspace per client: `ln -sfn ~/clients/acme workspace`). Keys stay out of it: they belong to you and this
 * computer, not to the product, so they stay in each agent's .env in the kit.
 *
 *   import { outputDir } from "../../../lib/workspace.mjs";
 *   const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || outputDir("deck"));   // <workspace>/out/deck
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WORKSPACE_ENV = "SUPERPRODUCT_WORKSPACE";
export const TEMPLATE_DIR = path.join(KIT_ROOT, "templates", "workspace");

/**
 * The workspace folder (it may not exist yet). Its real path when it exists: Claude reports the paths it works on with
 * symlinks resolved, and the agents' file guards compare those with the folders derived from this one.
 * `real: false` gives the path as configured (a symlink stays a symlink).
 */
export function workspaceDir({ env = process.env, real = true } = {}) {
  const v = env[WORKSPACE_ENV]?.trim();
  const dir = v ? path.resolve(KIT_ROOT, v) : path.join(KIT_ROOT, "workspace");
  if (!real) return dir;
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}

/** A path inside the workspace: workspacePath("sites") → <workspace>/sites. */
export const workspacePath = (rel = "", opts) => path.join(workspaceDir(opts), rel);

/** Where an agent writes its results: <workspace>/out/<agent id>. */
export const outputDir = (agentId, opts) => path.join(workspaceDir(opts), "out", agentId);

/** Your reference images for an agent: <workspace>/references/<agent id>. */
export const referencesDir = (agentId, opts) => path.join(workspaceDir(opts), "references", agentId);

/** Template files whose name can't be stored as is in the kit (a .gitignore there would apply to the kit). */
const RENAME = { gitignore: ".gitignore" };

/**
 * Create the workspace, or add what it lacks: the files of templates/workspace (README.md, .gitignore,
 * briefs/README.md) and a git repository unless `git` is false. Never overwrites a file.
 * Returns the paths it created, relative to the workspace.
 */
export function createWorkspace({ dir = workspaceDir(), git = true, template = TEMPLATE_DIR } = {}) {
  const created = [];
  mkdirSync(dir, { recursive: true });
  const copy = (src, dst) => {
    for (const e of readdirSync(src, { withFileTypes: true })) {
      if (e.name === ".DS_Store") continue;
      const from = path.join(src, e.name);
      const to = path.join(dst, RENAME[e.name] ?? e.name);
      if (e.isDirectory()) {
        mkdirSync(to, { recursive: true });
        copy(from, to);
      } else if (!existsSync(to)) {
        cpSync(from, to);
        created.push(path.relative(dir, to).split(path.sep).join("/"));
      }
    }
  };
  if (existsSync(template)) copy(template, dir);
  if (git && !existsSync(path.join(dir, ".git")) && spawnSync("git", ["init", "--quiet"], { cwd: dir, stdio: "ignore" }).status === 0) created.push(".git/");
  return created;
}
