/**
 * The media tools against a local mock of OpenAI's image API and ElevenLabs (zero cost): pictures in the house style
 * (the edit endpoint with the style references, consistency references, sizes, transparency, the cache, the per-run
 * limit, placeholders), narration with word timings, sound effects and music, written where HyperFrames' workflow
 * reads audio — and the workflow's own audio passes (sync-durations, fetch-sfx, host-audio) keep it all.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// .env first (src/env.ts loads it on import and never overrides), so the test's own values below win
await import("../src/env.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-media-"));
const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

// ── a mock of both APIs ─────────────────────────────────────────────────────────
interface Seen {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  json?: Record<string, unknown>;
  fields?: Record<string, string>;
  files?: { name: string; filename: string; type: string; bytes: number }[];
}
const seen: Seen[] = [];
const tone = (sec: number) => {
  const out = path.join(tmp, `tone-${sec}.mp3`);
  if (!fs.existsSync(out)) spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=330:duration=${sec}`, "-ar", "44100", "-ac", "1", "-b:a", "64k", out]);
  return fs.readFileSync(out);
};

function multipart(body: Buffer, type: string) {
  const boundary = type.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] ?? type.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2] ?? "";
  const fields: Record<string, string> = {};
  const files: { name: string; filename: string; type: string; bytes: number }[] = [];
  for (const part of body.toString("latin1").split(`--${boundary}`)) {
    const i = part.indexOf("\r\n\r\n");
    if (i < 0) continue;
    const head = part.slice(0, i);
    const value = part.slice(i + 4).replace(/\r\n$/, "");
    const name = head.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    const filename = head.match(/filename="([^"]*)"/)?.[1];
    if (filename !== undefined) files.push({ name, filename, type: head.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] ?? "", bytes: Buffer.byteLength(value, "latin1") });
    else fields[name] = value;
  }
  return { fields, files };
}

const { encodePng, pngSize, placeholderPng } = await import("../src/media/png.js");

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = Buffer.concat(chunks);
  const url = new URL(req.url ?? "/", "http://x");
  const s: Seen = { method: req.method ?? "", path: url.pathname, headers: req.headers };
  const ct = String(req.headers["content-type"] ?? "");
  if (ct.startsWith("application/json") && body.length) s.json = JSON.parse(body.toString());
  if (ct.startsWith("multipart/form-data")) Object.assign(s, multipart(body, ct));
  seen.push(s);
  const json = (code: number, v: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(v));
  };
  // OpenAI
  if (url.pathname === "/v1/images/generations" || url.pathname === "/v1/images/edits") {
    const size = String(s.json?.size ?? s.fields?.size ?? "1024x1024");
    const prompt = String(s.json?.prompt ?? s.fields?.prompt ?? "");
    if (/REFUSE/.test(prompt)) return json(400, { error: { message: "Your request was rejected by the safety system.", type: "image_generation_user_error", code: "moderation_blocked" } });
    const [w, h] = size.split("x").map(Number);
    const transparent = (s.json?.background ?? s.fields?.background) === "transparent";
    return json(200, { created: 1, data: [{ b64_json: placeholderPng(w, h, prompt.slice(0, 20), transparent).toString("base64") }], usage: { input_tokens: 50, output_tokens: 4000, total_tokens: 4050 } });
  }
  // ElevenLabs
  if (req.headers["xi-api-key"] !== "el-test") return json(401, { detail: { status: "invalid_api_key", message: "Invalid API key" } });
  const tts = url.pathname.match(/^\/v1\/text-to-speech\/([^/]+)\/with-timestamps$/);
  if (tts) {
    const text = String(s.json?.text ?? "");
    if (/FAIL422/.test(text)) return json(422, { detail: [{ loc: ["body", "text"], msg: "text is too long", type: "value_error" }] });
    const chars = [...text];
    const per = 1.0 / chars.length;
    return json(200, {
      audio_base64: tone(1.2).toString("base64"),
      alignment: /NOALIGN/.test(text) ? null : { characters: chars, character_start_times_seconds: chars.map((_, i) => i * per), character_end_times_seconds: chars.map((_, i) => (i + 1) * per) },
      normalized_alignment: null,
    });
  }
  if (url.pathname === "/v1/sound-generation") {
    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    return res.end(tone(Math.max(0.5, Number(s.json?.duration_seconds ?? 0.6))));
  }
  if (url.pathname === "/v1/music") {
    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    return res.end(tone(Math.min(8, Number(s.json?.music_length_ms ?? 3000) / 1000)));
  }
  if (url.pathname === "/v2/voices")
    return json(200, { voices: [{ voice_id: "voice-calm", name: "Calm", category: "premade", labels: { accent: "british", gender: "female" }, description: "A calm, dry narrator." }], has_more: false });
  json(404, { detail: "not found" });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as AddressInfo).port;
process.env.OPENAI_API_KEY = "sk-test";
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
process.env.ELEVENLABS_API_KEY = "el-test";
process.env.ELEVENLABS_BASE_URL = `http://127.0.0.1:${port}`;
for (const k of ["OPENAI_IMAGE_MODEL", "OPENAI_IMAGE_QUALITY", "MAX_IMAGES", "IMAGE_MOCK", "ELEVENLABS_TTS_MODEL", "ELEVENLABS_VOICE_ID", "ELEVENLABS_SFX_MODEL", "ELEVENLABS_MUSIC_MODEL", "VOICE_PROVIDER"]) delete process.env[k];

const { memoryStore } = await import("../src/media/common.js");
const { DEFAULT_IMAGE_STYLE, buildImagePrompt, generateImages, imageSettings, imageSize } = await import("../src/media/images.js");
const { alignmentToWords, estimateWords, soundSettings } = await import("../src/media/elevenlabs.js");
const { generateMusic, generateNarration, generateSfx, parseScript, readAudioMeta } = await import("../src/media/sound.js");
const { explainerTools, mediaNote } = await import("../src/tools.js");
const { nativeElevenLabs } = await import("../src/hyperframes.js");
const { PLUGIN_DIR } = await import("../src/config.js");

// ── settings ─────────────────────────────────────────────────────────────────
const img = imageSettings();
assert.deepEqual(img, { available: true, mock: false, model: "gpt-image-2.5-flare", quality: "high", max: 24 });
assert.equal(imageSettings({ OPENAI_IMAGE_MODEL: "gpt-image-1.5", OPENAI_IMAGE_QUALITY: "max" }).quality, "high", "xhigh/max only on 2.5");
assert.equal(imageSettings({ IMAGE_MOCK: "1" }).available, true, "placeholders need no key");
assert.equal(imageSettings({}).available, false);
assert.equal(imageSettings({ OPENAI_API_KEY: "x", MAX_IMAGES: "0" }).max, 0);
const snd = soundSettings();
assert.equal(snd.available, true);
assert.equal(snd.ttsModel, "eleven_multilingual_v2");
assert.equal(snd.musicModel, "music_v2_5");
assert.equal(nativeElevenLabs({ ELEVENLABS_API_KEY: "x" }), true);
assert.equal(nativeElevenLabs({ ELEVENLABS_API_KEY: "x", VOICE_PROVIDER: "hyperframes" }), false);
assert.equal(nativeElevenLabs({}), false);

// ── sizes and prompts ───────────────────────────────────────────────────────────
const portrait = { width: 1080, height: 1350 };
assert.deepEqual(imageSize(undefined, "cutout", portrait, "gpt-image-2.5-flare"), { width: 1024, height: 1024 });
assert.deepEqual(imageSize("frame", "scene", portrait, "gpt-image-2.5-flare"), { width: 1088, height: 1360 }, "the canvas, edges rounded up to 16");
assert.deepEqual(imageSize(undefined, "scene", { width: 1080, height: 1920 }, "gpt-image-2.5-sunburst"), { width: 1088, height: 1920 });
assert.deepEqual(imageSize("1000x500", "ui", portrait, "gpt-image-2.5-flare"), { width: 1008, height: 512 });
assert.deepEqual(imageSize("4000x1000", "ui", portrait, "gpt-image-2.5-flare"), { width: 3008, height: 1008 }, "ratio held at 3:1… then the pixel budget");
assert.ok(imageSize("4000x1000", "ui", portrait, "gpt-image-2.5-flare").width * 1008 <= 2560 * 1440 * 1.01);
assert.deepEqual(imageSize("frame", "scene", portrait, "gpt-image-1.5"), { width: 1024, height: 1536 }, "a standard size on older models");
const style = { text: "Mid-century print illustration, ink and gouache.", references: [] as string[], source: "test" };
const p0 = buildImagePrompt({ prompt: "A woman at a desk", kind: "cutout" }, style);
assert.match(p0, /^Subject: A woman at a desk\n\nComposition: One subject[\s\S]*transparent background[\s\S]*Style: Mid-century print illustration[\s\S]*No text anywhere/);
assert.doesNotMatch(p0, /attached image|new picture/i);
const p1 = buildImagePrompt({ prompt: "Ana waving", kind: "cutout" }, { ...style, references: ["/a.png"] }, ["assets/images/ana.png"]);
assert.match(p1, /^Create a new picture\. The first attached image is only a style reference[\s\S]*Don't reuse its people, hairstyles, clothes, furniture/);
assert.match(p1, /Subject: Ana waving\n\nAttached image 2/, "the subject before the consistency reference");
assert.match(p1, /Attached image 2 \(assets\/images\/ana\.png\)[\s\S]*keep it identical/);
assert.match(DEFAULT_IMAGE_STYLE, /illustration/);

// ── pictures ───────────────────────────────────────────────────────────────
const project = path.join(tmp, "project");
fs.mkdirSync(path.join(project, "assets", "style"), { recursive: true });
const ref = path.join(project, "assets", "style", "univac-operator.png");
fs.writeFileSync(ref, encodePng(4, 4, new Uint8Array(64).fill(200)));
const entries: import("../src/media/common.js").MediaEntry[] = [];
let saves = 0;
const store = memoryStore(entries, () => saves++);
const opts = { projectDir: project, canvas: portrait, style: { ...style, references: [ref] }, settings: img, store };
const imgReqs = () => seen.filter((x) => x.path.startsWith("/v1/images/"));

const batch = await generateImages(
  [
    { name: "Ana", prompt: "A woman in a 1950s blue dress, seated, typing", kind: "cutout", aspect: "portrait" },
    { name: "office", prompt: "A quiet open-plan office with desks and a window", kind: "scene" },
  ],
  opts,
);
assert.ok(batch.every((r) => !(r instanceof Error)), String(batch));
const [ana, office] = batch as Exclude<(typeof batch)[number], Error>[];
assert.equal(ana.file, "assets/images/ana.png", "names become safe file stems");
assert.deepEqual([ana.width, ana.height, ana.transparent, ana.cached], [1024, 1536, true, false]);
assert.deepEqual([office.width, office.height, office.transparent], [1088, 1360, false]);
assert.deepEqual(pngSize(fs.readFileSync(path.join(project, ana.file))), { width: 1024, height: 1536 });
if (hasFfmpeg) assert.ok(ana.preview && pngSize(ana.preview)!.width <= 384, "a small preview for the model");
const edits = imgReqs().filter((x) => x.path === "/v1/images/edits");
assert.equal(edits.length, 2, "with a style reference every picture goes through the edit endpoint");
const anaReq = edits.find((x) => /blue dress/.test(x.fields?.prompt ?? ""))!;
assert.equal(anaReq.fields?.model, "gpt-image-2.5-flare");
assert.equal(anaReq.fields?.size, "1024x1536");
assert.equal(anaReq.fields?.quality, "high");
assert.equal(anaReq.fields?.background, "transparent");
assert.equal(anaReq.fields?.output_format, "png");
assert.equal(anaReq.fields?.input_fidelity, undefined, "no fidelity setting without consistency references");
assert.deepEqual(anaReq.files?.map((f) => [f.name, f.filename, f.type]), [["image[]", "univac-operator.png", "image/png"]]);
assert.equal(edits.find((x) => /office/.test(x.fields?.prompt ?? ""))?.fields?.background, "opaque", "a scene is opaque");
assert.equal(entries.length, 2);
assert.ok(saves >= 2, "every new picture is saved into the record");
assert.deepEqual([entries[0].type, entries[0].provider, entries[0].model, entries[0].kind], ["image", "openai", "gpt-image-2.5-flare", "cutout"]);
assert.equal(entries.find((e) => e.file === ana.file)?.usage?.output_tokens, 4000);

// consistency: the character again, from its own file
const again = await generateImages([{ name: "ana-waving", prompt: "The same woman, standing, waving", kind: "cutout", refs: ["assets/images/ana.png"] }], opts);
assert.ok(!(again[0] instanceof Error), String(again[0]));
const waveReq = imgReqs().at(-1)!;
assert.equal(waveReq.files?.length, 2, "style reference + the character");
assert.equal(waveReq.fields?.input_fidelity, undefined, "gpt-image-2.5 rejects input_fidelity, so it isn't sent");
assert.match(waveReq.fields?.prompt ?? "", /Attached image 2 \(assets\/images\/ana\.png\)/);

const older = await generateImages([{ name: "ana-sitting", prompt: "The same woman, sitting", kind: "cutout", refs: ["assets/images/ana.png"] }], { ...opts, settings: { ...img, model: "gpt-image-1.5" } });
assert.ok(!(older[0] instanceof Error), String(older[0]));
assert.equal(imgReqs().at(-1)!.fields?.input_fidelity, "high", "older models keep the character with input_fidelity");
assert.equal(imgReqs().at(-1)!.fields?.size, "1024x1024", "and a standard size");

// the same request again is free; the limit counts only new pictures; bad input is refused per picture
const before = imgReqs().length;
const repeat = await generateImages([{ name: "Ana", prompt: "A woman in a 1950s blue dress, seated, typing", kind: "cutout", aspect: "portrait" }], opts);
assert.equal((repeat[0] as { cached: boolean }).cached, true);
assert.equal(imgReqs().length, before, "no request for a cached picture");
const copy = await generateImages([{ name: "ana-copy", prompt: "A woman in a 1950s blue dress, seated, typing", kind: "cutout", aspect: "portrait" }], opts);
assert.equal((copy[0] as { cached: boolean; file: string }).cached, true, "same picture under another name: copied, not regenerated");
assert.ok(fs.existsSync(path.join(project, "assets/images/ana-copy.png")));
const limited = await generateImages([{ name: "x1", prompt: "A desk lamp, lit", kind: "cutout" }, { name: "x2", prompt: "A typewriter", kind: "cutout" }], { ...opts, settings: { ...img, max: 4 } });
assert.ok(limited[0] instanceof Error && limited[1] instanceof Error && /image limit reached: 4/.test(limited[1].message), "4 made this run: the limit is reached");
const limited5 = await generateImages([{ name: "x1", prompt: "A desk lamp, lit", kind: "cutout" }, { name: "x2", prompt: "A typewriter", kind: "cutout" }], { ...opts, settings: { ...img, max: 5 } });
assert.ok(!(limited5[0] instanceof Error) && limited5[1] instanceof Error, "one more allowed at 5, the next refused");
const bad = await generateImages(
  [
    { name: "../../evil", prompt: "A key ring with two keys", kind: "cutout", refs: ["../../etc/hosts"] },
    { name: "dup", prompt: "A bell", kind: "ui" },
    { name: "dup", prompt: "A bell again", kind: "ui" },
    { name: "refused", prompt: "REFUSE this one please", kind: "illustration" },
  ],
  { ...opts, settings: { ...img, max: 99 } },
);
assert.match((bad[0] as Error).message, /outside the project/);
assert.ok(!(bad[1] instanceof Error));
assert.match((bad[2] as Error).message, /appears twice/);
assert.match((bad[3] as Error).message, /safety system refused/);
assert.ok(!fs.readdirSync(path.join(project, "assets", "images")).some((f) => f.includes("evil")));

// placeholders: no request, a real PNG at the requested size
const mockReqs = imgReqs().length;
const mocked = await generateImages([{ name: "placeholder", prompt: "A console with dials", kind: "ui", aspect: "wide" }], { ...opts, settings: { ...img, mock: true } });
assert.equal(imgReqs().length, mockReqs);
assert.deepEqual(pngSize(fs.readFileSync(path.join(project, "assets/images/placeholder.png"))), { width: 1920, height: 1088 });
assert.equal(entries.at(-1)?.provider, "mock");

// the tool: per-picture lines and previews the model can see
const events: { type: string; message?: string }[] = [];
const toolCtx = { jobDir: tmp, projectDir: project, width: 1080, height: 1350, emit: (e: { type: string }) => events.push(e), media: { store, images: { settings: { ...img, max: 99 }, style: opts.style } } };
const tools = explainerTools(toolCtx as never);
assert.deepEqual(tools.map((t) => t.name), ["generate_images", "deliver"], "only the tools this job may use");
const imgTool = tools.find((t) => t.name === "generate_images")!;
const reply = (await imgTool.handler({ images: [{ name: "inbox", prompt: "An overflowing inbox tray of envelopes", kind: "ui" }] } as never, {} as never)) as { content: { type: string; text?: string; data?: string }[]; isError?: boolean };
assert.equal(reply.isError, false);
assert.match(reply.content[0].text ?? "", /`assets\/images\/inbox\.png` · 1536×1024 · transparent cut-out · new/);
if (hasFfmpeg) assert.ok(reply.content.some((c) => c.type === "image" && c.data), "a preview image in the reply");
assert.ok(events.some((e) => /Images: 1 new/.test(e.message ?? "")));

// ── words from ElevenLabs' character timings ───────────────────────────────────
const align = (text: string) => {
  const c = [...text];
  return { characters: c, character_start_times_seconds: c.map((_, i) => i / 10), character_end_times_seconds: c.map((_, i) => (i + 1) / 10) };
};
const words = alignmentToWords(align("Hello,  world — again."));
assert.deepEqual(words.map((w) => w.text), ["Hello,", "world —", "again."], "a lone dash joins the word before it");
assert.deepEqual(words.map((w) => w.id), ["w0", "w1", "w2"]);
assert.deepEqual([words[0].start, words[0].end, words[2].end], [0, 0.6, 2.2]);
assert.deepEqual(alignmentToWords(align("— Hi there")).map((w) => w.text), ["— Hi", "there"]);
const est = estimateWords("one two three", 1.5);
assert.equal(est.length, 3);
assert.ok(est[2].end <= 1.5 && est[0].start > 0 && est[1].start > est[0].end - 0.001);
assert.deepEqual(parseScript("# Script\n\n## Hook (Frame 1)\n\n**tone:** dry\n\n    Same Claude.\n    Two ways to use it.\n\n## Close (frame 3)\n\n    Find your agent.\n"), [
  { frame: 1, text: "Same Claude. Two ways to use it." },
  { frame: 3, text: "Find your agent." },
]);

if (!hasFfmpeg) {
  console.log("⚠ media sound tests skipped: FFmpeg not found");
} else {
  // ── narration ───────────────────────────────────────────────────────────────
  fs.writeFileSync(path.join(project, "SCRIPT.md"), "# Script\n\n## Hook (Frame 1)\n\n    Same Claude. Two ways to use it.\n\n## Meet Ana (Frame 2)\n\n    Ana answers customer emails.\n");
  const ttsReqs = () => seen.filter((x) => x.path.includes("/with-timestamps"));
  const nar = await generateNarration({ projectDir: project, settings: snd, store, voiceId: "voice-calm", language: "en" });
  assert.deepEqual(nar.errors, []);
  assert.equal(nar.voices.length, 2);
  assert.ok(Math.abs(nar.voices[0].duration_s - 1.2) < 0.15, `about 1.2 s (${nar.voices[0].duration_s})`);
  assert.deepEqual(nar.voices[0].words.map((w) => w.text), ["Same", "Claude.", "Two", "ways", "to", "use", "it."]);
  assert.ok(fs.existsSync(path.join(project, "assets/voice/01.wav")) && fs.existsSync(path.join(project, "assets/voice/02.wav")));
  const t1 = ttsReqs()[0];
  assert.equal(t1.path, "/v1/text-to-speech/voice-calm/with-timestamps");
  assert.equal(t1.headers["xi-api-key"], "el-test");
  assert.equal(t1.json?.model_id, "eleven_multilingual_v2");
  assert.equal(t1.json?.language_code, undefined, "multilingual_v2 detects the language");
  const t2 = ttsReqs().find((x) => /Ana answers/.test(String(x.json?.text)))!;
  assert.equal(t2.json?.previous_text, "Same Claude. Two ways to use it.", "the line before, for a continuous delivery");
  const meta = JSON.parse(fs.readFileSync(path.join(project, "audio_meta.json"), "utf8"));
  assert.deepEqual(meta.voices.map((v: { frame: number; path: string }) => [v.frame, v.path]), [[1, "assets/voice/01.wav"], [2, "assets/voice/02.wav"]]);
  const engine = JSON.parse(fs.readFileSync(path.join(project, "audio_engine_meta.json"), "utf8"));
  assert.deepEqual(engine.voices.map((v: { id: string }) => v.id), ["01", "02"], "the engine's sidecar, id-keyed");
  assert.equal(engine.tts_provider, "elevenlabs");
  // again: free; one line re-voiced on request keeps the others
  const n0 = ttsReqs().length;
  const nar2 = await generateNarration({ projectDir: project, settings: snd, store, voiceId: "voice-calm", language: "en" });
  assert.equal(ttsReqs().length, n0, "unchanged lines are reused");
  assert.ok(nar2.voices.every((v) => v.cached));
  await generateNarration({ projectDir: project, settings: snd, store, voiceId: "voice-calm", lines: [{ frame: 2, text: "NOALIGN Ana answers every email." }] });
  const meta2 = readAudioMeta(project);
  assert.deepEqual(meta2.voices.map((v) => v.frame), [1, 2]);
  assert.equal(entries.find((e) => e.file === "assets/voice/02.wav")?.timing, "estimated", "no alignment → estimated timings, recorded as such");
  const failed = await generateNarration({ projectDir: project, settings: snd, store, voiceId: "voice-calm", lines: [{ frame: 5, text: "FAIL422" }] });
  assert.match(failed.errors[0].error, /ElevenLabs 422: body\.text: text is too long/);

  // ── sound effects and music, as host audio ─────────────────────────────────
  const fx = await generateSfx({
    projectDir: project,
    settings: snd,
    store,
    sounds: [
      { name: "Paper slap", prompt: "a sheet of paper slapped onto a wooden desk, dry, close", at: [{ frame: 1, offset_s: 0.2 }, { frame: 2, offset_s: 0.1, volume: 0.3 }] },
      { name: "stamp", prompt: "a rubber stamp thumped onto paper", duration_s: 0.8 },
    ],
  });
  assert.ok(fx.every((r) => !(r instanceof Error)), String(fx));
  const slap = fx[0] as { file: string; placed: number };
  assert.equal(slap.file, "assets/sfx/paper-slap.mp3");
  assert.equal(seen.filter((x) => x.path === "/v1/sound-generation")[1]?.json?.duration_seconds, 0.8);
  assert.equal(seen.find((x) => x.path === "/v1/sound-generation")?.json?.model_id, "eleven_text_to_sound_v2");
  let m = readAudioMeta(project);
  assert.deepEqual(m.sfx.map((x) => [x.frame, x.file, x.offset_s, x.source]), [[1, "assets/sfx/paper-slap.mp3", 0.2, "host"], [2, "assets/sfx/paper-slap.mp3", 0.1, "host"]]);
  assert.equal(m.voices.length, 2, "effects leave the narration alone");
  await generateSfx({ projectDir: project, settings: snd, store, sounds: [{ name: "Paper slap", prompt: "a sheet of paper slapped onto a wooden desk, dry, close", at: [{ frame: 2 }] }] });
  m = readAudioMeta(project);
  assert.deepEqual(m.sfx.map((x) => x.frame), [2], "a sound's placements are replaced, not added");
  const bed = await generateMusic({ projectDir: project, settings: snd, store, prompt: "dry, minimal upright piano, 90 bpm", durationSec: 4 });
  assert.equal(bed.file, "assets/music/bed.mp3");
  const musicReq = seen.find((x) => x.path === "/v1/music")!;
  assert.deepEqual([musicReq.json?.music_length_ms, musicReq.json?.model_id, musicReq.json?.force_instrumental], [4000, "music_v2_5", true]);
  m = readAudioMeta(project);
  assert.deepEqual([m.bgm?.path, m.bgm?.source], ["assets/music/bed.mp3", "host"]);

  // ── the workflow's own audio passes keep all of it ─────────────────────────────
  const scripts = path.join(PLUGIN_DIR, "skills", "faceless-explainer", "scripts");
  const { hostAudio } = await import(pathToFileURL(path.join(scripts, "lib", "host-audio.mjs")).href);
  const host = hostAudio(readAudioMeta(project), (p: string) => fs.existsSync(path.join(project, p)));
  assert.deepEqual(host.dropped, []);
  assert.equal(host.bgm?.path, "assets/music/bed.mp3");
  assert.equal(host.sfx.length, 1);
  fs.writeFileSync(path.join(project, "STORYBOARD.md"), "---\nformat: 1080x1350\nduration: 6s\nmusic: none\n---\n\n## Frame 1 — Hook\n\n- duration: 3s\n- src: compositions/frames/01-hook.html\n\n## Frame 2 — Ana\n\n- duration: 3s\n- src: compositions/frames/02-ana.html\n");
  const run = (args: string[]) => spawnSync(process.execPath, [path.join(scripts, "audio.mjs"), ...args], { cwd: project, encoding: "utf8", timeout: 120_000, env: { ...process.env, HEYGEN_API_KEY: "", HYPERFRAMES_API_KEY: "", HEYGEN_CONFIG_DIR: path.join(tmp, "no-heygen") } });
  const sync = run(["sync-durations", "--audio-meta", "./audio_meta.json", "--storyboard", "./STORYBOARD.md"]);
  assert.equal(sync.status, 0, sync.stderr);
  assert.match(fs.readFileSync(path.join(project, "STORYBOARD.md"), "utf8"), /## Frame 1 — Hook\n\n- duration: 1\.\d+s/, "sync-durations reads our voices");
  const fetchSfx = run(["fetch-sfx", "--storyboard", "./STORYBOARD.md", "--hyperframes", "."]);
  assert.equal(fetchSfx.status, 0, `${fetchSfx.stdout}\n${fetchSfx.stderr}`);
  const after = readAudioMeta(project);
  assert.deepEqual(after.voices.map((v) => v.frame), [1, 2], "fetch-sfx rebuilds from the engine sidecar: our voices survive");
  assert.equal(after.voices[0].words.length, 7, "with their word timings");
  assert.equal(after.bgm?.path, "assets/music/bed.mp3", "and the host bed");
  assert.deepEqual(after.sfx.map((x) => x.file), ["assets/sfx/paper-slap.mp3"], "and the host effects");

  // ── the sound tools, and the note post.md gets ────────────────────────────────
  const soundTools = explainerTools({ ...toolCtx, media: { store, sound: { settings: snd, voiceId: "voice-calm", narration: true, sfx: true, music: false } } } as never);
  assert.deepEqual(soundTools.map((t) => t.name), ["generate_narration", "find_voices", "generate_sfx", "deliver"]);
  const voicesReply = (await soundTools.find((t) => t.name === "find_voices")!.handler({ search: "calm" } as never, {} as never)) as { content: { text: string }[] };
  assert.match(voicesReply.content[0].text, /`voice-calm` Calm \(premade\) · british, female — A calm, dry narrator\./);
  assert.match(seen.find((x) => x.path === "/v2/voices")?.headers["xi-api-key"] as string, /el-test/);
  const narrReply = (await soundTools.find((t) => t.name === "generate_narration")!.handler({} as never, {} as never)) as { content: { text: string }[]; isError: boolean };
  assert.equal(narrReply.isError, false);
  assert.match(narrReply.content[0].text, /frame 1: `assets\/voice\/01\.wav`[\s\S]*sync-durations[\s\S]*Don't run the audio generate command/);
  const note = mediaNote(store);
  assert.match(note, /\d+ pictures generated with OpenAI gpt-image-2\.5-flare/);
  assert.match(note, /1 PLACEHOLDER picture \(IMAGE_MOCK=1\)/);
  assert.match(note, /Narration: ElevenLabs eleven_multilingual_v2, voice `voice-calm`/);
  assert.match(note, /sound effects?: ElevenLabs eleven_text_to_sound_v2/);
  assert.match(note, /Music: ElevenLabs music_v2_5 \("dry, minimal upright piano/);
  const wrongKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "nope";
  await assert.rejects(generateMusic({ projectDir: project, settings: snd, store, prompt: "something new and different", durationSec: 3 }), /ElevenLabs 401: Invalid API key \(check ELEVENLABS_API_KEY\)/);
  process.env.ELEVENLABS_API_KEY = wrongKey;
}

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`✓ media OK (${seen.length} mock API calls${hasFfmpeg ? "" : ", sound skipped"})`);
