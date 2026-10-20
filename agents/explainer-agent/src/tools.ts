/**
 * The agent's own tools; everything else is the HyperFrames CLI and skills.
 *  - present_storyboard (storyboard phase): photographs the sketch sheet (storyboard.html), writes storyboard.md (the
 *    review document) into the job folder and ends the phase: nothing is built before the person approves;
 *  - deliver (video phase): copies the render and its contact sheet into the job folder, writes post.md (caption, alt
 *    text, placeholders, generated media) and ends the job;
 *  - generate_images (OPENAI_API_KEY or IMAGE_MOCK=1): pictures in the product's illustration style for the motion
 *    layers — cut-outs, illustrated interface elements, illustrations, scenes — into assets/images/;
 *  - generate_narration, find_voices (--voice), generate_sfx (--sfx), generate_music (--music auto|<mood>), with
 *    ELEVENLABS_API_KEY: audio into assets/voice|sfx|music/, registered in audio_meta.json the way the workflow reads it.
 * The API keys stay in this process: the agent's shell never sees them.
 */
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { VERSION } from "./config.js";
import type { Emit } from "./events.js";
import { contactSheetFromVideo, probeVideo, type VideoInfo } from "./hyperframes.js";
import { isInside } from "./guard.js";
import { renderSheet, type SheetShot } from "./sheet.js";
import { madeThisRun, type MediaStore } from "./media/common.js";
import { IMAGE_KINDS, generateImages, type ImageResult, type ImageSettings, type ImageStyle } from "./media/images.js";
import type { SoundSettings } from "./media/elevenlabs.js";
import { findVoices, generateMusic, generateNarration, generateSfx, type SfxResult } from "./media/sound.js";

export interface Delivery {
  video: string;
  contactSheet: string | null;
  info: VideoInfo;
  title: string;
  caption: string;
  altText: string;
  placeholders: string[];
  notes?: string;
}

/** What this job may generate, and the record of what it did. */
export interface MediaContext {
  store: MediaStore;
  /** pictures in the house style (absent: no key, or --no-images) */
  images?: { settings: ImageSettings; style: ImageStyle };
  /** ElevenLabs (absent: no key); each tool exists only when the job asked for that kind of sound */
  sound?: { settings: SoundSettings; voiceId: string; language?: string; narration: boolean; sfx: boolean; music: boolean };
}

/** A storyboard handed to the person for review. */
export interface StoryboardPresented {
  version: number;
  /** files written into the job folder */
  review: string;
  sheet?: string;
  /** project-relative sketch sheet */
  html?: string;
  frames: number;
  seconds: number;
  cells?: number;
  warnings: string[];
}

export interface ToolContext {
  jobDir: string;
  projectDir: string;
  /** expected canvas, to flag a render at the wrong size */
  width: number;
  height: number;
  cta?: { label: string; url: string };
  emit: Emit;
  media?: MediaContext;
  /** what this run makes: the storyboard for review (ends at present_storyboard) or the video (ends at deliver) */
  phase?: "storyboard" | "video";
  /** the version this run's storyboard gets (1 for the first, +1 per revision) */
  storyboardVersion?: number;
  /** --storyboard-images: the storyboard phase generates its pictures too, so the sheet shows them */
  storyboardImages?: boolean;
  /** e.g. "4:5 portrait · about 45 s · silent", for the review document */
  formatLine?: string;
  storyboard?: StoryboardPresented;
  delivered?: Delivery;
}

export const TOOL = {
  present: "mcp__explainer__present_storyboard",
  deliver: "mcp__explainer__deliver",
  images: "mcp__explainer__generate_images",
  narration: "mcp__explainer__generate_narration",
  voices: "mcp__explainer__find_voices",
  sfx: "mcp__explainer__generate_sfx",
  music: "mcp__explainer__generate_music",
} as const;

const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });

/** post.md's note on what was generated, and by what (for an AI-content label where a platform asks for one). */
export function mediaNote(store: MediaStore | undefined): string {
  if (!store?.entries.length) return "";
  const of = (t: string) => store.entries.filter((e) => e.type === t);
  const models = (es: { model: string }[]) => [...new Set(es.map((e) => e.model))].join(", ");
  const lines: string[] = [];
  const img = of("image").filter((e) => e.provider !== "mock");
  const placeholders = of("image").filter((e) => e.provider === "mock");
  if (img.length) lines.push(`- ${img.length} picture${img.length > 1 ? "s" : ""} generated with OpenAI ${models(img)}, in the house illustration style (\`project/assets/images/\`)`);
  if (placeholders.length) lines.push(`- ${placeholders.length} PLACEHOLDER picture${placeholders.length > 1 ? "s" : ""} (IMAGE_MOCK=1): generate ${placeholders.length > 1 ? "them" : "it"} for real before publishing`);
  const voice = of("narration");
  if (voice.length) lines.push(`- Narration: ElevenLabs ${models(voice)}, voice \`${voice[0].voice}\` (${voice.length} line${voice.length > 1 ? "s" : ""})`);
  const sfx = of("sfx");
  if (sfx.length) lines.push(`- ${sfx.length} sound effect${sfx.length > 1 ? "s" : ""}: ElevenLabs ${models(sfx)}`);
  const music = of("music");
  if (music.length) lines.push(`- Music: ElevenLabs ${models(music)} ("${music.at(-1)!.prompt.slice(0, 120)}")`);
  return lines.join("\n");
}

/** The storyboard's frames (id = the composition file name), so a revision can name one: "02-answer — Answer (2s)". */
export function storyboardFrames(projectDir: string): { id: string; title: string; duration?: string }[] {
  const file = path.join(projectDir, "STORYBOARD.md");
  if (!fs.existsSync(file)) return [];
  const out: { id: string; title: string; duration?: string }[] = [];
  for (const part of fs.readFileSync(file, "utf8").split(/^#{2,3} (?:Frame|Beat|Scene)\s+/m).slice(1)) {
    const src = part.match(/^-\s+src:\s*(.+)$/m)?.[1]?.trim();
    if (!src) continue;
    const title = part.split("\n")[0].trim().replace(/^\d+\s*[—–:.-]?\s*/, "");
    out.push({ id: path.basename(src).replace(/\.html?$/i, ""), title, duration: part.match(/^-\s+duration:\s*(.+)$/m)?.[1]?.trim() });
  }
  return out;
}

/** Copy the render + contact sheet into the job folder and write post.md. Shared by the tool and the safety net. */
export function collectDelivery(ctx: ToolContext, d: { videoAbs: string; sheetAbs?: string | null; title: string; caption: string; altText: string; placeholders: string[]; notes?: string }): Delivery {
  const info = probeVideo(d.videoAbs);
  if (!info) throw new Error(`${path.relative(ctx.projectDir, d.videoAbs)} isn't a readable video`);
  const video = path.join(ctx.jobDir, "video.mp4");
  fs.copyFileSync(d.videoAbs, video);
  let contactSheet: string | null = null;
  if (d.sheetAbs && fs.existsSync(d.sheetAbs)) {
    contactSheet = path.join(ctx.jobDir, `contact-sheet${path.extname(d.sheetAbs).toLowerCase() || ".jpg"}`);
    fs.copyFileSync(d.sheetAbs, contactSheet);
  } else if (contactSheetFromVideo(video, path.join(ctx.jobDir, "contact-sheet.jpg"))) contactSheet = path.join(ctx.jobDir, "contact-sheet.jpg");
  const ph = d.placeholders.map((p) => p.trim()).filter(Boolean);
  const videoLines = [
    `- \`video.mp4\` · ${info.width}×${info.height} · ${info.durationSec.toFixed(1)} s`,
    contactSheet && `- \`${path.basename(contactSheet)}\` (contact sheet)`,
    ctx.cta && `- Call to action: ${ctx.cta.label} → ${ctx.cta.url}`,
  ].filter(Boolean);
  const frames = storyboardFrames(ctx.projectDir).map((f) => `- \`${f.id}\` ${f.title}${f.duration ? ` (${f.duration})` : ""}`);
  const media = mediaNote(ctx.media?.store);
  const post = [
    `# ${d.title.trim()}`,
    `## Caption\n\n${d.caption.trim()}`,
    `## Alt text\n\n${d.altText.trim()}`,
    `## Video\n\n${videoLines.join("\n")}`,
    frames.length && `## Frames\n\n${frames.join("\n")}`,
    `## Placeholders to fill\n\n${ph.length ? ph.map((p) => `- ${p}`).join("\n") : "None."}`,
    media && `## Generated media\n\n${media}`,
    d.notes?.trim() && `## Notes\n\n${d.notes.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  fs.writeFileSync(path.join(ctx.jobDir, "post.md"), post + "\n");
  const delivery: Delivery = { video, contactSheet, info, title: d.title.trim(), caption: d.caption.trim(), altText: d.altText.trim(), placeholders: ph, notes: d.notes };
  ctx.delivered = delivery;
  ctx.emit({ type: "video", path: "video.mp4", durationSec: info.durationSec });
  return delivery;
}

export interface StoryboardFrameInput {
  id: string;
  name: string;
  seconds: number;
  point: string;
  on_screen: string[];
  narration?: string;
  visual: string;
  motion: string;
}

export interface StoryboardInput {
  title: string;
  question: string;
  message: string;
  audience?: string;
  main_points: string[];
  look: string;
  frames: StoryboardFrameInput[];
  pictures?: { name: string; kind?: string; shows: string; treatment?: string }[];
  placeholders?: string[];
  questions?: string[];
}

const quote = (t: string) => `"${t.replace(/^["“]|["”]$/g, "")}"`;

/** storyboard.md: what the person reads to approve or change the plan. */
export function storyboardReview(ctx: ToolContext, sb: StoryboardInput, shot: SheetShot | null, version: number): string {
  const id = path.basename(ctx.jobDir);
  const seconds = sb.frames.reduce((a, f) => a + (Number(f.seconds) || 0), 0);
  const ph = (sb.placeholders ?? []).map((p) => p.trim()).filter(Boolean);
  const head = [
    `# ${sb.title.trim()} — storyboard v${version}`,
    "",
    `**The question:** ${sb.question.trim()}  `,
    `**The answer:** ${sb.message.trim()}  `,
    sb.audience?.trim() ? `**For:** ${sb.audience.trim()}  ` : "",
    `**Format:** ${[ctx.formatLine, `${sb.frames.length} frames`, `${seconds.toFixed(0)} s planned`].filter(Boolean).join(" · ")}  `,
    `**Look:** ${sb.look.trim()}`,
    "",
    "**Main points**",
    "",
    ...sb.main_points.map((p, i) => `${i + 1}. ${p.trim()}`),
    "",
    shot?.ok ? `![The storyboard sheet](${path.basename(shot.file!)})` : `_The sheet couldn't be photographed${shot?.error ? ` (${shot.error})` : ""}: open \`project/storyboard.html\` in a browser._`,
    "",
    ctx.storyboardImages
      ? "The sketch sheet itself: `project/storyboard.html` (open it in a browser). The pictures on the sheet are the generated ones (the build uses them as they are); narration and motion are made after approval."
      : "The sketch sheet itself: `project/storyboard.html` (open it in a browser). Pictures, narration and motion are made after approval; grey shapes on the sheet stand for pictures not made yet.",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  const frames = sb.frames.map((f) =>
    `### ${f.id} · ${f.name.trim()} — ${Number(f.seconds).toFixed(1)} s\n\n` +
    [
      `- **Point:** ${f.point.trim()}`,
      `- **On screen:** ${f.on_screen.length ? f.on_screen.map(quote).join(" · ") : "(no words)"}`,
      f.narration?.trim() ? `- **Narration:** ${quote(f.narration.trim())}` : "",
      `- **You see:** ${f.visual.trim()}`,
      `- **Motion:** ${f.motion.trim()}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const pictures = (sb.pictures ?? []).map((p) => `- \`${p.name}\`${[p.kind, p.treatment].filter(Boolean).length ? ` (${[p.kind, p.treatment].filter(Boolean).join(", ")})` : ""} — ${p.shows.trim()}`);
  return [
    head.join("\n"),
    `## Frames\n\n${frames.join("\n\n")}`,
    pictures.length && `## ${ctx.storyboardImages ? "Pictures (generated with the storyboard)" : "Pictures to make (after approval)"}\n\n${pictures.join("\n")}`,
    `## Placeholders to fill\n\n${ph.length ? ph.map((p) => `- ${p}`).join("\n") : "None."}`,
    sb.questions?.length && `## Questions for you\n\n${sb.questions.map((q) => `- ${q.trim()}`).join("\n")}`,
    `## Next\n\n- Approve and build the video: \`npm run video -- --approve ${id}\` (add a short note in quotes for last small changes)\n- Change the storyboard: \`npm run video -- --revise ${id} "frame 03: …"\``,
  ]
    .filter(Boolean)
    .join("\n\n") + "\n";
}

/**
 * Hand a storyboard to the person: photograph storyboard.html into the job folder (storyboard.jpg), write
 * storyboard.md and record it on the context. Shared by the tool and the safety net.
 */
export async function presentStoryboard(ctx: ToolContext, sb: StoryboardInput, opts: { htmlRel?: string } = {}): Promise<{ presented: StoryboardPresented; shot: SheetShot | null }> {
  const version = ctx.storyboardVersion ?? 1;
  const htmlRel = opts.htmlRel ?? "storyboard.html";
  const htmlAbs = path.resolve(ctx.projectDir, htmlRel);
  const warnings: string[] = [];
  let shot: SheetShot | null = null;
  if (fs.existsSync(htmlAbs)) {
    shot = await renderSheet(htmlAbs, path.join(ctx.jobDir, "storyboard.jpg"));
    if (!shot.ok) warnings.push(`The sheet couldn't be photographed: ${shot.error}`);
    else if (!shot.cells) warnings.push(`No cells with id="frame-NN" on the sheet`);
    else if (shot.cells < sb.frames.length) warnings.push(`The sheet has ${shot.cells} cells for ${sb.frames.length} frames`);
    if (shot.cut) warnings.push("The sheet is taller than 14000 px; the image is cut");
  } else warnings.push(`${htmlRel} doesn't exist`);
  if (!shot?.ok) fs.rmSync(path.join(ctx.jobDir, "storyboard.jpg"), { force: true });
  fs.writeFileSync(path.join(ctx.jobDir, "storyboard.md"), storyboardReview(ctx, sb, shot, version));
  const presented: StoryboardPresented = {
    version,
    review: "storyboard.md",
    sheet: shot?.ok ? "storyboard.jpg" : undefined,
    html: fs.existsSync(htmlAbs) ? path.relative(ctx.jobDir, htmlAbs).split(path.sep).join("/") : undefined,
    frames: sb.frames.length,
    seconds: sb.frames.reduce((a, f) => a + (Number(f.seconds) || 0), 0),
    cells: shot?.cells,
    warnings,
  };
  ctx.storyboard = presented;
  ctx.emit({ type: "storyboard", version, review: presented.review, sheet: presented.sheet });
  return { presented, shot };
}

/** STORYBOARD.md → a minimal storyboard, for the safety net when the agent stopped before presenting. */
export function storyboardFromProject(projectDir: string, title: string): StoryboardInput | null {
  const file = path.join(projectDir, "STORYBOARD.md");
  if (!fs.existsSync(file)) return null;
  const md = fs.readFileSync(file, "utf8");
  const front = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const fm = (k: string) => front.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  const field = (block: string, k: string) => block.match(new RegExp(`^-\\s+${k}:\\s*(.+)$`, "m"))?.[1]?.trim();
  const prose = (block: string, k: string) => block.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim();
  const frames = md
    .split(/^#{2,3} (?:Frame|Beat|Scene)\s+/m)
    .slice(1)
    .map((block, i) => {
      const head = block.split("\n")[0].trim();
      const src = field(block, "src");
      const vo = field(block, "voiceover")?.replace(/^["“]|["”]$/g, "");
      return {
        id: src ? path.basename(src).replace(/\.html?$/i, "") : String(i + 1).padStart(2, "0"),
        name: head.replace(/^\d+\s*[—–:.-]?\s*/, "") || `Frame ${i + 1}`,
        seconds: parseFloat(field(block, "duration") ?? "0") || 0,
        point: prose(block, "keyMessage") ?? prose(block, "narrativeRole") ?? field(block, "scene") ?? "",
        on_screen: [],
        narration: vo || undefined,
        visual: field(block, "scene") ?? "",
        motion: field(block, "transition_in") ? `seam in: ${field(block, "transition_in")}` : "",
      };
    });
  if (!frames.length) return null;
  return {
    title,
    question: "(not written: the agent stopped before presenting)",
    message: fm("message") ?? "(see STORYBOARD.md)",
    audience: fm("audience"),
    main_points: [],
    look: "(see project/frame.md and STORYBOARD.md → Video direction)",
    frames,
  };
}

/** The image tool's reply: one line per picture, then a preview of each new or reused one. */
function imagesReply(results: (ImageResult | Error)[], names: string[], remaining: number) {
  const lines = results.map((r, i) =>
    r instanceof Error
      ? `- ${names[i]}: FAILED — ${r.message}`
      : `- \`${r.file}\` · ${r.width}×${r.height} · ${r.transparent ? "transparent cut-out" : "opaque"} · ${r.cached ? "reused (same request as before, no cost)" : "new"}${r.mock ? " · placeholder (IMAGE_MOCK=1)" : ""}`,
  );
  const ok = results.filter((r): r is ImageResult => !(r instanceof Error));
  const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [
    {
      type: "text",
      text: `${lines.join("\n")}\n\n${ok.length ? `Place them with <img src="…" width height> at these sizes (or scaled, same ratio). ${remaining} new picture(s) left this run.` : ""} Previews follow (on grey, so a transparent ground shows):`,
    },
  ];
  for (const r of ok) {
    if (!r.preview) continue;
    content.push({ type: "text", text: r.file });
    content.push({ type: "image", data: r.preview.toString("base64"), mimeType: "image/png" });
  }
  return { content, isError: ok.length === 0 };
}

/** The present_storyboard tool (the storyboard phase's only tool of ours). */
function presentTool(ctx: ToolContext) {
  return tool(
    "present_storyboard",
    `Hand the storyboard to the person for review — call it once STORYBOARD.md (and SCRIPT.md with narration) and the sketch sheet storyboard.html are written. It photographs the sheet into the job folder, writes storyboard.md (the review document) from what you pass, shows you the photographed sheet, and ends this phase: nothing is built before the person approves. Calling it again in this run replaces this version (fix the sheet, then present again).`,
    {
      title: z.string().min(2).describe("The video's working title"),
      question: z.string().min(4).describe("The one question the video answers, as the viewer would ask it"),
      message: z.string().min(4).describe("The answer in one sentence a newcomer understands (BRIEF.md's message)"),
      audience: z.string().optional(),
      main_points: z.array(z.string().min(2)).min(1).max(5).describe("The main points (≤ 3 for most videos), one plain sentence each, in order"),
      look: z.string().min(4).describe("The style and look and why they fit the brand, one or two sentences (e.g. 'Editorial · paper-data: the brand keeps orange for small accents…')"),
      frames: z
        .array(
          z.object({
            id: z.string().describe("The frame id = its composition file name, e.g. 01-hook"),
            name: z.string(),
            seconds: z.number().min(0.5).max(60),
            point: z.string().describe("What the viewer understands after this frame, one plain sentence"),
            on_screen: z.array(z.string()).describe("Every word on screen, verbatim, one entry per line or label"),
            narration: z.string().optional().describe("The narration line (with --voice), verbatim"),
            visual: z.string().describe("What you see: the picture, the field, the type, the callout"),
            motion: z.string().describe("How it moves, one sentence: entrances, camera, the effect that guides the eye, the seam"),
          }),
        )
        .min(1)
        .max(40),
      pictures: z.array(z.object({ name: z.string(), kind: z.string().optional(), shows: z.string(), treatment: z.string().optional() })).optional().describe("The pictures: to generate after approval, or (with generate_images in this run) the ones made for the sheet"),
      placeholders: z.array(z.string()).optional().describe("Facts the brief didn't give, shown as [X] on screen, e.g. '[X] hours — frame 02'"),
      questions: z.array(z.string()).optional().describe("Choices the person may want to change: the analogy, the look, the length, a fact to confirm"),
      sheet: z.string().optional().describe("The sketch sheet, project-relative (default storyboard.html)"),
    },
    async (a) => {
      if (ctx.phase !== "storyboard") return text("This run builds the video; the storyboard was already approved.", true);
      if (!fs.existsSync(path.join(ctx.projectDir, "STORYBOARD.md"))) return text("Write STORYBOARD.md first (the workflow's Step 3), then the sketch sheet, then present.", true);
      const htmlRel = a.sheet ?? "storyboard.html";
      if (!isInside(path.resolve(ctx.projectDir, htmlRel), ctx.projectDir)) return text(`${htmlRel} is outside the project.`, true);
      if (!fs.existsSync(path.resolve(ctx.projectDir, htmlRel)))
        return text(`${htmlRel} doesn't exist yet. Draw the sketch sheet first (hyperframes:clear-explainer → references/storyboard-sheet.md), then present.`, true);
      try {
        const { presented, shot } = await presentStoryboard(ctx, a, { htmlRel });
        ctx.emit({ type: "status", message: `Storyboard v${presented.version}: ${presented.frames} frames, ${presented.seconds.toFixed(0)} s${presented.sheet ? ", sheet photographed" : ""}` });
        const lines = [
          `Presented storyboard v${presented.version}: storyboard.md${presented.sheet ? " and storyboard.jpg (the sheet, shown below)" : ""} are in the job folder for the person.`,
          ...presented.warnings.map((w) => `WARNING: ${w}`),
          "Look at the sheet: if a cell is broken (text overflowing, a missing font, an empty or missing cell, a frame in the wrong order), fix storyboard.html and call present_storyboard again. Otherwise end your turn now with one short line — the person reviews it and answers in a later message (changes, or approval to build).",
        ];
        const content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] = [{ type: "text", text: lines.join("\n") }];
        if (shot?.ok && shot.file) content.push({ type: "image", data: fs.readFileSync(shot.file).toString("base64"), mimeType: "image/jpeg" });
        return { content, isError: false };
      } catch (e) {
        return text(`Presenting failed: ${(e as Error).message}`, true);
      }
    },
  );
}

/** generate_images, when the job has an image provider (none otherwise). */
function imageTools(ctx: ToolContext) {
  const media = ctx.media;
  if (!media?.images) return [];
  const status = (message: string) => ctx.emit({ type: "status", message });
  const { settings, style } = media.images;
  return [
    tool(
      "generate_images",
      `Generate pictures for the motion layers with ${settings.mock ? "placeholders (IMAGE_MOCK=1, no cost)" : `OpenAI ${settings.model}`}, in this product's illustration style (${style.references.length ? `${style.references.length} reference illustration${style.references.length > 1 ? "s" : ""} and ` : ""}a style description go with every request: describe only the subject). Saves PNGs to assets/images/<name>.png and shows you a preview of each. Up to 8 per call, generated in parallel; at most ${settings.max} new pictures per run; an identical request reuses the earlier file for free.`,
      {
        images: z
          .array(
            z.object({
              name: z.string().min(1).max(60).describe("File stem: 'ana' → assets/images/ana.png. The same name again replaces that picture"),
              prompt: z.string().min(8).max(4000).describe("What to show: the subject, pose, angle, framing and props. The house style is added for you. Never ask for words, numbers, labels or logos"),
              kind: z
                .enum(IMAGE_KINDS)
                .describe("cutout: one subject on a transparent ground, for anything that moves · ui: an interface element (window, card, button, dial, inbox, chat bubble…) drawn in the house style, transparent, text areas blank · illustration: a small complete picture on paper white · scene: a full-bleed background"),
              aspect: z.string().optional().describe("square | portrait | landscape | wide (16:9) | tall (9:16) | frame (this video's canvas) | WIDTHxHEIGHT in multiples of 16. Default: square for cutout and illustration, landscape for ui, frame for scene"),
              refs: z.array(z.string()).max(8).optional().describe("Project-relative pictures to keep identical, e.g. ['assets/images/ana.png'] in every later picture of Ana"),
              transparent: z.boolean().optional().describe("Override the kind's background (scene is always opaque)"),
            }),
          )
          .min(1)
          .max(8),
      },
      async (a) => {
        try {
          const results = await generateImages(a.images, { projectDir: ctx.projectDir, canvas: { width: ctx.width, height: ctx.height }, style, settings, store: media.store });
          const made = results.filter((r) => !(r instanceof Error) && !r.cached).length;
          const reused = results.filter((r) => !(r instanceof Error) && r.cached).length;
          const failed = results.filter((r) => r instanceof Error).length;
          status(`Images: ${made} new${reused ? `, ${reused} reused` : ""}${failed ? `, ${failed} failed` : ""}`);
          const left = Math.max(0, settings.max - madeThisRun(media.store, "image"));
          return imagesReply(results, a.images.map((i) => i.name), left);
        } catch (e) {
          return text(`Image generation failed: ${(e as Error).message}`, true);
        }
      },
    ),
  ];
}

/** The tools this job offers: present_storyboard while the storyboard is made (plus generate_images with --storyboard-images); deliver plus the media tools its keys and options allow while the video is built. */
export function explainerTools(ctx: ToolContext) {
  if (ctx.phase === "storyboard") return [presentTool(ctx), ...(ctx.storyboardImages ? imageTools(ctx) : [])];
  const inProject = (p: string) => path.resolve(ctx.projectDir, p);
  const media = ctx.media;
  const status = (message: string) => ctx.emit({ type: "status", message });
  const extra = [];
  extra.push(...imageTools(ctx));

  const sound = media?.sound;
  if (media && sound?.narration) {
    extra.push(
      tool(
        "generate_narration",
        `Voice the narration with ElevenLabs (${sound.settings.ttsModel}): one clip per SCRIPT.md frame, with exact word timings, saved as assets/voice/NN.wav and written into audio_meta.json (voices) for sync-durations, captions and assembly. This replaces the workflow's own audio generate command. Unchanged lines are reused for free.`,
        {
          voice_id: z.string().optional().describe(`ElevenLabs voice id (default for this job: ${sound.voiceId})`),
          lines: z.array(z.object({ frame: z.number().int().min(1), text: z.string().min(1).max(5000) })).max(40).optional().describe("Only to re-voice particular frames; default: every line of SCRIPT.md"),
          speed: z.number().min(0.7).max(1.2).optional().describe("Speaking rate (1 = the voice's normal pace)"),
        },
        async (a) => {
          try {
            const r = await generateNarration({ projectDir: ctx.projectDir, settings: sound.settings, store: media.store, voiceId: a.voice_id?.trim() || sound.voiceId, language: sound.language, speed: a.speed, lines: a.lines });
            const fresh = r.voices.filter((v) => !v.cached).length;
            status(`Narration: ${r.voices.length} line(s), ${r.totalSec.toFixed(1)} s (${fresh} new, ElevenLabs ${r.model})`);
            const rows = r.voices.map((v) => `- frame ${v.frame}: \`${v.path}\` ${v.duration_s.toFixed(2)} s, ${v.words.length} words${v.cached ? " (reused)" : ""}${v.timing === "estimated" ? " — timings ESTIMATED (no alignment returned)" : ""}`);
            const errs = r.errors.map((e) => `- frame ${e.frame}: FAILED — ${e.error}`);
            return text(
              `Narration with voice \`${r.voiceId}\` (${r.model}): ${r.voices.length} clip(s), ${r.totalSec.toFixed(1)} s in all.\n${[...rows, ...errs].join("\n")}\n\naudio_meta.json holds the voices and their word timings. Next, as the workflow says: \`node "<faceless-explainer>/scripts/audio.mjs" sync-durations --audio-meta ./audio_meta.json --storyboard ./STORYBOARD.md\`, then captions and assembly. Don't run the audio generate command.`,
              r.voices.length === 0,
            );
          } catch (e) {
            return text(`Narration failed: ${(e as Error).message}`, true);
          }
        },
      ),
      tool(
        "find_voices",
        "Search the ElevenLabs voice library (the account's voices and ElevenLabs' defaults) when the brief asks for a kind of voice. Returns ids for generate_narration.",
        {
          search: z.string().max(120).optional().describe("Words to match in name, description and labels, e.g. 'calm narrator'"),
          gender: z.string().max(20).optional(),
          accent: z.string().max(40).optional().describe("e.g. british, american"),
          language: z.string().max(10).optional().describe("ISO 639-1, e.g. en, ro"),
          limit: z.number().int().min(1).max(30).optional(),
        },
        async (a) => {
          try {
            const voices = await findVoices(sound.settings, a);
            if (!voices.length) return text("No voices match; try fewer words.");
            return text(voices.map((v) => `- \`${v.id}\` ${v.name}${v.category ? ` (${v.category})` : ""}${Object.keys(v.labels).length ? ` · ${Object.values(v.labels).join(", ")}` : ""}${v.description ? ` — ${v.description}` : ""}`).join("\n"));
          } catch (e) {
            return text(`Voice search failed: ${(e as Error).message}`, true);
          }
        },
      ),
    );
  }
  if (media && sound?.sfx) {
    extra.push(
      tool(
        "generate_sfx",
        `Make sound effects with ElevenLabs (${sound.settings.sfxModel}) and place them: each sound is saved as assets/sfx/<name>.mp3 and, with \`at\`, listed in audio_meta.json as host sound effects at a frame's start + offset, which assembly places. One file can play at many places; an identical request reuses the earlier file for free. Up to 12 per call.`,
        {
          sounds: z
            .array(
              z.object({
                name: z.string().min(1).max(60).describe("File stem: 'paper-slap' → assets/sfx/paper-slap.mp3"),
                prompt: z.string().min(4).max(400).describe("The sound, physically and close up, e.g. 'a single sheet of paper slapped flat onto a wooden desk, dry, close'"),
                duration_s: z.number().min(0.5).max(30).optional().describe("Length; leave it out for short hits"),
                loop: z.boolean().optional().describe("A seamless loop (room tone, machine hum)"),
                at: z
                  .array(z.object({ frame: z.number().int().min(1), offset_s: z.number().min(0).optional(), volume: z.number().min(0).max(1).optional() }))
                  .max(40)
                  .optional()
                  .describe("Where it plays: frame number (as in STORYBOARD.md), seconds from that frame's start, volume 0–1 (default 0.35). Given = this sound's complete list of placements"),
              }),
            )
            .min(1)
            .max(12),
        },
        async (a) => {
          try {
            const results = await generateSfx({ projectDir: ctx.projectDir, settings: sound.settings, store: media.store, sounds: a.sounds });
            const ok = results.filter((r): r is SfxResult => !(r instanceof Error));
            status(`Sound effects: ${ok.filter((r) => !r.cached).length} new, ${ok.reduce((n, r) => n + r.placed, 0)} placed`);
            const rows = results.map((r, i) => (r instanceof Error ? `- ${a.sounds[i].name}: FAILED — ${r.message}` : `- \`${r.file}\` ${r.duration_s.toFixed(2)} s${r.cached ? " (reused)" : ""} · placed ${r.placed}×`));
            return text(`${rows.join("\n")}\n\nPlacements are host entries in audio_meta.json; the workflow's audio passes keep them and assemble-index places them. Leave \`sfx:\` cues out of STORYBOARD.md.`, ok.length === 0);
          } catch (e) {
            return text(`Sound effects failed: ${(e as Error).message}`, true);
          }
        },
      ),
    );
  }
  if (media && sound?.music) {
    extra.push(
      tool(
        "generate_music",
        `Compose a music bed with ElevenLabs (${sound.settings.musicModel}) for the whole video: saved as assets/music/<name>.mp3 and registered in audio_meta.json as the host's music (keep \`music: none\` in STORYBOARD.md). Make it once the video's length is known; an identical request reuses the earlier file for free.`,
        {
          prompt: z.string().min(8).max(2000).describe("Genre, instruments, tempo, mood and arc, e.g. 'dry, minimal upright piano and brushed snare, 92 bpm, curious then confident, no vocals'"),
          duration_s: z.number().min(3).max(600).describe("The video's length in seconds (a little longer is fine)"),
          name: z.string().max(60).optional().describe("File stem (default: bed)"),
          volume: z.number().min(0).max(1).optional().describe("Bed volume; default: 0.12 under narration, 0.9 without"),
          instrumental: z.boolean().optional().describe("Default true"),
        },
        async (a) => {
          try {
            const r = await generateMusic({ projectDir: ctx.projectDir, settings: sound.settings, store: media.store, prompt: a.prompt, durationSec: a.duration_s, name: a.name, volume: a.volume, instrumental: a.instrumental });
            status(`Music: ${r.file}, ${r.duration_s.toFixed(1)} s${r.cached ? " (reused)" : ""}`);
            return text(`\`${r.file}\` ${r.duration_s.toFixed(1)} s${r.cached ? " (reused)" : ""}, registered as the music bed in audio_meta.json (assembly loops it if the video runs longer).`);
          } catch (e) {
            return text(`Music failed: ${(e as Error).message}`, true);
          }
        },
      ),
    );
  }

  return [
    ...extra,
    tool(
      "deliver",
      "Hand the finished video to the person. Call once, after the final render: it copies the MP4 and the contact sheet into the job folder and writes post.md with the caption, alt text and the placeholders left on screen. Paths are relative to the project root.",
      {
        video: z.string().describe("The rendered MP4, e.g. renders/video.mp4"),
        contact_sheet: z.string().optional().describe("The contact sheet from `hyperframes snapshot`, e.g. snapshots/contact-sheet.jpg"),
        title: z.string().min(2).describe("Short title of the video"),
        caption: z.string().min(10).describe("LinkedIn-ready post text in the product's voice: hook line, 2–4 short lines, the call to action"),
        alt_text: z.string().min(10).describe("What the video shows, for screen readers (1–3 sentences)"),
        placeholders: z.array(z.string()).describe("Every placeholder left on screen, e.g. '[X] hours saved — frame 3'; empty when there are none"),
        notes: z.string().optional().describe("Anything the person should know: decisions, open questions, render warnings"),
      },
      async (a) => {
        const videoAbs = inProject(a.video);
        if (!isInside(videoAbs, ctx.projectDir)) return text(`${a.video} is outside the project.`, true);
        if (!fs.existsSync(videoAbs)) return text(`${a.video} doesn't exist yet. Render first: hyperframes render --output renders/video.mp4`, true);
        if (!/\.(mp4|mov|webm)$/i.test(videoAbs)) return text("video must be an .mp4 (or .mov/.webm) render", true);
        const sheetAbs = a.contact_sheet ? inProject(a.contact_sheet) : null;
        if (sheetAbs && !isInside(sheetAbs, ctx.projectDir)) return text(`${a.contact_sheet} is outside the project.`, true);
        try {
          const d = collectDelivery(ctx, { videoAbs, sheetAbs, title: a.title, caption: a.caption, altText: a.alt_text, placeholders: a.placeholders, notes: a.notes });
          const warn = d.info.width !== ctx.width || d.info.height !== ctx.height ? `\nWARNING: the render is ${d.info.width}×${d.info.height}, not the ${ctx.width}×${ctx.height} this job asked for.` : "";
          return text(
            `Delivered video.mp4 (${d.info.width}×${d.info.height}, ${d.info.durationSec.toFixed(1)} s)${d.contactSheet ? ` with ${path.basename(d.contactSheet)}` : ""} and post.md${d.placeholders.length ? ` · ${d.placeholders.length} placeholder(s) listed` : ""}.${warn} The job is done; reply with one short summary line.`,
          );
        } catch (e) {
          return text(`Delivery failed: ${(e as Error).message}`, true);
        }
      },
    ),
  ];
}

export function createExplainerServer(ctx: ToolContext) {
  return createSdkMcpServer({ name: "explainer", version: VERSION, tools: explainerTools(ctx) });
}

/** Every tool this server can offer; a run registers the ones its phase, keys and options allow. */
export const TOOL_NAMES: string[] = [TOOL.present, TOOL.deliver, TOOL.images, TOOL.narration, TOOL.voices, TOOL.sfx, TOOL.music];
