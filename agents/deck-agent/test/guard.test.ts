/**
 * The Read guard and inspect_data on a job folder reached through a symlink (an OUTPUT_DIR behind one), on any OS:
 * Claude Code reports the paths it works on with symlinks resolved, so the job's files must be readable by their real
 * paths, and a link out of the job folder leads outside it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";

const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "deck-guard-")));
process.env.OUTPUT_DIR = path.join(base, "link");
process.env.PRODUCT_DIR = "none"; // hermetic: ignore the workspace's product/ folder (test/product.test.ts covers it)
delete process.env.OPENAI_API_KEY;
const { loadBrand } = await import("../src/config.js");
const { initJobDir } = await import("../src/document.js");
const { guardHook } = await import("../src/guard.js");
const { buildTools } = await import("../src/tools.js");

const realJob = path.join(base, "real", "job");
initJobDir(realJob);
fs.copyFileSync("test/fixtures/sales.csv", path.join(realJob, "inputs", "sales.csv"));
fs.mkdirSync(path.join(base, "elsewhere"));
fs.copyFileSync("test/fixtures/sales.csv", path.join(base, "elsewhere", "sales.csv"));
fs.symlinkSync(path.join(base, "real"), path.join(base, "link"));
fs.symlinkSync(path.join(base, "elsewhere"), path.join(realJob, "out")); // a link out of the job folder
const linked = (...p: string[]) => path.join(base, "link", ...p);

try {
  const hook = guardHook(linked("job"));
  const read = async (file_path: string) => {
    const input = { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path }, tool_use_id: "t", session_id: "s", transcript_path: "", cwd: realJob } as HookInput;
    const out = (await hook(input, "t", { signal: new AbortController().signal })) as { hookSpecificOutput?: { permissionDecisionReason?: string } };
    return out.hookSpecificOutput?.permissionDecisionReason ?? null;
  };
  // by the real path (as Claude Code reports it), through the link, relative, or a file that doesn't exist yet: allowed
  for (const p of [path.join(realJob, "inputs", "sales.csv"), linked("job", "inputs", "sales.csv"), "inputs/sales.csv", path.join(realJob, "pages", "page-01.json")])
    assert.equal(await read(p), null, `should allow Read ${p}`);
  for (const p of ["/etc/hostname", "../../elsewhere/sales.csv", path.join(realJob, "out", "sales.csv"), linked("job", "out", "sales.csv")])
    assert.match((await read(p)) ?? "", /limited to the job folder/, `should deny Read ${p}`);

  const tools = buildTools({ job: { dir: linked("job"), brand: loadBrand() }, forced: {}, emit: () => {}, maxImages: 0, stats: { images: 0, exported: false } });
  const inspect = tools.find((t: { name: string }) => t.name === "inspect_data")!;
  const call = async (p: string) => (await inspect.handler({ path: p }, {})) as { isError?: boolean; content: { text?: string }[] };
  const real = await call(path.join(realJob, "inputs", "sales.csv"));
  assert.ok(!real.isError && /West, incl\. islands/.test(real.content[0].text ?? ""), `inspect_data by the real path: ${real.content[0].text}`);
  assert.ok(!(await call("inputs/sales.csv")).isError, "inspect_data relative to the job folder");
  assert.ok((await call("out/sales.csv")).isError, "inspect_data through a link out of the job folder");
  console.log("✓ guard OK: the job folder through a symlink is read by its real paths; links out of it are refused");
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}
