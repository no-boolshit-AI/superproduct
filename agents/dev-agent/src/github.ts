/** GitHub: repo URL parsing, token discovery, and the few REST calls the agent needs (issues, pull requests). */
import { spawnSync } from "node:child_process";
import path from "node:path";

export interface RepoRef {
  /** What git clones/pushes. */
  url: string;
  owner: string;
  name: string;
  /** True for github.com repos (pull requests, issues). */
  github: boolean;
}

/**
 * Accepts owner/name, github.com/owner/name, https://github.com/owner/name(.git), git@github.com:owner/name.git,
 * or any other git URL / local path (no PR support then).
 */
export function parseRepo(input: string): RepoRef {
  const s = input.trim().replace(/\/+$/, "");
  let m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i);
  if (m) return { url: `https://github.com/${m[1]}/${m[2]}.git`, owner: m[1], name: m[2], github: true };
  m = s.match(/^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i);
  if (m) return { url: s.endsWith(".git") ? s : `${s}.git`, owner: m[1], name: m[2], github: true };
  m = s.match(/^ssh:\/\/git@github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i);
  if (m) return { url: s, owner: m[1], name: m[2], github: true };
  m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (m && !s.startsWith(".") && !s.startsWith("/")) return { url: `https://github.com/${m[1]}/${m[2]}.git`, owner: m[1], name: m[2], github: true };
  // any other remote or a local path
  const url = /^(https?|ssh|git|file):\/\//.test(s) || s.includes("@") ? s : path.resolve(s);
  const name = path.basename(url).replace(/\.git$/, "") || "repo";
  return { url, owner: "local", name, github: false };
}

let cachedToken: string | null | undefined;

/** GITHUB_TOKEN / GH_TOKEN, else `gh auth token` (GitHub CLI login). */
export function githubToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env) return (cachedToken = env);
  try {
    const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 5000 });
    cachedToken = r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export function resetTokenCache(): void {
  cachedToken = undefined;
}

const API = () => (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");

async function api<T>(method: string, p: string, body?: unknown): Promise<T> {
  const token = githubToken();
  if (!token) throw new Error("No GitHub token: set GITHUB_TOKEN in .env or log in with `gh auth login`.");
  const res = await fetch(`${API()}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dev-agent",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = [j.message, ...(j.errors ?? []).map((e: { message?: string }) => e.message)].filter(Boolean).join("; ");
    } catch {
      /* not JSON */
    }
    throw new Error(`GitHub ${method} ${p}: ${res.status} ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface PullRequest {
  number: number;
  html_url: string;
  draft?: boolean;
}

export async function findOpenPullRequest(repo: RepoRef, branch: string): Promise<PullRequest | null> {
  const list = await api<PullRequest[]>("GET", `/repos/${repo.owner}/${repo.name}/pulls?state=open&head=${encodeURIComponent(`${repo.owner}:${branch}`)}`);
  return list[0] ?? null;
}

export async function openOrUpdatePullRequest(
  repo: RepoRef,
  o: { head: string; base: string; title: string; body: string; draft: boolean; reviewers?: string[]; labels?: string[] },
): Promise<PullRequest & { created: boolean }> {
  const existing = await findOpenPullRequest(repo, o.head);
  if (existing) {
    const pr = await api<PullRequest>("PATCH", `/repos/${repo.owner}/${repo.name}/pulls/${existing.number}`, { title: o.title, body: o.body });
    return { ...pr, created: false };
  }
  const pr = await api<PullRequest>("POST", `/repos/${repo.owner}/${repo.name}/pulls`, {
    title: o.title,
    head: o.head,
    base: o.base,
    body: o.body,
    draft: o.draft,
    maintainer_can_modify: true,
  });
  // best effort: reviewers and labels must not fail the publish
  if (o.reviewers?.length) await api("POST", `/repos/${repo.owner}/${repo.name}/pulls/${pr.number}/requested_reviewers`, { reviewers: o.reviewers }).catch(() => {});
  if (o.labels?.length) await api("POST", `/repos/${repo.owner}/${repo.name}/issues/${pr.number}/labels`, { labels: o.labels }).catch(() => {});
  return { ...pr, created: true };
}

export interface IssueContext {
  number: number;
  title: string;
  url: string;
  text: string;
}

/** Issue title, body and comments, formatted as part of the feature request. */
export async function fetchIssue(repo: RepoRef, ref: string): Promise<IssueContext> {
  const n = Number(ref.match(/(\d+)\s*$/)?.[1]);
  if (!n) throw new Error(`Not an issue number or URL: ${ref}`);
  const issue = await api<{ number: number; title: string; body: string | null; html_url: string; user?: { login: string } }>(
    "GET",
    `/repos/${repo.owner}/${repo.name}/issues/${n}`,
  );
  const comments = await api<{ body: string; user?: { login: string } }[]>("GET", `/repos/${repo.owner}/${repo.name}/issues/${n}/comments?per_page=50`).catch(
    () => [],
  );
  const text = [
    `GitHub issue #${issue.number}: ${issue.title}`,
    issue.html_url,
    "",
    issue.body?.trim() || "(no description)",
    ...comments.map((c) => `\n--- comment by ${c.user?.login ?? "someone"} ---\n${c.body.trim()}`),
  ].join("\n");
  return { number: issue.number, title: issue.title, url: issue.html_url, text: text.slice(0, 40_000) };
}

export function branchUrl(repo: RepoRef, branch: string): string | undefined {
  return repo.github ? `https://github.com/${repo.owner}/${repo.name}/tree/${encodeURIComponent(branch).replace(/%2F/g, "/")}` : undefined;
}

export function commitUrl(repo: RepoRef, sha: string): string | undefined {
  return repo.github ? `https://github.com/${repo.owner}/${repo.name}/commit/${sha}` : undefined;
}
