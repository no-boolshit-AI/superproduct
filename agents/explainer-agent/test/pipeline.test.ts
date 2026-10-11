/**
 * The real HyperFrames pipeline this agent drives, with the steps Claude would take played by fixtures: project setup
 * with a product (lib/fixtures/acme), build-frame's brand remix, the Brand kit section, the silent audio step, frame
 * packets, two frames written the way frame workers write them, assembly, transitions, offline GSAP, lint, check,
 * snapshot, a draft render and delivery. Costs nothing; needs FFmpeg and HyperFrames' Chrome (npm run setup).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureBrandSection } from "../src/agent.js";
import { PLUGIN_DIR, ROOT } from "../src/config.js";
import type { JobOptions } from "../src/events.js";
import { failureText, hf, hfEnv, localizeGsap, preflight, probeVideo } from "../src/hyperframes.js";
import { BRAND_MARKER, brandKit, resolveProduct } from "../src/product.js";
import { setupProject, writeBrandCapture } from "../src/project.js";
import { collectDelivery, type ToolContext } from "../src/tools.js";
import { STORYBOARD, answerFrame, hookFrame, type FixtureLook } from "./fixtures.js";

const ACME = path.resolve(ROOT, "../../lib/fixtures/acme");
const SCRIPTS = path.join(PLUGIN_DIR, "skills", "faceless-explainer", "scripts");
const t0 = Date.now();
const lap = (what: string) => console.log(`  ✓ ${what} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);

const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-pipeline-"));
const o: JobOptions = {
  brief: "# Why sourdough takes time\n\nA four-second explainer for home bakers: wild yeast is slow, so a good loaf takes [X] hours. Close on the subscription.",
  format: "portrait",
  lengthSec: 4,
  inputs: [],
};

// ── product → brand kit → project ─────────────────────────────────────────────
const product = resolveProduct(ACME);
assert.ok(product, "acme fixture loads");
const kit = brandKit(product);
assert.equal(kit.name, "Acme Bread");
assert.equal(kit.colors?.accent, "#ffd60a");
assert.equal(kit.colors?.onAccent, "#2b1d16", "the product's own on-accent colour is kept when it reads");
assert.equal(kit.fonts.display, "Acme Sans");
const setup = await setupProject(jobDir, o, kit, "faceless-explainer");
const P = setup.projectDir;
const read = (rel: string) => fs.readFileSync(path.join(P, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(P, rel));
assert.ok(exists("hyperframes.json"), "hyperframes init ran");
assert.match(read("capture/extracted/visible-text.txt"), /wild yeast is slow/);
const tokens = JSON.parse(read("capture/extracted/tokens.json"));
assert.deepEqual(tokens.colors, ["#faf7f2", "#2b1d16", "#ffd60a", "#86700a"]);
assert.deepEqual(tokens.fonts.map((f: { family: string }) => f.family), ["Acme Sans"]);
assert.ok(exists("capture/assets/fonts/acme-sans.woff2") && exists("assets/fonts/captured-acme-sans.woff2"), "font files staged");
assert.match(read("capture/extracted/page.html"), /@font-face\{font-family:"Acme Sans";[^}]*font-weight:400 700[^}]*url\("assets\/fonts\/acme-sans\.woff2"\)/);
assert.ok(!exists("design.md"), "build-frame workflows get the brand kit in frame.md, not design.md");
writeBrandCapture(P, kit, { title: "x", description: "y" });
assert.equal((read("capture/extracted/page.html").match(/@font-face/g) ?? []).length, 1, "writing the brand capture again changes nothing");
lap("project set up with the acme brand");

const env = hfEnv();
const node = (script: string, args: string[]) => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd: P, env, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `${script} ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  return `${r.stdout}\n${r.stderr}`;
};

// ── Step 2: design system ─────────────────────────────────────────────────────
const bf = node("build-frame.mjs", ["--preset", "cobalt-grid", "--hyperframes", "."]);
assert.match(bf, /accent [^\n]*→#ffd60a/i, "build-frame mapped the brand accent");
let frameMd = read("frame.md");
assert.match(frameMd, /Acme Sans/, "brand family swapped in");
assert.match(frameMd, /## Font loading \(auto-generated\)[\s\S]*captured-acme-sans\.woff2/, "build-frame loads the brand font from the capture");
assert.match(frameMd, /unicode-range|font-weight:400 700/, "the captured @font-face keeps its descriptors");
assert.equal(ensureBrandSection(P, kit, setup.logos), true);
assert.equal(ensureBrandSection(P, kit, setup.logos), false, "the Brand kit is appended once");
frameMd = read("frame.md");
assert.ok(frameMd.includes(BRAND_MARKER));
assert.match(frameMd, /Start a subscription/);
assert.match(frameMd, /src:url\("assets\/fonts\/captured-acme-sans\.woff2"\)/);
lap("build-frame remixed cobalt-grid onto the brand; Brand kit appended");

// ── Step 3: storyboard (silent: music none, no SCRIPT.md, no sfx) ───────────
fs.writeFileSync(path.join(P, "STORYBOARD.md"), STORYBOARD);
const audio = node("audio.mjs", ["--script", "./SCRIPT.md", "--storyboard", "./STORYBOARD.md", "--hyperframes", ".", "--out", "./audio_meta.json"]);
assert.match(audio, /silent/, "audio.mjs recognises the silent marker");
assert.ok(!exists("audio_meta.json"));
lap("silent audio step");

// ── Step 5: packets, frames (as workers write them), assembly ─────────────────
const packets = node("frame-packets.mjs", ["--project", P, "--storyboard", path.join(P, "STORYBOARD.md")]);
assert.match(packets, /2 bounded packet/);
assert.ok(exists(".hyperframes/frame-packets/_role.md") && exists(".hyperframes/frame-packets/01-hook.md") && exists(".hyperframes/frame-packets/02-answer.md"));

const c = kit.colors!;
const look: FixtureLook = { canvas: c.canvas, ink: c.ink, accent: c.accent, onAccent: c.onAccent, family: '"Acme Sans", sans-serif', fontFaceCss: kit.fontFaceCss };
fs.mkdirSync(path.join(P, "compositions", "frames"), { recursive: true });
fs.writeFileSync(path.join(P, "compositions/frames/01-hook.html"), hookFrame(look));
fs.writeFileSync(path.join(P, "compositions/frames/02-answer.html"), answerFrame(look));
const assembled = node("assemble-index.mjs", ["--storyboard", "./STORYBOARD.md", "--hyperframes", "."]);
assert.ok(exists("index.html"), `index.html assembled\n${assembled}`);
node("transitions.mjs", ["inject", "--storyboard", "./STORYBOARD.md", "--hyperframes", "."]);
node("transitions.mjs", ["verify", "--storyboard", "./STORYBOARD.md", "--index", "./index.html"]);
lap("frame packets, frames, index.html and transitions");

// ── offline GSAP: what the harness does before Chrome loads a composition ─────
const loc = localizeGsap(P);
assert.ok(loc.replaced >= 3, `GSAP tags localized (${loc.replaced})`);
assert.ok(exists("vendor/gsap/gsap.min.js"));
for (const f of ["index.html", "compositions/frames/01-hook.html", "compositions/frames/02-answer.html"]) assert.doesNotMatch(read(f), /cdn\.jsdelivr\.net\/npm\/gsap/, f);
assert.match(read("index.html"), /integrity="sha384-/, "the SRI hash stays: the local copy is byte-identical");
lap("GSAP served locally");

// ── Step 6: lint, check, snapshot, render ─────────────────────────────────────
const lint = await hf(["lint"], { cwd: P, timeoutMs: 120_000 });
assert.equal(lint.code, 0, `hyperframes lint:\n${failureText(lint, 40)}`);
lap("hyperframes lint");

const pf = await preflight();
if (!pf.browser.ok || !pf.ffmpeg) {
  console.log(`  ⚠ skipped check, snapshot, render and delivery: ${pf.problems.join("; ")} (run npm run setup)`);
} else {
  const check = await hf(["check"], { cwd: P, timeoutMs: 300_000 });
  assert.equal(check.code, 0, `hyperframes check:\n${failureText(check, 40)}`);
  lap("hyperframes check");

  const snap = await hf(["snapshot", "--at", "1.2,3.2"], { cwd: P, timeoutMs: 300_000 });
  assert.equal(snap.code, 0, `hyperframes snapshot:\n${failureText(snap, 20)}`);
  assert.ok(exists("snapshots/contact-sheet.jpg"), "contact sheet written");
  lap("hyperframes snapshot");

  const render = await hf(["render", "--skill=faceless-explainer", "--quality", "draft", "--output", "renders/video.mp4"], { cwd: P, timeoutMs: 600_000 });
  assert.equal(render.code, 0, `hyperframes render:\n${failureText(render, 30)}`);
  const video = path.join(P, "renders", "video.mp4");
  const info = probeVideo(video);
  assert.ok(info, "the render is a readable MP4");
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1350);
  assert.ok(Math.abs(info.durationSec - 4) < 0.6, `about 4 s long (${info.durationSec})`);
  lap(`draft render ${info.width}×${info.height}, ${info.durationSec} s`);

  // the timelines ran: the hook's title fades in, then frame 2 replaces frame 1 (both frames use a top-level `const tl`)
  const grab = (t: number) => {
    const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=27:34,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 });
    assert.equal(r.status, 0, String(r.stderr));
    return r.stdout as Buffer;
  };
  const diff = (a: Buffer, b: Buffer) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const [start, hook, answer] = [grab(0.05), grab(1.2), grab(3.4)];
  assert.ok(diff(start, hook) > 1.5, `the hook animates in (Δ ${diff(start, hook).toFixed(2)})`);
  assert.ok(diff(hook, answer) > 1.5, `frame 2 follows frame 1 (Δ ${diff(hook, answer).toFixed(2)})`);
  lap("both frames animate");

  const ctx: ToolContext = { jobDir, projectDir: P, width: 1080, height: 1350, cta: kit.cta, emit: () => {} };
  const d = collectDelivery(ctx, {
    videoAbs: video,
    sheetAbs: path.join(P, "snapshots", "contact-sheet.jpg"),
    title: "Why sourdough takes time",
    caption: "Good bread is slow bread.\n\nWild yeast needs hours. We wait, so you don't.\n\nStart a subscription: acme.example/start",
    altText: "Big type asks why sourdough takes hours, then the answer and a yellow subscription button.",
    placeholders: ["[X] hours — frame 1"],
  });
  assert.equal(d.info.durationSec, info.durationSec);
  for (const f of ["video.mp4", "contact-sheet.jpg", "post.md"]) assert.ok(fs.existsSync(path.join(jobDir, f)), f);
  const post = fs.readFileSync(path.join(jobDir, "post.md"), "utf8");
  assert.match(post, /^# Why sourdough takes time/);
  assert.match(post, /## Placeholders to fill\n\n- \[X\] hours — frame 1/);
  assert.match(post, /Start a subscription → https:\/\/acme\.example\/start/);
  assert.match(post, /## Frames\n\n- `01-hook` Hook \(2s\)\n- `02-answer` Answer \(2s\)/);
  lap("delivered: video.mp4, contact sheet, post.md");
}

if (process.env.KEEP_TEST_OUTPUT) console.log(`  kept ${jobDir}`);
else fs.rmSync(jobDir, { recursive: true, force: true });
console.log("✓ pipeline OK");
