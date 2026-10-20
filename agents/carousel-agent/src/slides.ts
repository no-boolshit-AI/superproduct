import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { FORMATS, listSlides, slideFile, type RunContext } from "./config.js";
import { composeSlideDocument, sanitizeFragment } from "./render/compose.js";
import { renderHtmlFile, renderHtmlString, type Diagnostics } from "./render/renderer.js";
import { STYLES } from "./styles.js";

export interface SlideResult {
  index: number;
  fragmentPath: string;
  previewPath: string;
  preview: Buffer;
  diagnostics: Diagnostics;
  notes: string[];
}

function build(ctx: RunContext, name: string, fragment: string) {
  if (!ctx.style) throw new Error("No style chosen yet: call set_style first.");
  const doc = composeSlideDocument(fragment, { runDir: ctx.dir, format: ctx.format, brand: ctx.brand, style: ctx.style });
  const buildPath = path.join(ctx.dir, "build", `${name}.html`);
  fs.mkdirSync(path.dirname(buildPath), { recursive: true });
  fs.writeFileSync(buildPath, doc);
  return buildPath;
}

/** Save a slide fragment, render a 1× preview and run layout diagnostics. */
export async function writeSlide(ctx: RunContext, index: number, html: string): Promise<SlideResult> {
  const name = slideFile(index);
  const { html: fragment, notes } = sanitizeFragment(html);
  const fragmentPath = path.join(ctx.dir, "slides", `${name}.html`);
  fs.mkdirSync(path.dirname(fragmentPath), { recursive: true });
  fs.writeFileSync(fragmentPath, fragment);
  return renderSlide(ctx, index, notes);
}

/** The style's composition rules for the layout QA. */
const qaFor = (ctx: RunContext) => ({ maxBand: ctx.style ? STYLES[ctx.style].maxBand : 1 });

export async function renderSlide(ctx: RunContext, index: number, notes: string[] = []): Promise<SlideResult> {
  const name = slideFile(index);
  const fragmentPath = path.join(ctx.dir, "slides", `${name}.html`);
  const buildPath = build(ctx, name, fs.readFileSync(fragmentPath, "utf8"));
  const { width, height } = FORMATS[ctx.format];
  const { buffer, diagnostics } = await renderHtmlFile(buildPath, { width, height, scale: 1, type: "jpeg", quality: 84, diagnose: true, qa: qaFor(ctx) });
  const previewPath = path.join(ctx.dir, "preview", `${name}.jpg`);
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  fs.writeFileSync(previewPath, buffer);
  fs.writeFileSync(path.join(ctx.dir, "build", `${name}.qa.json`), JSON.stringify(diagnostics));
  return { index, fragmentPath, previewPath, preview: buffer, diagnostics: diagnostics!, notes };
}

/**
 * Cross-slide consistency: the logo should sit in one place, and left-aligned headlines should share one left edge.
 * Reads the marks each render saved in build/slide-NN.qa.json.
 */
export function consistencyNotes(ctx: RunContext): string[] {
  const marks = listSlides(ctx.dir).map((f, i) => {
    const qa = path.join(ctx.dir, "build", path.basename(f, ".html") + ".qa.json");
    const m = fs.existsSync(qa) ? (JSON.parse(fs.readFileSync(qa, "utf8")) as Diagnostics).marks ?? {} : {};
    return { n: i + 1, ...m };
  });
  const groups = (key: "logo" | "heading", axis: number[]) => {
    const by = new Map<string, number[]>();
    for (const m of marks) {
      const p = m[key];
      if (!p) continue;
      const k = axis.map((a) => Math.round(p[a] / 8) * 8).join(",");
      by.set(k, [...(by.get(k) ?? []), m.n]);
    }
    return [...by.entries()];
  };
  const list = (g: [string, number[]][]) => g.map(([k, ns]) => `slide${ns.length > 1 ? "s" : ""} ${ns.join(", ")} at (${k})`).join("; ");
  const notes: string[] = [];
  const logos = groups("logo", [0, 1]);
  if (logos.length > 1) notes.push(`The logo moves between slides: ${list(logos)}. Keep it in one place (wordmark--top, or wordmark--inline in a top row, land on the same spot).`);
  const heads = groups("heading", [0]);
  if (heads.length > 1) notes.push(`Left-aligned headlines start at different x: ${list(heads)}. Keep one left edge.`);
  return notes;
}

export function removeSlide(ctx: RunContext, index: number) {
  const name = slideFile(index);
  for (const p of [`slides/${name}.html`, `build/${name}.html`, `preview/${name}.jpg`, `png/${name}.png`])
    fs.rmSync(path.join(ctx.dir, p), { force: true });
}

/** All slides side by side, to judge rhythm and consistency across the carousel. */
export async function contactSheet(ctx: RunContext): Promise<Buffer | null> {
  const previews = listSlides(ctx.dir).map((f) => path.join(ctx.dir, "preview", path.basename(f, ".html") + ".jpg"));
  const existing = previews.filter((p) => fs.existsSync(p));
  if (!existing.length) return null;
  const { width, height } = FORMATS[ctx.format];
  const cols = Math.min(existing.length, 3);
  const rows = Math.ceil(existing.length / cols);
  const tw = 420, th = Math.round((tw * height) / width), gap = 24;
  const W = cols * tw + (cols + 1) * gap, H = rows * (th + 34) + (rows + 1) * gap;
  const items = existing
    .map((p, i) => `<figure style="margin:0"><img src="data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}" style="width:${tw}px;height:${th}px;display:block;box-shadow:0 2px 10px rgba(0,0,0,.25)"><figcaption style="font:500 18px system-ui;color:#555;padding-top:8px">${i + 1}</figcaption></figure>`)
    .join("");
  const html = `<html><body style="margin:0;background:#e9e9ee"><div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:${gap}px;padding:${gap}px">${items}</div></body></html>`;
  return renderHtmlString(html, { width: W, height: H, type: "jpeg", quality: 80 });
}

export interface ExportResult {
  pngs: string[];
  /** carousel.pdf; null for a single post. */
  pdf: string | null;
  post: string;
  manifest: string;
  warnings: string[];
}

/** Final export: high-res PNG per slide, a LinkedIn-ready PDF carousel (not for a single post), and post copy. */
export async function exportCarousel(
  ctx: RunContext,
  opts: { caption?: string; altText?: string[]; scale?: number },
): Promise<ExportResult> {
  const scale = opts.scale ?? Number(process.env.EXPORT_SCALE || 2);
  const { width, height } = FORMATS[ctx.format];
  const slides = listSlides(ctx.dir);
  if (!slides.length) throw new Error("No slides to export. Call write_slide first.");
  if (ctx.single && slides.length > 1) throw new Error(`A single post has one slide, but there are ${slides.length}. Remove the others with remove_slide.`);
  const pngs: string[] = [];
  const warnings: string[] = [];
  const pdf = await PDFDocument.create();
  for (const fragmentPath of slides) {
    const name = path.basename(fragmentPath, ".html");
    const buildPath = build(ctx, name, fs.readFileSync(fragmentPath, "utf8"));
    const { buffer, diagnostics } = await renderHtmlFile(buildPath, { width, height, scale, type: "png", diagnose: true, qa: qaFor(ctx) });
    for (const e of diagnostics!.errors) warnings.push(`${name}: ${e}`);
    const out = path.join(ctx.dir, "png", `${name}.png`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buffer);
    pngs.push(out);
    const img = await pdf.embedPng(buffer);
    const page = pdf.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  let pdfPath: string | null = null;
  if (!ctx.single) {
    pdf.setTitle(opts.caption?.split("\n")[0]?.slice(0, 120) || "Carousel");
    pdf.setCreator(ctx.brand.name);
    pdfPath = path.join(ctx.dir, "carousel.pdf");
    fs.writeFileSync(pdfPath, await pdf.save());
  }

  const alt = opts.altText ?? [];
  const postPath = path.join(ctx.dir, "post.md");
  fs.writeFileSync(
    postPath,
    [
      "# LinkedIn post",
      "",
      opts.caption?.trim() || "_(no caption)_",
      "",
      "## Alt text",
      "",
      ...pngs.map((p, i) => `${i + 1}. **${path.basename(p)}**: ${alt[i] ?? "_(missing)_"}`),
      "",
      ctx.single
        ? `Upload \`png/${path.basename(pngs[0])}\` as an image post.`
        : `Upload \`carousel.pdf\` as a document post (swipeable carousel), or the PNGs as a multi-image post.`,
      "",
    ].join("\n"),
  );
  const manifestPath = path.join(ctx.dir, "manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        brand: ctx.brand.name,
        kind: ctx.single ? "single" : "carousel",
        style: ctx.style,
        format: ctx.format,
        size: { width: width * scale, height: height * scale },
        slides: pngs.map((p, i) => ({ png: path.relative(ctx.dir, p), alt: alt[i] ?? null })),
        pdf: pdfPath ? "carousel.pdf" : null,
        caption: opts.caption ?? null,
      },
      null,
      2,
    ),
  );
  return { pngs, pdf: pdfPath, post: postPath, manifest: manifestPath, warnings };
}
