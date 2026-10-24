/**
 * The file-access hook on a job folder reached through a symlink (an OUTPUT_DIR behind one), on any OS: Claude Code
 * reports the paths it works on with symlinks resolved, so the job's files must be writable by their real paths, and a
 * link counts as where it points (out of the job, into _design/, to a managed file).
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";

const base = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "collage-guard-")));
process.env.OUTPUT_DIR = path.join(base, "link");
process.env.PRODUCT_DIR = "none";
const { guardHook } = await import("../src/guard.js");
const { DESIGN_DIR, STYLEGUIDE } = await import("../src/paths.js");

const realJob = path.join(base, "real", "job");
mkdirSync(path.join(realJob, "_design"), { recursive: true });
mkdirSync(path.join(realJob, "assets"));
mkdirSync(path.join(base, "elsewhere"));
writeFileSync(path.join(realJob, "job.json"), "{}");
symlinkSync(path.join(base, "real"), path.join(base, "link"));
// links inside the job: out of it, into _design/, and to a managed file
symlinkSync(path.join(base, "elsewhere"), path.join(realJob, "out"));
symlinkSync(path.join(realJob, "_design"), path.join(realJob, "styles"));
symlinkSync(path.join(realJob, "job.json"), path.join(realJob, "notes.md"));
const linked = (...p: string[]) => path.join(base, "link", ...p);

try {
  const hook = guardHook(linked("job"));
  const call = async (tool_name: string, tool_input: Record<string, unknown>) => {
    const input = { hook_event_name: "PreToolUse", tool_name, tool_input, tool_use_id: "t", session_id: "s", transcript_path: "", cwd: realJob } as HookInput;
    const out = (await hook(input, "t", { signal: new AbortController().signal })) as { hookSpecificOutput?: { permissionDecisionReason?: string } };
    return out.hookSpecificOutput?.permissionDecisionReason ?? null;
  };
  const write = (file_path: string) => call("Write", { file_path, content: "<p>x</p>" });

  // by the real path (as Claude Code reports it), through the link, or relative: allowed
  for (const p of [path.join(realJob, "slide-01.html"), linked("job", "slide-02.html"), "caption.md"]) assert.equal(await write(p), null, `should allow Write ${p}`);
  assert.equal(await call("Read", { file_path: path.join(realJob, "assets", "figure.png") }), null);
  assert.equal(await call("Read", { file_path: STYLEGUIDE }), null);
  assert.equal(await call("Glob", { pattern: path.join(DESIGN_DIR, "layouts", "*.html") }), null);
  assert.equal(await call("Glob", { pattern: path.join(realJob, "assets", "*") }), null);

  const denied: [string, string | null, RegExp][] = [
    ["../escape.html", await write("../escape.html"), /Only files inside the job folder/],
    ["out/x.html (a link out of the job)", await write(path.join(realJob, "out", "x.html")), /Only files inside the job folder/],
    ["_design/collage.css", await write(linked("job", "_design", "collage.css")), /read-only/],
    ["styles/collage.css (a link into _design/)", await write(path.join(realJob, "styles", "collage.css")), /read-only/],
    ["job.json", await write(path.join(realJob, "job.json")), /managed by the host/],
    ["notes.md (a link to job.json)", await write("notes.md"), /managed by the host/],
    ["Read /etc/hostname", await call("Read", { file_path: "/etc/hostname" }), /Reading is limited/],
    ["Read out/ (a link out of the job)", await call("Read", { file_path: linked("job", "out", "secret.txt") }), /Reading is limited/],
  ];
  for (const [what, reason, re] of denied) assert.match(reason ?? "", re, `should deny ${what}: ${reason}`);
  console.log(`✓ guard OK: the job folder through a symlink is used by its real paths; ${denied.length} refusals`);
} finally {
  rmSync(base, { recursive: true, force: true });
}
