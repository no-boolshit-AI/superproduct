/**
 * Read is the only built-in tool; this hook keeps it inside the job folder. Paths are compared with symlinks resolved on
 * both sides, as Claude Code reports them: a link counts as where it points.
 */
import type { HookCallback, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";

/**
 * p with symlinks resolved, through the real path of its nearest existing ancestor (the rest may not exist yet).
 * Claude Code reports the paths it works on that way (relative ones against its real working directory; on macOS
 * /var/folders/… is /private/var/folders/…); the native call also gives the on-disk letter case, as Claude Code's
 * working directory has.
 */
export function realPath(p: string): string {
  const missing: string[] = [];
  for (let dir = path.resolve(p); ; dir = path.dirname(dir)) {
    try {
      return path.join(fs.realpathSync.native(dir), ...missing);
    } catch {
      if (path.dirname(dir) === dir) return path.resolve(p);
      missing.unshift(path.basename(dir));
    }
  }
}

export const isInside = (p: string, root: string) => {
  const rel = path.relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

export function guardHook(jobDir: string): HookCallback {
  const deny = (reason: string): HookJSONOutput => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
  // resolved once per job; each requested path is resolved per call
  const root = realPath(jobDir);
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    if (input.tool_name !== "Read") return {};
    const ti = (input.tool_input ?? {}) as Record<string, unknown>;
    const raw = String(ti.file_path ?? "");
    const real = realPath(path.resolve(root, raw));
    if (!isInside(real, root)) return deny("Reading is limited to the job folder (inputs/, assets/ and the files you created).");
    return {};
  };
}
