/**
 * Narration, sound effects and music from ElevenLabs, written where HyperFrames' explainer workflow reads audio:
 *  - narration: assets/voice/NN.wav for each SCRIPT.md frame, with word timings, into audio_meta.json → voices, and
 *    into the audio engine's sidecar (audio_engine_meta.json) so a later `audio.mjs fetch-sfx` pass keeps them;
 *  - sound effects: assets/sfx/<name>.mp3, placed per frame as host entries (audio_meta.json → sfx, "source": "host");
 *  - music: assets/music/<name>.mp3 as the host bed (audio_meta.json → bgm, "source": "host").
 * The workflow's own passes keep host entries (faceless-explainer/scripts/lib/host-audio.mjs); assemble-index places
 * all three (voice per frame, the bed under everything, each effect at its frame's start + offset).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cached, ffmpeg, hashKey, mediaDuration, pool, safeName, writeFileAtomic, type MediaStore } from "./common.js";
import { alignmentToWords, composeMusic, estimateWords, searchVoices, soundEffect, synthesizeSpeech, type SoundSettings, type VoiceInfo, type Word } from "./elevenlabs.js";

const pad2 = (n: number) => String(n).padStart(2, "0");
const META = "audio_meta.json";
const ENGINE_META = "audio_engine_meta.json";

/** SCRIPT.md → [{ frame, text }], the rule the workflow's audio adapter uses: `## … (Frame N)` opens a line, `**key:**`
 *  rows are metadata, the indented block is what is spoken. */
export function parseScript(md: string): { frame: number; text: string }[] {
  const out: { frame: number; text: string }[] = [];
  let cur: { frame: number; text: string } | null = null;
  const flush = () => {
    if (cur && cur.text.trim()) out.push({ frame: cur.frame, text: cur.text.trim() });
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+.*?\(frame\s+(\d+)\)/i);
    if (h) {
      flush();
      cur = { frame: Number(h[1]), text: "" };
      continue;
    }
    if (!cur) continue;
    if (/^\s*\*\*/.test(line)) continue;
    const m = line.match(/^(?: {4,}|\t)(.+)$/);
    if (m) cur.text += (cur.text ? " " : "") + m[1].trim();
  }
  flush();
  return out;
}

export interface FrameVoice {
  frame: number;
  path: string;
  duration_s: number;
  words: Word[];
}

interface AudioMeta {
  bgm: Record<string, unknown> | null;
  bgm_pending?: boolean;
  voices: FrameVoice[];
  sfx: Record<string, unknown>[];
  [k: string]: unknown;
}

function readJson(abs: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${path.basename(abs)} doesn't parse (${(e as Error).message}); fix or remove it first`);
  }
}

/** audio_meta.json in the frame-keyed shape captions.mjs and assemble-index.mjs read. */
export function readAudioMeta(projectDir: string): AudioMeta {
  const j = readJson(path.join(projectDir, META)) ?? {};
  return { ...j, bgm: (j.bgm as AudioMeta["bgm"]) ?? null, voices: (j.voices as FrameVoice[]) ?? [], sfx: (j.sfx as AudioMeta["sfx"]) ?? [] };
}

const writeJson = (abs: string, v: unknown) => writeFileAtomic(abs, JSON.stringify(v, null, 2) + "\n");

/** The voices in both places the workflow reads them: audio_meta.json and the engine's sidecar. */
function writeVoices(projectDir: string, voices: FrameVoice[], voiceId: string) {
  const sorted = [...voices].sort((a, b) => a.frame - b.frame);
  const meta = readAudioMeta(projectDir);
  writeJson(path.join(projectDir, META), { ...meta, bgm_pending: meta.bgm_pending ?? false, voices: sorted });
  const engineFile = path.join(projectDir, ENGINE_META);
  const engine = readJson(engineFile) ?? {};
  writeJson(engineFile, {
    ...engine,
    tts_provider: "elevenlabs",
    voice_id: voiceId,
    bgm: engine.bgm ?? null,
    bgm_pending: engine.bgm_pending ?? false,
    voices: sorted.map((v) => ({ id: pad2(v.frame), path: v.path, duration_s: v.duration_s, words: v.words })),
    sfx: engine.sfx ?? [],
    total_duration_s: Math.round(sorted.reduce((a, v) => a + v.duration_s, 0) * 1000) / 1000,
  });
}

export interface NarrationOptions {
  projectDir: string;
  settings: SoundSettings;
  store: MediaStore;
  voiceId: string;
  model?: string;
  language?: string;
  speed?: number;
  /** explicit lines (merged into the existing narration); default: every line of SCRIPT.md (replaces it) */
  lines?: { frame: number; text: string }[];
}

export interface NarrationResult {
  voices: (FrameVoice & { cached: boolean; timing: "elevenlabs" | "estimated" })[];
  errors: { frame: number; error: string }[];
  totalSec: number;
  characters: number;
  voiceId: string;
  model: string;
}

export async function generateNarration(o: NarrationOptions): Promise<NarrationResult> {
  const model = o.model || o.settings.ttsModel;
  let lines = o.lines;
  if (!lines) {
    const script = path.join(o.projectDir, "SCRIPT.md");
    if (!fs.existsSync(script)) throw new Error("SCRIPT.md doesn't exist yet: write it first (the workflow's script format), or pass lines");
    lines = parseScript(fs.readFileSync(script, "utf8"));
    if (!lines.length) throw new Error("SCRIPT.md has no spoken lines: each frame needs a `## … (Frame N)` heading and its line indented by four spaces");
  }
  const frames = new Set<number>();
  for (const l of lines) {
    if (!Number.isInteger(l.frame) || l.frame < 1) throw new Error(`frame must be a positive whole number (got ${l.frame})`);
    if (frames.has(l.frame)) throw new Error(`frame ${l.frame} has two lines`);
    frames.add(l.frame);
  }
  const all = lines;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "explainer-voice-"));
  const results = await pool(all, 3, async (line, i) => {
    const text = line.text.trim();
    if (!text) throw new Error("empty line");
    const previousText = all[i - 1]?.text.trim();
    const nextText = all[i + 1]?.text.trim();
    const rel = `assets/voice/${pad2(line.frame)}.wav`;
    const abs = path.join(o.projectDir, rel);
    const key = hashKey("narration", model, o.voiceId, o.language ?? "", o.speed ?? 1, text, previousText ?? "", nextText ?? "");
    const hit = cached(o.store, o.projectDir, key);
    if (hit?.words && hit.seconds) {
      if (hit.file !== rel) {
        writeFileAtomic(abs, fs.readFileSync(path.join(o.projectDir, hit.file)));
        o.store.add({ ...hit, file: rel, frame: line.frame, copyOf: hit.file });
      }
      return { frame: line.frame, path: rel, duration_s: hit.seconds, words: hit.words, cached: true, timing: hit.timing ?? ("elevenlabs" as const) };
    }
    const { audio, alignment } = await synthesizeSpeech(o.settings, { text, voiceId: o.voiceId, model, language: o.language, speed: o.speed, previousText, nextText });
    const mp3 = path.join(tmp, `${pad2(line.frame)}.mp3`);
    fs.writeFileSync(mp3, audio);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!ffmpeg(["-i", mp3, "-ar", "44100", "-ac", "1", abs])) throw new Error("FFmpeg couldn't convert the narration to WAV");
    const seconds = mediaDuration(abs);
    if (!seconds) throw new Error("the narration clip has no duration");
    const timing = alignment ? ("elevenlabs" as const) : ("estimated" as const);
    const words = alignment ? alignmentToWords(alignment) : estimateWords(text, seconds);
    o.store.add({ type: "narration", file: rel, provider: "elevenlabs", model, key, prompt: text, at: new Date().toISOString(), voice: o.voiceId, frame: line.frame, characters: text.length, seconds, timing, words });
    return { frame: line.frame, path: rel, duration_s: seconds, words, cached: false, timing };
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  const voices: NarrationResult["voices"] = [];
  const errors: NarrationResult["errors"] = [];
  results.forEach((r, i) => (r instanceof Error ? errors.push({ frame: all[i].frame, error: r.message }) : voices.push(r)));
  if (voices.length) {
    // SCRIPT.md is the whole narration; explicit lines replace only their own frames
    const kept = o.lines ? readAudioMeta(o.projectDir).voices.filter((v) => !frames.has(v.frame)) : [];
    writeVoices(o.projectDir, [...kept, ...voices.map(({ cached: _c, timing: _t, ...v }) => v)], o.voiceId);
  }
  return {
    voices,
    errors,
    totalSec: Math.round(voices.reduce((a, v) => a + v.duration_s, 0) * 100) / 100,
    characters: voices.filter((v) => !v.cached).reduce((a, v) => a + (all.find((l) => l.frame === v.frame)?.text.length ?? 0), 0),
    voiceId: o.voiceId,
    model,
  };
}

export interface SfxPlacement {
  frame: number;
  /** seconds from the frame's start */
  offset_s?: number;
  /** 0–1; assemble's default is 0.35 */
  volume?: number;
}

export interface SfxSpec {
  /** file stem: "paper-slap" → assets/sfx/paper-slap.mp3 */
  name: string;
  prompt: string;
  duration_s?: number;
  loop?: boolean;
  prompt_influence?: number;
  /** where it plays; given = the sound's complete list of placements (earlier ones for this file are replaced) */
  at?: SfxPlacement[];
}

export interface SfxResult {
  name: string;
  file: string;
  duration_s: number;
  cached: boolean;
  placed: number;
}

/** Host sound effects in audio_meta.json: each sound's placements replace its earlier ones. */
export function placeSfx(projectDir: string, placements: { file: string; duration_s: number; at: SfxPlacement[] }[]) {
  const meta = readAudioMeta(projectDir);
  const files = new Set(placements.map((p) => p.file));
  const sfx = meta.sfx.filter((s) => !(s.source === "host" && files.has(String(s.file))));
  for (const p of placements)
    for (const a of p.at)
      sfx.push({ frame: a.frame, file: p.file, offset_s: Math.max(0, a.offset_s ?? 0), duration_s: p.duration_s, ...(a.volume !== undefined ? { volume: Math.min(1, Math.max(0, a.volume)) } : {}), source: "host" });
  sfx.sort((a, b) => Number(a.frame) - Number(b.frame) || Number(a.offset_s ?? 0) - Number(b.offset_s ?? 0));
  writeJson(path.join(projectDir, META), { ...meta, sfx });
}

export async function generateSfx(o: { projectDir: string; settings: SoundSettings; store: MediaStore; sounds: SfxSpec[] }): Promise<(SfxResult | Error)[]> {
  const seen = new Set<string>();
  const results = await pool(o.sounds, 3, async (s) => {
    if (!s.prompt?.trim()) throw new Error("prompt is empty");
    const name = safeName(s.name, "sound");
    if (seen.has(name)) throw new Error(`"${name}" appears twice in this batch`);
    seen.add(name);
    for (const a of s.at ?? []) if (!Number.isInteger(a.frame) || a.frame < 1) throw new Error(`frame must be a positive whole number (got ${a.frame})`);
    const rel = `assets/sfx/${name}.mp3`;
    const abs = path.join(o.projectDir, rel);
    const key = hashKey("sfx", o.settings.sfxModel, s.prompt.trim(), s.duration_s ?? null, !!s.loop, s.prompt_influence ?? null);
    const hit = cached(o.store, o.projectDir, key);
    let duration: number;
    let isCached = false;
    if (hit?.seconds) {
      if (hit.file !== rel) {
        writeFileAtomic(abs, fs.readFileSync(path.join(o.projectDir, hit.file)));
        o.store.add({ ...hit, file: rel, copyOf: hit.file });
      }
      duration = hit.seconds;
      isCached = true;
    } else {
      const bytes = await soundEffect(o.settings, { text: s.prompt.trim(), durationSec: s.duration_s, promptInfluence: s.prompt_influence, loop: s.loop });
      writeFileAtomic(abs, bytes);
      const d = mediaDuration(abs);
      if (!d) throw new Error("the sound effect has no duration");
      duration = d;
      o.store.add({ type: "sfx", file: rel, provider: "elevenlabs", model: o.settings.sfxModel, key, prompt: s.prompt.trim(), at: new Date().toISOString(), seconds: d });
    }
    return { name, file: rel, duration_s: duration, cached: isCached, placed: s.at?.length ?? 0 };
  });
  const placements = results.flatMap((r, i) => (r instanceof Error || !o.sounds[i].at ? [] : [{ file: r.file, duration_s: r.duration_s, at: o.sounds[i].at! }]));
  if (placements.length) placeSfx(o.projectDir, placements);
  return results;
}

export interface MusicResult {
  file: string;
  duration_s: number;
  cached: boolean;
}

/** A bed under the whole video, registered as the host's music (the storyboard keeps `music: none`). */
export async function generateMusic(o: { projectDir: string; settings: SoundSettings; store: MediaStore; prompt: string; durationSec: number; name?: string; volume?: number; instrumental?: boolean }): Promise<MusicResult> {
  if (!o.prompt?.trim()) throw new Error("prompt is empty");
  const lengthMs = Math.round(Math.min(600, Math.max(3, o.durationSec)) * 1000);
  const rel = `assets/music/${safeName(o.name ?? "bed", "bed")}.mp3`;
  const abs = path.join(o.projectDir, rel);
  const key = hashKey("music", o.settings.musicModel, o.prompt.trim(), lengthMs, o.instrumental ?? true);
  const hit = cached(o.store, o.projectDir, key);
  let duration: number;
  let isCached = false;
  if (hit?.seconds) {
    if (hit.file !== rel) {
      writeFileAtomic(abs, fs.readFileSync(path.join(o.projectDir, hit.file)));
      o.store.add({ ...hit, file: rel, copyOf: hit.file });
    }
    duration = hit.seconds;
    isCached = true;
  } else {
    const bytes = await composeMusic(o.settings, { prompt: o.prompt.trim(), lengthMs, instrumental: o.instrumental });
    writeFileAtomic(abs, bytes);
    const d = mediaDuration(abs);
    if (!d) throw new Error("the music has no duration");
    duration = d;
    o.store.add({ type: "music", file: rel, provider: "elevenlabs", model: o.settings.musicModel, key, prompt: o.prompt.trim(), at: new Date().toISOString(), seconds: d });
  }
  const meta = readAudioMeta(o.projectDir);
  writeJson(path.join(o.projectDir, META), {
    ...meta,
    bgm: { path: rel, ...(o.volume !== undefined ? { volume: Math.min(1, Math.max(0, o.volume)) } : {}), duration_s: duration, source: "host" },
    bgm_pending: false,
  });
  return { file: rel, duration_s: duration, cached: isCached };
}

export async function findVoices(settings: SoundSettings, q: { search?: string; gender?: string; accent?: string; language?: string; limit?: number }): Promise<VoiceInfo[]> {
  return searchVoices(settings, { search: q.search, gender: q.gender, accent: q.accent, language: q.language, pageSize: q.limit ?? 15 });
}
