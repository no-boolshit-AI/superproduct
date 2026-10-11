/** Exercises every tool handler directly (no Claude): validation, element types, layouts, page ops, review, export. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "deck-tools-"));
process.env.PRODUCT_DIR = "none"; // hermetic: ignore the workspace's product/ folder (test/product.test.ts covers it)
process.env.EXPORT_DPI = "110";
delete process.env.OPENAI_API_KEY;
process.env.IMAGE_MOCK = "1";
const { loadBrand } = await import("../src/config.js");
const { initJobDir, listPages } = await import("../src/document.js");
const { buildTools } = await import("../src/tools.js");
const { closeBrowser } = await import("../src/render/renderer.js");
const { strategyDeck, strategyReport } = await import("../scripts/demo-content.js");

type Res = { content: { type: string; text?: string }[]; isError?: boolean };
function harness(dir: string) {
  const events: string[] = [];
  const tools = buildTools({ job: { dir, brand: loadBrand() }, forced: {}, emit: (e) => events.push(e.type), maxImages: 2, stats: { images: 0, exported: false } });
  const call = async (name: string, args: Record<string, unknown>): Promise<Res & { txt: string }> => {
    const t = tools.find((x: { name: string }) => x.name === name);
    assert.ok(t, `tool ${name}`);
    const r = (await t.handler(args, {})) as Res;
    return { ...r, txt: r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n") };
  };
  return { call, events };
}

const fail: string[] = [];
const check = (cond: unknown, msg: string) => { if (!cond) fail.push(msg); };

try {
  // ---------- deck ----------
  const dir = path.join(process.env.OUTPUT_DIR!, "t-deck");
  initJobDir(dir);
  fs.copyFileSync("test/fixtures/sales.csv", path.join(dir, "inputs", "sales.csv"));
  const { call, events } = harness(dir);
  const early = await call("write_page", { index: 1, layout: "cover", slots: {} });
  check(early.isError && /setup_document/.test(early.txt), "write_page before setup is rejected");
  const demo = strategyDeck();
  const s = await call("setup_document", { format: "deck", theme: "strategy", title: demo.doc.title, subtitle: demo.doc.subtitle, date: "October 2026" });
  check(/Layouts for deck/.test(s.txt) && /executive-summary/.test(s.txt), "setup returns layout catalogue");
  const plan = await call("plan_storyline", { pages: [{ layout: "cover", title: "x" }, { layout: "exhibit", title: "Revenue" }, { layout: "nope", title: "Something happens here in this market" }] });
  check(/topic label/.test(plan.txt) && /unknown layout/.test(plan.txt), "storyline lint flags topic titles and unknown layouts");
  const data = await call("inspect_data", { path: "inputs/sales.csv" });
  check(/4 rows × 4 columns/.test(data.txt) && /West, incl. islands/.test(data.txt), "CSV parsed with quoted commas");
  const esc = await call("inspect_data", { path: "../../etc/passwd" });
  check(esc.isError, "inspect_data cannot leave the job folder");

  for (const e of demo.elements) {
    const { kind, ...rest } = e as unknown as Record<string, unknown>;
    const name = kind === "chart" ? "create_chart" : kind === "diagram" ? "create_diagram" : kind === "table" ? "create_table" : "create_kpis";
    const r = await call(name, rest);
    check(!r.isError, `${name} ${e.id}: ${r.txt}`);
    check(r.content.some((c) => c.type === "image"), `${name} ${e.id} returns a preview image`);
  }
  const bad = await call("create_chart", { id: "bad", type: "waterfall" });
  check(bad.isError && /steps/.test(bad.txt), "invalid chart spec reports an error");

  for (const [i, p] of demo.pages.entries()) {
    const r = await call("write_page", { index: i + 1, ...p });
    check(!r.isError && !/^ERROR/m.test(r.txt), `deck page ${i + 1} (${p.layout}): ${r.txt.split("\n").filter((l) => l.startsWith("ERROR")).join(" | ")}`);
  }
  const gap = await call("write_page", { index: 40, layout: "custom", slots: { body: "x" } });
  check(gap.isError && /gap/.test(gap.txt), "write_page refuses gaps");
  const missing = await call("write_page", { index: demo.pages.length + 1, layout: "exhibit", title: "A chart that does not exist yet on this page", slots: { element: "ghost-chart" } });
  check(/ERROR: Element "ghost-chart" does not exist/.test(missing.txt), "missing element is an error");
  const ins = await call("write_page", { index: 2, insert: true, layout: "statement", title: "Inserted", slots: { statement: "Inserted page" } });
  check(!ins.isError && listPages(dir)[1].spec.layout === "statement" && listPages(dir)[2].spec.layout === "executive-summary", "insert shifts pages");
  await call("move_page", { from: 2, to: 4 });
  check(listPages(dir)[3].spec.layout === "statement", "move_page reorders");
  await call("remove_page", { index: 4 });
  await call("remove_page", { index: listPages(dir).length });
  check(listPages(dir).length === demo.pages.length && listPages(dir).every((p, i) => p.index === i + 1), "remove_page renumbers without gaps");
  const xss = await call("write_page", { index: 3, layout: "custom", title: "Sanitiser check on this custom page body", slots: { body: '<div onclick="x()">ok</div><script>alert(1)</script><img src="https://evil.example/a.png">' } });
  check(/NOTE: body: Removed <script>/.test(xss.txt) && /external/.test(xss.txt), "sanitiser strips scripts and external URLs");
  await call("write_page", { index: 3, ...demo.pages[2] });
  const img = await call("generate_image", { name: "cover-test", prompt: "A modern office atrium with plants", style: "photo", aspect: "portrait" });
  check(!img.isError && fs.existsSync(path.join(dir, "assets", "cover-test.jpg")), "mock image generated");
  const rv = await call("review_document", {});
  check(/Title read-through/.test(rv.txt) && rv.content.some((c) => c.type === "image"), "review returns read-through + contact sheet");
  const ex = await call("export_document", {});
  check(!ex.isError && fs.existsSync(path.join(dir, "presentation.pdf")), `export: ${ex.txt}`);
  check(events.includes("page") && events.includes("export"), "events emitted");
  try {
    const txt = execFileSync("pdftotext", [path.join(dir, "presentation.pdf"), "-"], { encoding: "utf8" });
    const flat = txt.replace(/\s+/g, " ");
    check(/Returning Northwind to profitable growth/.test(flat) && /Input costs and wages wiped out/.test(flat), "PDF text layer is searchable");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    console.log("  (pdftotext not installed: skipped text-layer check)");
  }

  // ---------- report ----------
  const rdir = path.join(process.env.OUTPUT_DIR!, "t-report");
  initJobDir(rdir);
  const R = harness(rdir);
  const rep = strategyReport("editorial");
  await R.call("setup_document", { format: "report", theme: "editorial", title: rep.doc.title, running_title: rep.doc.running_title });
  for (const e of rep.elements) {
    const { kind, ...rest } = e as unknown as Record<string, unknown>;
    const name = kind === "chart" ? "create_chart" : kind === "diagram" ? "create_diagram" : kind === "table" ? "create_table" : "create_kpis";
    const r = await R.call(name, rest);
    check(!r.isError, `report ${name} ${e.id}: ${r.txt}`);
  }
  for (const [i, p] of rep.pages.entries()) {
    const r = await R.call("write_page", { index: i + 1, ...p });
    check(!r.isError && !/^ERROR/m.test(r.txt), `report page ${i + 1} (${p.layout}): ${r.txt.split("\n").filter((l) => l.startsWith("ERROR")).join(" | ")}`);
  }
  const wrong = await R.call("write_page", { index: 3, layout: "kpi-dashboard", title: "Deck-only layout in a report should be refused", slots: { kpis: "numbers" } });
  check(/not available for the report format/.test(wrong.txt), "deck-only layout refused in report");
  await R.call("write_page", { index: 3, ...rep.pages[2] });
  const long = await R.call("write_page", { index: rep.pages.length + 1, layout: "article", title: "Overflow check", slots: { body: Array(40).fill("A long paragraph of body text that keeps going to make sure that the overflow detection works for multi-column article pages in the report format.").join("\n\n") } });
  check(/Body text does not fit/.test(long.txt), "article overflow detected");
  await R.call("remove_page", { index: rep.pages.length + 1 });
  const rex = await R.call("export_document", { file_name: "resilience.pdf" });
  check(!rex.isError && fs.existsSync(path.join(rdir, "resilience.pdf")), `report export: ${rex.txt}`);
  const toc = fs.readFileSync(path.join(rdir, "build", "page-02.html"), "utf8");
  check(/What sets resilient companies apart/.test(toc) && /toc-p">5</.test(toc), "auto table of contents with page numbers");
} finally {
  await closeBrowser();
}
if (fail.length) {
  console.error(`✗ ${fail.length} check(s) failed:\n- ${fail.join("\n- ")}`);
  process.exit(1);
}
console.log(`✓ tools OK (${process.env.OUTPUT_DIR})`);
