/**
 * ElevenLabs over plain HTTPS (no SDK, no Python): speech with per-character timestamps (exact word timings for the
 * captions, no transcription pass), sound effects, music and the voice library. The key stays in this process; the
 * agent's shell never sees it. ELEVENLABS_BASE_URL points at a regional server (or a test mock).
 */

export interface SoundSettings {
  /** ELEVENLABS_API_KEY is set */
  available: boolean;
  baseUrl: string;
  ttsModel: string;
  voiceId: string;
  sfxModel: string;
  musicModel: string;
}

/** "George" from ElevenLabs' default library: a warm, mature British narrator. */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export function soundSettings(env: NodeJS.ProcessEnv = process.env): SoundSettings {
  return {
    available: !!env.ELEVENLABS_API_KEY?.trim(),
    baseUrl: (env.ELEVENLABS_BASE_URL?.trim() || "https://api.elevenlabs.io").replace(/\/+$/, ""),
    ttsModel: env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_multilingual_v2",
    voiceId: env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID,
    sfxModel: env.ELEVENLABS_SFX_MODEL?.trim() || "eleven_text_to_sound_v2",
    musicModel: env.ELEVENLABS_MUSIC_MODEL?.trim() || "music_v2_5",
  };
}

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errorMessage(status: number, body: string): string {
  let detail = body.trim().slice(0, 300) || "no details";
  try {
    const j = JSON.parse(body);
    const d = j.detail ?? j.error ?? j.message;
    detail = Array.isArray(d)
      ? d.map((x: { loc?: unknown[]; msg?: string }) => `${(x.loc ?? []).join(".")}: ${x.msg ?? ""}`).join("; ")
      : d && typeof d === "object"
        ? String((d as { message?: string }).message ?? (d as { status?: string }).status ?? JSON.stringify(d))
        : String(d ?? detail);
  } catch {}
  const hint =
    status === 401 ? " (check ELEVENLABS_API_KEY)"
    : status === 402 || status === 403 ? " (your ElevenLabs plan may not include this, or its credits are used up)"
    : status === 429 ? " (rate or concurrency limit)"
    : "";
  return `ElevenLabs ${status}: ${detail}${hint}`;
}

async function call(s: SoundSettings, method: "GET" | "POST", route: string, body?: unknown, timeoutMs = 180_000): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new ElevenLabsError("ELEVENLABS_API_KEY is not set (add it to the agent's .env)", 0);
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${s.baseUrl}${route}`, {
        method,
        headers: { "xi-api-key": key, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new ElevenLabsError(`ElevenLabs unreachable: ${(e as Error).message}`, 0);
    }
    if (res.ok) return res;
    const text = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(2000 * (attempt + 1) ** 2);
      continue;
    }
    throw new ElevenLabsError(errorMessage(res.status, text), res.status);
  }
}

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** One spoken word, as HyperFrames' captions and duration sync read them (ids w0, w1, …). */
export interface Word {
  id: string;
  text: string;
  start: number;
  end: number;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const PUNCT_ONLY = /^[\p{P}\p{S}]+$/u;

/** Character timings → words: runs of non-space characters; a token that is only punctuation joins its neighbour. */
export function alignmentToWords(a: Alignment): Word[] {
  const n = Math.min(a.characters.length, a.character_start_times_seconds.length, a.character_end_times_seconds.length);
  const tokens: { text: string; start: number; end: number }[] = [];
  let cur: { text: string; start: number; end: number } | null = null;
  for (let i = 0; i < n; i++) {
    const ch = a.characters[i];
    if (!ch || /^\s+$/.test(ch)) {
      if (cur) tokens.push(cur);
      cur = null;
      continue;
    }
    const start = a.character_start_times_seconds[i];
    const end = a.character_end_times_seconds[i];
    if (!cur) cur = { text: ch, start, end };
    else {
      cur.text += ch;
      cur.end = Math.max(cur.end, end);
    }
  }
  if (cur) tokens.push(cur);
  const words: { text: string; start: number; end: number }[] = [];
  let prefix = "";
  for (const t of tokens) {
    if (PUNCT_ONLY.test(t.text)) {
      const last = words.at(-1);
      if (last) {
        last.text += ` ${t.text}`;
        last.end = Math.max(last.end, t.end);
      } else prefix += `${t.text} `;
      continue;
    }
    words.push({ ...t, text: prefix + t.text });
    prefix = "";
  }
  return words.map((w, i) => ({ id: `w${i}`, text: w.text, start: r3(w.start), end: r3(Math.max(w.end, w.start)) }));
}

/** Word timings spread by length over the clip, when the API returns no alignment. */
export function estimateWords(text: string, durationSec: number): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const weights = parts.map((p) => p.length + 1);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const span = Math.max(0.1, durationSec - 0.1);
  let t = 0.05;
  return parts.map((p, i) => {
    const d = (weights[i] / total) * span;
    const w = { id: `w${i}`, text: p, start: r3(t), end: r3(t + d * 0.9) };
    t += d;
    return w;
  });
}

export interface SpeechRequest {
  text: string;
  voiceId: string;
  model: string;
  /** ISO 639-1; eleven_multilingual_v2 detects the language itself */
  language?: string;
  /** 0.7–1.2 */
  speed?: number;
  /** the lines around this one, so the delivery flows across clips */
  previousText?: string;
  nextText?: string;
}

/** MP3 (44.1 kHz) and the character timings of one line. */
export async function synthesizeSpeech(s: SoundSettings, o: SpeechRequest): Promise<{ audio: Buffer; alignment: Alignment | null }> {
  const body: Record<string, unknown> = { text: o.text, model_id: o.model };
  if (o.language && !/multilingual_v2/.test(o.model)) body.language_code = o.language;
  if (o.speed && o.speed !== 1) body.voice_settings = { speed: Math.min(1.2, Math.max(0.7, o.speed)) };
  if (o.previousText) body.previous_text = o.previousText;
  if (o.nextText) body.next_text = o.nextText;
  const res = await call(s, "POST", `/v1/text-to-speech/${encodeURIComponent(o.voiceId)}/with-timestamps?output_format=mp3_44100_128`, body);
  const j = (await res.json()) as { audio_base64?: string; alignment?: Alignment | null; normalized_alignment?: Alignment | null };
  if (!j.audio_base64) throw new ElevenLabsError("ElevenLabs returned no audio for a narration line", res.status);
  // the alignment on the original text, so caption words match the script ("€2,500", not "two thousand …")
  const alignment = j.alignment?.characters?.length ? j.alignment : j.normalized_alignment?.characters?.length ? j.normalized_alignment : null;
  return { audio: Buffer.from(j.audio_base64, "base64"), alignment };
}

/** One sound effect as MP3. duration 0.5–30 s (omit to let the model decide). */
export async function soundEffect(s: SoundSettings, o: { text: string; durationSec?: number; promptInfluence?: number; loop?: boolean }): Promise<Buffer> {
  const body: Record<string, unknown> = { text: o.text, model_id: s.sfxModel };
  if (o.durationSec) body.duration_seconds = Math.min(30, Math.max(0.5, o.durationSec));
  if (o.promptInfluence !== undefined) body.prompt_influence = Math.min(1, Math.max(0, o.promptInfluence));
  if (o.loop) body.loop = true;
  const res = await call(s, "POST", "/v1/sound-generation?output_format=mp3_44100_128", body);
  return Buffer.from(await res.arrayBuffer());
}

/** A piece of music as MP3, 3 s to 10 min. */
export async function composeMusic(s: SoundSettings, o: { prompt: string; lengthMs: number; instrumental?: boolean }): Promise<Buffer> {
  const body = { prompt: o.prompt, music_length_ms: Math.round(Math.min(600_000, Math.max(3000, o.lengthMs))), model_id: s.musicModel, force_instrumental: o.instrumental ?? true };
  const res = await call(s, "POST", "/v1/music?output_format=mp3_44100_128", body, 600_000);
  return Buffer.from(await res.arrayBuffer());
}

export interface VoiceInfo {
  id: string;
  name: string;
  category?: string;
  labels: Record<string, string>;
  description?: string;
}

/** Search the voice library (the account's own voices and ElevenLabs' defaults). */
export async function searchVoices(s: SoundSettings, o: { search?: string; gender?: string; accent?: string; language?: string; pageSize?: number } = {}): Promise<VoiceInfo[]> {
  const q = new URLSearchParams({ page_size: String(Math.min(100, Math.max(1, o.pageSize ?? 20))) });
  for (const k of ["search", "gender", "accent", "language"] as const) if (o[k]?.trim()) q.set(k, o[k]!.trim());
  const res = await call(s, "GET", `/v2/voices?${q}`);
  const j = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string>; description?: string | null }[] };
  return (j.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels ?? {}, description: v.description?.slice(0, 200) || undefined }));
}
