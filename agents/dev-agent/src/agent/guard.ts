/**
 * PreToolUse guard for every agent session. The container is the main isolation boundary; this adds the
 * workflow rules: the agent edits only the repo, and git history/branches/remotes belong to the host harness.
 */
import path from "node:path";
import type { HookCallback, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { pathInside } from "../profile.js";

export interface GuardOptions {
  /** Agent-visible working directory (relative paths resolve against it). */
  cwd: string;
  /** Roots the agent may write to; empty = no writes at all. */
  writable: string[];
  /** Roots the agent may read; "any" inside a container. */
  readable: string[] | "any";
  /** Block Bash entirely (setup agent on the host). */
  noBash?: boolean;
  /** Extra Bash rules for RUNTIME=local. */
  hostShell?: boolean;
}

const deny = (reason: string): HookJSONOutput => ({
  hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
});

/** Git subcommands the agent must leave to the harness. */
const GIT_FORBIDDEN =
  /(^|[;&|(`$]\s*|\s)git\s+(?:-[cC]\s+\S+\s+)*(push|commit|rebase|merge|reset\s+--hard|switch|remote|config|tag|filter-branch|filter-repo|update-ref|replace|worktree|am|cherry-pick|revert|pull|fetch|clone|init|update-index|gc|prune|reflog\s+(expire|delete)|branch\s+(-[dDmMcC]|--delete|--move|--copy|--force))\b/;
const GIT_CHECKOUT_BRANCH = /(^|[;&|(`$]\s*|\s)git\s+checkout\s+(?!.*\s--(\s|$))(?!--\s)/;

export function bashViolation(command: string, o: Pick<GuardOptions, "hostShell"> = {}): string | null {
  const c = command.replace(/\\\n/g, " ");
  const m = c.match(GIT_FORBIDDEN);
  if (m)
    return `\`git ${m[2]}\` is handled by dev-agent: it commits when you call complete_milestone and pushes the branch at the end. Leave history, branches, remotes and config alone (git status/diff/log/show/blame/stash/restore are fine).`;
  if (GIT_CHECKOUT_BRANCH.test(c)) return "Don't switch branches. To restore files use `git restore <path>` or `git checkout -- <path>`.";
  if (/(^|[;&|\s])gh\s+/.test(c)) return "The GitHub CLI isn't available to the agent; publishing is done by dev-agent.";
  if (o.hostShell) {
    if (/(^|[;&|\s])sudo\s/.test(c)) return "No sudo.";
    if (/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\$HOME)(\s|$)/i.test(c)) return "Refusing to delete outside the repo.";
  }
  return null;
}

function targetPath(input: Record<string, unknown>): string | undefined {
  const p = input.file_path ?? input.notebook_path ?? input.path;
  if (typeof p === "string" && p) return p;
  if (typeof input.pattern === "string" && path.isAbsolute(input.pattern)) return input.pattern.replace(/[*?[{].*$/, "") || "/";
  return undefined;
}

export function guardHook(o: GuardOptions): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const name = input.tool_name;
    const ti = (input.tool_input ?? {}) as Record<string, unknown>;

    if (name === "Bash") {
      if (o.noBash) return deny("No shell here. Use workspace_exec to run commands inside the project workspace.");
      const v = bashViolation(String(ti.command ?? ""), o);
      return v ? deny(v) : {};
    }

    const raw = targetPath(ti);
    const abs = raw ? path.resolve(o.cwd, raw) : undefined;
    if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(name)) {
      if (!abs) return {};
      if (!o.writable.some((r) => pathInside(abs, r))) return deny(`You can only change files inside ${o.writable.join(" or ") || "(nothing in this phase)"}.`);
      if (abs.split(path.sep).includes(".git")) return deny("The .git folder is managed by dev-agent.");
      return {};
    }
    if (["Read", "Glob", "Grep", "LS"].includes(name) && abs && o.readable !== "any") {
      if (!o.readable.some((r) => pathInside(abs, r))) return deny(`Reading is limited to ${o.readable.join(", ")}.`);
    }
    return {};
  };
}
