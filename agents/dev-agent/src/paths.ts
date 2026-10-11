import "./env.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workspacePath } from "../../../lib/workspace.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Where projects/, runs/, cache/ and ask/ live: $DEVAGENT_HOME, else the workspace's dev/ (see lib/workspace.mjs). */
export const HOME = path.resolve(process.env.DEVAGENT_HOME || workspacePath("dev"));
export const PROJECTS_DIR = path.join(HOME, "projects");
export const RUNS_DIR = path.join(HOME, "runs");
export const CACHE_DIR = path.join(HOME, "cache");
export const DOCKER_DIR = path.join(ROOT, "docker");

/** Folder layout of one configured project. */
export function projectPaths(slug: string) {
  assertSlug(slug);
  const dir = path.join(PROJECTS_DIR, slug);
  return {
    dir,
    profile: path.join(dir, "project.json"),
    knowledge: path.join(dir, "PROJECT.md"),
    secrets: path.join(dir, "secrets.env"),
    plugin: path.join(dir, "plugin"),
    mirror: path.join(dir, "mirror.git"),
    image: path.join(dir, "image"),
    composeOverride: path.join(dir, "compose.override.json"),
    setup: path.join(dir, "setup"),
    setupRepo: path.join(dir, "setup", "repo"),
    setupGitDir: path.join(dir, "setup", "git"),
  };
}

/** Folder layout of one run. */
export function runPaths(project: string, runId: string) {
  assertSlug(project);
  assertSlug(runId);
  const dir = path.join(RUNS_DIR, project, runId);
  return {
    dir,
    record: path.join(dir, "run.json"),
    events: path.join(dir, "events.jsonl"),
    repo: path.join(dir, "repo"),
    /** git database of the checkout, kept outside the working tree (read-only inside the container) */
    gitDir: path.join(dir, "git"),
    home: path.join(dir, "home"),
    logs: path.join(dir, "logs"),
    prd: path.join(dir, "PRD.md"),
    plan: path.join(dir, "PLAN.md"),
    notes: path.join(dir, "NOTES.md"),
    compose: path.join(dir, "compose.json"),
  };
}

export function assertSlug(s: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(s) || s.includes("..")) throw new Error(`Invalid name: ${s}`);
}

export function slugify(s: string, max = 40): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "feature"
  );
}

/** Version of the Agent SDK in node_modules; the container installs the matching Claude Code binary. */
export function sdkVersion(): string {
  const pkg = path.join(ROOT, "node_modules", "@anthropic-ai", "claude-agent-sdk", "package.json");
  return JSON.parse(readFileSync(pkg, "utf8")).version as string;
}
