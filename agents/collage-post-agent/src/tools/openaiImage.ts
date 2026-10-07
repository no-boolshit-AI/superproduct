import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import path from "node:path";

export const IMAGE_KINDS = ["cutout", "portrait", "scene", "texture", "object"] as const;
export const IMAGE_MEDIA = ["photo", "engraving", "painting", "halftone", "sculpture"] as const;
export const IMAGE_ASPECTS = ["portrait", "square", "landscape", "cover"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
export type ImageMedium = (typeof IMAGE_MEDIA)[number];
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];
export type ImageQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export interface ImageRequest {
  /** What to show. For people: an anonymous archetype, never a named real person. */
  subject: string;
  kind: ImageKind;
  medium?: ImageMedium;
  aspect?: ImageAspect;
  /** File name without extension, e.g. "cover-scholar". */
  filename: string;
  /** Defaults to true for cutout/object. */
  transparent?: boolean;
}

export interface ImageResult {
  path: string; // relative to the job dir
  absPath: string;
  prompt: string;
  size: string;
  transparent: boolean;
}

const MEDIUM: Record<ImageMedium, string> = {
  photo: "Archival black-and-white photograph, documentary style, natural light, rich silver-gelatin tones",
  engraving: "19th-century steel engraving, fine cross-hatching and stipple, black ink on white paper",
  painting: "Old-master oil painting rendered in greyscale, chiaroscuro lighting, visible brushwork and craquelure",
  halftone: "Coarse black-and-white newspaper halftone print, visible dot screen",
  sculpture: "Classical marble sculpture photographed in black and white, raking side light",
};

const KIND: Record<ImageKind, (s: string) => string> = {
  cutout: (s) =>
    `${s}. A single isolated subject shown head-and-shoulders or half-length, cropped only by the bottom edge, ` +
    `with generous empty space around the head. Fully transparent background, clean crisp silhouette edge, no cast shadow, no floor.`,
  portrait: (s) =>
    `${s}. Frontal head-and-shoulders portrait, centred, eyes on the upper third of the frame, ` +
    `plain dark seamless studio background.`,
  scene: (s) =>
    `${s}. Low-key, moody lighting with a mostly dark frame. The main subject sits in the upper-middle of the frame; ` +
    `the bottom third is dark and quiet.`,
  texture: (s) =>
    `${s}. Dense all-over composition filling the frame edge to edge, many repeated elements, no single focal point, even exposure.`,
  object: (s) =>
    `${s}. A single object, centred, fully visible with space around it. Fully transparent background, crisp edge, no cast shadow.`,
};

const BASE =
  "Source material for an editorial collage. Strictly monochrome greyscale with a full tonal range: deep blacks, " +
  "clean highlights, crisp detail, subtle film grain. Absolutely no text, letters, numbers, captions, signatures, " +
  "logos, watermarks, borders or frames.";

export function buildImagePrompt(req: ImageRequest): string {
  const medium = MEDIUM[req.medium ?? "photo"];
  return `${medium}. ${KIND[req.kind](req.subject.trim().replace(/\.$/, ""))} ${BASE}`;
}

function sizeFor(aspect: ImageAspect, model: string): string {
  const custom = /^gpt-image-2/.test(model); // 2 / 2.5 accept arbitrary WxH (multiples of 16)
  switch (aspect) {
    case "square":
      return "1024x1024";
    case "landscape":
      return "1536x1024";
    case "cover":
      return custom ? "1088x1360" : "1024x1536"; // 4:5, exactly the slide ratio
    default:
      return "1024x1536";
  }
}

function defaultAspect(kind: ImageKind): ImageAspect {
  if (kind === "texture") return "square";
  if (kind === "scene") return "cover";
  return "portrait";
}

export function safeName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

let client: OpenAI | null = null;
function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (add it to .env).");
  return (client ??= new OpenAI());
}

export async function generateImage(
  req: ImageRequest,
  jobDir: string,
  opts: { model: string; quality: ImageQuality },
): Promise<ImageResult> {
  const transparent = req.transparent ?? (req.kind === "cutout" || req.kind === "object");
  const size = sizeFor(req.aspect ?? defaultAspect(req.kind), opts.model);
  const prompt = buildImagePrompt(req);
  const res = await openai().images.generate({
    model: opts.model,
    prompt,
    size,
    quality: opts.quality,
    background: transparent ? "transparent" : "opaque",
    output_format: "png",
    moderation: "auto",
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image API returned no image data.");
  const rel = path.join("assets", `${safeName(req.filename)}.png`);
  const absPath = path.join(jobDir, rel);
  await writeFile(absPath, Buffer.from(b64, "base64"));
  return { path: rel, absPath, prompt, size, transparent };
}

/** Run async tasks with a concurrency limit, preserving order; failures become Error values. */
export async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<(R | Error)[]> {
  const out: (R | Error)[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        out[i] = e instanceof Error ? e : new Error(String(e));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
