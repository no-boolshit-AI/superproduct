/**
 * Optional: narration without an API key. Creates .venv with the local Kokoro voice (kokoro-onnx, soundfile; plus
 * HyperFrames' ElevenLabs package when VOICE_PROVIDER=hyperframes routes ElevenLabs through the workflow), installs the
 * on-device Parakeet model for word timings, and synthesises one test line so the voice model is downloaded now
 * rather than mid-run.
 * ElevenLabs needs only ELEVENLABS_API_KEY in .env (this agent calls it directly, with word timings); HeyGen voices
 * need only HEYGEN_API_KEY.
 *   npm run setup:voice
 */
import "../src/env.js";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../src/config.js";
import { hf, hfEnv, preflight, progressPrinter } from "../src/hyperframes.js";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const run = (cmd: string, args: string[]) => {
  console.log(dim(`$ ${[cmd, ...args].join(" ")}`));
  const r = spawnSync(cmd, args, { stdio: "inherit", env: hfEnv() });
  return r.status === 0;
};
const fail = (msg: string) => {
  console.log(`${red("✗")} ${msg}`);
  process.exit(1);
};

const python = ["python3.12", "python3.11", "python3.10", "python3"].find((p) => spawnSync(p, ["-c", "import sys; assert sys.version_info >= (3, 9)"], { stdio: "ignore" }).status === 0);
if (!python) fail("Python 3.9+ not found (macOS: xcode-select --install, or brew install python@3.12)");
const venv = path.join(ROOT, ".venv");
const py = path.join(venv, "bin", "python");
if (!fs.existsSync(py) && !run(python!, ["-m", "venv", venv])) fail("Couldn't create .venv");
const packages = ["kokoro-onnx", "soundfile"];
if (process.env.ELEVENLABS_API_KEY?.trim() && process.env.VOICE_PROVIDER?.trim().toLowerCase() === "hyperframes") packages.push("elevenlabs");
if (!run(py, ["-m", "pip", "install", "--upgrade", "--quiet", "pip"]) || !run(py, ["-m", "pip", "install", "--quiet", ...packages])) fail(`pip install ${packages.join(" ")} failed`);
console.log(`${green("✓")} .venv with ${packages.join(", ")} (HyperFrames uses it through HYPERFRAMES_PYTHON)`);

console.log(dim("… installing the on-device Parakeet model for word timings (captions)"));
const parakeet = await hf(["models", "install", "parakeet"], { cwd: ROOT, timeoutMs: 20 * 60_000, onLine: progressPrinter((l) => console.log(dim(`  ${l}`))) });
if (parakeet.code === 0) console.log(`${green("✓")} Parakeet word timings`);
else console.log(`${dim("·")} Parakeet didn't install; HyperFrames falls back to whisper.cpp for word timings`);

console.log(dim("… synthesising a test line with the local voice (downloads the Kokoro model the first time, about 340 MB)"));
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "explainer-voice-")), "test.wav");
const tts = await hf(["tts", "This is the local voice.", "-o", out], { cwd: ROOT, timeoutMs: 20 * 60_000 });
if (tts.code !== 0 || !fs.existsSync(out)) fail(`Kokoro test failed:\n${tts.stderr.slice(-800)}`);
console.log(`${green("✓")} Local voice works (${out})`);

if (spawnSync("which", ["espeak-ng"], { stdio: "ignore" }).status !== 0) console.log(`${dim("·")} For narration in languages other than English, also run: brew install espeak-ng`);
const pf = await preflight({ voice: true });
console.log(`\nNarration provider for --voice: ${pf.voice.provider ?? "none"} · word timings: ${pf.voice.transcription}`);
