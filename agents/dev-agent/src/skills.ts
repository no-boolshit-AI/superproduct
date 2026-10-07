/**
 * Agent-level skills live in a local Claude Code plugin per project (projects/<slug>/plugin), mounted read-only
 * into every workspace and passed to the SDK with `plugins: [{ type: "local", path }]`. They never touch the repo.
 */
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gitOk } from "./git.js";
import { parseRepo } from "./github.js";
import type { SkillSource } from "./catalog.js";

export const PLUGIN_NAME = "project-skills";

export interface InstalledSkill {
  name: string;
  repo: string;
  ref?: string;
  path: string;
  commit: string;
  description: string;
  installedAt: string;
}

const lockFile = (pluginDir: string) => path.join(pluginDir, "skills.lock.json");

export async function ensurePlugin(pluginDir: string, project: string): Promise<void> {
  await mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
  await mkdir(path.join(pluginDir, "skills"), { recursive: true });
  const manifest = path.join(pluginDir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifest))
    await writeFile(
      manifest,
      JSON.stringify({ name: PLUGIN_NAME, version: "1.0.0", description: `Development skills installed by dev-agent for ${project}` }, null, 2) + "\n",
    );
}

export async function listInstalled(pluginDir: string): Promise<InstalledSkill[]> {
  try {
    return JSON.parse(await readFile(lockFile(pluginDir), "utf8"));
  } catch {
    return [];
  }
}

function frontmatter(md: string): { name?: string; description?: string } {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const get = (k: string) => {
    const m = fm.match(new RegExp(`^${k}:\\s*(>-?|\\|-?)?\\s*(.*)$`, "m"));
    if (!m) return undefined;
    if (m[1]) {
      // folded/literal block: collect the indented lines that follow
      const after = fm.slice(fm.indexOf(m[0]) + m[0].length).split(/\r?\n/);
      const lines: string[] = [];
      for (const l of after.slice(1)) {
        if (/^\s+\S/.test(l)) lines.push(l.trim());
        else break;
      }
      return [m[2], ...lines].join(" ").trim();
    }
    return m[2].replace(/^["']|["']$/g, "").trim();
  };
  return { name: get("name"), description: get("description") };
}

/**
 * Downloads skill folders (sparse, shallow clone) and copies them into the plugin. Returns what was installed and
 * per-path errors (a missing SKILL.md, a repo that can't be cloned…) without throwing.
 */
export async function installSkills(
  pluginDir: string,
  project: string,
  sources: SkillSource[],
  log: (msg: string) => void = () => {},
): Promise<{ installed: InstalledSkill[]; errors: string[] }> {
  await ensurePlugin(pluginDir, project);
  const lock = await listInstalled(pluginDir);
  const installed: InstalledSkill[] = [];
  const errors: string[] = [];
  for (const src of sources) {
    const repo = parseRepo(src.repo);
    const tmp = await mkdtemp(path.join(os.tmpdir(), "devagent-skill-"));
    try {
      log(`Fetching ${src.repo}${src.ref ? `@${src.ref}` : ""}`);
      const isLocal = !repo.github && existsSync(repo.url);
      if (isLocal) {
        await gitOk(undefined, ["clone", "--depth", "1", ...(src.ref ? ["--branch", src.ref] : []), `file://${repo.url}`, tmp], { timeoutMs: 5 * 60_000 });
      } else {
        await gitOk(undefined, ["clone", "--depth", "1", "--filter=blob:none", "--sparse", ...(src.ref ? ["--branch", src.ref] : []), repo.url, tmp], {
          auth: repo.url,
          timeoutMs: 10 * 60_000,
        });
        await gitOk(tmp, ["sparse-checkout", "set", "--no-cone", ...src.paths.map((p) => `/${p.replace(/^\/+|\/+$/g, "")}/`)], { auth: repo.url, timeoutMs: 10 * 60_000 });
      }
      const commit = await gitOk(tmp, ["rev-parse", "HEAD"]);
      for (const rel of src.paths) {
        const from = path.join(tmp, rel.replace(/^\/+|\/+$/g, ""));
        const skillMd = path.join(from, "SKILL.md");
        if (!existsSync(skillMd)) {
          errors.push(`${src.repo}: no SKILL.md in ${rel}`);
          continue;
        }
        const fm = frontmatter(await readFile(skillMd, "utf8"));
        const name = (fm.name || path.basename(from)).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
        const dest = path.join(pluginDir, "skills", name);
        await rm(dest, { recursive: true, force: true });
        await cp(from, dest, { recursive: true, filter: (p) => !p.split(path.sep).includes(".git") });
        const entry: InstalledSkill = { name, repo: src.repo, ref: src.ref, path: rel, commit, description: (fm.description ?? "").slice(0, 300), installedAt: new Date().toISOString() };
        installed.push(entry);
        const i = lock.findIndex((l) => l.name === name);
        if (i >= 0) lock[i] = entry;
        else lock.push(entry);
        log(`Installed skill ${name}`);
      }
    } catch (e) {
      errors.push(`${src.repo}: ${(e as Error).message.split("\n").slice(0, 4).join(" ")}`);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
  await writeFile(lockFile(pluginDir), JSON.stringify(lock, null, 2) + "\n");
  return { installed, errors };
}

/** Names of skill folders actually present in the plugin. */
export async function skillNames(pluginDir: string): Promise<string[]> {
  const dir = path.join(pluginDir, "skills");
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "SKILL.md"))).map((d) => d.name);
}
