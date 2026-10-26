/**
 * Smoke test of the whole pipeline at zero cost: the real Agent SDK + Claude Code CLI, the MCP tools,
 * the file-access hook, Chromium rendering and the export, driven by mock Claude/OpenAI APIs.
 *   npm test
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PRODUCT_DIR = "none"; // hermetic: product folders are covered by test/product.test.ts
// before any project module is loaded (paths.ts reads OUTPUT_DIR once). Behind a symlink, on any OS (on macOS
// os.tmpdir() is one too): Claude Code reports the job's files by their real paths, and the hook must still allow them.
const tmp = mkdtempSync(path.join(os.tmpdir(), "collage-test-"));
mkdirSync(path.join(tmp, "real"));
symlinkSync(path.join(tmp, "real"), path.join(tmp, "out"));
process.env.OUTPUT_DIR = path.join(tmp, "out");
const m = await import("./mocks.js");
const mocks = await m.startMocks();
const { toolResults, imageRequests } = m;
const { runJob } = await import("../src/agent.js");
const { defaults } = await import("../src/config.js");
const { closeBrowser } = await import("../src/tools/render.js");

const events: string[] = [];
const job = await runJob({
  options: { ...defaults(), brief: "Test: why generalists matter", slides: 2, palette: "cobalt", brand: "Test Brand" },
  emit: (e) => events.push(e.type),
});
try {
  assert.equal(job.status, "done", job.error ?? "");
  assert.deepEqual([...m.mainToolNames].sort(), ["Edit", "Glob", "Read", "Write", "mcp__collage__find_public_domain_image", "mcp__collage__generate_image", "mcp__collage__remove_slides", "mcp__collage__render_slides"]);
  assert.equal(imageRequests.length, 2);
  assert.equal(imageRequests[0].size, "1088x1360");
  assert.equal(imageRequests[1].background, "transparent");
  const render = toolResults.find((r) => r.text.startsWith("Rendered 2 slide(s)"));
  assert.ok(render, "render_slides result");
  assert.match(render.text, /0 warning/);
  assert.equal(render.images, 2, "contact sheet + inspect image returned to the model");
  const denied = toolResults.filter((r) => r.isError);
  assert.equal(denied.length, 4, "escape write, _design write, /etc read and an iframe slide are denied");
  assert.ok(!existsSync(path.join(job.dir, "slide-09.html")));
  assert.ok(!existsSync(path.join(process.env.OUTPUT_DIR!, "escape.html")));
  for (const s of job.slides) assert.ok(existsSync(path.join(job.dir, s.png)), s.png);
  assert.ok(existsSync(path.join(job.dir, job.zip!)));
  assert.match(readFileSync(path.join(job.dir, "index.html"), "utf8"), /palette cobalt/);
  assert.ok(events.includes("render") && events.at(-1) === "done");

  const rev = await runJob({ options: { ...defaults() }, reviseJobId: job.id, instructions: "Shorter headline." });
  assert.equal(rev.status, "done", rev.error ?? "");
  assert.equal(rev.sessionId, job.sessionId, "revision resumes the same agent session");
  console.log(`✓ pipeline OK: ${job.slides.length} slides, zip ${job.zip}\n  ${job.dir}`);
} finally {
  await closeBrowser();
  mocks.close();
}
