/**
 * End-to-end at zero cost: the real Agent SDK + Claude Code CLI, the deck MCP tools, the Read guard, Chromium
 * rendering and the PDF export, driven by a mock Claude API. Then a revision that resumes the same session.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "deck-e2e-"));
process.env.PRODUCT_DIR = "none"; // hermetic: ignore the repo's product/ folder (test/product.test.ts covers it)
process.env.EXPORT_DPI = "100";
const m = await import("./mock-claude.js");
const mock = await m.startMockClaude();
const { runJob } = await import("../src/agent.js");
const { closeBrowser } = await import("../src/render/renderer.js");

const events: string[] = [];
try {
  const job = await runJob({
    options: { brief: "Regional sales review for the sales leadership team", format: "auto", theme: "auto", inputs: [path.resolve("test/fixtures/sales.csv")] },
    emit: (e) => events.push(e.type),
  });
  assert.equal(job.status, "done", job.error ?? "");
  const expected = ["Read", "create_chart", "create_diagram", "create_kpis", "create_table", "export_document", "inspect_data", "move_page", "plan_storyline", "remove_page", "review_document", "setup_document", "view_page", "write_page"]
    .map((t) => (t === "Read" ? t : `mcp__deck__${t}`)).sort();
  assert.deepEqual([...m.mainToolNames].sort(), expected, "only Read + deck tools are exposed (no Bash/Write/Web)");
  assert.match(m.systemPromptSeen, /Action titles/, "system prompt delivered");
  const denied = m.toolResults.filter((r) => r.isError);
  assert.equal(denied.length, 1, `exactly one denied call (the /etc read): ${JSON.stringify(denied)}`);
  assert.match(denied[0].text, /limited to the job folder/);
  const page2 = m.toolResults.find((r) => r.text.startsWith("Page 2 (exhibit) rendered"));
  assert.ok(page2 && page2.images === 1, "write_page returns a preview image");
  assert.ok(!/^ERROR/m.test(page2!.text), page2!.text);
  assert.ok(m.toolResults.some((r) => /West, incl\. islands/.test(r.text ?? "")), "inspect_data read the CSV");
  assert.equal(job.pdf, "presentation.pdf");
  assert.ok(fs.existsSync(path.join(job.dir, "presentation.pdf")));
  assert.equal(job.pages.length, 3);
  for (const p of job.pages) assert.ok(fs.existsSync(path.join(job.dir, p.png!)), String(p.png));
  assert.ok(fs.readdirSync(path.join(job.dir, "exhibits")).length >= 2, "exhibit PNGs exported");
  assert.ok(events.includes("page") && events.includes("export") && events.at(-1) === "done");

  const rev = await runJob({ options: { brief: "", format: "auto", theme: "auto" }, reviseJobId: job.id, instructions: "Sharpen page 2 and add a takeaway." });
  assert.equal(rev.status, "done", rev.error ?? "");
  assert.equal(rev.sessionId, job.sessionId, "revision resumes the same agent session");
  assert.equal(rev.revisions.length, 1);
  const p2 = JSON.parse(fs.readFileSync(path.join(job.dir, "pages", "page-02.json"), "utf8"));
  assert.match(p2.title, /North alone/);
  console.log(`✓ e2e OK: ${job.pages.length} pages → ${path.join(job.dir, job.pdf!)}`);
} finally {
  await closeBrowser();
  mock.close();
}
