import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outputDir } from "../../../lib/workspace.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Where jobs go: $OUTPUT_DIR, else the workspace's out/explainer (see lib/workspace.mjs). */
export const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || outputDir("explainer"));
/** The HyperFrames Claude Code plugin (all published HyperFrames skills), pinned to the CLI version in package.json. */
export const PLUGIN_DIR = path.join(ROOT, "vendor", "hyperframes");
export const NODE_BIN = path.join(ROOT, "node_modules", ".bin");
export const HF_BIN = path.join(NODE_BIN, process.platform === "win32" ? "hyperframes.cmd" : "hyperframes");
export const GSAP_DIR = path.join(ROOT, "node_modules", "gsap");
export const VERSION = "0.1.0";

/** Canvas formats. The HyperFrames storyboard takes any WxH; these are the four social/web shapes. */
export type FormatId = "portrait" | "vertical" | "square" | "landscape";
export interface FormatSpec {
  id: FormatId;
  label: string;
  width: number;
  height: number;
  ratio: string;
  /** brief-contract destination word written into BRIEF.md */
  destination: string;
}
export const FORMATS: Record<FormatId, FormatSpec> = {
  portrait: { id: "portrait", label: "4:5 portrait · LinkedIn / Instagram feed", width: 1080, height: 1350, ratio: "4:5", destination: "linkedin-feed" },
  vertical: { id: "vertical", label: "9:16 vertical · Reels, Shorts, TikTok", width: 1080, height: 1920, ratio: "9:16", destination: "reels" },
  square: { id: "square", label: "1:1 square · feeds", width: 1080, height: 1080, ratio: "1:1", destination: "x-feed" },
  landscape: { id: "landscape", label: "16:9 landscape · YouTube, website, slides", width: 1920, height: 1080, ratio: "16:9", destination: "youtube" },
};
export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];
export const isFormat = (s: unknown): s is FormatId => typeof s === "string" && s in FORMATS;

/** HyperFrames workflows this agent drives. faceless-explainer is the default; the others are for special cases. */
export const WORKFLOWS = ["faceless-explainer", "general-video", "motion-graphics", "product-launch-video"] as const;
export type Workflow = (typeof WORKFLOWS)[number];
export const isWorkflow = (s: unknown): s is Workflow => typeof s === "string" && (WORKFLOWS as readonly string[]).includes(s);

/**
 * Visual styles on top of a workflow. "default" lets the workflow pick a frame preset; the others fix the look:
 * the preset, the skill that carries the method, the kit staged into the project and the render frame rate.
 */
export const STYLES = ["default", "vox-collage"] as const;
export type Style = (typeof STYLES)[number];
export const isStyle = (s: unknown): s is Style => typeof s === "string" && (STYLES as readonly string[]).includes(s);
export interface StyleSpec {
  id: Style;
  label: string;
  /** frame preset (hyperframes-creative/frame-presets/<preset>) written into BRIEF.md as style_preset */
  preset?: string;
  /** the skill that carries the style's method, loaded as hyperframes:<skill> */
  skill?: string;
  /** skill assets copied into the project: [skill-relative folder, project-relative folder] */
  kit?: [string, string];
  /** render frame rate the style is animated for */
  fps?: number;
}
export const STYLE_SPECS: Record<Style, StyleSpec> = {
  default: { id: "default", label: "Default · the workflow picks a preset" },
  "vox-collage": { id: "vox-collage", label: "Vox collage · paper cut-outs, stop-motion, marker", preset: "vox-collage", skill: "vox-collage", kit: ["assets", "assets/collage"], fps: 24 },
};
export const styleSpec = (s: unknown): StyleSpec => STYLE_SPECS[isStyle(s) ? s : "default"];
export const DEFAULT_STYLE: Style = isStyle(process.env.DEFAULT_STYLE) ? process.env.DEFAULT_STYLE : "default";

/** Render quality → `hyperframes render --quality` value. */
export const QUALITIES = { draft: "draft", standard: "looks", high: "delivery" } as const;
export type Quality = keyof typeof QUALITIES;
export const isQuality = (s: unknown): s is Quality => typeof s === "string" && s in QUALITIES;

export const DEFAULT_FORMAT: FormatId = isFormat(process.env.DEFAULT_FORMAT) ? process.env.DEFAULT_FORMAT : "portrait";
export const DEFAULT_LENGTH_SEC = Number(process.env.DEFAULT_LENGTH_SEC || 45);

export function slugify(s: string, max = 48): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "explainer"
  );
}

export const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** Version of the installed HyperFrames CLI (node_modules/hyperframes). */
export function cliVersion(): string | null {
  return (readJson(path.join(ROOT, "node_modules", "hyperframes", "package.json"))?.version as string) ?? null;
}

export interface PluginInfo {
  dir: string;
  version: string | null;
  /** skill folder names that have a SKILL.md, e.g. faceless-explainer */
  skills: string[];
}

/** The vendored HyperFrames plugin: its version and the skills it ships. */
export function pluginInfo(dir = PLUGIN_DIR): PluginInfo {
  const manifest = readJson(path.join(dir, ".claude-plugin", "plugin.json")) ?? readJson(path.join(dir, "plugin.json"));
  const skillsDir = path.join(dir, "skills");
  const skills = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir).filter((n) => fs.existsSync(path.join(skillsDir, n, "SKILL.md"))).sort()
    : [];
  return { dir, version: (manifest?.version as string) ?? null, skills };
}

/** Skills the explainer workflows cannot run without (the router, the domain skills and the workflows we route to). */
export const REQUIRED_SKILLS = [
  "hyperframes",
  "hyperframes-core",
  "hyperframes-cli",
  "hyperframes-animation",
  "hyperframes-keyframes",
  "hyperframes-creative",
  "hyperframes-audio",
  "hyperframes-registry",
  "media-use",
  "embedded-captions",
  "faceless-explainer",
  "general-video",
  "motion-graphics",
  "product-launch-video",
  // explainer-agent's own additions (extensions/hyperframes), laid over the plugin by applyExtensions()
  "vox-collage",
];
/** Required skills that come from extensions/hyperframes rather than the HyperFrames release. */
export const EXTENSION_SKILLS = ["vox-collage"];

/** Problems with the bundled skills: missing plugin, missing skills, or a plugin/CLI version mismatch. */
export function skillProblems(info = pluginInfo(), cli = cliVersion()): string[] {
  const problems: string[] = [];
  if (!info.version) return [`HyperFrames plugin not found in ${path.relative(ROOT, info.dir)} (run npm run skills:update)`];
  const missing = REQUIRED_SKILLS.filter((s) => !info.skills.includes(s));
  const upstream = missing.filter((s) => !EXTENSION_SKILLS.includes(s));
  const ours = missing.filter((s) => EXTENSION_SKILLS.includes(s));
  if (upstream.length) problems.push(`missing HyperFrames skills: ${upstream.join(", ")} (run npm run skills:update)`);
  if (ours.length) problems.push(`missing explainer-agent skills: ${ours.join(", ")} (run npm run setup)`);
  if (cli && cli !== info.version) problems.push(`HyperFrames skills are ${info.version} but the CLI is ${cli}; run npm run skills:update -- ${cli}`);
  return problems;
}
