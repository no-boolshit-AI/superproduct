/**
 * The HyperFrames CLI as this agent uses it: one environment for every HyperFrames process (ours and the agent's
 * Bash), project scaffolding, offline-safe GSAP, render output discovery and a preflight of the machine.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GSAP_DIR, HF_BIN, NODE_BIN, PLUGIN_DIR, ROOT, cliVersion, pluginInfo } from "./config.js";

/** Environment for HyperFrames commands, also given to the agent so its Bash calls behave the same. */
export function hfEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined) env[k] = v;
  const version = pluginInfo().version ?? cliVersion() ?? "";
  Object.assign(env, {
    // the plugin owns skills: never let the CLI install or refresh standalone copies
    HYPERFRAMES_SKIP_SKILLS: "1",
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
    HYPERFRAMES_PLUGIN_VERSION: version,
    HYPERFRAMES_SKILL_PKG_VERSION: version,
    // no anonymous usage telemetry from agent runs
    HYPERFRAMES_NO_TELEMETRY: "1",
    DO_NOT_TRACK: "1",
  });
  const sep = process.platform === "win32" ? ";" : ":";
  env.PATH = [NODE_BIN, env.PATH ?? ""].filter(Boolean).join(sep);
  // helper scripts (animation-map, contrast-report) load @hyperframes/producer from here instead of bootstrapping it
  env.HYPERFRAMES_SKILL_NODE_MODULES = path.dirname(NODE_BIN);
  const venvPython = path.join(ROOT, ".venv", "bin", "python");
  if (!env.HYPERFRAMES_PYTHON?.trim() && fs.existsSync(venvPython)) env.HYPERFRAMES_PYTHON = venvPython;
  // a blank line in .env must not count as "set"
  for (const k of ["HYPERFRAMES_PYTHON", "HYPERFRAMES_BROWSER_PATH", "HEYGEN_API_KEY", "ELEVENLABS_API_KEY"]) if (!env[k]?.trim()) delete env[k];
  return env;
}

export interface HfResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the local HyperFrames CLI. Progress lines (@hf-progress) go to onLine; output is kept for errors. */
export function hf(args: string[], opts: { cwd: string; timeoutMs?: number; onLine?: (line: string) => void; signal?: AbortSignal }): Promise<HfResult> {
  return new Promise((resolve) => {
    const child = spawn(HF_BIN, args, { cwd: opts.cwd, env: hfEnv(), stdio: ["ignore", "pipe", "pipe"], signal: opts.signal });
    let stdout = "";
    let stderr = "";
    let buf = "";
    const onData = (chunk: Buffer, which: "out" | "err") => {
      const s = chunk.toString();
      if (which === "out") stdout += s;
      else stderr += s;
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
      if (!opts.onLine) return;
      buf += s;
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) opts.onLine(l);
    };
    child.stdout.on("data", (c) => onData(c, "out"));
    child.stderr.on("data", (c) => onData(c, "err"));
    const timer = opts.timeoutMs ? setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs) : null;
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${e.message}` });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

/** onLine handler for long CLI commands run from a terminal: drops spinner frames and repeats, prints each new message once. */
export function progressPrinter(write: (line: string) => void): (line: string) => void {
  let last = "";
  return (line) => {
    // spinners redraw in place (carriage return / cursor-to-column-1): keep the last frame of the line
    const frames = line.split(/\x1b\[[0-9;]*[GJK]|\r/).map(stripAnsi).filter((x) => x.trim());
    const text = (frames.at(-1) ?? "").replace(/^[\s•oO0◇◆|/\\-]+/, "").trim();
    if (!text || text === last || text.startsWith("@hf-progress")) return;
    last = text;
    write(text);
  };
}

/** Last meaningful lines of a failed CLI run, for an error message. */
export function failureText(r: HfResult, max = 12): string {
  const lines = stripAnsi(`${r.stdout}\n${r.stderr}`)
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !l.startsWith("@hf-progress") && !/█|░/.test(l));
  return lines.slice(-max).join("\n");
}

/**
 * Scaffold the HyperFrames project for a job: `hyperframes init <dir> --example=blank`, stamped with the workflow.
 * init refuses a non-empty directory, so this runs before anything else is written into it.
 */
export async function initProject(projectDir: string, workflow: string): Promise<void> {
  const parent = path.dirname(projectDir);
  fs.mkdirSync(parent, { recursive: true });
  const r = await hf(["init", path.basename(projectDir), "--non-interactive", "--example=blank", `--skill=${workflow}`], { cwd: parent, timeoutMs: 120_000 });
  if (r.code !== 0 || !fs.existsSync(path.join(projectDir, "hyperframes.json"))) throw new Error(`hyperframes init failed:\n${failureText(r)}`);
}

const GSAP_CDN = /https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@([0-9.]+)\/dist\/([A-Za-z0-9_.-]+\.js)/g;

function gsapVersion(): string | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(GSAP_DIR, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

function htmlFiles(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || !fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") && e.name !== ".hyperframes") continue;
    if (["node_modules", "renders", "snapshots", "vendor", "capture"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out, depth + 1);
    else if (/\.html?$/i.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Point GSAP <script> tags at local copies (project/vendor/gsap/…) when the installed gsap matches the CDN version.
 * The npm build is byte-identical to jsDelivr's (same SRI hash), so renders work offline and never depend on the CDN.
 */
export function localizeGsap(projectDir: string): { files: number; replaced: number } {
  const version = gsapVersion();
  if (!version) return { files: 0, replaced: 0 };
  let files = 0;
  let replaced = 0;
  for (const file of htmlFiles(projectDir)) {
    const src = fs.readFileSync(file, "utf8");
    let n = 0;
    const out = src.replace(GSAP_CDN, (m, v: string, name: string) => {
      const local = path.join(GSAP_DIR, "dist", name);
      if (v !== version || !fs.existsSync(local)) return m;
      const dest = path.join(projectDir, "vendor", "gsap", name);
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(local, dest);
      }
      n++;
      return `/vendor/gsap/${name}`;
    });
    if (n) {
      fs.writeFileSync(file, out);
      files++;
      replaced += n;
    }
  }
  return { files, replaced };
}

export interface VideoInfo {
  durationSec: number;
  width: number;
  height: number;
}

export function probeVideo(file: string): VideoInfo | null {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams?.[0];
    const d = Number(j.format?.duration);
    if (!s || !Number.isFinite(d)) return null;
    return { durationSec: Math.round(d * 100) / 100, width: s.width, height: s.height };
  } catch {
    return null;
  }
}

/** The rendered MP4: renders/video.mp4, else the newest .mp4 under renders/. */
export function findVideo(projectDir: string): string | null {
  const dir = path.join(projectDir, "renders");
  const main = path.join(dir, "video.mp4");
  if (fs.existsSync(main)) return main;
  if (!fs.existsSync(dir)) return null;
  const mp4 = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return mp4[0] ?? null;
}

/** Contact sheet from a finished video (one frame every ~duration/12 s, 4 columns). Fallback when snapshot didn't run. */
export function contactSheetFromVideo(video: string, out: string): boolean {
  const info = probeVideo(video);
  if (!info) return false;
  const every = Math.max(0.5, info.durationSec / 12);
  const cols = 4;
  const rows = Math.max(1, Math.ceil(Math.min(12, Math.floor(info.durationSec / every) || 1) / cols));
  const width = info.width >= info.height ? 360 : 270;
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", video, "-vf", `fps=1/${every.toFixed(3)},scale=${width}:-1,tile=${cols}x${rows}:padding=6:margin=6:color=white`, "-frames:v", "1", "-q:v", "3", out], { encoding: "utf8" });
  return r.status === 0 && fs.existsSync(out);
}

const has = (cmd: string, args = ["-version"]) => {
  try {
    return spawnSync(cmd, args, { stdio: "ignore", timeout: 15000 }).status === 0;
  } catch {
    return false;
  }
};

function heygenCredential(): boolean {
  if (["HEYGEN_ACCESS_TOKEN", "HEYGEN_API_KEY", "HYPERFRAMES_API_KEY"].some((k) => process.env[k]?.trim())) return true;
  const dir = process.env.HEYGEN_CONFIG_DIR?.trim() || path.join(os.homedir(), ".heygen");
  return fs.existsSync(path.join(dir, "credentials"));
}

function pythonHas(module: string): boolean {
  const env = hfEnv();
  const py = env.HYPERFRAMES_PYTHON || "python3";
  try {
    return spawnSync(py, ["-c", `import ${module}`], { stdio: "ignore", timeout: 20000, env }).status === 0;
  } catch {
    return false;
  }
}

export interface Preflight {
  node: { ok: boolean; version: string };
  ffmpeg: boolean;
  browser: { ok: boolean; detail: string };
  /** engine "explainer": ElevenLabs through this agent's narration tool; "hyperframes": the workflow's TTS chain */
  voice: { provider: "heygen" | "elevenlabs" | "kokoro" | null; engine: "explainer" | "hyperframes" | null; transcription: string; hints: string[] };
  problems: string[];
}

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail?: string;
  hint?: string;
}

/** ElevenLabs narration through this agent's own tool: the key is set, unless VOICE_PROVIDER=hyperframes asks for the workflow's chain. */
export const nativeElevenLabs = (env: NodeJS.ProcessEnv = process.env) => !!env.ELEVENLABS_API_KEY?.trim() && env.VOICE_PROVIDER?.trim().toLowerCase() !== "hyperframes";

/** What this machine can do: Node 22, FFmpeg, Chrome for rendering, and which voice provider narration would use. */
export async function preflight(opts: { voice?: boolean } = {}): Promise<Preflight> {
  const major = Number(process.versions.node.split(".")[0]);
  const node = { ok: major >= 22, version: process.versions.node };
  const ffmpeg = has("ffmpeg") && has("ffprobe");
  const doctor = await hf(["doctor", "--json"], { cwd: os.tmpdir(), timeoutMs: 60_000 });
  let checks: DoctorCheck[] = [];
  try {
    checks = JSON.parse(doctor.stdout.slice(doctor.stdout.indexOf("{"))).checks ?? [];
  } catch {}
  const check = (name: string) => checks.find((c) => c.name.toLowerCase().startsWith(name.toLowerCase()));
  const chrome = check("Chrome");
  const browser = { ok: !!chrome?.ok, detail: chrome ? `${chrome.detail ?? ""}${chrome.ok ? "" : ` → ${chrome.hint ?? "npm run setup"}`}` : "unknown (hyperframes doctor failed)" };
  const voice: Preflight["voice"] = { provider: null, engine: null, transcription: "", hints: [] };
  if (opts.voice && nativeElevenLabs()) Object.assign(voice, { provider: "elevenlabs", engine: "explainer", transcription: "ElevenLabs word timestamps" });
  else if (opts.voice) {
    if (heygenCredential()) voice.provider = "heygen";
    else if (process.env.ELEVENLABS_API_KEY?.trim() && pythonHas("elevenlabs")) voice.provider = "elevenlabs";
    else if (check("TTS (Kokoro)")?.ok || pythonHas("kokoro_onnx")) voice.provider = "kokoro";
    if (process.env.ELEVENLABS_API_KEY?.trim() && voice.provider !== "elevenlabs" && voice.provider !== "heygen")
      voice.hints.push("VOICE_PROVIDER=hyperframes with ELEVENLABS_API_KEY: HyperFrames' ElevenLabs path needs its Python package (npm run setup:voice)");
    const whisper = check("whisper-cpp");
    voice.transcription = voice.provider === "heygen" ? "HeyGen word timestamps" : whisper?.ok ? "whisper.cpp" : "Parakeet/whisper.cpp (installed on first use)";
    if (voice.provider) voice.engine = "hyperframes";
  }
  const problems: string[] = [];
  if (!node.ok) problems.push(`Node ${node.version}: HyperFrames needs Node 22 or newer`);
  if (!ffmpeg) problems.push("FFmpeg/FFprobe not found (macOS: brew install ffmpeg)");
  if (!browser.ok) problems.push(`Chrome for rendering: ${browser.detail}`);
  if (opts.voice && !voice.provider)
    problems.push("--voice needs a TTS provider: HEYGEN_API_KEY or ELEVENLABS_API_KEY in .env, or the free local voice (npm run setup:voice)");
  return { node, ffmpeg, browser, voice, problems };
}

export { PLUGIN_DIR };
