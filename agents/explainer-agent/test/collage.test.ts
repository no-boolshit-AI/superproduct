/**
 * The vox-collage style end to end, without Claude: the skill extensions laid over the plugin (idempotent), the
 * collage kit in Node, a project set up with --style vox-collage and the acme brand, build-frame's remix of the
 * vox-collage preset, frame packets that inline the collage blueprint and rules, a collage frame built on the kit,
 * lint, check, snapshot and a 24 fps draft render. Costs nothing; needs FFmpeg and HyperFrames' Chrome for the render.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { alignStyleFonts, ensureBrandSection } from "../src/agent.js";
import { EXTENSION_SKILLS, PLUGIN_DIR, ROOT, STYLES, pluginInfo, skillProblems, styleSpec } from "../src/config.js";
import type { JobOptions } from "../src/events.js";
import { EXTENSIONS_DIR, applyExtensions, extensionStatus, stageStyleKit } from "../src/extensions.js";
import { failureText, hf, hfEnv, localizeGsap, preflight, probeVideo } from "../src/hyperframes.js";
import { brandKit, resolveProduct } from "../src/product.js";
import { lockedBriefFields, setupProject } from "../src/project.js";
import { COLLAGE_STORYBOARD, collageFrame, type FixtureLook } from "./fixtures.js";

const ACME = path.resolve(ROOT, "../../lib/fixtures/acme");
const SCRIPTS = path.join(PLUGIN_DIR, "skills", "faceless-explainer", "scripts");
const t0 = Date.now();
const lap = (what: string) => console.log(`  ✓ ${what} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-collage-"));

// ── the extensions over the plugin ───────────────────────────────────────────
assert.deepEqual(STYLES, ["default", "vox-collage"]);
assert.equal(styleSpec("vox-collage").fps, 24);
assert.equal(styleSpec("nope").id, "default");
assert.deepEqual(EXTENSION_SKILLS, ["vox-collage"]);
{
  const status = extensionStatus();
  assert.deepEqual([status.copied, status.appended, status.missingTargets], [[], [], []], "the shipped plugin already carries the extensions");
  // a fresh copy of the upstream index files, as a skills update leaves them
  const plugin = path.join(tmp, "plugin");
  for (const rel of ["skills/hyperframes-animation/rules-index.md", "skills/hyperframes-animation/blueprints-index.md", "skills/hyperframes-creative/references/visual-styles.md"]) {
    const dest = path.join(plugin, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const upstream = fs.readFileSync(path.join(PLUGIN_DIR, rel), "utf8").replace(/\n*<!-- explainer-agent extension: [\s\S]*?<!-- \/explainer-agent extension -->\n?/g, "\n");
    fs.writeFileSync(dest, upstream);
  }
  const first = applyExtensions(plugin);
  assert.equal(first.appended.length, 3);
  assert.ok(first.copied.includes("skills/vox-collage/SKILL.md") && first.copied.includes("skills/vox-collage/assets/collage.js"));
  assert.ok(first.copied.includes("skills/hyperframes-animation/rules/collage-kit.md") && first.copied.includes("skills/hyperframes-creative/frame-presets/vox-collage/FRAME.md"));
  const again = applyExtensions(plugin);
  assert.deepEqual([again.copied.length, again.appended.length], [0, 0], "applying twice changes nothing");
  const index = fs.readFileSync(path.join(plugin, "skills/hyperframes-animation/rules-index.md"), "utf8");
  assert.equal(index.match(/<!-- explainer-agent extension: /g)?.length, 1, "one block per appended file");
  assert.match(index, /<collage-kit path="rules\/collage-kit\.md">/);
  // an edited extension replaces its block instead of adding a second one
  const ext = path.join(tmp, "ext");
  fs.cpSync(EXTENSIONS_DIR, ext, { recursive: true });
  const appendFile = path.join(ext, "skills/hyperframes-animation/rules-index.append.md");
  fs.writeFileSync(appendFile, fs.readFileSync(appendFile, "utf8").replace("## Paper collage (vox-collage)", "## Paper collage (edited)"));
  const edited = applyExtensions(plugin, ext);
  assert.deepEqual(edited.appended, ["skills/hyperframes-animation/rules-index.md"]);
  const index2 = fs.readFileSync(path.join(plugin, "skills/hyperframes-animation/rules-index.md"), "utf8");
  assert.equal(index2.match(/<!-- explainer-agent extension: /g)?.length, 1);
  assert.match(index2, /Paper collage \(edited\)/);
  // a release without the target: reported, not created
  fs.rmSync(path.join(plugin, "skills/hyperframes-creative/references/visual-styles.md"));
  assert.deepEqual(applyExtensions(plugin).missingTargets, ["skills/hyperframes-creative/references/visual-styles.md"]);
}
const info = pluginInfo();
assert.ok(info.skills.includes("vox-collage"));
assert.match(skillProblems({ ...info, skills: info.skills.filter((s) => s !== "vox-collage") }, info.version)[0], /missing explainer-agent skills: vox-collage \(run npm run setup\)/);
lap("skill extensions: applied once, idempotent, edits replace their block");

// ── the kit in Node: deterministic geometry and the stop-motion ease ──────────
{
  const g = globalThis as Record<string, unknown>;
  g.window = { document: null };
  g.gsap = { parseEase: (e: string) => (e === "none" ? (p: number) => p : (p: number) => p) };
  createRequire(import.meta.url)(path.join(PLUGIN_DIR, "skills/vox-collage/assets/collage.js"));
  const C = (g.window as { Collage: Record<string, (...a: unknown[]) => unknown> }).Collage;
  assert.equal(C.tornPath(400, 100, { seed: 3, edges: "tb" }), C.tornPath(400, 100, { seed: 3, edges: "tb" }), "same seed, same tear");
  assert.notEqual(C.tornPath(400, 100, { seed: 3 }), C.tornPath(400, 100, { seed: 4 }));
  assert.match(String(C.tornPath(400, 100, { edges: "" })), /^M0 0L400 0L400 100L0 100Z$/, "no torn edges: a knife-cut rectangle");
  const [l, r] = C.seam(1080, 1350, 540) as string[];
  assert.match(l, /^M0 0L540 0/);
  assert.match(r, /^M540 0/);
  const twos = C.twos("none", 1) as (p: number) => number;
  assert.equal(twos(0.49), 5 / 12, "the ease only changes 12 times a second");
  assert.equal(twos(0.5), 6 / 12);
  assert.equal(twos(1), 1);
  for (const kind of ["circlePath", "arrowPath", "underlinePath", "scribblePath", "checkPath", "crossPath"]) {
    const d = String((C[kind] as (...a: number[]) => string)(100, 100, 60, 40));
    assert.match(d, /^M[\d.-]+ [\d.-]+C/, kind);
  }
  delete g.window;
  delete g.gsap;
}
lap("collage kit geometry");

// ── a vox-collage job: project, preset, packets, frame ───────────────────────
const product = resolveProduct(ACME);
const kit = brandKit(product);
const o: JobOptions = { brief: "# Why sourdough takes time\n\nA three-second collage for home bakers.", format: "portrait", lengthSec: 3, style: "vox-collage", inputs: [] };
assert.equal(lockedBriefFields(o, "faceless-explainer").style_preset, "vox-collage");
assert.equal(lockedBriefFields(o, "general-video").style_preset, undefined, "only build-frame workflows read style_preset");
assert.equal(lockedBriefFields({ ...o, style: "default" }, "faceless-explainer").style_preset, undefined);
const jobDir = path.join(tmp, "job");
fs.mkdirSync(jobDir);
const setup = await setupProject(jobDir, o, kit, "faceless-explainer");
const P = setup.projectDir;
const read = (rel: string) => fs.readFileSync(path.join(P, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(P, rel));
assert.equal(setup.kit, "assets/collage");
for (const f of ["collage.js", "paper-grain.svg", "paper-tone.svg", "grid-paper.svg", "halftone.svg", "stamp-mask.svg", "paper-grain-light.svg"]) assert.ok(exists(`assets/collage/${f}`), f);
assert.equal(stageStyleKit(path.join(tmp, "none"), "default"), null, "the default style stages nothing");
lap("project set up with the collage kit");

const env = hfEnv();
const node = (script: string, args: string[]) => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { cwd: P, env, encoding: "utf8", timeout: 120_000 });
  assert.equal(r.status, 0, `${script} ${args.join(" ")} failed:\n${r.stdout}\n${r.stderr}`);
  return `${r.stdout}\n${r.stderr}`;
};
const bf = node("build-frame.mjs", ["--preset", "vox-collage", "--hyperframes", "."]);
assert.match(bf, /accent [^\n]*→#ffd60a/i, `the highlighter became the brand accent\n${bf}`);
const frameMd = read("frame.md");
assert.match(frameMd, /name: Vox Collage/);
assert.match(frameMd, /paper: "#faf7f2"/i, "paper → the brand canvas");
assert.match(frameMd, /highlighter: "#ffd60a"/i);
assert.match(frameMd, /Acme Sans/, "display and body faces → the brand face");
assert.ok(exists(".hyperframes/caption-skin.html"), "the collage caption skin is copied");
assert.match(read("frame.md"), /serif: +\{ fontFamily: "Playfair Display"/, "build-frame leaves the third family alone");
assert.equal(alignStyleFonts(P, kit), true);
assert.equal(alignStyleFonts(P, kit), false, "once");
assert.doesNotMatch(read("frame.md"), /Playfair Display/, "the serif voice now uses a face the project ships (acme has no accent face: its display face)");
assert.match(read("frame.md"), /serif: +\{ fontFamily: "Acme Sans"/);
assert.equal(ensureBrandSection(P, kit, setup.logos), true);
lap("build-frame remixed vox-collage onto the brand");

fs.writeFileSync(path.join(P, "STORYBOARD.md"), COLLAGE_STORYBOARD);
node("frame-packets.mjs", ["--project", P, "--storyboard", path.join(P, "STORYBOARD.md")]);
const packet = read(".hyperframes/frame-packets/01-collage.md");
assert.match(packet, /## Selected blueprint: collage-poster-build/);
assert.match(packet, /## Selected motion rule: collage-kit[\s\S]*assets\/collage\/collage\.js/);
assert.match(packet, /## Selected motion rule: collage-cutout-slap/);
assert.match(packet, /## Selected motion rule: collage-marker-annotate/);
assert.ok(Buffer.byteLength(packet) < 48_000, `the packet stays under the 48 KB bound (${Buffer.byteLength(packet)})`);
lap("frame packet inlines the collage blueprint and rules");

const c = kit.colors!;
const look: FixtureLook = { canvas: c.canvas, ink: c.ink, accent: c.accent, onAccent: c.onAccent, family: '"Acme Sans", sans-serif', fontFaceCss: kit.fontFaceCss };
fs.mkdirSync(path.join(P, "compositions", "frames"), { recursive: true });
fs.writeFileSync(path.join(P, "compositions/frames/01-collage.html"), collageFrame(look));
node("assemble-index.mjs", ["--storyboard", "./STORYBOARD.md", "--hyperframes", "."]);
localizeGsap(P);
const lint = await hf(["lint"], { cwd: P, timeoutMs: 120_000 });
assert.equal(lint.code, 0, `hyperframes lint:\n${failureText(lint, 40)}`);
assert.match(lint.stdout + lint.stderr, /0 error/);
lap("collage frame assembled and linted");

const pf = await preflight();
if (!pf.browser.ok || !pf.ffmpeg) {
  console.log(`  ⚠ skipped check, snapshot and render: ${pf.problems.join("; ")} (run npm run setup)`);
} else {
  const check = await hf(["check"], { cwd: P, timeoutMs: 300_000 });
  assert.equal(check.code, 0, `hyperframes check:\n${failureText(check, 40)}`);
  lap("hyperframes check");
  const snap = await hf(["snapshot", "--at", "0.05,2.8", "--no-end"], { cwd: P, timeoutMs: 300_000 });
  assert.equal(snap.code, 0, `hyperframes snapshot:\n${failureText(snap, 20)}`);
  lap("hyperframes snapshot");
  const render = await hf(["render", "--skill=faceless-explainer", "--quality", "draft", "--fps", "24", "--output", "renders/video.mp4"], { cwd: P, timeoutMs: 600_000 });
  assert.equal(render.code, 0, `hyperframes render:\n${failureText(render, 30)}`);
  const video = path.join(P, "renders", "video.mp4");
  const vinfo = probeVideo(video);
  assert.ok(vinfo, "the render is a readable MP4");
  assert.deepEqual([vinfo.width, vinfo.height], [1080, 1350]);
  const rate = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", video], { encoding: "utf8" }).stdout.trim();
  assert.equal(rate, "24/1", "rendered at 24 fps");
  const grab = (t: number) => {
    const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=27:34,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 });
    return r.stdout as Buffer;
  };
  const diff = (a: Buffer, b: Buffer) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const [start, end] = [grab(0.02), grab(2.8)];
  assert.ok(diff(start, end) > 1.5, `the pieces land (Δ ${diff(start, end).toFixed(2)})`);
  // the board is visible from the first frame (no black capture) and pieces arrive later
  assert.ok(start.reduce((s, v) => s + v, 0) / start.length > 150, "the first frame is the paper board, not black");
  // the strip's words sit above its torn sheet (a bare text node, not only child elements)
  const words = spawnSync("ffmpeg", ["-v", "error", "-ss", "2.8", "-i", video, "-frames:v", "1", "-vf", "crop=520:90:140:545,scale=52:9,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 }).stdout as Buffer;
  const ink = words.filter((v) => v < 110).length / words.length;
  assert.ok(ink > 0.12, `"Wild yeast is" is visible on the strip (${(ink * 100).toFixed(0)}% ink pixels)`);
  lap(`24 fps draft render, ${vinfo.durationSec} s`);
}

if (process.env.KEEP_TEST_OUTPUT) console.log(`  kept ${tmp}`);
else fs.rmSync(tmp, { recursive: true, force: true });
console.log("✓ collage OK");
