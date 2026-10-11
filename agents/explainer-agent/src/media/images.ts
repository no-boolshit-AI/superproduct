/**
 * Pictures for the motion layers: OpenAI GPT Image (gpt-image-2.5-flare by default) in the product's illustration
 * style. Every request carries the style twice: as a prompt-ready description, and as reference illustrations sent
 * to the edit endpoint (up to 16 images per request), so characters, props and illustrated interface elements share
 * the house look. A picture that must stay the same across frames (a character, a prop) is passed as a further
 * reference. Text never goes into a picture: the layout sets it in HTML. IMAGE_MOCK=1 draws placeholders locally.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI, { toFile } from "openai";
import { cached, ffmpeg, fileHash, hashKey, madeThisRun, pool, safeName, writeFileAtomic, type MediaStore } from "./common.js";
import { placeholderPng, pngSize } from "./png.js";

export const IMAGE_KINDS = ["cutout", "ui", "illustration", "scene"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];
export const IMAGE_ASPECTS = ["square", "portrait", "landscape", "wide", "tall", "frame"] as const;
export const IMAGE_QUALITIES = ["low", "medium", "high", "xhigh", "max"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export interface ImageSettings {
  /** OPENAI_API_KEY is set, or IMAGE_MOCK=1 */
  available: boolean;
  mock: boolean;
  model: string;
  quality: ImageQuality;
  /** generations per run (cached repeats are free and don't count) */
  max: number;
}

/** gpt-image-2 and 2.5 take any WxH (multiples of 16); xhigh/max quality is 2.5 only; input_fidelity is 1.x only (2.5 rejects it). */
const customSizes = (model: string) => /^gpt-image-2/.test(model);
const extraQuality = (model: string) => /^gpt-image-2\.5/.test(model);
const fidelity = (model: string) => /^gpt-image-1(?!-mini)/.test(model);

export function imageSettings(env: NodeJS.ProcessEnv = process.env): ImageSettings {
  const mock = env.IMAGE_MOCK?.trim() === "1";
  const model = env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-flare";
  const q = env.OPENAI_IMAGE_QUALITY?.trim() ?? "";
  let quality: ImageQuality = (IMAGE_QUALITIES as readonly string[]).includes(q) ? (q as ImageQuality) : "high";
  if (!extraQuality(model) && (quality === "xhigh" || quality === "max")) quality = "high";
  const max = Number(env.MAX_IMAGES);
  return { available: mock || !!env.OPENAI_API_KEY?.trim(), mock, model, quality, max: env.MAX_IMAGES?.trim() && Number.isFinite(max) && max >= 0 ? Math.floor(max) : 24 };
}

/** The house look: a prompt-ready description plus reference illustrations (absolute paths; style only). */
export interface ImageStyle {
  text: string;
  references: string[];
  /** where it came from, for messages: "product folder: …" or "built-in" */
  source: string;
}

export const DEFAULT_IMAGE_STYLE =
  "Clean editorial illustration: confident ink outlines, flat muted colours with a subtle printed-paper grain, simple shapes, realistic proportions, calm and modern.";

export interface ImageSpec {
  /** file stem: "ana" → assets/images/ana.png */
  name: string;
  /** what to show: subject, pose, angle, framing. Never text. */
  prompt: string;
  kind: ImageKind;
  /** a preset (square, portrait, landscape, wide, tall, frame = the video's canvas) or WIDTHxHEIGHT */
  aspect?: string;
  /** project-relative pictures to keep identical (a character or prop generated earlier) */
  refs?: string[];
  /** cutout and ui are transparent, illustration and scene opaque, unless this says otherwise (scene is always opaque) */
  transparent?: boolean;
}

export interface ImageResult {
  name: string;
  /** project-relative */
  file: string;
  width: number;
  height: number;
  kind: ImageKind;
  transparent: boolean;
  cached: boolean;
  mock: boolean;
  model: string;
  /** small PNG on grey (so a transparent ground shows), for the tool result */
  preview?: Buffer;
}

const KIND: Record<ImageKind, string> = {
  cutout:
    "One subject (a person, an object or a small group), complete and uncropped with some margin around it, isolated on a fully transparent background: no floor, no backdrop, no frame, no shadow on the ground. Crisp, clean edges, so it can be cut out and animated on its own.",
  ui:
    "One interface element (for example a window, a card, a button, a toggle, a dial, a progress bar, a chat bubble, an inbox or a form field) drawn as an illustrated object in the same style: inked outline, painted fills, print texture, a little physical depth like an enamel sign or a printed card. Front view, flat and centred, isolated on a fully transparent background. Every place where text would go is left blank or shown as plain grey bars.",
  illustration: "A complete small illustration of the subject on a plain, very light paper-white background, with a simple composition and generous margin around the subject.",
  scene: "A full-bleed scene that fills the frame edge to edge, made to sit behind a video's text: the main subject sits off-centre and a calm, uncluttered area is left free for type.",
};

const NO_TEXT =
  "No text anywhere: no letters, words, numbers, captions, labels, signatures, logos, brand names or watermarks. Screens, signs, papers and buttons stay blank or show plain grey bars.";

/**
 * The prompt as sent. With style references it opens by saying the picture is new and the references are for style
 * only: tried on gpt-image-2.5-flare, a reference otherwise lends its person, hairstyle and furniture to the subject.
 */
export function buildImagePrompt(spec: Pick<ImageSpec, "prompt" | "kind">, style: ImageStyle, refNames: string[] = []): string {
  const n = style.references.length;
  const its = n === 1 ? "its" : "their";
  const parts: string[] = [];
  if (n)
    parts.push(
      `Create a new picture. ${n === 1 ? "The first attached image is" : `The first ${n} attached images are`} only a style reference: match ${its} medium, ink line work, painted shading, print texture and colour palette. Don't reuse ${its} people, hairstyles, clothes, furniture, objects or composition.`,
    );
  parts.push(`Subject: ${spec.prompt.trim()}`);
  refNames.forEach((r, i) => parts.push(`Attached image ${n + i + 1} (${r}) shows something that appears again here: keep it identical, with the same face, hair, clothes, proportions and colours.`));
  parts.push(`Composition: ${KIND[spec.kind]}`, `Style: ${style.text.trim()}`, NO_TEXT);
  return parts.join("\n\n");
}

const MAX_PIXELS = 2560 * 1440;
const DEFAULT_ASPECT: Record<ImageKind, string> = { cutout: "square", ui: "landscape", illustration: "square", scene: "frame" };

/** The request size for an aspect on this model: any WxH in multiples of 16 for gpt-image-2.x, else a standard size. */
export function imageSize(aspect: string | undefined, kind: ImageKind, canvas: { width: number; height: number }, model: string): { width: number; height: number } {
  const a = aspect?.trim() || DEFAULT_ASPECT[kind];
  const m = a.match(/^(\d{2,4})\s*[x×]\s*(\d{2,4})$/i);
  const presets: Record<string, [number, number]> = { square: [1024, 1024], portrait: [1024, 1536], landscape: [1536, 1024], wide: [1920, 1088], tall: [1088, 1920], frame: [canvas.width, canvas.height] };
  let [w, h] = m ? [Number(m[1]), Number(m[2])] : (presets[a] ?? presets[DEFAULT_ASPECT[kind]]);
  if (!customSizes(model)) {
    const r = w / h;
    return r > 1.2 ? { width: 1536, height: 1024 } : r < 0.83 ? { width: 1024, height: 1536 } : { width: 1024, height: 1024 };
  }
  // the ratio between 1:3 and 3:1, inside the pixel budget, both edges multiples of 16 (rounded up for the canvas)
  if (w / h > 3) w = h * 3;
  if (h / w > 3) h = w * 3;
  if (w * h > MAX_PIXELS) {
    const s = Math.sqrt(MAX_PIXELS / (w * h));
    w *= s;
    h *= s;
  }
  const up = (n: number) => Math.max(256, Math.ceil(n / 16) * 16);
  const down = (n: number) => Math.max(256, Math.floor(n / 16) * 16);
  const fit = w * h > MAX_PIXELS * 0.98 ? down : up;
  return { width: fit(w), height: fit(h) };
}

const mimeOf = (p: string) => (/\.png$/i.test(p) ? "image/png" : /\.webp$/i.test(p) ? "image/webp" : "image/jpeg");

/** A preview on mid-grey, at most 384×512, for the model to look at; null without FFmpeg. */
function previewOf(abs: string, width: number, height: number): Buffer | null {
  const s = Math.min(384 / width, 512 / height, 1);
  const w = Math.max(2, Math.round((width * s) / 2) * 2);
  const h = Math.max(2, Math.round((height * s) / 2) * 2);
  const out = path.join(os.tmpdir(), `explainer-preview-${process.pid}-${Math.random().toString(36).slice(2)}.png`);
  try {
    const ok = ffmpeg(["-i", abs, "-filter_complex", `color=c=0x9e9e9e:s=${w}x${h}[bg];[0:v]scale=${w}:${h}[fg];[bg][fg]overlay=format=auto,format=rgb24`, "-frames:v", "1", out]);
    return ok && fs.existsSync(out) ? fs.readFileSync(out) : null;
  } finally {
    fs.rmSync(out, { force: true });
  }
}

/** OpenAI's error, said plainly. */
function openAiMessage(e: unknown, model: string): string {
  const err = e as { status?: number; message?: string; error?: { message?: string; code?: string } };
  const msg = err.error?.message ?? err.message ?? String(e);
  if (err.status === 401) return "OpenAI rejected OPENAI_API_KEY (401)";
  if (err.status === 429) return `OpenAI rate limit or quota reached (429): ${msg}`;
  if (err.status === 400 && /safety|moderation|policy/i.test(msg)) return `OpenAI's safety system refused this prompt; describe the subject differently (${msg})`;
  if (err.status === 404 || (err.status === 400 && /model/i.test(msg))) return `OpenAI image model ${model}: ${msg}`;
  return `OpenAI ${err.status ?? "error"}: ${msg}`;
}

export interface GenerateImagesOptions {
  projectDir: string;
  /** the video's canvas, for aspect "frame" */
  canvas: { width: number; height: number };
  style: ImageStyle;
  settings: ImageSettings;
  store: MediaStore;
  /** tests pass their own client */
  client?: OpenAI;
  concurrency?: number;
}

/** Generate a batch, in parallel. Each result is an ImageResult or the Error that stopped that one. */
export async function generateImages(specs: ImageSpec[], o: GenerateImagesOptions): Promise<(ImageResult | Error)[]> {
  const { projectDir, settings, style, store } = o;
  const model = settings.mock ? `mock (${settings.model})` : settings.model;
  let remaining = Math.max(0, settings.max - madeThisRun(store, "image"));
  const seen = new Set<string>();
  const styleHashes = style.references.map((p) => fileHash(p));
  let client: OpenAI | null = o.client ?? null;
  return pool(specs, o.concurrency ?? 4, async (spec) => {
    if (!(IMAGE_KINDS as readonly string[]).includes(spec.kind)) throw new Error(`kind must be one of ${IMAGE_KINDS.join(", ")}`);
    if (!spec.prompt?.trim()) throw new Error("prompt is empty");
    const name = safeName(spec.name, "image");
    if (seen.has(name)) throw new Error(`"${name}" appears twice in this batch`);
    seen.add(name);
    const refs = (spec.refs ?? []).map((r) => {
      const abs = path.resolve(projectDir, r);
      const rel = path.relative(projectDir, abs);
      if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`ref ${r} is outside the project`);
      if (!fs.existsSync(abs)) throw new Error(`ref ${r} doesn't exist`);
      if (!/\.(png|jpe?g|webp)$/i.test(abs)) throw new Error(`ref ${r} must be a PNG, JPEG or WebP`);
      return { abs, rel: rel.split(path.sep).join("/") };
    });
    if (style.references.length + refs.length > 16) throw new Error("at most 16 reference images per picture (the style references count)");
    const kind = spec.kind;
    const transparent = kind === "scene" ? false : (spec.transparent ?? (kind === "cutout" || kind === "ui"));
    const { width, height } = imageSize(spec.aspect, kind, o.canvas, settings.model);
    const prompt = buildImagePrompt(spec, style, refs.map((r) => r.rel));
    const key = hashKey("image", model, `${width}x${height}`, settings.quality, transparent, prompt, styleHashes, refs.map((r) => fileHash(r.abs)));
    const file = `assets/images/${name}.png`;
    const abs = path.join(projectDir, file);
    const done = (bytes: Buffer, isCached: boolean): ImageResult => {
      const dims = pngSize(bytes) ?? { width, height };
      return { name, file, width: dims.width, height: dims.height, kind, transparent, cached: isCached, mock: settings.mock, model, preview: previewOf(abs, dims.width, dims.height) ?? undefined };
    };
    const hit = cached(store, projectDir, key);
    if (hit) {
      if (hit.file !== file) {
        writeFileAtomic(abs, fs.readFileSync(path.join(projectDir, hit.file)));
        store.add({ ...hit, file, copyOf: hit.file });
      }
      return done(fs.readFileSync(abs), true);
    }
    if (remaining <= 0) throw new Error(`image limit reached: ${settings.max} new images per run (MAX_IMAGES); reuse a file or regenerate fewer`);
    remaining--;
    let bytes: Buffer;
    let usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
    if (settings.mock) bytes = placeholderPng(width, height, name, transparent);
    else {
      client ??= new OpenAI({ timeout: 300_000, maxRetries: 2 });
      const common = { model: settings.model, prompt, size: `${width}x${height}`, quality: settings.quality, background: transparent ? "transparent" : "opaque", output_format: "png", n: 1 } as const;
      const files = [...style.references, ...refs.map((r) => r.abs)].map((p) => ({ data: fs.readFileSync(p), name: path.basename(p), type: mimeOf(p) }));
      let res: OpenAI.ImagesResponse;
      try {
        if (files.length) {
          const image = await Promise.all(files.map((f) => toFile(f.data, f.name, { type: f.type })));
          try {
            res = await client.images.edit({ ...common, image, ...(refs.length && fidelity(settings.model) ? { input_fidelity: "high" as const } : {}) });
          } catch (e) {
            // a model without input fidelity: the references still steer it
            if (!refs.length || !fidelity(settings.model) || !/input_fidelity/i.test(String((e as Error).message))) throw e;
            res = await client.images.edit({ ...common, image: await Promise.all(files.map((f) => toFile(f.data, f.name, { type: f.type }))) });
          }
        } else res = await client.images.generate(common);
      } catch (e) {
        remaining++;
        throw new Error(openAiMessage(e, settings.model));
      }
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error(`OpenAI returned no image data (model ${settings.model})`);
      bytes = Buffer.from(b64, "base64");
      usage = res.usage ? { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, total_tokens: res.usage.total_tokens } : undefined;
    }
    writeFileAtomic(abs, bytes);
    store.add({
      type: "image",
      file,
      provider: settings.mock ? "mock" : "openai",
      model,
      key,
      prompt,
      at: new Date().toISOString(),
      kind,
      size: `${width}x${height}`,
      transparent,
      refs: refs.map((r) => r.rel),
      ...(usage ? { usage } : {}),
    });
    return done(bytes, false);
  });
}
