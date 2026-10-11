import type { FormatId, Quality, Style, Workflow } from "./config.js";
import type { MediaEntry } from "./media/common.js";

export type JobEvent =
  | { type: "status"; message: string }
  | { type: "text"; text: string; worker?: boolean }
  | { type: "tool"; name: string; summary: string; worker?: boolean }
  /** A workflow milestone, derived from the files and commands the agent produces. */
  | { type: "step"; step: StepId; label: string }
  | { type: "denied"; tool: string; reason: string }
  | { type: "video"; path: string; durationSec?: number }
  | { type: "cost"; usd: number; turns: number }
  | { type: "done"; job: JobRecord }
  | { type: "error"; message: string };

export type Emit = (e: JobEvent) => void;

export type StepId = "setup" | "brief" | "design" | "storyboard" | "images" | "audio" | "frames" | "assemble" | "checks" | "snapshot" | "render" | "deliver";

export const STEPS: { id: StepId; label: string }[] = [
  { id: "setup", label: "Project set up" },
  { id: "brief", label: "Brief locked" },
  { id: "design", label: "Design system" },
  { id: "storyboard", label: "Storyboard" },
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
  /** Visual style: "default" (the workflow picks a preset) or "vox-collage" (paper cut-outs on twos). */
  style?: Style;
  /** Website for product-launch-video. */
  url?: string;
  quality?: Quality;
  model?: string;
  maxBudgetUsd?: number;
  maxTurns?: number;
  /** Product folder for brand, voice and facts: a path, or "none". Default: PRODUCT_DIR, then the nearest product/. */
  product?: string;
  /** absolute paths of user files (images, video clips, text) */
  inputs?: string[];
}

export interface JobRecord {
  id: string;
  dir: string;
  brief: string;
  options: Omit<JobOptions, "brief" | "inputs">;
  status: "running" | "done" | "error" | "cancelled";
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
  revisions: { at: string; instructions: string }[];
  /** The product folder the job used (brand, voice, facts), if any. */
  product?: { dir: string; name: string } | null;
  /** Where the brand came from: "product folder: <name>" or "none (HyperFrames preset palette)". */
  brand?: string;
  hyperframes?: { cli: string | null; skills: string | null };
  voice?: { provider: string | null };
  /** Everything generated for the video (pictures, narration, sound effects, music), with model and prompt. */
  media?: MediaEntry[];
}
