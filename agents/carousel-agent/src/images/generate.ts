import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import OpenAI, { toFile } from "openai";
import type { Brand, StyleId } from "../config.js";
import { STYLES } from "../styles.js";
import { mockImage } from "./mock.js";

export type ImageStyle = "3d-mono" | "photo" | "still-life" | "illustration" | "abstract" | "cutout" | "raw";
export type Aspect = "square" | "portrait" | "landscape" | "wide";

export interface ImageRequest {
  name: string; // file stem, e.g. "cover-bg"
  prompt: string; // the subject / composition only
  style: ImageStyle;
  aspect: Aspect;
  resolution: "standard" | "hd";
  quality: "medium" | "high" | "xhigh";
  variant?: "flare" | "sunburst";
  referenceImages?: string[]; // absolute paths; switches to the edit endpoint
}

export interface ImageResult {
  file: string; // path relative to the run dir, e.g. assets/cover-bg.jpg
  absPath: string;
  size: string;
  model: string;
  cached: boolean;
  mock: boolean;
  finalPrompt: string;
}

const NO_TEXT =
  "Absolutely no text, letters, numbers, captions, labels, logos, brand names, signage or watermarks anywhere in the image.";

/**
 * The palette words for image prompts: the consulting colours in the consulting style; otherwise the brand's palette,
 * or the visual style's own palette when the brand doesn't set one (the default brand.json).
 */
export function paletteWords(brand: Brand, style: StyleId): string {
  const c = brand.colors;
  if (style === "consulting") return `${brand.imageStyle} (primary ${c.primary}, deep ${c.primaryDeep}, highlights ${c.primaryLight} and ${c.violet})`;
  const p = brand.palette;
  if (!p) return STYLES[style].imagePalette;
  const highlights = p.highlights.slice(0, 2).map((h) => h.bg).join(" and ");
  return `${brand.imageStyle || STYLES[style].imagePalette} (primary ${p.primary}, accent ${p.accent}, highlights ${highlights})`;
}

/** House style per image role. Text, colour unification and layout are done in HTML/CSS, so images stay clean. */
export function buildPrompt(req: ImageRequest, brand: Brand, style: StyleId = "consulting"): string {
  const c = brand.colors;
  const palette = paletteWords(brand, style);
  const brandColour = style === "consulting" ? c.primary : (brand.palette?.primary ?? palette);
  const styles: Record<ImageStyle, string> = {
    "3d-mono":
      `Stylized, photoreal 3D render. Smooth matte plastic, frosted glass and soft ceramic materials. ` +
      `Strictly monochromatic palette: ${palette}. Soft diffuse studio light with gentle rim light, subtle reflections, ` +
      `shallow depth of field, calm, premium, minimal. Generic unbranded objects only. ` +
      `Composition leaves a large calm area in the centre for a text panel to be overlaid.`,
    photo:
      `Editorial corporate photograph, shot on a full-frame camera with a 50mm lens. Natural daylight in a bright modern workplace, ` +
      `candid and authentic, shallow depth of field, soft colour grade with subtle accents in the brand colour ${brandColour} in clothing or surroundings, ` +
      `natural skin tones, diverse people, no posing for the camera.`,
    "still-life":
      `Editorial still-life photograph for a magazine cover: one or a few real, generic, unbranded objects on a simple surface, ` +
      `dramatic natural or sunset light with long soft shadows, cinematic colour, shallow depth of field, lots of negative space. ` +
      `Colour mood: ${palette}.`,
    illustration:
      `Flat editorial illustration: bold simple shapes, a limited palette (${palette}), subtle halftone grain, ` +
      `friendly and modern, generous negative space, no outlines clutter.`,
    abstract:
      `Minimal abstract 3D composition of soft geometric forms (arches, spheres, ribbons, stepped blocks). ` +
      `Monochromatic palette: ${palette}. Soft gradients, gentle studio light, generous negative space, premium and calm.`,
    cutout:
      `A single isolated object, centred with generous margin, studio lit, rendered in ${palette}. ` +
      `Fully transparent background, no ground plane, soft natural form shadow only on the object itself.`,
    raw: "",
  };
  return [req.prompt.trim(), styles[req.style], NO_TEXT].filter(Boolean).join("\n\n");
}

const SIZES: Record<"standard" | "hd", Record<Aspect, string>> = {
  standard: { square: "1024x1024", portrait: "1024x1536", landscape: "1536x1024", wide: "1536x1024" },
  // ≤ 2560×1440 pixel budget, all edges divisible by 16 (gpt-image-2.x accepts arbitrary sizes)
  hd: { square: "1920x1920", portrait: "1536x1920", landscape: "2304x1536", wide: "2560x1440" },
};

function resolveModel(variant?: "flare" | "sunburst"): string {
  const base = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
  if (variant && /^gpt-image-2\.5-(flare|sunburst)/.test(base)) return base.replace(/(flare|sunburst)/, variant);
  return base;
}

export const isMockMode = () => process.env.IMAGE_MOCK === "1" || !process.env.OPENAI_API_KEY;

export async function generateImage(req: ImageRequest, runDir: string, brand: Brand, style: StyleId = "consulting"): Promise<ImageResult> {
  const model = resolveModel(req.variant);
  const supportsCustomSize = /^gpt-image-2/.test(model);
  const size = SIZES[supportsCustomSize ? req.resolution : "standard"][req.aspect];
  const transparent = req.style === "cutout";
  const ext = transparent ? "png" : "jpg";
  const finalPrompt = buildPrompt(req, brand, style);
  const mock = isMockMode();

  const assetsDir = path.join(runDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const file = `assets/${req.name}.${ext}`;
  const absPath = path.join(runDir, file);

  // Cache: identical requests are free on re-runs and while the agent iterates on layout.
  const refsHash = (req.referenceImages ?? []).map((p) => fs.statSync(p).mtimeMs + p).join("|");
  const key = crypto.createHash("sha256").update([model, size, req.quality, finalPrompt, refsHash, mock].join("§")).digest("hex");
  const cachePath = path.join(assetsDir, ".cache.json");
  const cache: Record<string, string> = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
  if (cache[key] && fs.existsSync(path.join(runDir, cache[key]))) {
    const cachedFile = cache[key];
    if (cachedFile !== file) fs.copyFileSync(path.join(runDir, cachedFile), absPath);
    return { file, absPath, size, model: mock ? `mock (${model})` : model, cached: true, mock, finalPrompt };
  }

  let bytes: Buffer;
  if (mock) {
    bytes = await mockImage(req, size, brand);
  } else {
    const client = new OpenAI();
    const common = {
      model,
      prompt: finalPrompt,
      size,
      quality: req.quality,
      background: transparent ? ("transparent" as const) : ("opaque" as const),
      output_format: transparent ? ("png" as const) : ("jpeg" as const),
      ...(transparent ? {} : { output_compression: 92 }),
      n: 1,
    };
    const res = req.referenceImages?.length
      ? await client.images.edit({
          ...common,
          image: await Promise.all(
            req.referenceImages.map((p) => toFile(fs.createReadStream(p), path.basename(p), { type: mimeOf(p) })),
          ),
        })
      : await client.images.generate(common);
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error(`OpenAI returned no image data (model ${model}).`);
    bytes = Buffer.from(b64, "base64");
  }

  fs.writeFileSync(absPath, bytes);
  // The file now holds this request's image: forget other requests that pointed to the same name.
  for (const [k, v] of Object.entries(cache)) if (v === file) delete cache[k];
  cache[key] = file;
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  return { file, absPath, size, model: mock ? `mock (${model})` : model, cached: false, mock, finalPrompt };
}

function mimeOf(p: string) {
  const e = path.extname(p).toLowerCase();
  return e === ".png" ? "image/png" : e === ".webp" ? "image/webp" : "image/jpeg";
}
