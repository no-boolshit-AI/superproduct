import type { FormatId, Look, Quality, Style, Workflow } from "./config.js";
import type { MediaEntry } from "./media/common.js";

export type JobEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string; worker?: boolean }
  | { type: "tool"; name: string; summary: string; worker?: boolean }
  /** A workflow milestone, derived from the files and commands the agent produces. */
  | { type: "step"; step: StepId; label: string }
  | { type: "denied"; tool: string; reason: string }
  | { type: "video"; path: string; durationSec?: number }
  /** A storyboard was presented for review (files relative to the job folder). */
  | { type: "storyboard"; version: number; review: string; sheet?: string }
  | { type: "cost"; usd: number; turns: number }
  | { type: "done"; job: JobRecord }
  | { type: "error"; message: string };

export type Emit = (e: JobEvent) => void;

export type StepId = "setup" | "brief" | "design" | "storyboard" | "review" | "approved" | "images" | "audio" | "frames" | "assemble" | "checks" | "snapshot" | "render" | "deliver";

export const STEPS: { id: StepId; label: string }[] = [
  { id: "setup", label: "Project set up" },
  { id: "brief", label: "Brief locked" },
  { id: "design", label: "Design system" },
  { id: "storyboard", label: "Storyboard" },
  { id: "review", label: "Storyboard ready" },
  { id: "approved", label: "Approved" },
  { id: "images", label: "Images" },
  { id: "audio", label: "Audio" },
  { id: "frames", label: "Frames" },
  { id: "assemble", label: "Assembled" },
  { id: "checks", label: "Checks" },
  { id: "snapshot", label: "Contact sheet" },
  { id: "render", label: "Render" },
  { id: "deliver", label: "Delivered" },
];

export interface JobOptions {
  brief: string;
  format: FormatId;
  /** Target length in seconds (advisory; the narration decides when there is one). */
  lengthSec?: number;
  /** Narration: ElevenLabs when ELEVENLABS_API_KEY is set, else HyperFrames' TTS chain (HeyGen → local Kokoro). Off by default. */
  voice?: boolean;
  voiceId?: string;
  /** Absolute path of a music file to lay under the video. */
  music?: string;
  /** A music bed composed for the video with ElevenLabs: "auto" (mood from the story) or a mood/style prompt. */
  musicPrompt?: string;
  /** Sound effects: made for the video with ElevenLabs when its key is set, else HyperFrames' bundled library. */
  sfx?: boolean;
  /** Generated pictures (OpenAI, in the product's illustration style) when OPENAI_API_KEY is set; false turns them off. */
  images?: boolean;
  language?: string;
  audience?: string;
  workflow?: Workflow;
  /** Visual style: "editorial" (cinematic cut-outs on brand colour), "vox-collage" (paper cut-outs on twos) or "default" (the workflow picks a HyperFrames preset). */
  style?: Style;
  /** The editorial style's look; "auto" (or absent): the agent picks it from the brand. */
  look?: Look;
  /** Review a storyboard before anything is built (default true): the run stops at the storyboard; --approve builds it. */
  storyboard?: boolean;
  /** Website for product-launch-video. */
  url?: string;
  quality?: Quality;
  model?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  /** Product folder for brand, voice and facts: a path, the id of one in workspace/products, or "none". Default: PRODUCT_DIR, then the workspace's product/. */
  product?: string;
  /** absolute paths of user files (images, video clips, text) */
  inputs?: string[];
}

/** The storyboard presented for review (files relative to the job folder). */
export interface StoryboardRecord {
  version: number;
  /** storyboard.md: the review document */
  review: string;
  /** storyboard.jpg: the sketch sheet as an image (absent when it couldn't be photographed) */
  sheet?: string;
  /** project/storyboard.html: the sketch sheet itself */
  html?: string;
  frames: number;
  seconds?: number;
  presentedAt: string;
  approvedAt?: string;
  /** what the person added when approving */
  approvalNotes?: string;
}

export interface JobRecord {
  id: string;
  dir: string;
  brief: string;
  options: Omit<JobOptions, "brief" | "inputs">;
  /** "storyboard": the storyboard waits for the person's approval (or changes) */
  status: "running" | "storyboard" | "done" | "error" | "cancelled";
  /** what the last run worked on: the storyboard, or the video */
  phase?: "storyboard" | "video";
  storyboard?: StoryboardRecord;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  costUsd?: number;
  title?: string;
  workflow?: Workflow;
  width?: number;
  height?: number;
  /** files relative to the job folder */
  video?: string;
  contactSheet?: string;
  post?: string;
  durationSec?: number;
  frames?: number;
  placeholders?: string[];
  steps?: StepId[];
  summary?: string;
  error?: string;
  warnings?: string[];
  revisions: { at: string; instructions: string; kind?: "storyboard" | "video" }[];
  /** The product folder the job used (brand, voice, facts), if any. */
  product?: { dir: string; name: string } | null;
  /** Where the brand came from: "product folder: <name>" or "none (HyperFrames preset palette)". */
  brand?: string;
  hyperframes?: { cli: string | null; skills: string | null };
  voice?: { provider: string | null };
  /** Everything generated for the video (pictures, narration, sound effects, music), with model and prompt. */
  media?: MediaEntry[];
}
