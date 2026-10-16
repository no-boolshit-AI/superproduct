/**
 * The storyboard checkpoint without Claude: present_storyboard is the only tool of the storyboard phase (no pictures,
 * sound or delivery before approval); it refuses without STORYBOARD.md or the sketch sheet, photographs the sheet,
 * writes storyboard.md for the person and returns the photo to the agent; the safety net builds a review from
 * STORYBOARD.md when the agent stopped early. Zero cost; the photo needs HyperFrames' Chrome (skipped without it).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { JobEvent } from "../src/events.js";
import { preflight } from "../src/hyperframes.js";
import { SHEET_WIDTH } from "../src/sheet.js";
import { explainerTools, presentStoryboard, storyboardFromProject, type StoryboardInput, type ToolContext } from "../src/tools.js";
import { STORYBOARD } from "./fixtures.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-storyboard-"));
const jobDir = path.join(tmp, "20261016-120000-why-sourdough-takes-time");
const projectDir = path.join(jobDir, "project");
fs.mkdirSync(projectDir, { recursive: true });
const events: JobEvent[] = [];
const ctx: ToolContext = {
  jobDir,
  projectDir,
  width: 1080,
  height: 1350,
  emit: (e) => events.push(e),
  phase: "storyboard",
  storyboardVersion: 1,
  formatLine: "4:5 portrait 1080×1350 · about 4 s · silent, on-screen text",
  // media configured: still no media tools before approval
  media: { store: { entries: [], save: () => {} } as never, images: { settings: { mock: true, max: 4 } as never, style: { text: "", references: [], source: "built-in" } } },
};

type Reply = { content: { type: string; text?: string; data?: string; mimeType?: string }[]; isError?: boolean };
const tools = explainerTools(ctx);
assert.deepEqual(tools.map((t) => t.name), ["present_storyboard"], "the storyboard phase offers only present_storyboard");
assert.ok(explainerTools({ ...ctx, phase: "video" }).some((t) => t.name === "deliver") && !explainerTools({ ...ctx, phase: "video" }).some((t) => t.name === "present_storyboard"), "the video phase delivers");
const txt = (r: Reply) => String(r.content[0]?.text ?? "");
const present = (a: Partial<StoryboardInput> & { sheet?: string } = {}) => tools[0].handler({ ...INPUT, ...a } as never, {} as never) as Promise<Reply>;

const INPUT: StoryboardInput = {
  title: "Why sourdough takes time",
  question: "Why does sourdough take a whole day?",
  message: "Wild yeast is slow, so good bread needs time.",
  audience: "home bakers",
  main_points: ["Sourdough rises with wild yeast, not packet yeast.", "Wild yeast works slowly."],
  look: "Editorial · paper-data: the brand keeps its accent for small touches.",
  frames: [
    { id: "01-hook", name: "Hook", seconds: 2, point: "Sourdough takes much longer than other bread.", on_screen: ["Why does sourdough take [X] hours?"], visual: "The question in big type over the accent bar.", motion: "The question rises; the bar wipes in under it." },
    { id: "02-answer", name: "Answer", seconds: 2, point: "Slow yeast is the reason — and we wait for you.", on_screen: ["Wild yeast is slow.", "Start a subscription"], narration: "Wild yeast is slow.", visual: "The answer, the wordmark and the call to action.", motion: "Cut in; the CTA pops." },
  ],
  pictures: [{ name: "loaf", kind: "cutout", shows: "a crusty sourdough loaf", treatment: "B&W halftone" }],
  placeholders: ["[X] hours — frame 01"],
  questions: ["Keep the question as the hook, or open on the loaf?"],
};

// refusals: no STORYBOARD.md, no sheet, a sheet outside the project
let r = await present();
assert.ok(r.isError && /Write STORYBOARD\.md first/.test(txt(r)), txt(r));
fs.writeFileSync(path.join(projectDir, "STORYBOARD.md"), STORYBOARD);
r = await present();
assert.ok(r.isError && /storyboard\.html doesn't exist yet/.test(txt(r)), txt(r));
r = await present({ sheet: "../brief.md" });
assert.ok(r.isError && /outside the project/.test(txt(r)));
const sb = () => ctx.storyboard; // read through a getter: the tool sets it
assert.equal(sb(), undefined, "nothing presented yet");

// the sketch sheet: two cells at the video's aspect, 1600 px wide
fs.writeFileSync(
  path.join(projectDir, "storyboard.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>
body{width:${SHEET_WIDTH}px;margin:0;padding:40px;box-sizing:border-box;background:#ECEAE6;font-family:sans-serif}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.cell{aspect-ratio:4/5;container-type:inline-size;background:#f6f4ef;position:relative}
.cell h2{position:absolute;left:8cqw;top:30cqw;font-size:10cqw;margin:0}
</style></head><body><h1>Why sourdough takes time · v1</h1><div class="grid">
<div><div class="cell" id="frame-01"><h2>Why does sourdough take [X] hours?</h2></div><p>01 · Hook · 2 s</p></div>
<div><div class="cell" id="frame-02"><h2>Wild yeast is slow.</h2></div><p>02 · Answer · 2 s</p></div>
</div></body></html>`,
);
const pf = await preflight();
const chrome = pf.browser.ok;
r = await present();
assert.ok(!r.isError, txt(r));
assert.match(txt(r), /Presented storyboard v1/);
assert.match(txt(r), /end your turn now/);
const review = fs.readFileSync(path.join(jobDir, "storyboard.md"), "utf8");
assert.match(review, /^# Why sourdough takes time — storyboard v1/);
assert.match(review, /\*\*The question:\*\* Why does sourdough take a whole day\?/);
assert.match(review, /\*\*Format:\*\* 4:5 portrait 1080×1350 · about 4 s · silent, on-screen text · 2 frames · 4 s planned/);
assert.match(review, /\*\*Main points\*\*\n\n1\. Sourdough rises with wild yeast/);
assert.match(review, /### 02-answer · Answer — 2\.0 s\n\n- \*\*Point:\*\* Slow yeast[\s\S]*- \*\*On screen:\*\* "Wild yeast is slow\." · "Start a subscription"\n- \*\*Narration:\*\* "Wild yeast is slow\."/);
assert.match(review, /## Pictures to make \(after approval\)\n\n- `loaf` \(cutout, B&W halftone\) — a crusty sourdough loaf/);
assert.match(review, /## Placeholders to fill\n\n- \[X\] hours — frame 01/);
assert.match(review, /## Questions for you\n\n- Keep the question as the hook/);
assert.match(review, /--approve 20261016-120000-why-sourdough-takes-time/);
assert.equal(sb()?.version, 1);
assert.equal(sb()?.frames, 2);
assert.equal(sb()?.html, "project/storyboard.html");
assert.ok(events.some((e) => e.type === "storyboard" && e.version === 1));
if (chrome) {
  assert.equal(sb()?.sheet, "storyboard.jpg");
  assert.equal(sb()?.cells, 2);
  assert.deepEqual(sb()?.warnings, []);
  assert.ok(fs.statSync(path.join(jobDir, "storyboard.jpg")).size > 5_000, "the sheet was photographed");
  assert.match(review, /!\[The storyboard sheet\]\(storyboard\.jpg\)/);
  const img = r.content.find((c) => c.type === "image");
  assert.equal(img?.mimeType, "image/jpeg", "the agent sees the photographed sheet");
  console.log("  ✓ present_storyboard: refusals, review document, sheet photographed and shown to the agent");
} else {
  assert.ok(sb()?.warnings.some((w) => /couldn't be photographed/.test(w)));
  assert.match(review, /open `project\/storyboard\.html` in a browser/);
  console.log(`  ⚠ sheet photo skipped: ${pf.problems.join("; ")} (run npm run setup)`);
}

// a sheet with fewer cells than frames is flagged; presenting again in the run keeps the version
if (chrome) {
  fs.writeFileSync(path.join(projectDir, "storyboard.html"), fs.readFileSync(path.join(projectDir, "storyboard.html"), "utf8").replace(/<div><div class="cell" id="frame-02">[\s\S]*?<\/p><\/div>/, ""));
  r = await present();
  assert.match(txt(r), /WARNING: The sheet has 1 cells for 2 frames/);
  assert.equal(sb()?.version, 1);
}

// the safety net: a review from STORYBOARD.md alone
const fallback = storyboardFromProject(projectDir, "Why sourdough takes time");
assert.ok(fallback);
assert.deepEqual(fallback.frames.map((f) => [f.id, f.name, f.seconds]), [["01-hook", "Hook", 2], ["02-answer", "Answer", 2]]);
assert.equal(fallback.message, "Good sourdough takes time");
assert.equal(fallback.audience, "home bakers");
const ctx2: ToolContext = { ...ctx, storyboardVersion: 2, storyboard: undefined, emit: () => {} };
fs.rmSync(path.join(projectDir, "storyboard.html"));
const { presented } = await presentStoryboard(ctx2, fallback);
assert.equal(presented.version, 2);
assert.ok(presented.warnings.some((w) => /storyboard\.html doesn't exist/.test(w)));
assert.ok(!fs.existsSync(path.join(jobDir, "storyboard.jpg")), "no stale photo of an earlier version");
assert.match(fs.readFileSync(path.join(jobDir, "storyboard.md"), "utf8"), /storyboard v2[\s\S]*### 01-hook · Hook — 2\.0 s[\s\S]*The question in big type over one accent bar|storyboard v2/);
assert.equal(storyboardFromProject(path.join(tmp, "nowhere"), "x"), null);
console.log("  ✓ safety net: a review from STORYBOARD.md");

fs.rmSync(tmp, { recursive: true, force: true });
console.log("✓ storyboard OK");
