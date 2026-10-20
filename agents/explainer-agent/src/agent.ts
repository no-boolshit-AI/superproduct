import { query, type HookCallback, type HookJSONOutput, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_STORYBOARD, DEFAULT_STYLE, FORMATS, NODE_BIN, OUTPUT_DIR, PLUGIN_DIR, QUALITIES, ROOT, VERSION, cliVersion, pluginInfo, skillProblems, slugify, styleSpec, type Workflow } from "./config.js";
import type { Emit, JobEvent, JobOptions, JobRecord, StepId } from "./events.js";
import { STEPS } from "./events.js";
import { applyExtensions } from "./extensions.js";
import { checkBash, checkFileTool, isInside, localCli, realPath, rootsFor, type Roots } from "./guard.js";
import { failureText, findVideo, hf, hfEnv, localizeGsap, preflight, type Preflight } from "./hyperframes.js";
import { memoryStore } from "./media/common.js";
import { soundSettings } from "./media/elevenlabs.js";
import { DEFAULT_IMAGE_STYLE, imageSettings, type ImageStyle } from "./media/images.js";
import { BRAND_MARKER, brandKit, brandSection, productContext, resolveProduct, type BrandKit } from "./product.js";
import { lockedBriefFields, setupProject, writeBrandCapture, type ProjectSetup } from "./project.js";
import { FRAME_WORKER_PROMPT, approvalPrompt, initialPrompt, revisionPrompt, storyboardRevisionPrompt, systemAppend, type Phase } from "./prompt.js";
import { NUDGE, STORYBOARD_NUDGE, TurnKeeper } from "./session.js";
import { collectDelivery, createExplainerServer, presentStoryboard, storyboardFromProject, TOOL, TOOL_NAMES, type MediaContext, type ToolContext } from "./tools.js";

export function newJobId(brief: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const first = brief.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ?? "explainer";
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${slugify(first, 40)}`;
}

export function jobDirFor(id: string): string {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error(`Invalid job id: ${id}`);
  return path.join(OUTPUT_DIR, id);
}

export function readJob(id: string): JobRecord | null {
  try {
    const job = JSON.parse(fs.readFileSync(path.join(jobDirFor(id), "job.json"), "utf8")) as JobRecord;
    job.dir = jobDirFor(id); // where the job folder is now, if it moved since it was created
    return job;
  } catch {
    return null;
  }
}

function saveJob(job: JobRecord) {
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(job.dir, "job.json"), JSON.stringify(job, null, 2));
}

/**
 * Environment for the Claude Code subprocess (and so for the agent's Bash calls). Auth precedence (same as the CLI):
 *  ANTHROPIC_API_KEY → CLAUDE_CODE_OAUTH_TOKEN (subscription token from `claude setup-token`) → this machine's Claude Code login.
 * Empty values are removed so a blank line in .env doesn't shadow the subscription login.
 */
export function agentEnv(jobDir?: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...hfEnv(), CLAUDE_AGENT_SDK_CLIENT_APP: `explainer-agent/${VERSION}` };
  if (jobDir) {
    // Claude Code sources this before every Bash command, so the installed CLI stays first on PATH even when the
    // person's shell profile rewrites PATH
    const file = path.join(jobDir, "shell-env.sh");
    fs.writeFileSync(file, `export PATH=${JSON.stringify(NODE_BIN)}:"$PATH"\n`);
    env.CLAUDE_ENV_FILE = file;
  }
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) if (!env[k]?.trim()) delete env[k];
  for (const k of ["CLAUDE_CODE_SESSION_ID", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"]) delete env[k];
  return env;
}

export function describeAuth(): string {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "Anthropic API key (ANTHROPIC_API_KEY)";
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) return "Claude subscription (CLAUDE_CODE_OAUTH_TOKEN)";
  return "Claude subscription via this machine's Claude Code login";
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];
const effortOf = (v: string | undefined): Effort | undefined => (EFFORTS as readonly string[]).includes(String(v)) ? (v as Effort) : undefined;

const STEP_LABEL = Object.fromEntries(STEPS.map((s) => [s.id, s.label])) as Record<StepId, string>;

/** The workflow milestones a tool call marks (in workflow order), from the files and commands HyperFrames' explainer workflow uses. */
export function stepsFor(name: string, input: Record<string, unknown>): StepId[] {
  if (name === TOOL.deliver) return ["deliver"];
  if (name === TOOL.present) return ["review"];
  if (name === TOOL.images) return ["images"];
  if (name === TOOL.narration || name === TOOL.sfx || name === TOOL.music) return ["audio"];
  if (["Write", "Edit"].includes(name)) {
    const f = String(input.file_path ?? "").replace(/\\/g, "/");
    if (/(^|\/)BRIEF\.md$/.test(f)) return ["brief"];
    if (/(^|\/)STORYBOARD\.md$/.test(f) || /(^|\/)SCRIPT\.md$/.test(f) || /(^|\/)storyboard\.html$/.test(f)) return ["storyboard"];
    if (/compositions\/(frames\/)?[^/]+\.html$/.test(f)) return ["frames"];
    return [];
  }
  if (name !== "Bash") return [];
  const c = String(input.command ?? "");
  const hf = (sub: string) => new RegExp(`\\bhyperframes(@[\\w.-]+)?\\s+(${sub})\\b|plugin-cli\\.mjs["']?\\s+(${sub})\\b|npm run (${sub})\\b`).test(c);
  // a workflow script that runs (node …, directly or through the plugin launcher), not one that is listed or grepped
  const runs = (script: string) => new RegExp(`\\bnode\\b[^;&|\\n]*(${script})\\.mjs`).test(c);
  const found: Record<StepId, boolean> = {
    setup: false,
    brief: false,
    design: runs("build-frame"),
    storyboard: false,
    review: false,
    approved: false,
    images: false,
    audio: runs("audio"),
    frames: runs("frame-packets"),
    assemble: runs("assemble-index|transitions"),
    checks: hf("lint|check|validate|inspect"),
    snapshot: hf("snapshot"),
    render: hf("render"),
    deliver: false,
  };
  return STEPS.map((x) => x.id).filter((id) => found[id]);
}

const skillsDir = path.join(PLUGIN_DIR, "skills") + path.sep;

function summarizeTool(name: string, input: Record<string, unknown>): string | null {
  const short = (s: unknown, n = 110) => {
    const t = String(s ?? "").replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };
  const rel = (p: unknown) => String(p ?? "").replace(/^.*\/project\//, "");
  switch (name) {
    case "Skill":
      return `Skill ${short(input.skill ?? input.name ?? input.command)}`;
    case "Read":
      return `Reading ${rel(input.file_path).split(skillsDir).join("skill: ")}`;
    case "Write":
      return `Writing ${rel(input.file_path)}`;
    case "Edit":
      return `Editing ${rel(input.file_path)}`;
    case "Bash":
      return `$ ${short(String(input.command ?? "").split(skillsDir).join("<skills>/"))}`;
    case "Agent":
    case "Task":
      return `Worker: ${short(input.description ?? input.subagent_type, 80)}`;
    case TOOL.deliver:
      return "Delivering the video";
    case TOOL.present:
      return `Presenting the storyboard (${Array.isArray(input.frames) ? input.frames.length : "?"} frames)`;
    case TOOL.images: {
      const list = Array.isArray(input.images) ? (input.images as { name?: string }[]) : [];
      return `Generating ${list.length} picture${list.length === 1 ? "" : "s"}: ${short(list.map((i) => i.name).join(", "), 90)}`;
    }
    case TOOL.narration:
      return `Voicing the narration${Array.isArray(input.lines) ? ` (${input.lines.length} line${input.lines.length === 1 ? "" : "s"})` : " from SCRIPT.md"}`;
    case TOOL.voices:
      return `Finding voices${input.search ? `: ${short(input.search, 60)}` : ""}`;
    case TOOL.sfx: {
      const list = Array.isArray(input.sounds) ? (input.sounds as { name?: string }[]) : [];
      return `Sound effects: ${short(list.map((x) => x.name).join(", "), 90)}`;
    }
    case TOOL.music:
      return `Composing music (${input.duration_s ?? "?"} s)`;
    default:
      return null;
  }
}

export interface RunArgs {
  options: JobOptions;
  /** change an existing job: its storyboard (while it waits for approval) or its video */
  reviseJobId?: string;
  /** build the storyboard a job presented; `instructions` are the person's last notes, if any */
  approveJobId?: string;
  instructions?: string;
  jobId?: string;
  emit?: Emit;
  signal?: AbortSignal;
  onMessage?: (m: SDKMessage) => void;
}

/** Append the product's brand kit to frame.md once it exists (Step 2), and again if the agent rewrites frame.md without it. */
export function ensureBrandSection(projectDir: string, kit: BrandKit, logos: ProjectSetup["logos"]): boolean {
  const frame = path.join(projectDir, "frame.md");
  if (kit.name === "none" || !fs.existsSync(frame)) return false;
  const md = fs.readFileSync(frame, "utf8");
  if (md.includes(BRAND_MARKER)) return false;
  fs.writeFileSync(frame, `${md.trimEnd()}\n\n${brandSection(kit, logos)}\n`);
  return true;
}

/** The third family each style preset names for its serif voice, which build-frame's remix leaves alone. */
const STYLE_SERIF: [RegExp, string][] = [
  [/^name: Vox Collage/m, "Playfair Display"],
  [/^name: Editorial/m, "EB Garamond"],
];

/**
 * The vox-collage and editorial presets name a third family for their serif voice (Playfair Display, EB Garamond),
 * which build-frame's remix leaves alone. With a product, point it at a face the project actually ships: the brand's
 * accent face, else its display face.
 */
export function alignStyleFonts(projectDir: string, kit: BrandKit): boolean {
  const frame = path.join(projectDir, "frame.md");
  if (kit.name === "none" || !fs.existsSync(frame)) return false;
  const md = fs.readFileSync(frame, "utf8");
  const face = kit.fonts.accent ?? kit.fonts.display;
  const serif = STYLE_SERIF.find(([name, family]) => name.test(md) && md.includes(family))?.[1];
  if (!face || !serif) return false;
  fs.writeFileSync(frame, md.replaceAll(serif, face));
  return true;
}

interface HookActions {
  /** frame.md may have changed: make sure it carries the Brand kit */
  onFrameMd: () => void;
  /** a job-specific refusal for a shell command (beyond the guard), or null */
  refuse?: (command: string) => string | null;
  /** a job-specific refusal for any other tool (frame workers before approval), or null */
  refuseTool?: (name: string) => string | null;
  /** build-frame.mjs is about to run: make sure capture/ carries the brand tokens and fonts */
  beforeBuildFrame: () => void;
}

function buildHooks(roots: Roots, emit: Emit, act: HookActions): Options["hooks"] {
  const deny = (reason: string): HookJSONOutput => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
  const pre: HookCallback = async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const ti = (input.tool_input ?? {}) as Record<string, unknown>;
    // Claude Code's working directory, compared as a real path like the roots
    const real = input.cwd ? realPath(input.cwd) : "";
    const cwd = real && isInside(real, roots.job) ? real : roots.project;
    if (input.tool_name === "Bash") {
      const refused = act.refuse?.(String(ti.command ?? ""));
      if (refused) {
        emit({ type: "denied", tool: "Bash", reason: refused });
        return deny(refused);
      }
      const res = checkBash(String(ti.command ?? ""), roots, cwd);
      if (!res.ok) {
        emit({ type: "denied", tool: "Bash", reason: res.reason ?? "" });
        return deny(res.reason ?? "not allowed");
      }
      const command = String(ti.command ?? "");
      if (/build-frame\.mjs/.test(command)) act.beforeBuildFrame();
      if (res.rendersCompositions) {
        act.onFrameMd();
        localizeGsap(roots.project);
      }
      // run the installed CLI rather than letting npx fetch another copy
      const local = localCli(command);
      if (local !== command && checkBash(local, roots, cwd).ok)
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...ti, command: local } } };
      return {};
    }
    const no = act.refuseTool?.(input.tool_name);
    if (no) {
      emit({ type: "denied", tool: input.tool_name, reason: no });
      return deny(no);
    }
    const why = checkFileTool(input.tool_name, ti, roots, cwd);
    if (why) {
      emit({ type: "denied", tool: input.tool_name, reason: why });
      return deny(why);
    }
    return {};
  };
  const post: HookCallback = async (input) => {
    if (input.hook_event_name === "PostToolUse" && ["Bash", "Write", "Edit"].includes(input.tool_name)) act.onFrameMd();
    return {};
  };
  return { PreToolUse: [{ hooks: [pre] }], PostToolUse: [{ hooks: [post] }] };
}

/** With ElevenLabs narration, the workflow's own TTS pass would voice the script a second time over ours. */
export function refuseWorkflowTts(command: string): string | null {
  // any `node … audio.mjs` (the workflow's adapter or the media engine, by path or from its folder) except the two
  // passes that keep our voices: sync-durations and fetch-sfx
  const generate = /\bnode\b[^;&|\n]*[\s"'\/\\]audio\.mjs(?!["']?\s+(?:sync-durations|fetch-sfx)\b)/.test(command);
  return generate
    ? "Narration on this run comes from mcp__explainer__generate_narration (ElevenLabs, exact word timings): it writes assets/voice/ and the voices in audio_meta.json. Call it once SCRIPT.md is written, then run `audio.mjs sync-durations`; the audio generate command isn't used here."
    : null;
}

const BEFORE_APPROVAL = "The storyboard isn't approved yet: this run ends at mcp__explainer__present_storyboard, and pictures, sound, frames, assembly and renders come after the person approves. Finish STORYBOARD.md and storyboard.html and present them.";

/** While the storyboard waits for approval: the build steps the workflow would take next. */
export function refuseBeforeApproval(command: string): string | null {
  const runs = (script: string) => new RegExp(`\\bnode\\b[^;&|\\n]*[\\s"'\\/\\\\](${script})\\.mjs`).test(command);
  const hf = (sub: string) => new RegExp(`\\bhyperframes(@[\\w.-]+)?\\s+(${sub})\\b|plugin-cli\\.mjs["']?\\s+(${sub})\\b`).test(command);
  return runs("frame-packets|assemble-index|transitions|captions|audio") || hf("render|snapshot|add") ? BEFORE_APPROVAL : null;
}

/** Frame workers and the dispatch tools wait for approval too. */
export function refuseToolBeforeApproval(name: string): string | null {
  return name === "Agent" || name === "Task" ? BEFORE_APPROVAL : null;
}

function frameCount(projectDir: string): number {
  const dir = path.join(projectDir, "compositions", "frames");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".html")).length : 0;
}

export async function runJob(args: RunArgs): Promise<JobRecord> {
  const o = args.options;
  const startedAt = Date.now();
  let job: JobRecord;
  /** what this run makes */
  let phase: Phase;
  /** this run continues a job: its storyboard changes, the approval, or a video revision */
  let mode: "new" | "storyboard-revision" | "approval" | "video-revision" = "new";
  const existingId = args.approveJobId ?? args.reviseJobId;
  if (existingId) {
    const existing = readJob(existingId);
    if (!existing) throw new Error(`Job not found: ${existingId}`);
    if (!existing.sessionId) throw new Error(`This job has no saved agent session, so it can't be ${args.approveJobId ? "approved" : "revised"}.`);
    const waiting = existing.status === "storyboard" || (existing.phase === "storyboard" && !!existing.storyboard && !existing.video);
    if (args.approveJobId && !waiting)
      throw new Error(existing.storyboard?.approvedAt ? `Job ${existingId}'s storyboard was approved already; use --revise to change the video.` : `Job ${existingId} has no storyboard waiting for approval.`);
    mode = args.approveJobId ? "approval" : waiting ? "storyboard-revision" : "video-revision";
    phase = mode === "storyboard-revision" ? "storyboard" : "video";
    job = existing;
    job.dir = jobDirFor(job.id); // where the job folder is now, if it moved since it was created
    job.status = "running";
    job.error = undefined;
    job.warnings = [];
    if (mode === "approval") job.storyboard = { ...job.storyboard!, approvedAt: new Date().toISOString(), approvalNotes: args.instructions?.trim() || undefined };
    else job.revisions = [...(job.revisions ?? []), { at: new Date().toISOString(), instructions: args.instructions ?? "", kind: phase }];
    Object.assign(o, {
      ...job.options,
      model: o.model ?? job.options.model,
      maxBudgetUsd: o.maxBudgetUsd ?? job.options.maxBudgetUsd,
      quality: o.quality ?? job.options.quality,
      product: o.product ?? job.options.product,
      // --storyboard-images on a revision turns it on for the rest of the job (the build reuses the pictures)
      storyboardImages: o.storyboardImages ?? job.options.storyboardImages,
      brief: job.brief,
      inputs: o.inputs,
    });
    job.options.storyboardImages = o.storyboardImages;
  } else {
    const id = args.jobId ?? newJobId(o.brief);
    const dir = jobDirFor(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "brief.md"), o.brief);
    o.storyboard ??= DEFAULT_STORYBOARD;
    const { brief: _b, inputs: _i, ...rest } = o;
    job = { id, dir, brief: o.brief, options: rest, status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revisions: [] };
    phase = o.storyboard === false ? "video" : "storyboard";
  }
  job.phase = phase;
  const dir = job.dir;
  const baseCost = job.costUsd ?? 0; // a revision adds to what the job already cost
  const workflow: Workflow = o.workflow ?? job.workflow ?? "faceless-explainer";
  job.workflow = workflow;
  // explainer-agent's skill extensions (vox-collage & co.) over the vendored plugin, in case a skills update dropped them
  const ext = applyExtensions();
  const plugin = pluginInfo();
  job.hyperframes = { cli: cliVersion(), skills: plugin.version };
  saveJob(job);
  const eventsFile = path.join(dir, "events.jsonl");
  // milestones of this run (a revision shows its own progress); job.steps keeps the union
  const steps = new Set<StepId>();
  const earlierSteps = job.steps ?? [];
  const emit: Emit = (e: JobEvent) => {
    fs.appendFile(eventsFile, JSON.stringify({ t: Date.now(), ...e }) + "\n", () => {});
    args.emit?.(e);
  };
  // the storyboard phase can only reach the storyboard's milestones (a refused build step still shows up as a call)
  const reachable = (s: StepId) => phase !== "storyboard" || ["setup", "brief", "design", "storyboard", "review"].includes(s);
  const mark = (s: StepId) => {
    if (steps.has(s) || !reachable(s)) return;
    steps.add(s);
    emit({ type: "step", step: s, label: STEP_LABEL[s] });
  };
  const fail = (msg: string) => {
    job.status = "error";
    job.error = msg;
    emit({ type: "error", message: msg });
    saveJob(job);
    emit({ type: "done", job });
    return job;
  };
  emit({
    type: "status",
    message:
      mode === "approval" ? `Building ${job.id} from storyboard v${job.storyboard?.version ?? 1}`
      : mode === "storyboard-revision" ? `Revising storyboard v${job.storyboard?.version ?? 1} of ${job.id}`
      : mode === "video-revision" ? `Revising ${job.id}`
      : phase === "storyboard" ? `Started ${job.id} (storyboard first)`
      : `Started ${job.id}`,
  });
  if (ext.copied.length || ext.appended.length) emit({ type: "status", message: `Skill extensions applied (${ext.copied.length + ext.appended.length} files)` });
  for (const t of ext.missingTargets) emit({ type: "status", message: `Skill extension skipped: ${t} isn't in this HyperFrames release` });

  // ── product, machine and skills checks: fail before any Claude spend ─────────
  let product;
  try {
    product = resolveProduct(o.product);
  } catch (e) {
    return fail((e as Error).message);
  }
  const kit = brandKit(product);
  // the look: --style, else the product's default, else DEFAULT_STYLE; the editorial look: --look, else the product's
  o.style ??= kit.style ?? DEFAULT_STYLE;
  job.options.style = o.style;
  const look = o.style === "editorial" ? (o.look ?? kit.look ?? "auto") : undefined;
  const context = product ? productContext(product) : undefined;
  if (context) fs.writeFileSync(path.join(dir, "product-context.md"), context);
  job.product = product ? { dir: product.dir, name: product.name } : null;
  job.brand = kit.source;
  for (const w of kit.warnings) emit({ type: "status", message: `Brand: ${w}` });
  emit({ type: "status", message: `Brand: ${kit.source} · HyperFrames ${job.hyperframes.cli ?? "?"} · skills ${plugin.version ?? "missing"} (${plugin.skills.length})` });
  if (o.style !== "default") emit({ type: "status", message: `Style: ${styleSpec(o.style).label}${look ? ` · look: ${look}` : ""}` });
  const skills = skillProblems(plugin, job.hyperframes.cli);
  if (skills.length) return fail(skills.join("; "));
  const pf: Preflight = await preflight({ voice: o.voice });
  job.voice = o.voice ? { provider: pf.voice.provider } : undefined;
  if (pf.problems.length) return fail(`This machine isn't ready: ${pf.problems.join("; ")}`);
  const sound = soundSettings();
  const images = imageSettings();
  if (o.musicPrompt && !o.music && !sound.available) return fail("--music auto (or a mood) composes the music with ElevenLabs: add ELEVENLABS_API_KEY to .env, or pass a music file");
  // narration through our ElevenLabs tool replaces the workflow's TTS step
  const nativeVoice = !!o.voice && pf.voice.engine === "explainer";
  for (const h of pf.voice.hints) emit({ type: "status", message: h });
  if (o.voice) emit({ type: "status", message: `Voice: ${pf.voice.provider} · timings: ${pf.voice.transcription}` });

  // ── the HyperFrames project ─────────────────────────────────────────────────
  let setup: ProjectSetup;
  try {
    setup = await setupProject(dir, o, kit, workflow);
  } catch (e) {
    return fail((e as Error).message);
  }
  const projectDir = setup.projectDir;
  job.title ??= setup.title;
  mark("setup");
  if (mode === "approval") mark("approved");
  saveJob(job);

  const f = FORMATS[o.format];
  const voiceId = o.voiceId ?? kit.voice;
  job.media ??= [];
  const media: MediaContext = { store: memoryStore(job.media, () => saveJob(job)) };
  if (images.available && o.images !== false) {
    const style: ImageStyle = {
      text: kit.illustration?.style || DEFAULT_IMAGE_STYLE,
      references: setup.styleRefs.map((r) => path.join(projectDir, r)),
      source: kit.illustration ? kit.source : "built-in",
    };
    media.images = { settings: images, style };
    emit({ type: "status", message: `Images: ${images.mock ? "placeholders (IMAGE_MOCK=1)" : `OpenAI ${images.model}, ${images.quality}`} · style: ${style.source}${style.references.length ? ` (${style.references.length} reference${style.references.length > 1 ? "s" : ""})` : ""} · up to ${images.max} per run` });
  }
  if (sound.available) {
    media.sound = { settings: sound, voiceId: (nativeVoice && voiceId) || sound.voiceId, language: o.language, narration: nativeVoice, sfx: !!o.sfx, music: !!o.musicPrompt && !o.music && !setup.staged.some((x) => x.kind === "music") };
    const what = [nativeVoice && "narration", o.sfx && "sound effects", media.sound.music && "music"].filter(Boolean);
    if (what.length) emit({ type: "status", message: `Sound: ElevenLabs (${what.join(", ")})` });
  }
  const ctx: ToolContext = {
    jobDir: dir,
    projectDir,
    width: f.width,
    height: f.height,
    cta: kit.cta,
    emit,
    media,
    phase,
    storyboardVersion: mode === "storyboard-revision" ? (job.storyboard?.version ?? 0) + 1 : (job.storyboard?.version ?? 1),
    storyboardImages: !!o.storyboardImages && !!media.images,
    formatLine: `${f.ratio} ${f.id} ${f.width}×${f.height} · about ${o.lengthSec ?? 45} s · ${o.voice ? "narrated, with captions" : "silent, on-screen text"}`,
  };
  const roots = rootsFor(dir, projectDir, PLUGIN_DIR, ROOT);
  const onFrameMd = () => {
    if (alignStyleFonts(projectDir, kit)) emit({ type: "status", message: "frame.md: the serif voice set to the brand's face" });
    if (ensureBrandSection(projectDir, kit, setup.logos)) emit({ type: "status", message: "Brand kit added to frame.md" });
  };
  const beforeBuildFrame = () => {
    if (kit.name !== "none") writeBrandCapture(projectDir, kit, { title: setup.title, description: setup.title });
  };
  const promptCtx = {
    phase,
    look,
    reviewed: phase === "video" && !!job.storyboard?.approvedAt,
    storyboardImages: !!o.storyboardImages && !!media.images,
    projectDir,
    jobDir: dir,
    pluginDir: PLUGIN_DIR,
    pluginVersion: plugin.version ?? "",
    workflow,
    kit,
    logos: setup.logos,
    productName: product?.name,
    productContext: context,
    preflight: pf,
    // an explicit voice (--voice-id, product.json); with ElevenLabs the prompt names the default and may search
    voiceId,
    kitDir: setup.kit,
    media: {
      images: media.images && { model: media.images.settings.model, mock: media.images.settings.mock, max: media.images.settings.max, refs: setup.styleRefs },
      sound: media.sound && { narration: media.sound.narration, sfx: media.sound.sfx, music: media.sound.music, voiceId: media.sound.voiceId, ttsModel: media.sound.settings.ttsModel },
    },
  };
  const prompt =
    mode === "approval" ? approvalPrompt({ brief: job.brief, notes: args.instructions ?? "", staged: setup.staged, version: job.storyboard?.version ?? 1, workflow, voice: !!o.voice })
    : mode === "storyboard-revision" ? storyboardRevisionPrompt(args.instructions ?? "", setup.staged, ctx.storyboardVersion ?? 2)
    : mode === "video-revision" ? revisionPrompt(args.instructions ?? "", setup.staged)
    : initialPrompt(o, lockedBriefFields(o, workflow, voiceId), setup.staged, phase);

  const freshSession = mode === "new" || mode === "approval";
  let sessionSaved = false;
  const abort = new AbortController();
  // the prompt stays open until the video (or the storyboard) is handed over, so background frame workers can finish
  // (see session.ts)
  const keeper = new TurnKeeper(prompt, {
    delivered: () => (phase === "storyboard" ? !!ctx.storyboard : !!ctx.delivered),
    nudge: phase === "storyboard" ? STORYBOARD_NUDGE : NUDGE,
    onNudge: (n) => emit({ type: "status", message: `The agent ended its turn before ${phase === "storyboard" ? "presenting the storyboard" : "delivering"}; asking it to carry on (${n}/2)` }),
    onStall: () => emit({ type: "status", message: "Nothing happened for 45 minutes; ending the run" }),
  });
  args.signal?.addEventListener("abort", () => {
    keeper.close();
    abort.abort();
  });
  const builtIn = ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Skill", "Agent", "TaskCreate", "TaskUpdate", "TaskStop"];
  const effort = effortOf(process.env.CLAUDE_EFFORT?.trim());
  const workerEffort = effortOf(process.env.FRAME_WORKER_EFFORT?.trim());
  try {
    const q = query({
      prompt: keeper.prompt,
      options: {
        systemPrompt: { type: "preset", preset: "claude_code", append: systemAppend(o, promptCtx, setup.staged) },
        model: o.model || process.env.CLAUDE_MODEL?.trim() || undefined,
        ...(effort ? { effort } : {}),
        cwd: projectDir,
        tools: builtIn,
        allowedTools: [...builtIn, "Task", ...TOOL_NAMES],
        disallowedTools: ["WebFetch", "WebSearch", "AskUserQuestion", "NotebookEdit", "EnterPlanMode", "ExitPlanMode", "mcp__claude-in-chrome", "mcp__Claude_in_Chrome"],
        permissionMode: "dontAsk",
        settingSources: [],
        strictMcpConfig: true,
        plugins: [{ type: "local", path: PLUGIN_DIR }],
        skills: plugin.skills.map((s) => `hyperframes:${s}`),
        agents: {
          "frame-worker": {
            description: "Builds exactly one HyperFrames frame (compositions/frames/NN-*.html) from its _role.md and frame packet. Use it for every frame the workflow dispatches.",
            prompt: FRAME_WORKER_PROMPT,
            tools: ["Read", "Write", "Edit", "Glob", "Grep"],
            model: process.env.FRAME_WORKER_MODEL?.trim() || "inherit",
            ...(workerEffort ? { effort: workerEffort } : {}),
          },
        },
        mcpServers: { explainer: createExplainerServer(ctx) },
        hooks: buildHooks(roots, emit, {
          onFrameMd,
          beforeBuildFrame,
          refuse: (command) => (phase === "storyboard" ? refuseBeforeApproval(command) : nativeVoice ? refuseWorkflowTts(command) : null),
          refuseTool: (name) => (phase === "storyboard" ? refuseToolBeforeApproval(name) : null),
        }),
        maxTurns: o.maxTurns ?? Number(process.env.MAX_TURNS || 400),
        maxBudgetUsd: o.maxBudgetUsd ?? (process.env.MAX_BUDGET_USD ? Number(process.env.MAX_BUDGET_USD) : undefined),
        abortController: abort,
        // a resumed session keeps the system prompt it started with, so the build after approval (whose prompt differs
        // from the storyboard's) starts a fresh session from the approved files; changes resume their run's session
        ...(!freshSession && job.sessionId ? { resume: job.sessionId } : {}),
        env: agentEnv(dir),
      },
    });
    for await (const msg of q) {
      keeper.observe(msg);
      args.onMessage?.(msg);
      if (freshSession && !sessionSaved && "session_id" in msg && msg.session_id) {
        job.sessionId = msg.session_id;
        sessionSaved = true;
        saveJob(job);
      }
      if (msg.type === "assistant") {
        const worker = !!msg.parent_tool_use_id;
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim() && !worker) emit({ type: "text", text: block.text.trim() });
          if (block.type === "tool_use") {
            const input = (block.input ?? {}) as Record<string, unknown>;
            const s = summarizeTool(block.name, input);
            if (s) emit({ type: "tool", name: block.name, summary: s, worker });
            for (const step of stepsFor(block.name, input)) mark(step);
          }
        }
      } else if (msg.type === "result") {
        job.costUsd = baseCost + (msg.total_cost_usd ?? 0);
        emit({ type: "cost", usd: job.costUsd, turns: msg.num_turns });
        if (msg.subtype === "success") job.summary = msg.result;
        else {
          const why =
            msg.subtype === "error_max_budget_usd" ? `Stopped at the $${o.maxBudgetUsd ?? process.env.MAX_BUDGET_USD} budget limit`
            : msg.subtype === "error_max_turns" ? "Stopped at the turn limit"
            : `Agent error: ${(msg as { errors?: string[] }).errors?.join("; ") || msg.subtype}`;
          emit({ type: "status", message: why });
          job.error = why;
        }
      }
    }
    keeper.close();
  } catch (e) {
    keeper.close();
    if (abort.signal.aborted) {
      job.status = "cancelled";
      job.error = "Cancelled";
    } else {
      job.error = (e as Error).message;
      emit({ type: "error", message: job.error });
    }
  }

  // ── safety net: whatever happened, hand over what exists ────────────────────
  const warnings: string[] = job.warnings ?? [];
  if (phase === "storyboard") {
    if (!ctx.storyboard && job.status !== "cancelled") {
      const fallback = storyboardFromProject(projectDir, job.title ?? "Explainer");
      if (fallback && fs.statSync(path.join(projectDir, "STORYBOARD.md")).mtimeMs >= startedAt - 1000) {
        emit({ type: "status", message: "The agent stopped before presenting; collecting the storyboard that exists" });
        await presentStoryboard(ctx, fallback);
        warnings.push("The agent didn't call present_storyboard; storyboard.md was collected from STORYBOARD.md by the safety net (no main points or on-screen words).");
      }
    }
    if (ctx.storyboard) {
      const sb = ctx.storyboard;
      job.storyboard = { version: sb.version, review: sb.review, sheet: sb.sheet, html: sb.html, frames: sb.frames, seconds: sb.seconds, presentedAt: new Date().toISOString() };
      warnings.push(...sb.warnings);
      mark("review");
      if (job.status === "running") job.status = "storyboard";
    } else if (job.status === "running") {
      job.status = "error";
      job.error ??= "The agent stopped before presenting a storyboard.";
    }
    job.frames = frameCount(projectDir);
    job.steps = STEPS.map((x) => x.id).filter((id) => steps.has(id) || earlierSteps.includes(id));
    job.warnings = warnings;
    saveJob(job);
    emit({ type: "done", job });
    return job;
  }
  if (!ctx.delivered && job.status !== "cancelled") {
    const since = startedAt - 1000;
    const fresh = (v: string | null): v is string => !!v && fs.statSync(v).mtimeMs >= since;
    let video = findVideo(projectDir);
    if (!fresh(video) && fs.existsSync(path.join(projectDir, "index.html")) && frameCount(projectDir) > 0) {
      emit({ type: "status", message: "The agent stopped before delivering; rendering what exists" });
      alignStyleFonts(projectDir, kit);
      ensureBrandSection(projectDir, kit, setup.logos);
      localizeGsap(projectDir);
      const fps = styleSpec(o.style).fps;
      const r = await hf(["render", `--skill=${workflow}`, "--quality", QUALITIES[o.quality ?? "high"], ...(fps ? ["--fps", String(fps)] : []), "--output", "renders/video.mp4"], { cwd: projectDir, timeoutMs: 45 * 60_000 });
      if (r.code === 0) video = findVideo(projectDir);
      else warnings.push(`Safety-net render failed:\n${failureText(r, 8)}`);
    }
    if (fresh(video)) {
      try {
        const sheet = path.join(projectDir, "snapshots", "contact-sheet.jpg");
        collectDelivery(ctx, {
          videoAbs: video,
          sheetAbs: fs.existsSync(sheet) ? sheet : null,
          title: job.title ?? "Explainer",
          caption: "(not written: the agent stopped before delivering)",
          altText: "(not written)",
          placeholders: [],
          notes: "Collected by the safety net: check the video before using it.",
        });
        warnings.push("The agent didn't call deliver; the video was collected by the safety net (no caption or alt text).");
      } catch (e) {
        warnings.push((e as Error).message);
      }
    }
  }
  if (ctx.delivered) {
    const d = ctx.delivered;
    job.video = path.basename(d.video);
    job.contactSheet = d.contactSheet ? path.basename(d.contactSheet) : undefined;
    job.post = "post.md";
    job.durationSec = d.info.durationSec;
    job.width = d.info.width;
    job.height = d.info.height;
    job.placeholders = d.placeholders;
    if (d.title && !d.title.startsWith("(")) job.title = d.title;
    mark("deliver");
    if (job.status === "running") job.status = "done";
  } else if (job.status === "running") {
    job.status = "error";
    job.error ??= "The agent finished without a rendered video.";
  }
  job.frames = frameCount(projectDir);
  job.steps = STEPS.map((x) => x.id).filter((id) => steps.has(id) || earlierSteps.includes(id));
  job.warnings = warnings;
  saveJob(job);
  emit({ type: "done", job });
  return job;
}
