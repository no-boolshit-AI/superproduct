/** Optional imagery via OpenAI image generation (raw material only: no text, no charts). Mock art when no key. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import type { Brand } from "./config.js";
import { renderHtmlString } from "./render/renderer.js";
import { THEMES, type ThemeId } from "./themes.js";

export type ImageStyle = "photo" | "abstract" | "illustration" | "texture" | "cutout" | "raw";
export type Aspect = "landscape" | "portrait" | "square" | "wide" | "tall";

export interface ImageRequest {
  name: string;
  prompt: string;
  style: ImageStyle;
  aspect: Aspect;
  quality?: "medium" | "high";
}

export const imagesEnabled = () => !!process.env.OPENAI_API_KEY?.trim() || process.env.IMAGE_MOCK === "1";
export const isMockMode = () => process.env.IMAGE_MOCK === "1" || !process.env.OPENAI_API_KEY?.trim();

const NO_TEXT = "Absolutely no text, letters, numbers, charts, user interfaces, logos, brand names, signage or watermarks anywhere in the image.";

export function buildPrompt(req: ImageRequest, theme: ThemeId, brand: Brand): string {
  const colours = brand.imagePalette || THEMES[theme].imagePalette;
  const palette = brand.imageStyle ? `${brand.imageStyle}; palette ${colours}` : colours;
  const styles: Record<ImageStyle, string> = {
    photo: `Editorial corporate photograph, full-frame camera, 35–50mm lens, natural light, authentic and unposed, shallow depth of field, restrained colour grade that harmonises with ${palette}. Diverse, realistic people when people appear; no identifiable real persons.`,
    abstract: `Minimal abstract composition of soft geometric forms and gradients, premium and calm, generous negative space, colours: ${palette}.`,
    illustration: `Clean flat vector-style illustration, simple shapes, consistent line weight, limited palette of ${palette}, white or very light background, corporate and modern.`,
    texture: `Subtle, low-contrast background texture (paper, fabric, topographic lines or soft light), designed to sit behind text, colours: ${palette}.`,
    cutout: `A single isolated object, centred with margin, studio lit, colours harmonising with ${palette}. Fully transparent background, no ground plane.`,
    raw: "",
  };
  return [req.prompt.trim(), styles[req.style], NO_TEXT].filter(Boolean).join("\n\n");
}

const SIZES: Record<Aspect, string> = { landscape: "1536x1024", portrait: "1024x1536", square: "1024x1024", wide: "2048x1152", tall: "1152x2048" };

async function mockImage(req: ImageRequest, size: string, theme: ThemeId): Promise<Buffer> {
  const [w, h] = size.split("x").map(Number);
  const seed = [...req.name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = (seed * 47) % 360;
  const html = `<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:system-ui">
<div style="position:absolute;inset:0;background:linear-gradient(${seed % 180}deg,hsl(${hue} 30% 32%),hsl(${(hue + 40) % 360} 35% 62%))"></div>
<div style="position:absolute;width:${w * 0.7}px;height:${w * 0.7}px;border-radius:50%;left:${w * 0.45}px;top:${-h * 0.2}px;background:rgba(255,255,255,.12)"></div>
<div style="position:absolute;width:${w * 0.5}px;height:${w * 0.5}px;border-radius:50%;left:${-w * 0.1}px;top:${h * 0.55}px;background:rgba(0,0,0,.12)"></div>
<div style="position:absolute;left:6%;bottom:7%;right:6%;color:rgba(255,255,255,.9);font-size:${Math.round(w / 38)}px;line-height:1.3"><b>Placeholder image</b> · ${req.style} · ${theme}<br>${req.prompt.slice(0, 140).replace(/</g, "&lt;")}</div>
</body></html>`;
  return renderHtmlString(html, { width: w, height: h, type: req.style === "cutout" ? "png" : "jpeg", quality: 85 });
}

export async function generateImage(req: ImageRequest, runDir: string, theme: ThemeId, brand: Brand) {
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-flare";
  const size = SIZES[req.aspect];
  const transparent = req.style === "cutout";
  const ext = transparent ? "png" : "jpg";
  const finalPrompt = buildPrompt(req, theme, brand);
  const mock = isMockMode();
  const assets = path.join(runDir, "assets");
  fs.mkdirSync(assets, { recursive: true });
  const file = `assets/${req.name}.${ext}`;
  const abs = path.join(runDir, file);
  const key = crypto.createHash("sha256").update([model, size, req.quality, finalPrompt, mock].join("§")).digest("hex");
  const cachePath = path.join(assets, ".cache.json");
  const cache: Record<string, string> = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
  if (cache[key] && fs.existsSync(path.join(runDir, cache[key]))) {
    if (cache[key] !== file) fs.copyFileSync(path.join(runDir, cache[key]), abs);
    return { file, abs, size, model: mock ? "mock" : model, cached: true, mock };
  }
  let bytes: Buffer;
  if (mock) bytes = await mockImage(req, size, theme);
  else {
    const client = new OpenAI();
    const res = await client.images.generate({
      model,
      prompt: finalPrompt,
      size: size as "1024x1024",
      quality: req.quality ?? "high",
      background: transparent ? "transparent" : "opaque",
      output_format: transparent ? "png" : "jpeg",
      n: 1,
    } as Parameters<typeof client.images.generate>[0]);
    const b64 = (res as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json;
    if (!b64) throw new Error(`OpenAI returned no image data (model ${model}).`);
    bytes = Buffer.from(b64, "base64");
  }
  fs.writeFileSync(abs, bytes);
  cache[key] = file;
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  return { file, abs, size, model: mock ? "mock" : model, cached: false, mock };
}
