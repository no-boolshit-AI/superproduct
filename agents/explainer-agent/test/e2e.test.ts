/**
 * A whole run and a revision through the real Agent SDK + Claude Code + the bundled HyperFrames plugin + hooks +
 * frame-worker subagents + a real HyperFrames render, against a mock Claude API (no product folder, zero cost).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { JobEvent } from "../src/events.js";

await import("../src/env.js"); // .env first, so the overrides below win
process.env.OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-e2e-"));
process.env.PRODUCT_DIR = "none";
// pictures as placeholders (the tool runs for real, no image API); no ElevenLabs on this silent run
process.env.IMAGE_MOCK = "1";
for (const k of ["OPENAI_API_KEY", "ELEVENLABS_API_KEY", "MAX_IMAGES", "OPENAI_IMAGE_MODEL"]) delete process.env[k];
delete process.env.MAX_BUDGET_USD;
delete process.env.CLAUDE_EFFORT;
delete process.env.FRAME_WORKER_MODEL;

const { startMockClaude, toolResults, seen } = await import("./mock-claude.js");
const mock = await startMockClaude();
const { runJob, readJob } = await import("../src/agent.js");
const { preflight } = await import("../src/hyperframes.js");
const { pluginInfo } = await import("../src/config.js");

const pf = await preflight();
if (!pf.browser.ok || !pf.ffmpeg) {
  console.log(`⚠ e2e skipped: ${pf.problems.join("; ")} (run npm run setup)`);
  mock.close();
  process.exit(0);
}

const t0 = Date.now();
const results = (name: string) => toolResults.filter((r) => r.name === name);
const fail = (job: { status: string; error?: string; warnings?: string[] }) =>
  `\n${JSON.stringify({ status: job.status, error: job.error, warnings: job.warnings, results: toolResults.filter((r) => r.isError).map((r) => `${r.name}: ${r.text.slice(0, 300)}`) }, null, 2)}`;
const stepsOf = (events: JobEvent[]) => events.filter((e) => e.type === "step").map((e) => (e as { step: string }).step);
const deniedOf = (events: JobEvent[]) => events.filter((e) => e.type === "denied").map((e) => (e as { reason: string }).reason);

// ── run 1: the storyboard, for review; nothing is built ──────────────────────
const sbEvents: JobEvent[] = [];
const job = await runJob({
  options: { brief: "# Why sourdough takes time\n\nFour seconds for home bakers: wild yeast is slow, so a loaf takes [X] hours.", format: "portrait", lengthSec: 4, quality: "draft", style: "default" },
  emit: (e) => sbEvents.push(e),
});
const P = path.join(job.dir, "project");
assert.equal(job.status, "storyboard", `the run stops at the storyboard${fail(job)}`);
assert.equal(job.phase, "storyboard");
assert.equal(job.storyboard?.version, 1);
assert.equal(job.storyboard?.frames, 2);
assert.equal(job.storyboard?.review, "storyboard.md");
assert.equal(job.storyboard?.sheet, "storyboard.jpg", "the sheet was photographed");
assert.ok(job.sessionId, "session id saved for the approval");
assert.equal(job.video, undefined);
assert.deepEqual(stepsOf(sbEvents), ["setup", "brief", "design", "storyboard", "review"]);
assert.match(fs.readFileSync(path.join(job.dir, "storyboard.md"), "utf8"), /# Why sourdough takes time — storyboard v1[\s\S]*\*\*Main points\*\*[\s\S]*## Placeholders to fill\n\n- \[X\] hours — frame 01/);
assert.ok(fs.statSync(path.join(job.dir, "storyboard.jpg")).size > 5_000);
assert.ok(!fs.existsSync(path.join(P, ".hyperframes", "frame-packets")), "no frame packets before approval");
assert.ok(!fs.existsSync(path.join(P, "compositions", "frames", "01-hook.html")), "no frames before approval");
const sbDenied = deniedOf(sbEvents);
assert.equal(sbDenied.filter((r) => /isn't approved yet/.test(r)).length, 2, `frame packets and the worker refused before approval: ${sbDenied.join(" | ")}`);
const presentResult = results("mcp__explainer__present_storyboard")[0];
assert.ok(presentResult && !presentResult.isError && presentResult.images === 1, `present_storyboard returned the photographed sheet: ${presentResult?.text.slice(0, 200)}`);
const sbRun = seen.runs.storyboard!;
assert.ok(sbRun.tools.includes("mcp__explainer__present_storyboard"), "the storyboard run can present");
for (const t of ["mcp__explainer__deliver", "mcp__explainer__generate_images"]) assert.ok(!sbRun.tools.includes(t), `no ${t} before approval`);
assert.match(sbRun.system, /## Mode: storyboard first — this run stops at the storyboard/);
assert.match(sbRun.system, /## Teaching: clear, for a newcomer/);
assert.match(sbRun.system, /## Pictures: planned now, generated after approval/);
assert.match(sbRun.prompt, /Plan an explainer video from this brief and present its storyboard for review/);
assert.match(fs.readFileSync(path.join(P, "BRIEF.md"), "utf8"), /storyboard: yes/);
console.log(`  ✓ storyboard v1: ${job.storyboard?.frames} frames, sheet photographed, build steps refused (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// ── run 2: a change to the storyboard ─────────────────────────────────────────
const t1 = Date.now();
const sb2Events: JobEvent[] = [];
const sb2 = await runJob({ options: { brief: "", format: "portrait" }, reviseJobId: job.id, instructions: "Say 'good sourdough' in the hook.", emit: (e) => sb2Events.push(e) });
assert.equal(sb2.status, "storyboard", `still waiting for approval${fail(sb2)}`);
assert.equal(sb2.storyboard?.version, 2);
assert.deepEqual(sb2.revisions.map((r) => r.kind), ["storyboard"]);
assert.deepEqual(stepsOf(sb2Events), ["setup", "storyboard", "review"]);
assert.match(fs.readFileSync(path.join(job.dir, "storyboard.md"), "utf8"), /storyboard v2[\s\S]*Why does good sourdough take \[X\] hours\?/);
assert.match(seen.runs["storyboard-revision"]!.prompt, /reviewed storyboard v1 and asks for these changes[\s\S]*good sourdough[\s\S]*v2/);
console.log(`  ✓ storyboard v2 after a change (${((Date.now() - t1) / 1000).toFixed(0)} s)`);

// ── run 3: approved, with a last note → the video ─────────────────────────────
const t2 = Date.now();
const events: JobEvent[] = [];
const built = await runJob({ options: { brief: "", format: "portrait" }, approveJobId: job.id, instructions: "Keep it calm.", emit: (e) => events.push(e) });
const took = ((Date.now() - t2) / 1000).toFixed(0);
assert.equal(built.status, "done", `job finished${fail(built)}`);
assert.equal(built.phase, "video");
assert.ok(built.storyboard?.approvedAt, "the approval is recorded");
assert.equal(built.storyboard?.approvalNotes, "Keep it calm.");
assert.equal(built.video, "video.mp4");
assert.equal(built.width, 1080);
assert.equal(built.height, 1350);
assert.ok(built.durationSec && Math.abs(built.durationSec - 4) < 0.6, `about 4 s (${built.durationSec})`);
assert.deepEqual(built.placeholders, ["[X] hours — frame 1"]);
assert.equal(built.frames, 2);
assert.equal(built.product, null);
assert.equal(built.workflow, "faceless-explainer");
assert.equal(built.hyperframes?.skills, pluginInfo().version);
for (const f of ["video.mp4", "contact-sheet.jpg", "post.md", "brief.md", "job.json", "events.jsonl", "storyboard.md", "storyboard.jpg"]) assert.ok(fs.existsSync(path.join(job.dir, f)), f);
assert.match(fs.readFileSync(path.join(job.dir, "post.md"), "utf8"), /## Placeholders to fill\n\n- \[X\] hours — frame 1/);
assert.deepEqual(readJob(job.id)?.status, "done");
const buildRun = seen.runs.build!;
assert.match(buildRun.prompt, /Storyboard v2 of this explainer video was approved with last notes[\s\S]*<brief>[\s\S]*Keep it calm/);
assert.notEqual(built.sessionId, job.sessionId, "the build runs in a fresh session (a resumed one keeps the storyboard's system prompt)");
assert.match(buildRun.system, /## Mode: build the approved storyboard, rendering pre-approved/);
for (const t of ["mcp__explainer__deliver", "mcp__explainer__generate_images"]) assert.ok(buildRun.tools.includes(t), `the build has ${t}`);
assert.ok(!buildRun.tools.includes("mcp__explainer__present_storyboard"), "no presenting once approved");

// the agent ended its turn while the workers ran; the run carried on to delivery (the prompt stays open, session.ts)
assert.ok(seen.turnEndedMidJob, "the mock's main agent ended a turn mid-job");
assert.ok(events.filter((e) => e.type === "cost").length >= 2, "more than one turn: the run continued after the turn ended");
const nudges = events.filter((e) => e.type === "status" && /asking it to carry on/.test((e as { message: string }).message)).length;
console.log(`  · turn ended mid-job; continued by ${nudges ? `${nudges} nudge(s)` : "the workers' notices"}`);

// every milestone of the build, in order; the record keeps the storyboard's too
assert.deepEqual(stepsOf(events), ["setup", "approved", "images", "audio", "frames", "assemble", "checks", "snapshot", "render", "deliver"]);
assert.deepEqual(built.steps, ["setup", "brief", "design", "storyboard", "review", "approved", "images", "audio", "frames", "assemble", "checks", "snapshot", "render", "deliver"]);

// the picture tool through the real SDK: a placeholder PNG, its preview in the result, the record, the post note
const pics = results("mcp__explainer__generate_images")[0];
assert.ok(pics && !pics.isError, `generate_images: ${pics?.text.slice(0, 300)}`);
assert.match(pics.text, /`assets\/images\/loaf\.png` · 1024×1024 · transparent cut-out · new · placeholder/);
assert.ok(pics.images > 0, "the preview reached the model as an image");
assert.ok(fs.existsSync(path.join(P, "assets", "images", "loaf.png")));
assert.deepEqual(built.media?.map((m) => [m.type, m.file, m.provider]), [["image", "assets/images/loaf.png", "mock"]]);
assert.match(fs.readFileSync(path.join(job.dir, "post.md"), "utf8"), /## Generated media\n\n- 1 PLACEHOLDER picture/);

// the model saw the HyperFrames plugin: every bundled skill offered, the router skill loads, no web tools
const skills = pluginInfo().skills;
const missing = skills.filter((s) => !seen.mainRequestText.includes(`hyperframes:${s}`));
assert.deepEqual(missing, [], `every bundled HyperFrames skill is offered to the model (${skills.length})`);
const outside = toolResults.filter((r) => ["Read", "Grep", "Glob"].includes(r.name) && !r.isError);
assert.ok(outside.some((r) => r.name === "Read" && /faceless-explainer|Faceless/i.test(r.text)), "the agent reads the plugin's skill files");
assert.ok(outside.some((r) => r.name === "Read" && /wild yeast is slow/.test(r.text)), "and the job's brief.md above the project");
assert.ok(outside.some((r) => r.name === "Grep" && /SKILL\.md/.test(r.text)), `Grep in the plugin: ${toolResults.filter((r) => r.name === "Grep").map((r) => r.text.slice(0, 200)).join(" | ")}`);
assert.ok(outside.some((r) => r.name === "Glob" && /FRAME\.md|\.md/.test(r.text)), "Glob in the plugin");
const skill = results("Skill")[0];
if (process.env.DEBUG_E2E) {
  const i = seen.mainRequestText.indexOf("hyperframes:faceless-explainer");
  console.log(`skills listing: …${seen.mainRequestText.slice(Math.max(0, i - 600), i + 300)}…`);
  console.log(`Skill result: ${skill?.text.slice(0, 400)}`);
}
assert.ok(skill && !skill.isError, `Skill hyperframes:hyperframes loaded: ${skill?.text.slice(0, 200)}`);
for (const t of ["Bash", "Read", "Write", "Edit", "Skill", "Agent"]) assert.ok(seen.mainToolNames.includes(t), `main agent has ${t}`);
for (const t of ["WebFetch", "WebSearch", "AskUserQuestion", "mcp__explainer__generate_narration", "mcp__explainer__generate_music", "mcp__explainer__generate_sfx"]) assert.ok(!buildRun.tools.includes(t), `main agent lacks ${t}`);
assert.match(buildRun.system, /## Pictures: generated in the house style[\s\S]*placeholders \(IMAGE_MOCK=1/);
assert.match(buildRun.system, /No product folder/);

// frame workers: two of them, file tools only, each wrote its frame
assert.ok(seen.workerRequests >= 4, `two workers, two turns each (${seen.workerRequests})`);
assert.ok(!seen.workerToolNames.includes("Bash") && seen.workerToolNames.includes("Write"), `worker tools: ${seen.workerToolNames.join(", ")}`);
assert.match(seen.workerSystem, /confirmed sketch at `storyboard\.html#frame-NN`/);
for (const f of ["01-hook", "02-answer"]) assert.ok(fs.existsSync(path.join(P, "compositions", "frames", `${f}.html`)), f);
assert.ok(results("Agent").filter((r) => !/isn't approved yet/.test(r.text)).every((r) => !r.isError), "workers returned");

// the guard: network, preview and reads outside the job are refused with a reason; everything else ran
const denied = deniedOf(events);
assert.ok(denied.some((r) => /network/.test(r)), `curl refused: ${denied.join(" | ")}`);
assert.ok(denied.some((r) => /headless/.test(r)), "preview refused");
assert.ok(denied.some((r) => /outside/.test(r)), "/etc/hosts refused");
assert.deepEqual(denied.filter((r) => !/network|headless|\/etc\/hosts/.test(r)), [], "nothing else refused");
const bashErrors = results("Bash").filter((r) => r.isError && !/curl|preview|network|headless|isn't approved yet/.test(r.text));
assert.deepEqual(bashErrors.map((r) => r.text.slice(0, 300)), [], "HyperFrames commands succeed");

// npx and the plugin launcher run the installed CLI (an unpublished version would fail on npm)
assert.ok(results("Bash").some((r) => /0\.8\.140/.test(r.text) && !r.isError), "npx hyperframes@… ran the installed CLI");
assert.ok(fs.existsSync(path.join(P, ".hyperframes", "frame-packets", "_role.md")), "frame packets via the plugin launcher");
// GSAP localized before Chrome loaded the compositions; the agent looked at the contact sheet
assert.ok(fs.existsSync(path.join(P, "vendor", "gsap", "gsap.min.js")));
assert.ok(results("Read").some((r) => r.images > 0), "the contact sheet reached the model as an image");
console.log(`  ✓ approved → built: ${built.durationSec} s video, ${stepsOf(events).length} steps, ${denied.length} refusals (${took} s)`);

// ── run 4: a revision of the video resumes the same session and project ─────
const before = fs.statSync(path.join(job.dir, "video.mp4")).mtimeMs;
const t3 = Date.now();
const firstCost = built.costUsd ?? 0;
const revEvents: JobEvent[] = [];
const rev = await runJob({ options: { brief: "", format: "portrait" }, reviseJobId: job.id, instructions: "Make frame 2's line warmer.", emit: (e) => revEvents.push(e) });
assert.equal(rev.status, "done", `revision finished${fail(rev)}`);
assert.deepEqual(rev.revisions.map((r) => r.kind), ["storyboard", "video"]);
assert.equal(rev.title, "Why sourdough takes time (v2)");
assert.deepEqual(rev.placeholders, []);
assert.ok(fs.statSync(path.join(job.dir, "video.mp4")).mtimeMs > before, "video re-rendered");
assert.match(fs.readFileSync(path.join(P, "compositions", "frames", "02-answer.html"), "utf8"), /Slow yeast, better bread/);
assert.equal(rev.options.quality, "draft", "the revision keeps the job's options");
assert.deepEqual(stepsOf(revEvents), ["setup", "frames", "checks", "render", "deliver"], "the revision shows its own progress");
assert.equal(rev.steps?.length, 14, "the record keeps every milestone");
assert.equal(rev.media?.length, 1, "the media record survives a revision");
assert.ok((rev.costUsd ?? 0) > firstCost, `revision cost adds up (${firstCost} → ${rev.costUsd})`);
await assert.rejects(runJob({ options: { brief: "", format: "portrait" }, approveJobId: job.id }), /approved already/, "a delivered job can't be approved again");
console.log(`  ✓ video revision (${((Date.now() - t3) / 1000).toFixed(0)} s)`);

mock.close();
if (process.env.KEEP_TEST_OUTPUT) console.log(`  kept ${process.env.OUTPUT_DIR}`);
else fs.rmSync(process.env.OUTPUT_DIR!, { recursive: true, force: true });
console.log("✓ e2e OK");
