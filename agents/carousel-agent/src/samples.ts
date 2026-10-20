/**
 * Sample images for the layout templates (assets/hero.jpg, photo.jpg, …), so `npm run demo` and `npm run gallery`
 * render without Claude. Mock art unless OPENAI_API_KEY is set and IMAGE_MOCK isn't 1.
 */
import fs from "node:fs";
import path from "node:path";
import type { Brand, Format, StyleId } from "./config.js";
import { generateImage, type ImageRequest } from "./images/generate.js";
import { mockScreenHtml } from "./images/mock.js";
import { renderHtmlString } from "./render/renderer.js";

type Sample = Omit<ImageRequest, "resolution" | "quality">;

export function sampleImages(format: Format): Sample[] {
  const aspect = format === "portrait" ? "portrait" : "square";
  return [
    { name: "hero", style: "3d-mono", aspect, prompt: "Rows of minimal, unbranded household-care bottles and jars standing on simple retail shelves, seen straight on, slightly from below." },
    { name: "photo", style: "photo", aspect: "landscape", prompt: "Five colleagues in a small workshop room gathered around a laptop and sticky notes, one laughing, candid moment." },
    { name: "still", style: "still-life", aspect: "landscape", prompt: "A slim folding phone half open like a small laptop on a concrete table, a smooth stone beside it, sunset light from the left." },
    { name: "objects", style: "abstract", aspect, prompt: "A handful of thin rounded rectangular cards floating and tumbling in mid-air, scattered diagonally." },
    { name: "portrait", style: "cutout", aspect: "portrait", prompt: "A smiling person in a dark t-shirt, head and shoulders portrait, facing the camera." },
    { name: "avatar-1", style: "photo", aspect: "square", prompt: "Headshot portrait of a person with red hair in front of a green wall." },
    { name: "avatar-2", style: "photo", aspect: "square", prompt: "Headshot portrait of a person wearing a cap, outdoors." },
  ];
}

/** Write the sample images the given layouts need (all by default) into <dir>/assets. */
export async function prepareSampleAssets(dir: string, brand: Brand, style: StyleId, format: Format, needed?: string[]) {
  const want = (file: string) => !needed || needed.includes(file);
  const done: string[] = [];
  for (const img of sampleImages(format)) {
    const ext = img.style === "cutout" ? "png" : "jpg";
    if (!want(`assets/${img.name}.${ext}`)) continue;
    const r = await generateImage({ ...img, resolution: "hd", quality: "high" }, dir, brand, style);
    done.push(`${r.file} ${r.size} ${r.model}${r.cached ? " (cached)" : ""}`);
  }
  if (want("assets/screen.jpg")) {
    const file = path.join(dir, "assets", "screen.jpg");
    if (!fs.existsSync(file)) fs.writeFileSync(file, await renderHtmlString(mockScreenHtml(brand), { width: 1600, height: 1000, type: "jpeg", quality: 88 }));
    done.push("assets/screen.jpg (mock web page)");
  }
  return done;
}
