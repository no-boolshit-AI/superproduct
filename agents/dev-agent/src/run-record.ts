/** run.json: the state machine of one feature run. Every step is resumable from here. */
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { RUNS_DIR, runPaths, slugify } from "./paths.js";
import type { Step } from "./events.js";
import type { LocalPolicyResult } from "./git.js";

export type RunStatus = "running" | "waiting" | "done" | "error" | "blocked" | "cancelled";

export interface Milestone {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
  acceptance: string[];
  status: "pending" | "in_progress" | "done" | "done_with_issues" | "skipped";
  attempts: number;
  commit?: string;
  summary?: string;
  knownIssues?: string;
  sessionId?: string;
}

export interface CheckResult {
  name: string;
  command: string;
  ok: boolean;
  code: number;
  durationMs: number;
  tail: string;
}

export interface ReviewFinding {
  severity: "blocker" | "major" | "minor" | "nit";
  title: string;
  detail: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface RunRecord {
  id: string;
  project: string;
  request: string;
  title: string;
  issue?: { number: number; url: string };
  status: RunStatus;
  step: Step;
  runtime: "docker" | "local";
  model: string;
  budgetUsd: number;
  costUsd: number;
  /** Spend per agent session id (sessions report cumulative totals). */
  sessionCosts: Record<string, number>;
  baseBranch: string;
  baseSha?: string;
  branch: string;
  /** Last commit made by the harness: the agent must not move HEAD. */
  headSha?: string;
  toolingCommit?: string;
  docsCommit?: string;
  localTooling?: LocalPolicyResult;
  bootstrap?: { ok: boolean; failed?: string; tail?: string };
  planSessionId?: string;
  milestones: Milestone[];
  review?: { verdict: "approve" | "changes_requested"; summary: string; findings: ReviewFinding[]; rounds: number };
  verification?: { at: string; ok: boolean; checks: CheckResult[] };
  publish?: { at: string; branchUrl?: string; prUrl?: string; prNumber?: number };
  revisions: { at: string; instructions: string }[];
  /** The product folder whose context the run used (see src/product.ts), if any. */
  product?: { dir: string; name: string; source: string } | null;
  /** --product as given when the run started (a path or "none"); resumes and revisions keep it. */
  productFlag?: string;
  pid?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function newRunId(request: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${slugify(request.split("\n")[0], 36)}`;
}

export async function readRun(project: string, id: string): Promise<RunRecord | null> {
  try {
    return JSON.parse(await readFile(runPaths(project, id).record, "utf8"));
  } catch {
    return null;
  }
}

export async function saveRun(run: RunRecord): Promise<void> {
  run.updatedAt = new Date().toISOString();
  const file = runPaths(run.project, run.id).record;
  await writeFile(file + ".tmp", JSON.stringify(run, null, 2));
  await rename(file + ".tmp", file);
}

/** Finds a run by id across projects. */
export async function findRun(id: string): Promise<RunRecord | null> {
  if (!existsSync(RUNS_DIR)) return null;
  for (const p of await readdir(RUNS_DIR)) {
    if (existsSync(path.join(RUNS_DIR, p, id, "run.json"))) return readRun(p, id);
  }
  return null;
}

export async function listRuns(project?: string): Promise<RunRecord[]> {
  if (!existsSync(RUNS_DIR)) return [];
  const projects = project ? [project] : await readdir(RUNS_DIR);
  const out: RunRecord[] = [];
  for (const p of projects) {
    const dir = path.join(RUNS_DIR, p);
    if (!existsSync(dir)) continue;
    for (const id of await readdir(dir)) {
      const r = await readRun(p, id).catch(() => null);
      if (r) out.push(r);
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A run marked running whose process is gone (crash, Ctrl+C twice, reboot). */
export function isStale(run: RunRecord): boolean {
  if (run.status !== "running" || !run.pid) return false;
  if (run.pid === process.pid) return false;
  return !pidAlive(run.pid);
}
