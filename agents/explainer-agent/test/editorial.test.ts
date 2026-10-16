/**
 * The editorial style end to end, without Claude: the kit in Node (deterministic geometry, the count-up), a project
 * set up with --style editorial and the acme brand, build-frame's remix of the editorial preset (the colour field
 * becomes the brand accent), frame packets that inline the editorial blueprint and rules, two frames built on the kit,
 * lint, check, snapshot and a draft render — with pixel checks that the halftone treatment reaches the SECOND frame
 * (a treated <img> must be its own clip), that the spotlight dims the frame and that the vignette darkens the corners.
 * Costs nothing; needs FFmpeg and HyperFrames' Chrome for the render.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { alignStyleFonts, ensureBrandSection } from "../src/agent.js";
import { PLUGIN_DIR, ROOT, STYLES, styleSpec } from "../src/config.js";
import type { JobOptions } from "../src/events.js";
import { stageStyleKit } from "../src/extensions.js";
import { failureText, hf, hfEnv, localizeGsap, preflight, probeVideo } from "../src/hyperframes.js";
import { encodePng } from "../src/media/png.js";
import { brandKit, resolveProduct } from "../src/product.js";
import { lockedBriefFields, setupProject } from "../src/project.js";
import { EDITORIAL_STORYBOARD, editorialFrames, type FixtureLook } from "./fixtures.js";

const ACME = path.resolve(ROOT, "../../lib/fixtures/acme");
const SCRIPTS = path.join(PLUGIN_DIR, "skills", "faceless-explainer", "scripts");
const t0 = Date.now();
const lap = (what: string) => console.log(`  ✓ ${what} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-editorial-"));

// ── the kit in Node ───────────────────────────────────────────────────────────
assert.deepEqual(STYLES, ["editorial", "vox-collage", "default"]);
assert.equal(styleSpec("editorial").preset, "editorial");
assert.equal(styleSpec("editorial").fps, undefined, "editorial renders at the default 30 fps");
{
  const g = globalThis as Record<string, unknown>;
  g.window = { document: null };
  g.gsap = { parseEase: () => (p: number) => p };
  createRequire(import.meta.url)(path.join(PLUGIN_DIR, "skills/editorial/assets/editorial.js"));
  const E = (g.window as { Editorial: Record<string, (...a: unknown[]) => unknown> }).Editorial;
  assert.equal(E.shapePath("blob", 300, 400, 3), E.shapePath("blob", 300, 400, 3), "same seed, same silhouette");
  assert.notEqual(E.shapePath("blob", 300, 400, 3), E.shapePath("blob", 300, 400, 4));
  assert.match(String(E.shapePath("arch", 200, 300)), /^M0 300V100A100 100 0 0 1 200 100V300Z$/, "the portrait niche");
  assert.equal(E.pathFrom("route 40 330 520 330 780 940 780"), "M330 520L330 740Q330 780 370 780L940 780", "a connector with a rounded corner");
  assert.match(String(E.pathFrom("ring 100 100 50")), /^M100 50A50 50/, "rings start at 12 o'clock");
  assert.equal(String(E.pathFrom("rays 100 100 20 60 4")).match(/M/g)?.length, 4);
  assert.equal(String(E.pathFrom("stack 0 500 100 5 12")).match(/M/g)?.length, 5, "a stack of five coins");
  assert.equal(E.pathFrom("nope 1 2"), null);
  assert.equal(E.formatNumber(1234567.891, 1), "1,234,567.9");
  // the count-up writes the digits from the tween's progress
  const el = { textContent: "" };
  const tl = { fromTo: (o: { v: number }, _a: unknown, b: { v: number; onUpdate: () => void }) => ((o.v = b.v), b.onUpdate()) };
  E.count(tl, el, 0, { to: 829, suffix: "%" });
  assert.equal(el.textContent, "829%");
  delete g.window;
  delete g.gsap;
}
lap("editorial kit geometry");

// ── an editorial job: project, preset, packets, frames ───────────────────────
const product = resolveProduct(ACME);
const kit = brandKit(product);
const o: JobOptions = { brief: "# Why sourdough takes a day\n\nSix seconds for home bakers.", format: "portrait", lengthSec: 6, style: "editorial", inputs: [] };
assert.equal(lockedBriefFields(o, "faceless-explainer").style_preset, "editorial");
const jobDir = path.join(tmp, "job");
fs.mkdirSync(jobDir);
const setup = await setupProject(jobDir, o, kit, "faceless-explainer");
const P = setup.projectDir;
const read = (rel: string) => fs.readFileSync(path.join(P, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(P, rel));
assert.equal(setup.kit, "assets/editorial");
for (const f of ["editorial.js", "film-grain.svg", "film-grain-light.svg", "vignette.svg", "grid.svg", "halftone.svg"]) assert.ok(exists(`assets/editorial/${f}`), f);
assert.equal(stageStyleKit(path.join(tmp, "none"), "default"), null);
lap("project set up with the editorial kit");

const env = hfEnv();
const node = (script: string, args: string[]) => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd: P, env, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `${script} ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  return `${r.stdout}\n${r.stderr}`;
};
const bf = node("build-frame.mjs", ["--preset", "editorial", "--hyperframes", "."]);
assert.match(bf, /accent [^\n]*→#ffd60a/i, `the colour field became the brand accent\n${bf}`);
const frameMd = read("frame.md");
assert.match(frameMd, /name: Editorial/);
assert.match(frameMd, /field: "#ffd60a"/i, "field → the brand accent, exactly");
assert.match(frameMd, /paper: "#faf7f2"/i, "paper → the brand canvas");
assert.match(frameMd, /Acme Sans/, "display and body → the brand face");
assert.ok(exists(".hyperframes/caption-skin.html"), "the editorial caption skin is copied");
assert.match(read(".hyperframes/caption-skin.html"), /documentary subtitles/);
assert.equal(alignStyleFonts(P, kit), true);
assert.equal(alignStyleFonts(P, kit), false, "once");
assert.doesNotMatch(read("frame.md"), /EB Garamond/, "the serif voice uses a face the project ships");
assert.equal(ensureBrandSection(P, kit, setup.logos), true);
lap("build-frame remixed the editorial preset onto the brand");

fs.writeFileSync(path.join(P, "STORYBOARD.md"), EDITORIAL_STORYBOARD);
node("frame-packets.mjs", ["--project", P, "--storyboard", path.join(P, "STORYBOARD.md")]);
const packet = read(".hyperframes/frame-packets/01-field.md");
assert.match(packet, /## Selected blueprint: editorial-subject-field/);
assert.match(packet, /## Selected motion rule: editorial-kit[\s\S]*assets\/editorial\/editorial\.js/);
assert.match(packet, /## Selected motion rule: editorial-callouts/);
assert.match(packet, /data-color-grading/, "the packet carries the picture treatments");
for (const f of ["01-field", "02-paper"]) {
  const bytes = Buffer.byteLength(read(`.hyperframes/frame-packets/${f}.md`));
  assert.ok(bytes < 48_000, `${f}'s packet stays under the 48 KB bound (${bytes})`);
}
lap("frame packets inline the editorial blueprints and rules");

// a colourful cut-out (red and green rings on transparency): the treatment must turn it black and white
{
  const n = 600;
  const px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2, y - n / 2);
      const i = (y * n + x) * 4;
      if (d > 270) continue;
      const band = Math.floor(d / 45) % 2;
      px.set(band ? [230, 40, 30, 255] : [40, 190, 60, 255], i);
    }
  fs.mkdirSync(path.join(P, "assets", "images"), { recursive: true });
  fs.writeFileSync(path.join(P, "assets", "images", "subject.png"), encodePng(n, n, px));
}
const c = kit.colors!;
const look: FixtureLook = { canvas: c.canvas, ink: c.ink, accent: c.accent, onAccent: c.onAccent, family: '"Acme Sans", sans-serif', fontFaceCss: kit.fontFaceCss };
fs.mkdirSync(path.join(P, "compositions", "frames"), { recursive: true });
for (const [id, html] of Object.entries(editorialFrames(look))) fs.writeFileSync(path.join(P, `compositions/frames/${id}.html`), html);
node("assemble-index.mjs", ["--storyboard", "./STORYBOARD.md", "--hyperframes", "."]);
localizeGsap(P);
const lint = await hf(["lint"], { cwd: P, timeoutMs: 120_000 });
assert.equal(lint.code, 0, `hyperframes lint:\n${failureText(lint, 40)}`);
assert.match(lint.stdout + lint.stderr, /0 error/);
lap("editorial frames assembled and linted");

const pf = await preflight();
if (!pf.browser.ok || !pf.ffmpeg) {
  console.log(`  ⚠ skipped check, snapshot and render: ${pf.problems.join("; ")} (run npm run setup)`);
} else {
  const check = await hf(["check"], { cwd: P, timeoutMs: 300_000 });
  assert.equal(check.code, 0, `hyperframes check:\n${failureText(check, 40)}`);
  lap("hyperframes check");
  const snap = await hf(["snapshot", "--at", "1.5,4.5", "--no-end"], { cwd: P, timeoutMs: 300_000 });
  assert.equal(snap.code, 0, `hyperframes snapshot:\n${failureText(snap, 20)}`);
  lap("hyperframes snapshot");
  const render = await hf(["render", "--skill=faceless-explainer", "--quality", "draft", "--output", "renders/video.mp4"], { cwd: P, timeoutMs: 600_000 });
  assert.equal(render.code, 0, `hyperframes render:\n${failureText(render, 30)}`);
  const video = path.join(P, "renders", "video.mp4");
  const vinfo = probeVideo(video);
  assert.ok(vinfo, "the render is a readable MP4");
  assert.deepEqual([vinfo.width, vinfo.height], [1080, 1350]);
  assert.ok(Math.abs(vinfo.durationSec - 6) < 0.3, `6 s (${vinfo.durationSec})`);
  /** rgb24 pixels of a crop at time t */
  const crop = (t: number, x: number, y: number, w: number, h: number) =>
    spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y},scale=${Math.max(8, w / 8)}:${Math.max(8, h / 8)}`, "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], { maxBuffer: 1 << 22 }).stdout as Buffer;
  const saturation = (b: Buffer) => {
    let sum = 0;
    for (let i = 0; i < b.length; i += 3) sum += Math.max(b[i], b[i + 1], b[i + 2]) - Math.min(b[i], b[i + 1], b[i + 2]);
    return sum / (b.length / 3);
  };
  const luma = (b: Buffer) => {
    let sum = 0;
    for (let i = 0; i < b.length; i += 3) sum += 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
    return sum / (b.length / 3);
  };
  // the subject's centre in each frame: printed in black and white (the source is saturated red and green)
  const s1 = saturation(crop(1.6, 440, 500, 200, 200));
  const s2 = saturation(crop(4.6, 440, 500, 200, 200));
  assert.ok(s1 < 45, `frame 1's subject is black and white (saturation ${s1.toFixed(0)})`);
  assert.ok(s2 < 45, `frame 2's subject is black and white too: the treated <img> is a clip (saturation ${s2.toFixed(0)})`);
  // the spotlight: outside the circle, frame 1 is darker after the focus than before it
  const [before, after] = [luma(crop(1.6, 20, 1180, 160, 120)), luma(crop(2.9, 20, 1180, 160, 120))];
  assert.ok(after < before * 0.6, `the spotlight dims the frame (${before.toFixed(0)} → ${after.toFixed(0)})`);
  // the vignette: on frame 2's paper ground a corner is darker than the open paper near the top centre
  const [corner, open] = [luma(crop(5.0, 0, 0, 64, 64)), luma(crop(5.0, 500, 120, 80, 64))];
  assert.ok(corner < open - 6, `the vignette darkens the corners (${corner.toFixed(0)} < ${open.toFixed(0)})`);
  lap(`draft render, ${vinfo.durationSec} s, treatments in both frames`);
}

if (process.env.KEEP_TEST_OUTPUT) console.log(`  kept ${tmp}`);
else fs.rmSync(tmp, { recursive: true, force: true });
console.log("✓ editorial OK");
