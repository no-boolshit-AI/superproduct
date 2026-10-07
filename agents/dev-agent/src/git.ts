/**
 * Git on the host. Credentials never enter the container: clone, fetch and push run here, with the token passed per
 * command as an HTTP header (nothing is written to git config).
 *
 * Run checkouts keep their git database outside the working tree (`clone --separate-git-dir`). The container sees it
 * read-only, and every host command names it explicitly (GIT_DIR/GIT_WORK_TREE), so code running in the workspace
 * can't plant config (filters, fsmonitor, hooks, remotes) that the host would later execute, nor rewrite history.
 */
import { existsSync } from "node:fs";
import { appendFile, link, lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { exec, type ExecResult } from "./proc.js";
import { githubToken, type RepoRef } from "./github.js";

/** Trusted git dirs of checkouts whose working tree is shared with a container. */
const gitDirs = new Map<string, string>();

export function registerGitDir(workTree: string, gitDir: string): void {
  gitDirs.set(path.resolve(workTree), path.resolve(gitDir));
}

export function gitDirOf(workTree: string): string {
  return gitDirs.get(path.resolve(workTree)) ?? path.join(workTree, ".git");
}

const PASS_ENV = /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TEMP|TMP|LANG|LC_\w+|SSH_AUTH_SOCK|SSH_AGENT_PID|GIT_SSH|GIT_SSH_COMMAND|XDG_CONFIG_HOME|SYSTEMROOT|https?_proxy|HTTPS?_PROXY|no_proxy|NO_PROXY|SSL_CERT_FILE|SSL_CERT_DIR|GIT_SSL_CAINFO|GIT_SSL_CAPATH)$/;

/** A minimal environment: no API keys or tokens, and settings that keep repo-provided config from running code. */
function gitEnv(cwd?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (PASS_ENV.test(k)) env[k] = v;
  const cfg: [string, string][] = [
    ["core.hooksPath", "/dev/null"],
    ["core.fsmonitor", "false"],
    ["safe.directory", "*"],
    ["commit.gpgsign", "false"],
    ["tag.gpgsign", "false"],
  ];
  Object.assign(env, { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "echo", GIT_CONFIG_COUNT: String(cfg.length) });
  cfg.forEach(([k, v], i) => ((env[`GIT_CONFIG_KEY_${i}`] = k), (env[`GIT_CONFIG_VALUE_${i}`] = v)));
  const gd = cwd ? gitDirs.get(path.resolve(cwd)) : undefined;
  if (gd) Object.assign(env, { GIT_DIR: gd, GIT_WORK_TREE: path.resolve(cwd!) });
  return env;
}

/** Extra `-c` args that authenticate HTTPS requests to github.com for this one command. */
export function authArgs(url: string): string[] {
  if (!/^https:\/\/github\.com\//i.test(url)) return [];
  const token = githubToken();
  if (!token) return [];
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return ["-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`];
}

interface GitOpts {
  timeoutMs?: number;
  auth?: string;
  input?: string;
}

export async function git(cwd: string | undefined, args: string[], o: GitOpts = {}): Promise<ExecResult> {
  const pre = o.auth ? authArgs(o.auth) : [];
  return exec("git", [...pre, ...args], { cwd, env: gitEnv(cwd), timeoutMs: o.timeoutMs ?? 10 * 60_000, input: o.input });
}

/** Like git() but throws with the command output on failure. */
export async function gitOk(cwd: string | undefined, args: string[], o: GitOpts = {}): Promise<string> {
  const r = await git(cwd, args, o);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed:\n${redact(r.output).trim()}`);
  return r.stdout.trim();
}

const redact = (s: string) => s.replace(/AUTHORIZATION: basic [A-Za-z0-9+/=]+/gi, "AUTHORIZATION: basic ***");

/** Default branch of a remote, via `ls-remote --symref`. */
export async function remoteDefaultBranch(repo: RepoRef): Promise<string> {
  const out = await gitOk(undefined, ["ls-remote", "--symref", repo.url, "HEAD"], { auth: repo.url, timeoutMs: 60_000 });
  return out.match(/ref: refs\/heads\/(\S+)\s+HEAD/)?.[1] ?? "main";
}

/**
 * Keeps a bare mirror per project so every run is a fast local clone (objects are hard-linked) instead of a
 * full download.
 */
export async function updateMirror(repo: RepoRef, mirrorDir: string): Promise<void> {
  await mkdir(path.dirname(mirrorDir), { recursive: true });
  await withLock(`${mirrorDir}.lock`, () => fetchMirror(repo, mirrorDir));
}

async function fetchMirror(repo: RepoRef, mirrorDir: string): Promise<void> {
  if (!existsSync(path.join(mirrorDir, "HEAD"))) {
    await rm(mirrorDir, { recursive: true, force: true });
    await gitOk(undefined, ["clone", "--mirror", repo.url, mirrorDir], { auth: repo.url, timeoutMs: 30 * 60_000 });
  } else {
    await gitOk(mirrorDir, ["fetch", "--prune", repo.url, "+refs/heads/*:refs/heads/*", "+refs/tags/*:refs/tags/*"], { auth: repo.url, timeoutMs: 30 * 60_000 });
  }
}

/** Cross-process lock (runs of the same project share the mirror). Locks of dead processes are taken over. */
export async function withLock<T>(file: string, fn: () => Promise<T>, timeoutMs = 15 * 60_000): Promise<T> {
  const started = Date.now();
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}`;
  await writeFile(tmp, String(process.pid));
  try {
    for (;;) {
      try {
        await link(tmp, file); // atomic: the lock appears with its owner already written
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        const pid = Number((await readFile(file, "utf8").catch(() => "")) || 0);
        let alive = !pid; // unreadable: assume held
        try {
          if (pid) {
            process.kill(pid, 0);
            alive = true;
          }
        } catch {
          /* holder is gone */
        }
        if (!alive) {
          await rm(file, { force: true });
          continue;
        }
        if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${file}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } finally {
    await rm(tmp, { force: true });
  }
  try {
    return await fn();
  } finally {
    await rm(file, { force: true });
  }
}

/**
 * Clones `branch` from the mirror into `dest`, with the git database in `gitDir` (outside the working tree), and
 * points origin at the real remote.
 */
export async function cloneFromMirror(repo: RepoRef, mirrorDir: string, dest: string, branch: string, gitDir: string): Promise<void> {
  await rm(dest, { recursive: true, force: true });
  await rm(gitDir, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await gitOk(undefined, ["clone", "--separate-git-dir", gitDir, "--branch", branch, mirrorDir, dest], { timeoutMs: 30 * 60_000 });
  registerGitDir(dest, gitDir);
  await gitOk(dest, ["remote", "set-url", "origin", repo.url]);
  // origin/* refs come from the mirror, which was fetched a moment ago
}

export async function configureIdentity(repoDir: string, name: string, email: string): Promise<void> {
  await gitOk(repoDir, ["config", "user.name", name]);
  await gitOk(repoDir, ["config", "user.email", email]);
}

export async function head(repoDir: string): Promise<string> {
  return gitOk(repoDir, ["rev-parse", "HEAD"]);
}

export async function currentBranch(repoDir: string): Promise<string> {
  return (await git(repoDir, ["symbolic-ref", "--short", "-q", "HEAD"])).stdout.trim();
}

export interface StatusEntry {
  code: string; // two-letter porcelain code, e.g. " M", "??", "A "
  path: string;
}

/** `git status --porcelain -z`; untracked dirs are collapsed unless `allUntracked`. */
export async function status(repoDir: string, allUntracked = false): Promise<StatusEntry[]> {
  const out = (await git(repoDir, ["status", "--porcelain=v1", "-z", `--untracked-files=${allUntracked ? "all" : "normal"}`])).stdout;
  const parts = out.split("\0").filter(Boolean);
  const entries: StatusEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    entries.push({ code, path: parts[i].slice(3) });
    if (code[0] === "R" || code[0] === "C") i++; // skip the rename source
  }
  return entries;
}

/** Hides paths from `git add -A` for this clone only (info/exclude in the git dir). */
export async function excludeLocally(repoDir: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const file = path.join(gitDirOf(repoDir), "info", "exclude");
  await mkdir(path.dirname(file), { recursive: true });
  // never follow a symlink planted in a shared .git
  if ((await lstat(file).catch(() => null))?.isSymbolicLink()) await rm(file);
  const existing = existsSync(file) ? await readFile(file, "utf8") : "";
  const lines = paths.map((p) => "/" + p.replace(/^\/+/, "")).filter((l) => !existing.split("\n").includes(l));
  if (lines.length) await appendFile(file, (existing.endsWith("\n") || !existing ? "" : "\n") + "# dev-agent: local workspace files\n" + lines.join("\n") + "\n");
}

/** Dependency manifests and lock files: never hidden, restored instead (see applyLocalPolicy). */
export const MANIFEST_RE =
  /(^|\/)(composer\.(json|lock)|package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|pyproject\.toml|uv\.lock|poetry\.lock|Pipfile(\.lock)?|requirements[^/]*\.txt)$/;

export interface LocalPolicyResult {
  restored: string[];
  hidden: string[];
  excluded: string[];
  /** Content hash of each hidden file when it was hidden (to notice later edits that won't be committed). */
  hiddenHashes?: Record<string, string>;
}

/**
 * Makes the current working-tree changes invisible to later commits without undoing them:
 * - changed dependency manifests/locks are restored from HEAD (installed packages stay in vendor/node_modules);
 * - other changed tracked files are marked skip-worktree;
 * - untracked files/dirs go to info/exclude.
 */
export async function applyLocalPolicy(repoDir: string): Promise<LocalPolicyResult> {
  const res: LocalPolicyResult = { restored: [], hidden: [], excluded: [], hiddenHashes: {} };
  for (const e of await status(repoDir)) {
    if (e.code === "??") res.excluded.push(e.path);
    else if (MANIFEST_RE.test(e.path)) res.restored.push(e.path);
    else if (e.code.includes("D") || e.code.includes("M") || e.code.includes("A")) res.hidden.push(e.path);
  }
  if (res.restored.length) {
    await gitOk(repoDir, ["reset", "-q", "--", ...res.restored]);
    await gitOk(repoDir, ["checkout", "--", ...res.restored]);
  }
  if (res.hidden.length) {
    await git(repoDir, ["reset", "-q", "--", ...res.hidden]);
    // newly added files (staged "A") can't be skip-worktree'd; exclude them instead
    const tracked = new Set((await git(repoDir, ["ls-files", "--", ...res.hidden])).stdout.split("\n").filter(Boolean));
    const untracked = res.hidden.filter((p) => !tracked.has(p));
    res.excluded.push(...untracked);
    res.hidden = res.hidden.filter((p) => tracked.has(p));
    if (res.hidden.length) {
      await gitOk(repoDir, ["update-index", "--skip-worktree", "--", ...res.hidden]);
      for (const f of res.hidden) res.hiddenHashes![f] = await fileHash(repoDir, f);
    }
  }
  await excludeLocally(repoDir, res.excluded);
  return res;
}

export async function fileHash(repoDir: string, file: string): Promise<string> {
  return existsSync(path.join(repoDir, file)) ? (await git(repoDir, ["hash-object", "--", file])).stdout.trim() : "(deleted)";
}

/** Stages everything, unstages huge files, and commits. Returns null when there was nothing to commit. */
export async function commitAll(
  repoDir: string,
  message: string,
  o: { maxFileBytes?: number } = {},
): Promise<{ sha: string; files: string[]; skipped: string[] } | null> {
  await gitOk(repoDir, ["add", "-A"]);
  const staged = (await gitOk(repoDir, ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean);
  const skipped: string[] = [];
  const max = o.maxFileBytes ?? 5_000_000;
  for (const f of staged) {
    const s = await stat(path.join(repoDir, f)).catch(() => null);
    if (s && s.isFile() && s.size > max) skipped.push(f);
  }
  if (skipped.length) await gitOk(repoDir, ["reset", "-q", "--", ...skipped]);
  const files = staged.filter((f) => !skipped.includes(f));
  if (!files.length) return null;
  await gitOk(repoDir, ["commit", "-q", "--no-verify", "-F", "-"], { input: message.trim() + "\n" });
  return { sha: await head(repoDir), files, skipped };
}

export async function diffStat(repoDir: string, base: string): Promise<string> {
  return (await git(repoDir, ["diff", "--stat", `${base}...HEAD`])).stdout.trim();
}

export async function logSince(repoDir: string, base: string): Promise<string> {
  return (await git(repoDir, ["log", "--oneline", "--no-decorate", `${base}..HEAD`])).stdout.trim();
}

/** Pushes to the profile's URL (never to whatever "origin" says now). */
export async function pushBranch(repoDir: string, repo: RepoRef, branch: string): Promise<void> {
  await gitOk(repoDir, ["push", repo.url, `refs/heads/${branch}:refs/heads/${branch}`], { auth: repo.url, timeoutMs: 15 * 60_000 });
  await git(repoDir, ["update-ref", `refs/remotes/origin/${branch}`, `refs/heads/${branch}`]);
}

export async function fetchBranch(repoDir: string, repo: RepoRef, branch: string): Promise<ExecResult> {
  return git(repoDir, ["fetch", repo.url, `+refs/heads/${branch}:refs/remotes/origin/${branch}`], { auth: repo.url, timeoutMs: 5 * 60_000 });
}
