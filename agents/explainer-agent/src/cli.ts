#!/usr/bin/env tsx
import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describeAuth, readJob, runJob } from "./agent.js";
import { DEFAULT_FORMAT, DEFAULT_LENGTH_SEC, FORMAT_IDS, OUTPUT_DIR, STYLES, WORKFLOWS, isFormat, isQuality, isStyle, isWorkflow, pluginInfo } from "./config.js";
import type { JobOptions } from "./events.js";
import { soundSettings } from "./media/elevenlabs.js";
import { imageSettings } from "./media/images.js";
import { brandKit, resolveProduct } from "./product.js";

const HELP = `Usage: npm run video -- [brief text] [options]

  -f, --file <path>        Brief from a file (markdown/txt); combined with inline text if both are given
      --format <f>         ${FORMAT_IDS.join(" | ")} (default ${DEFAULT_FORMAT}: 1080×1350 for the LinkedIn/Instagram feed)
      --style <s>          ${STYLES.join(" | ")} (default: the product's agents.explainer.style, else default).
                           vox-collage: Vox-style paper collage — torn cut-outs on twos, marker, stamps, 24 fps
  -l, --length <seconds>   Target length (default ${DEFAULT_LENGTH_SEC}; explainers work best at 30–90)
      --voice              Add narration and word-timed captions (ElevenLabs when ELEVENLABS_API_KEY is set, else
                           HyperFrames TTS: HeyGen → local Kokoro)
      --voice-id <id>      Voice for --voice (provider-specific id)
      --music <m>          A music bed: a file (mp3/wav/m4a), or "auto" / a mood ("dry upright piano, 90 bpm") to
                           compose one with ElevenLabs
      --sfx                Sound effects: made for the video with ElevenLabs when its key is set, else HyperFrames'
                           bundled library
      --no-images          Don't generate pictures (on by default when OPENAI_API_KEY is set: OpenAI
                           $OPENAI_IMAGE_MODEL in the product's illustration style)
  -i, --input <path>       A file for the video: images or clips (placed as real assets), text/markdown/PDF (source
                           material). Repeatable.
      --lang <code>        Language of on-screen text and narration (default en)
      --audience <text>    Who will watch
      --workflow <w>       ${WORKFLOWS.join(" | ")} (default faceless-explainer)
      --url <url>          Website to capture (with --workflow product-launch-video)
      --quality <q>        draft | standard | high (default high)
      --product <dir|id>   Product folder for brand, voice and facts, the id of one in workspace/products, or "none"
                           (default: $PRODUCT_DIR, then workspace/product)
  -m, --model <id>         Claude model (default $CLAUDE_MODEL / SDK default)
      --budget <usd>       Stop when Claude spend reaches this (default $MAX_BUDGET_USD)
      --revise <job-id>    Revise an existing job; the brief text becomes the change request
  -q, --quiet              Only print progress milestones and the summary

Examples:
  npm run video -- --file briefs/example-what-is-an-agent.md
  npm run video -- "Explain RAG to a finance team in 45 seconds" --format vertical --voice
  npm run video -- --file ../../workspace/briefs/launch.md --style vox-collage --length 30
  npm run video -- --revise 20261007-141500-what-an-ai-agent-actually-is "Slow down frame 3 and make the CTA bigger"
  npm run render -- 20261007-141500-what-an-ai-agent-actually-is --format mov    (ProRes 4444 for DaVinci Resolve)
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string", short: "f" },
    format: { type: "string" },
    style: { type: "string" },
    length: { type: "string", short: "l" },
    voice: { type: "boolean" },
    "voice-id": { type: "string" },
    music: { type: "string" },
    sfx: { type: "boolean" },
    "no-images": { type: "boolean" },
    input: { type: "string", short: "i", multiple: true },
    lang: { type: "string" },
    audience: { type: "string" },
    workflow: { type: "string" },
    url: { type: "string" },
    quality: { type: "string" },
    product: { type: "string" },
    model: { type: "string", short: "m" },
    budget: { type: "string" },
    revise: { type: "string" },
    quiet: { type: "boolean", short: "q" },
    help: { type: "boolean", short: "h" },
  },
});

const brief = [values.file ? fs.readFileSync(values.file, "utf8") : "", positionals.join(" ")].filter(Boolean).join("\n\n").trim();
if (values.help || !brief) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}
const format = values.format ?? DEFAULT_FORMAT;
if (!isFormat(format)) throw new Error(`--format must be one of ${FORMAT_IDS.join(", ")}`);
if (values.workflow && !isWorkflow(values.workflow)) throw new Error(`--workflow must be one of ${WORKFLOWS.join(", ")}`);
if (values.style && !isStyle(values.style)) throw new Error(`--style must be one of ${STYLES.join(", ")}`);
if (values.quality && !isQuality(values.quality)) throw new Error("--quality must be draft, standard or high");
if (values.workflow === "product-launch-video" && !values.url) throw new Error("--workflow product-launch-video needs --url");
// --music: an existing file is a bed to lay under the video; "auto" or any other words are a mood to compose one
const musicValue = values.music?.trim();
const musicFile = musicValue && fs.existsSync(musicValue) ? musicValue : undefined;
if (musicValue && !musicFile && (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(musicValue) || /^(\.{1,2}[\\/]|[\\/]|~)/.test(musicValue))) throw new Error(`File not found: ${musicValue}`);
const musicPrompt = musicValue && !musicFile ? musicValue : undefined;
for (const f of values.input ?? []) if (!fs.existsSync(f)) throw new Error(`File not found: ${f}`);
const length = values.length ? Number(values.length) : undefined;
if (length !== undefined && !(length >= 3 && length <= 300)) throw new Error("--length must be between 3 and 300 seconds");

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
console.log(dim(`Claude auth: ${describeAuth()}`));
{
  const product = resolveProduct(values.product);
  const kit = brandKit(product);
  const plugin = pluginInfo();
  console.log(dim(`Brand: ${kit.source}  ·  HyperFrames skills ${plugin.version ?? "missing"} (${plugin.skills.length})`));
  const img = imageSettings();
  const snd = soundSettings();
  const imagesLine = values["no-images"] ? "off (--no-images)" : img.mock ? "placeholders (IMAGE_MOCK=1)" : img.available ? `OpenAI ${img.model} (${img.quality}) in ${kit.illustration ? "the product's illustration style" : "a neutral illustration style"}` : "off (no OPENAI_API_KEY)";
  console.log(dim(`Images: ${imagesLine}  ·  Sound: ${snd.available ? "ElevenLabs" : "no ELEVENLABS_API_KEY"}`));
}

function onMessage(msg: SDKMessage) {
  if (msg.type === "system" && msg.subtype === "init") console.log(dim(`Model: ${msg.model}`));
  if (values.quiet) return;
  if (msg.type === "assistant" && !msg.parent_tool_use_id) {
    for (const b of msg.message.content) if (b.type === "text" && b.text.trim()) console.log(`\n${b.text.trim()}`);
  }
}

const options: JobOptions = {
  brief,
  format,
  lengthSec: length,
  voice: values.voice,
  voiceId: values["voice-id"],
  music: musicFile ? path.resolve(musicFile) : undefined,
  musicPrompt,
  sfx: values.sfx,
  images: values["no-images"] ? false : undefined,
  language: values.lang,
  audience: values.audience,
  workflow: values.workflow as JobOptions["workflow"],
  style: values.style as JobOptions["style"],
  url: values.url,
  quality: values.quality as JobOptions["quality"],
  // absolute paths, so a revision started from another folder (or the web UI) finds the same files
  product: values.product && !/^(none|off|false|0)$/i.test(values.product) ? path.resolve(values.product) : values.product,
  model: values.model,
  maxBudgetUsd: values.budget ? Number(values.budget) : undefined,
  inputs: (values.input ?? []).map((f) => path.resolve(f)),
};
if (values.revise && !readJob(values.revise)) throw new Error(`No job ${values.revise} in ${OUTPUT_DIR}`);

const job = await runJob({
  options,
  reviseJobId: values.revise,
  instructions: values.revise ? brief : undefined,
  onMessage,
  emit: (e) => {
    if (e.type === "tool" && !values.quiet && !e.worker) console.log(dim(`→ ${e.summary}`));
    if (e.type === "tool" && !values.quiet && e.worker && /^Writing/.test(e.summary)) console.log(dim(`  ↳ worker: ${e.summary}`));
    if (e.type === "step") console.log(`■ ${e.label}`);
    if (e.type === "denied") console.log(dim(`  ✗ refused (${e.tool}): ${e.reason}`));
    if (e.type === "status") console.log(dim(`· ${e.message}`));
    if (e.type === "error") console.error(`! ${e.message}`);
  },
});
console.log(`\n${"─".repeat(64)}\n${job.summary ?? job.error ?? ""}\n`);
console.log(`Job:    ${job.id}`);
console.log(`Folder: ${path.relative(process.cwd(), job.dir) || job.dir}`);
if (job.video) console.log(`Video:  ${path.relative(process.cwd(), path.join(job.dir, job.video))}  (${job.width}×${job.height}, ${job.durationSec?.toFixed(1)} s)`);
if (job.post) console.log(`Post:   ${path.relative(process.cwd(), path.join(job.dir, job.post))}`);
if (job.placeholders?.length) console.log(`Placeholders: ${job.placeholders.join(" · ")}`);
for (const w of job.warnings ?? []) console.log(`Warning: ${w}`);
const made = (t: string) => (job.media ?? []).filter((m) => m.type === t);
const mediaBits = [
  made("image").length && `${made("image").length} picture(s)`,
  made("narration").length && `narration ${made("narration").reduce((a, m) => a + (m.seconds ?? 0), 0).toFixed(0)} s / ${made("narration").reduce((a, m) => a + (m.characters ?? 0), 0)} characters`,
  made("sfx").length && `${made("sfx").length} sound effect(s)`,
  made("music").length && `${made("music").length} music bed(s)`,
].filter(Boolean);
if (mediaBits.length) console.log(dim(`Generated: ${mediaBits.join(" · ")} (listed in job.json → media)`));
console.log(dim(`Cost: $${(job.costUsd ?? 0).toFixed(2)} Claude${mediaBits.length ? " (OpenAI/ElevenLabs bill separately)" : ""}`));
process.exitCode = job.status === "done" ? 0 : 1;
