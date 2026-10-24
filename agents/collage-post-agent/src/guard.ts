/**
 * Keeps the agent's file access inside the job folder (+ read-only design/reference files). Paths are compared with
 * symlinks resolved on both sides, as Claude Code reports them: a link counts as where it points.
 */
import type { HookCallback, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { realpathSync } from "node:fs";
import path from "node:path";
import { DESIGN_DIR, REFERENCE_DIR, STYLEGUIDE } from "./paths.js";

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
      return path.join(realpathSync.native(dir), ...missing);
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
  const deny = (reason: string): HookJSONOutput => ({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  });
  // resolved once per job; each requested path is resolved per call
  const job = realPath(jobDir);
  const readable = [jobDir, DESIGN_DIR, REFERENCE_DIR, STYLEGUIDE].map(realPath);
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const ti = (input.tool_input ?? {}) as Record<string, unknown>;
    const raw = (ti.file_path ?? ti.path ?? (typeof ti.pattern === "string" && path.isAbsolute(ti.pattern) ? ti.pattern : undefined)) as
      | string
      | undefined;
    if (!raw) return {};
    const real = realPath(path.resolve(job, raw.replace(/\*.*$/, "") || "."));
    if (input.tool_name === "Write" || input.tool_name === "Edit") {
      if (!isInside(real, job)) return deny(`Only files inside the job folder (${job}) can be written.`);
      if (isInside(real, path.join(job, "_design"))) return deny("_design/ is the shared design system and is read-only.");
      if (["job.json", "events.jsonl", "credits.jsonl", "index.html", "CREDITS.md", "PRODUCT.md"].includes(path.relative(job, real)))
        return deny("That file is managed by the host app.");
      if (!/\.(html|md|txt)$/i.test(real)) return deny("Only .html, .md and .txt files can be written.");
      const body = String(ti.content ?? ti.new_string ?? "");
      if (/<(iframe|object|embed|frame|form|base|meta\s+http-equiv)\b/i.test(body) || /<script(?![^>]*src=["']_design\/collage\.js["'])/i.test(body) || /\b(src|href)\s*=\s*["']?(https?:|\/\/|file:|\.\.\/)/i.test(body))
        return deny("Slides may not contain iframes/objects/forms, scripts other than _design/collage.js, external URLs or ../ paths.");
      return {};
    }
    if (!readable.some((r) => isInside(real, r))) return deny("Reading is limited to the job folder, design/, reference/ and STYLEGUIDE.md.");
    return {};
  };
}
