/**
 * The per-job HyperFrames project: scaffolded with `hyperframes init`, then filled with what the workflow's Steps 0–1
 * expect before the agent starts — the source text (capture/extracted/visible-text.txt), the brand as a capture would
 * leave it (capture/extracted/tokens.json, page.html fonts, capture/assets/fonts/), the user's media under public/, a
 * music bed under assets/music/, the logos under assets/brand/ and the font files under assets/fonts/. BRIEF.md is
 * left to the agent: it derives the message and angle.
 */
import fs from "node:fs";
import path from "node:path";
import { FORMATS, styleSpec, type Workflow } from "./config.js";
import type { JobOptions } from "./events.js";
import { stageStyleKit } from "./extensions.js";
import { initProject } from "./hyperframes.js";
import { brandSection, tokensJson, type BrandKit } from "./product.js";

export type StagedKind = "image" | "video" | "text" | "document" | "music" | "file";
export interface Staged {
  /** path relative to the project root */
  rel: string;
  kind: StagedKind;
  source: string;
}

export interface ProjectSetup {
  projectDir: string;
  title: string;
  staged: Staged[];
  /** project-relative logo paths that exist */
  logos: { light?: string; dark?: string; mark?: string };
  /** project-relative folder of the style's kit (vox-collage: assets/collage), when the style has one */
  kit?: string;
  /** the product's reference illustrations for generated pictures, copied to assets/style/ (project-relative) */
  styleRefs: string[];
}

const IMAGE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const VIDEO = /\.(mp4|mov|webm|m4v)$/i;
const AUDIO = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
const TEXT = /\.(md|markdown|txt|csv|tsv|json)$/i;

const safeName = (s: string) => path.basename(s).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+/, "") || "file";

/** First heading or first line of the brief, for the job title and tokens.json. */
export function briefTitle(brief: string): string {
  const lines = brief.split("\n").map((l) => l.trim()).filter(Boolean);
  const heading = lines.find((l) => /^#{1,3}\s/.test(l));
  return (heading ?? lines[0] ?? "Explainer").replace(/^#{1,3}\s+/, "").replace(/^(title|topic)\s*:\s*/i, "").slice(0, 90);
}

function briefDescription(brief: string): string {
  const para = brief
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#.*$/gm, "").trim())
    .find((p) => p.length > 40);
  return (para ?? brief).replace(/\s+/g, " ").slice(0, 280);
}

function copyInto(projectDir: string, rel: string, src: string): string {
  const dest = path.join(projectDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return rel.split(path.sep).join("/");
}

/** Logos into assets/brand/; font files into assets/fonts/captured-<name>, where the frames load them from. */
export function stageBrand(projectDir: string, kit: BrandKit): ProjectSetup["logos"] {
  const logos: ProjectSetup["logos"] = {};
  for (const [key, src] of Object.entries(kit.logos) as [keyof ProjectSetup["logos"], string | undefined][]) {
    if (!src || !fs.existsSync(src)) continue;
    const name = key === "light" ? "wordmark" : key === "dark" ? "wordmark-inverse" : "mark";
    logos[key] = copyInto(projectDir, path.join("assets", "brand", `${name}${path.extname(src).toLowerCase()}`), src);
  }
  for (const f of kit.fontFiles) if (fs.existsSync(f.abs)) copyInto(projectDir, path.join("assets", "fonts", `captured-${f.name}`), f.abs);
  return logos;
}

const CAPTURE_MARK = "explainer-agent: brand fonts";

/**
 * The brand the way HyperFrames' website capture leaves it, for build-frame.mjs (Step 2) and captions.mjs:
 * capture/extracted/tokens.json with the brand's colours and families, the font files in capture/assets/fonts/ and
 * their @font-face rules in capture/extracted/page.html. Merges into an existing (website) capture rather than
 * replacing it, so it is safe to run again right before build-frame.
 */
export function writeBrandCapture(projectDir: string, kit: BrandKit, fallback: { title: string; description: string }): void {
  const extracted = path.join(projectDir, "capture", "extracted");
  fs.mkdirSync(extracted, { recursive: true });
  const tokensFile = path.join(extracted, "tokens.json");
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(fs.readFileSync(tokensFile, "utf8"));
  } catch {}
  const brand = tokensJson(kit, String(existing.title || fallback.title), String(existing.description || fallback.description));
  const merged: Record<string, unknown> = { ...existing, title: brand.title, description: brand.description };
  if ((brand.colors as string[]).length) Object.assign(merged, { colors: brand.colors, colorStats: brand.colorStats });
  if ((brand.fonts as unknown[]).length) merged.fonts = brand.fonts;
  merged.colors ??= [];
  merged.fonts ??= [];
  fs.writeFileSync(tokensFile, JSON.stringify(merged, null, 2) + "\n");
  if (!kit.captureFontFaceCss) return;
  for (const f of kit.fontFiles) if (fs.existsSync(f.abs)) copyInto(projectDir, path.join("capture", "assets", "fonts", f.name), f.abs);
  const page = path.join(extracted, "page.html");
  const html = fs.existsSync(page) ? fs.readFileSync(page, "utf8") : "";
  if (html.includes(CAPTURE_MARK)) return;
  const style = `<style>/* ${CAPTURE_MARK} */\n${kit.captureFontFaceCss.trim()}\n</style>`;
  fs.writeFileSync(
    page,
    !html
      ? `<!doctype html>\n<html><head><meta charset="utf-8"><title>${kit.name}: brand fonts</title>\n${style}\n</head><body></body></html>\n`
      : html.includes("</head>")
        ? html.replace("</head>", `${style}\n</head>`)
        : `${html}\n${style}\n`,
  );
}

/**
 * The product's reference illustrations into assets/style/, so the job keeps the references it was made with (a
 * revision after the product changed still matches the first cut). Existing copies are kept.
 */
export function stageStyleRefs(projectDir: string, kit: BrandKit): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  for (const src of kit.illustration?.references ?? []) {
    let name = safeName(src);
    for (let n = 2; used.has(name); n++) name = name.replace(/(-\d+)?(\.[a-z0-9]+)$/, `-${n}$2`);
    used.add(name);
    const rel = path.join("assets", "style", name);
    out.push(fs.existsSync(path.join(projectDir, rel)) ? rel.split(path.sep).join("/") : copyInto(projectDir, rel, src));
  }
  return out;
}

/** Workflows whose Step 2 runs build-frame.mjs (frame.md from a preset, remixed onto capture/extracted/tokens.json). */
export const BUILD_FRAME_WORKFLOWS: readonly Workflow[] = ["faceless-explainer", "product-launch-video"];

/** Scaffold (or, for a revision, reuse) the job's HyperFrames project. */
export async function setupProject(jobDir: string, o: JobOptions, kit: BrandKit, workflow: Workflow): Promise<ProjectSetup> {
  const projectDir = path.join(jobDir, "project");
  const title = briefTitle(o.brief);
  if (fs.existsSync(path.join(projectDir, "hyperframes.json"))) {
    // revision: keep the project; stage only the new files (the music bed is already in place)
    const kitDir = stageStyleKit(projectDir, o.style) ?? undefined; // the kit as this agent version ships it
    return { projectDir, title, staged: stageInputs(projectDir, { ...o, music: undefined }), logos: existingLogos(projectDir), kit: kitDir, styleRefs: existingStyleRefs(projectDir, kit) };
  }
  await initProject(projectDir, workflow);
  const staged = stageInputs(projectDir, o);
  const logos = stageBrand(projectDir, kit);
  const kitDir = stageStyleKit(projectDir, o.style) ?? undefined;
  const styleRefs = stageStyleRefs(projectDir, kit);
  // product-launch-video captures the website into capture/ itself; the brand is merged in before build-frame runs
  if (!(workflow === "product-launch-video" && o.url)) {
    const extracted = path.join(projectDir, "capture", "extracted");
    fs.mkdirSync(extracted, { recursive: true });
    const texts = staged
      .filter((s) => s.kind === "text")
      .map((s) => `\n\n--- ${path.basename(s.rel)} ---\n\n${fs.readFileSync(path.join(projectDir, s.rel), "utf8").trim()}`);
    fs.writeFileSync(path.join(extracted, "visible-text.txt"), `${o.brief.trim()}${texts.join("")}\n`);
    writeBrandCapture(projectDir, kit, { title, description: briefDescription(o.brief) });
  }
  // general-video and motion-graphics have no build-frame: they read design.md as the brand truth
  if (!BUILD_FRAME_WORKFLOWS.includes(workflow) && kit.name !== "none")
    fs.writeFileSync(path.join(projectDir, "design.md"), `# Design\n\n${brandSection(kit, logos)}`);
  return { projectDir, title, staged, logos, kit: kitDir, styleRefs };
}

/** A revision keeps the references the job was made with; a job made before references existed gets the current ones. */
function existingStyleRefs(projectDir: string, kit: BrandKit): string[] {
  const dir = path.join(projectDir, "assets", "style");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort() : [];
  return files.length ? files.map((f) => `assets/style/${f}`) : stageStyleRefs(projectDir, kit);
}

function existingLogos(projectDir: string): ProjectSetup["logos"] {
  const dir = path.join(projectDir, "assets", "brand");
  const find = (name: string) => {
    if (!fs.existsSync(dir)) return undefined;
    const f = fs.readdirSync(dir).find((x) => x.startsWith(`${name}.`));
    return f ? `assets/brand/${f}` : undefined;
  };
  return { light: find("wordmark"), dark: find("wordmark-inverse"), mark: find("mark") };
}

/** User files → the places the workflow looks: media in public/, text in capture/inputs/, music in assets/music/. */
export function stageInputs(projectDir: string, o: JobOptions): Staged[] {
  const out: Staged[] = [];
  for (const src of o.inputs ?? []) {
    if (!fs.existsSync(src)) continue;
    const name = safeName(src);
    if (IMAGE.test(name)) out.push({ rel: copyInto(projectDir, path.join("public", name), src), kind: "image", source: src });
    else if (VIDEO.test(name)) out.push({ rel: copyInto(projectDir, path.join("public", name), src), kind: "video", source: src });
    else if (AUDIO.test(name)) out.push({ rel: copyInto(projectDir, path.join("assets", "music", name), src), kind: "music", source: src });
    else if (TEXT.test(name)) out.push({ rel: copyInto(projectDir, path.join("capture", "inputs", name), src), kind: "text", source: src });
    else if (/\.pdf$/i.test(name)) out.push({ rel: copyInto(projectDir, path.join("capture", "inputs", name), src), kind: "document", source: src });
    else out.push({ rel: copyInto(projectDir, path.join("capture", "inputs", name), src), kind: "file", source: src });
  }
  if (o.music && fs.existsSync(o.music) && !out.some((s) => s.source === o.music))
    out.push({ rel: copyInto(projectDir, path.join("assets", "music", safeName(o.music)), o.music), kind: "music", source: o.music });
  return out;
}

/** The BRIEF.md frontmatter values fixed by the job's options (the agent adds message, angle and the body). */
export function lockedBriefFields(o: JobOptions, workflow: Workflow, voiceId?: string): Record<string, string> {
  const f = FORMATS[o.format];
  const fields: Record<string, string> = {
    workflow,
    flow: "automation",
    storyboard: "no",
    destination: f.destination,
    aspect: `${f.width}x${f.height}`,
    language: o.language || "en",
    length: `${o.lengthSec ?? 45}s`,
    narration: o.voice ? "yes" : "no",
  };
  if (o.audience) fields.audience = o.audience;
  if (o.voice && voiceId) fields.voice = voiceId;
  // a style fixes the look: the workflow's Step 2 uses BRIEF.md's style_preset instead of choosing one
  const preset = styleSpec(o.style).preset;
  if (preset && BUILD_FRAME_WORKFLOWS.includes(workflow)) fields.style_preset = preset;
  return fields;
}
