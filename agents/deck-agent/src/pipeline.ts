/** Rendering pipeline shared by the agent tools, the CLI scripts and tests. */
import fs from "node:fs";
import path from "node:path";
import { exportScale, FORMATS, pageName, type Brand } from "./config.js";
import { composeElementPreview, composePage } from "./compose.js";
import { listPages, pageContexts, readDoc, readElements } from "./document.js";
import { PREVIEW_SIZES } from "./elements/schema.js";
import type { ElementSpec } from "./elements/types.js";
import { LAYOUT_MAP, type DocMeta, type PageSpec } from "./layouts.js";
import { buildPdf } from "./render/pdf.js";
import { renderHtmlFile, renderHtmlString, renderRegions, type Diagnostics } from "./render/renderer.js";

export interface Job {
  dir: string;
  brand: Brand;
}

export function requireDoc(job: Job): DocMeta {
  const doc = readDoc(job.dir);
  if (!doc) throw new Error("Call setup_document first (format, theme, title).");
  return doc;
}

export interface PageRender {
  index: number;
  preview: Buffer;
  previewPath: string;
  diagnostics: Diagnostics;
  notes: string[];
  errors: string[];
}

function writeBuild(job: Job, name: string, html: string) {
  const p = path.join(job.dir, "build", `${name}.html`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
  return p;
}

const hasDataElement = (spec: PageSpec, elements: Record<string, ElementSpec>) =>
  Object.values(spec.slots ?? {}).some((v) =>
    [...String(v).matchAll(/(?:data-el="|<x-el[^>]*id=["']?|^)([a-z0-9][a-z0-9-]*)/g)].some((m) => {
      const e = elements[m[1]];
      return e && (e.kind === "chart" || e.kind === "table");
    }),
  );

/** Compose + render one page as a JPEG preview with layout diagnostics. */
export async function renderPagePreview(job: Job, index: number): Promise<PageRender> {
  const doc = requireDoc(job);
  const fmt = FORMATS[doc.format];
  const ctxs = pageContexts(job.dir, doc);
  const page = listPages(job.dir).find((p) => p.index === index);
  if (!page) throw new Error(`Page ${index} does not exist.`);
  const elements = readElements(job.dir);
  const c = composePage({ runDir: job.dir, doc, brand: job.brand, spec: page.spec, ctx: ctxs.get(index)!, elements });
  if (!c.html) return { index, preview: Buffer.alloc(0), previewPath: "", diagnostics: { errors: c.errors, warnings: [], wordCount: 0, titleLines: 0 }, notes: c.notes, errors: c.errors };
  const buildPath = writeBuild(job, pageName(index), c.html);
  const r = await renderHtmlFile(buildPath, {
    width: fmt.width,
    height: fmt.height,
    scale: fmt.previewScale,
    type: "jpeg",
    quality: 84,
    diagnose: { minFont: fmt.minFont, safe: fmt.safe, format: doc.format },
  });
  const d = r.diagnostics!;
  for (const mnt of r.mounts) for (const w of mnt.warnings) (w.startsWith("ERROR:") ? d.errors : d.warnings).push(`[${mnt.id}] ${w.replace(/^ERROR:\s*/, "")}`);
  const def = LAYOUT_MAP.get(page.spec.layout);
  if (def?.chrome === "full" && !page.spec.source && hasDataElement(page.spec, elements) && !(page.spec.slots?.exhibit_source))
    d.warnings.push("This page shows data but has no `source` line. Add the data origin (e.g. 'Company annual reports; team analysis').");
  if (doc.format === "deck" && def?.chrome === "full" && !page.spec.title && def.id !== "statement") d.warnings.push("No title: every content page needs an action title stating its message.");
  const previewPath = path.join(job.dir, "preview", `${pageName(index)}.jpg`);
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  fs.writeFileSync(previewPath, r.buffer);
  return { index, preview: r.buffer, previewPath, diagnostics: d, notes: c.notes, errors: c.errors };
}

/** Render one element on its own (theme applied) so it can be checked before placing it. */
export async function renderElementPreview(job: Job, spec: ElementSpec, size?: string): Promise<{ png: Buffer; path: string; warnings: string[]; errors: string[]; width: number; height: number }> {
  const doc = requireDoc(job);
  const sizes = PREVIEW_SIZES[doc.format] as Record<string, readonly [number, number]>;
  const fallback = spec.kind === "kpis" ? "strip" : "full";
  const [w, h] = sizes[size ?? fallback] ?? sizes[fallback] ?? sizes.full;
  const c = composeElementPreview({ runDir: job.dir, doc, brand: job.brand, spec, width: w, height: h });
  const buildPath = writeBuild(job, `el-${spec.id}`, c.html);
  const r = await renderHtmlFile(buildPath, { width: c.width, height: c.height, scale: 1, type: "png" });
  const out = path.join(job.dir, "preview", `el-${spec.id}.png`);
  fs.writeFileSync(out, r.buffer);
  const warnings = r.mounts.flatMap((m) => m.warnings);
  return { png: r.buffer, path: out, warnings: warnings.filter((x) => !x.startsWith("ERROR:")), errors: warnings.filter((x) => x.startsWith("ERROR:")).map((x) => x.slice(7)), width: w, height: h };
}

/** All page previews side by side to judge rhythm and consistency. */
export async function contactSheet(job: Job, opts: { cols?: number; tileWidth?: number } = {}): Promise<Buffer | null> {
  const doc = requireDoc(job);
  const fmt = FORMATS[doc.format];
  const pages = listPages(job.dir);
  const files = pages.map((p) => ({ i: p.index, f: path.join(job.dir, "preview", `${pageName(p.index)}.jpg`) })).filter((x) => fs.existsSync(x.f));
  if (!files.length) return null;
  const cols = opts.cols ?? (doc.format === "deck" ? Math.min(4, files.length) : Math.min(5, files.length));
  const tw = opts.tileWidth ?? (doc.format === "deck" ? 380 : 260);
  const th = Math.round((tw * fmt.height) / fmt.width);
  const gap = 18;
  const rows = Math.ceil(files.length / cols);
  const W = cols * tw + (cols + 1) * gap;
  const H = rows * (th + 26) + (rows + 1) * gap;
  const items = files
    .map((x) => `<figure style="margin:0"><img src="data:image/jpeg;base64,${fs.readFileSync(x.f).toString("base64")}" style="width:${tw}px;height:${th}px;display:block;box-shadow:0 1px 6px rgba(0,0,0,.25)"><figcaption style="font:500 14px system-ui;color:#444;padding-top:6px">${x.i}</figcaption></figure>`)
    .join("");
  const html = `<html><body style="margin:0;background:#e6e8ec"><div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:${gap}px;padding:${gap}px">${items}</div></body></html>`;
  return renderHtmlString(html, { width: W, height: H, type: "jpeg", quality: 80 });
}

export interface ExportResult {
  pdf: string;
  pngs: string[];
  exhibits: string[];
  storyline: string;
  manifest: string;
  warnings: string[];
  bytes: number;
}

/** Final export: page PNGs at EXPORT_DPI, exhibit PNGs, PDF with text layer + bookmarks, storyline.md, manifest.json. */
export async function exportDocument(job: Job, opts: { textLayer?: boolean; fileName?: string; onPage?: (i: number, n: number) => void } = {}): Promise<ExportResult> {
  const doc = requireDoc(job);
  const fmt = FORMATS[doc.format];
  const scale = exportScale();
  const pages = listPages(job.dir);
  if (!pages.length) throw new Error("No pages to export. Call write_page first.");
  const ctxs = pageContexts(job.dir, doc);
  const elements = readElements(job.dir);
  const textLayer = opts.textLayer ?? process.env.PDF_TEXT_LAYER !== "0";
  const pngs: string[] = [];
  const exhibits: string[] = [];
  const warnings: string[] = [];
  const pdfPages = [];
  fs.rmSync(path.join(job.dir, "exhibits"), { recursive: true, force: true });
  fs.mkdirSync(path.join(job.dir, "exhibits"), { recursive: true });
  fs.mkdirSync(path.join(job.dir, "png"), { recursive: true });
  let k = 0;
  for (const p of pages) {
    opts.onPage?.(++k, pages.length);
    const c = composePage({ runDir: job.dir, doc, brand: job.brand, spec: p.spec, ctx: ctxs.get(p.index)!, elements });
    if (!c.html) { warnings.push(`page ${p.index}: ${c.errors.join("; ")}`); continue; }
    for (const e of c.errors) warnings.push(`page ${p.index}: ${e}`);
    const name = pageName(p.index);
    const buildPath = writeBuild(job, name, c.html);
    const r = await renderHtmlFile(buildPath, {
      width: fmt.width,
      height: fmt.height,
      scale,
      type: "png",
      diagnose: { minFont: fmt.minFont, safe: fmt.safe, format: doc.format },
      extractText: textLayer,
    });
    for (const e of r.diagnostics!.errors) warnings.push(`page ${p.index}: ${e}`);
    for (const m of r.mounts) for (const w of m.warnings) if (w.startsWith("ERROR:")) warnings.push(`page ${p.index} [${m.id}]: ${w.slice(7)}`);
    const out = path.join(job.dir, "png", `${name}.png`);
    fs.writeFileSync(out, r.buffer);
    pngs.push(out);
    pdfPages.push({ png: r.buffer, cssWidth: fmt.width, cssHeight: fmt.height, text: r.text });
    if (r.boxes?.length) {
      const shots = await renderRegions(buildPath, { width: fmt.width, height: fmt.height, scale, regions: r.boxes });
      shots.forEach((buf, i) => {
        const f = path.join(job.dir, "exhibits", `${name}-${r.boxes![i].id}.png`);
        fs.writeFileSync(f, buf);
        exhibits.push(f);
      });
    }
  }
  const outline = pages
    .filter((p) => ["section", "chapter", "summary", "agenda", "contents", "executive-summary"].includes(p.spec.layout))
    .map((p) => ({ title: (p.spec.slots?.number ? `${p.spec.slots.number}  ` : "") + (p.spec.title || LAYOUT_MAP.get(p.spec.layout)!.label), page: pages.indexOf(p) }));
  const bytes = await buildPdf(pdfPages, {
    pageSize: fmt.pdf,
    title: doc.title,
    author: doc.author,
    subject: doc.subtitle,
    language: doc.language,
    outline: [{ title: doc.title, page: 0 }, ...outline],
    textLayer,
  });
  const pdfName = opts.fileName ?? `${doc.format === "deck" ? "presentation" : "report"}.pdf`;
  const pdfPath = path.join(job.dir, pdfName);
  fs.writeFileSync(pdfPath, bytes);

  const storyline = path.join(job.dir, "storyline.md");
  fs.writeFileSync(storyline, storylineMarkdown(doc, pages));
  const manifest = path.join(job.dir, "manifest.json");
  fs.writeFileSync(
    manifest,
    JSON.stringify(
      {
        title: doc.title,
        format: doc.format,
        theme: doc.theme,
        pages: pages.map((p) => ({ page: p.index, layout: p.spec.layout, title: p.spec.title ?? null, png: `png/${pageName(p.index)}.png` })),
        pdf: pdfName,
        exportScale: scale,
        pixelSize: [Math.round(fmt.width * scale), Math.round(fmt.height * scale)],
        textLayer,
        exported: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  return { pdf: pdfPath, pngs, exhibits, storyline, manifest, warnings, bytes: bytes.length };
}

/** The "title read-through": every page's action title in order, plus speaker notes. */
export function storylineMarkdown(doc: DocMeta, pages: { index: number; spec: PageSpec }[]): string {
  const lines = [`# ${doc.title}`, "", doc.subtitle ? `_${doc.subtitle}_\n` : "", `Format: ${FORMATS[doc.format].label} · Theme: ${doc.theme} · ${pages.length} pages`, "", "## Storyline (titles only)", ""];
  for (const p of pages) {
    const t = p.spec.title || p.spec.slots?.statement || p.spec.slots?.message || "";
    const pre = p.spec.layout === "section" || p.spec.layout === "chapter" ? `\n**${p.spec.slots?.number ? p.spec.slots.number + " " : ""}${t}**` : `${p.index}. ${t}`;
    lines.push(pre + ` _(${p.spec.layout})_`);
  }
  const notes = pages.filter((p) => p.spec.speaker_notes);
  if (notes.length) {
    lines.push("", "## Speaker notes", "");
    for (const p of notes) lines.push(`**Page ${p.index}: ${p.spec.title ?? p.spec.layout}**`, "", p.spec.speaker_notes!, "");
  }
  return lines.join("\n") + "\n";
}
