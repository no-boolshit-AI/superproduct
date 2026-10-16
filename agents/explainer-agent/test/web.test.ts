/** Web UI server: meta, request guards, a job from the UI with an uploaded note, its storyboard, the approval, live events, video byte ranges, revision. */
import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

await import("../src/env.js"); // .env first, so the overrides below win
process.env.OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-web-"));
process.env.PRODUCT_DIR = "none"; // hermetic: ignore the workspace's product/ folder (pipeline.test.ts covers a product)
// the mock run asks for one picture: placeholders, never a paid API from a test
process.env.IMAGE_MOCK = "1";
for (const k of ["OPENAI_API_KEY", "ELEVENLABS_API_KEY", "MAX_IMAGES"]) delete process.env[k];
delete process.env.MAX_BUDGET_USD;
const m = await import("./mock-claude.js");
const mock = await m.startMockClaude();
const { server } = await import("../src/web/server.js");
const { preflight } = await import("../src/hyperframes.js");
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const sseUntilDone = async (id: string) => {
  const text = await (await fetch(`${base}/api/jobs/${id}/events`)).text(); // the stream ends on "done"
  return text.split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
};

try {
  const meta = await (await fetch(`${base}/api/meta`)).json();
  assert.equal(meta.formats.length, 4);
  assert.equal(meta.defaults.format, "portrait");
  assert.equal(meta.brand, "none (HyperFrames preset palette)");
  assert.equal(meta.hyperframes.skillCount, 24);
  assert.deepEqual(meta.styles.map((s: { id: string }) => s.id), ["editorial", "vox-collage", "default"]);
  assert.equal(meta.defaults.style, "editorial");
  assert.equal(meta.defaults.storyboard, true, "the storyboard is reviewed first by default");
  assert.deepEqual(meta.looks.map((l: { id: string }) => l.id), ["auto", "colour-field", "paper-data", "documentary", "duotone"]);
  assert.equal(meta.steps.length, 14);
  assert.ok("images" in meta && "sound" in meta, "the UI is told which media services are set up");

  assert.equal((await post("/api/jobs", {}, { Origin: "https://evil.example" })).status, 403, "cross-origin POST blocked");
  assert.equal((await fetch(`${base}/api/jobs`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" })).status, 403, "non-JSON POST blocked");
  assert.equal((await post("/api/jobs", { brief: "" })).status, 400, "empty brief refused");
  assert.equal((await post("/api/jobs", { brief: "x", length: 9000 })).status, 400, "length checked");
  assert.equal((await post("/api/jobs", { brief: "x", workflow: "product-launch-video" })).status, 400, "launch video needs a URL");
  const bad = await post("/api/jobs", { brief: "x", files: [{ name: "run.sh", data: "ZWNobw==" }] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /Unsupported file type/);

  const pf = await preflight();
  if (!pf.browser.ok || !pf.ffmpeg) {
    console.log(`⚠ web job skipped: ${pf.problems.join("; ")} (run npm run setup)`);
  } else {
    const note = Buffer.from("Wild yeast is slow: a good loaf takes [X] hours.").toString("base64");
    const r = await post("/api/jobs", { brief: "# Why sourdough takes time\n\nFour seconds for home bakers.", format: "portrait", length: 4, quality: "draft", style: "vox-collage", files: [{ name: "notes.md", data: note }] });
    assert.equal(r.status, 202);
    const { id } = await r.json();
    // the storyboard first
    const sbEvents = await sseUntilDone(id);
    const sbDone = sbEvents.at(-1);
    assert.equal(sbDone.type, "done");
    assert.equal(sbDone.job.status, "storyboard", sbDone.job.error);
    assert.ok(sbEvents.some((e) => e.type === "storyboard" && e.version === 1));
    assert.ok(!sbEvents.some((e) => e.type === "step" && e.step === "render"), "nothing rendered before approval");
    assert.ok(fs.existsSync(path.join(process.env.OUTPUT_DIR!, id, "project", "capture", "inputs", "notes.md")), "the uploaded note is in the project");
    assert.equal(sbDone.job.options.style, "vox-collage", "the style from the form reaches the job");
    assert.ok(fs.existsSync(path.join(process.env.OUTPUT_DIR!, id, "project", "assets", "collage", "collage.js")), "the collage kit is staged");
    const waiting = await (await fetch(`${base}/api/jobs/${id}`)).json();
    assert.match(waiting.storyboardReview, /# Why sourdough takes time — storyboard v1/);
    assert.equal((await fetch(`${base}/out/${id}/storyboard.jpg`)).headers.get("content-type"), "image/jpeg");
    assert.ok((await fetch(`${base}/out/${id}/project/storyboard.html`)).ok, "the sheet opens in the browser");
    assert.equal((await (await fetch(`${base}/api/jobs`)).json())[0].thumb, "storyboard.jpg", "the list shows the sheet until there's a video");
    // approved → the video
    assert.equal((await post(`/api/jobs/${id}/approve`, { notes: "Keep it calm." })).status, 202);
    const events = await sseUntilDone(id);
    const done = events.at(-1);
    assert.equal(done.type, "done");
    assert.equal(done.job.status, "done", done.job.error);
    assert.equal(done.job.storyboard.approvalNotes, "Keep it calm.");
    assert.ok(events.some((e) => e.type === "step" && e.step === "render"));
    assert.ok(events.some((e) => e.type === "video"));
    assert.equal((await post(`/api/jobs/${id}/approve`, {})).status, 409, "nothing left to approve");

    const job = await (await fetch(`${base}/api/jobs/${id}`)).json();
    assert.match(job.post, /## Caption/);
    const head = await fetch(`${base}/out/${id}/video.mp4`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-type"), "video/mp4");
    assert.equal(head.headers.get("accept-ranges"), "bytes");
    const part = await fetch(`${base}/out/${id}/video.mp4`, { headers: { Range: "bytes=0-99" } });
    assert.equal(part.status, 206, "byte ranges for the player");
    assert.equal((await part.arrayBuffer()).byteLength, 100);
    assert.match(part.headers.get("content-range") ?? "", /^bytes 0-99\/\d+$/);
    assert.ok((await fetch(`${base}/out/${id}/contact-sheet.jpg`)).ok);
    assert.ok((await fetch(`${base}/out/${id}/project/index.html`)).headers.get("content-security-policy"), "job files carry a CSP");
    assert.equal((await fetch(`${base}/out/${id}/..%2F..%2Fetc%2Fpasswd`)).status, 404, "path traversal blocked");
    const list = await (await fetch(`${base}/api/jobs`)).json();
    assert.equal(list[0].id, id);
    assert.equal(list[0].thumb, "contact-sheet.jpg");

    assert.equal((await post(`/api/jobs/${id}/revise`, { instructions: "" })).status, 400);
    const rev = await post(`/api/jobs/${id}/revise`, { instructions: "Make frame 2's line warmer." });
    assert.equal(rev.status, 202);
    const revDone = (await sseUntilDone(id)).at(-1);
    assert.equal(revDone.job.status, "done", revDone.job.error);
    assert.equal(revDone.job.revisions.length, 1);
    console.log(`  ✓ job ${id}: storyboard, approval and a revision through the UI`);
  }
  console.log("✓ web OK");
} finally {
  server.closeAllConnections();
  server.close();
  mock.close();
}
process.exit(process.exitCode ?? 0);
