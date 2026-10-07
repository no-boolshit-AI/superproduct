/** The agent's tools: an in-process SDK MCP server named "deck". */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { FORMATS, isFormat, pageName, type FormatId } from "./config.js";
import { loadTables, summarize } from "./data.js";
import { insertGap, listPages, movePage, readDoc, readElements, removePage, writeDoc, writeElement, writePage } from "./document.js";
import { chartShape, diagramShape, kpiShape, previewSize, tableShape } from "./elements/schema.js";
import type { ElementSpec } from "./elements/types.js";
import type { Emit } from "./events.js";
import { generateImage, imagesEnabled, isMockMode } from "./images.js";
import { LAYOUT_MAP, layoutCatalog, type DocMeta, type PageSpec } from "./layouts.js";
import { contactSheet, exportDocument, renderElementPreview, renderPagePreview, requireDoc, storylineMarkdown, type Job } from "./pipeline.js";
import { thumbnail } from "./render/renderer.js";
import { isTheme, THEME_IDS, THEMES, type ThemeId } from "./themes.js";

export const SERVER_NAME = "deck";
const BASE_TOOLS = [
  "setup_document",
  "plan_storyline",
  "inspect_data",
  "create_chart",
  "create_diagram",
  "create_table",
  "create_kpis",
  "write_page",
  "view_page",
  "remove_page",
  "move_page",
  "review_document",
  "export_document",
];
export const toolNames = () => [...BASE_TOOLS, ...(imagesEnabled() ? ["generate_image"] : [])].map((t) => `mcp__${SERVER_NAME}__${t}`);

export interface ToolContext {
  job: Job;
  forced: { format?: FormatId; theme?: ThemeId };
  emit: Emit;
  maxImages: number;
  stats: { images: number; exported: boolean };
}

const text = (t: string) => ({ type: "text" as const, text: t });
const jpeg = (b: Buffer) => ({ type: "image" as const, data: b.toString("base64"), mimeType: "image/jpeg" });
const png = (b: Buffer) => ({ type: "image" as const, data: b.toString("base64"), mimeType: "image/png" });
const fail = (err: unknown) => ({ content: [text(`ERROR: ${(err as Error).message}`)], isError: true });

const NON_ACTION = new Set(["cover", "section", "agenda", "contents", "closing", "back-cover", "chapter", "statement", "numbers", "summary"]);

function lintTitles(format: FormatId, pages: { layout: string; title?: string }[]): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  pages.forEach((p, i) => {
    const n = i + 1;
    const def = LAYOUT_MAP.get(p.layout);
    if (!def) out.push(`p${n}: unknown layout "${p.layout}".`);
    else if (!def.formats.includes(format)) out.push(`p${n}: layout "${p.layout}" is not available for ${format}.`);
    const t = (p.title ?? "").trim();
    if (!t) { if (!NON_ACTION.has(p.layout) && p.layout !== "cover") out.push(`p${n}: no title.`); return; }
    const words = t.split(/\s+/).length;
    if (!NON_ACTION.has(p.layout) && words < 5) out.push(`p${n}: "${t}" reads like a topic label. Action titles state the takeaway as a sentence.`);
    if (format === "deck" && t.length > 125) out.push(`p${n}: title is ${t.length} characters; it will run past 2 lines (aim ≤ 110).`);
    if (/\.$/.test(t) && !/\.\.\.$/.test(t)) out.push(`p${n}: drop the full stop at the end of the title.`);
    const key = t.toLowerCase();
    if (seen.has(key)) out.push(`p${n}: same title as p${seen.get(key)}.`);
    seen.set(key, n);
  });
  return out;
}

async function elementReply(ctx: ToolContext, spec: ElementSpec, size?: string) {
  writeElement(ctx.job.dir, spec);
  const r = await renderElementPreview(ctx.job, spec, size);
  ctx.emit({ type: "element", id: spec.id, path: path.relative(ctx.job.dir, r.path) });
  const used = listPages(ctx.job.dir).filter((p) => JSON.stringify(p.spec.slots ?? {}).includes(spec.id)).map((p) => p.index);
  const lines = [
    `Saved element "${spec.id}" (${spec.kind}${"type" in spec ? `/${spec.type}` : ""}). Preview rendered at ${r.width}×${r.height}px; on a page it re-fits to its slot automatically.`,
    ...r.errors.map((e) => `ERROR: ${e}`),
    ...r.warnings.map((w) => `WARNING: ${w}`),
    used.length ? `Used on page(s) ${used.join(", ")}: call write_page again for those pages (or review_document) to refresh their previews.` : `Place it with the slot value "${spec.id}" (element slots) or <x-el id="${spec.id}"></x-el> inside HTML slots.`,
  ];
  return { content: [text(lines.join("\n")), png(r.png)], isError: r.errors.length > 0 };
}

export function buildTools(ctx: ToolContext) {
  const { job } = ctx;

  const setupDocument = tool(
    "setup_document",
    "First call. Choose the page format and visual theme and set the document metadata. Can be called again to change the theme (pages re-render on review/export). Returns the layout catalogue for the chosen format.",
    {
      format: z.enum(["deck", "report"]).describe("deck = 16:9 presentation pages (1280×720 canvas). report = A4 portrait document pages (794×1123 canvas)."),
      theme: z.enum(THEME_IDS as [ThemeId, ...ThemeId[]]).describe(THEME_IDS.map((t) => `${t}: ${THEMES[t].bestFor}`).join(" | ")),
      title: z.string().min(3).describe("Document title (cover)"),
      subtitle: z.string().optional(),
      client: z.string().optional().describe("Client / audience / occasion shown as the cover kicker"),
      author: z.string().optional(),
      date: z.string().optional().describe("e.g. 'October 2026'"),
      confidentiality: z.string().optional().describe("Confidentiality notice (defaults to the brand's)"),
      language: z.string().optional().describe("BCP-47 code of the document language, e.g. 'en', 'de', 'ro'"),
      running_title: z.string().optional().describe("Report: short title for the running header"),
    },
    async (a) => {
      try {
        const notes: string[] = [];
        let format: FormatId = a.format;
        let theme: ThemeId = a.theme;
        if (ctx.forced.format && ctx.forced.format !== format) { notes.push(`The user fixed the format to "${ctx.forced.format}"; using it instead of "${format}".`); format = ctx.forced.format; }
        if (ctx.forced.theme && ctx.forced.theme !== theme) { notes.push(`The user fixed the theme to "${ctx.forced.theme}"; using it instead of "${theme}".`); theme = ctx.forced.theme; }
        const prev = readDoc(job.dir);
        if (prev && prev.format !== format && listPages(job.dir).length) notes.push(`Format changed from ${prev.format} to ${format}: existing pages were laid out for ${prev.format}; rewrite them with layouts for ${format}.`);
        const doc: DocMeta = {
          format,
          theme,
          title: a.title,
          subtitle: a.subtitle,
          client: a.client,
          author: a.author,
          date: a.date,
          confidentiality: a.confidentiality ?? job.brand.confidentiality,
          language: a.language ?? "en",
          running_title: a.running_title,
        };
        writeDoc(job.dir, doc);
        ctx.emit({ type: "status", message: `Document: ${FORMATS[format].label}, theme ${THEMES[theme].label}` });
        const f = FORMATS[format];
        return {
          content: [
            text(
              [
                ...notes.map((n) => `NOTE: ${n}`),
                `Document set up: ${f.label}, canvas ${f.width}×${f.height}px, theme "${theme}" (${THEMES[theme].label}).`,
                `Theme guidance: ${THEMES[theme].guidance}`,
                `Minimum font size ${f.minFont}px. Element preview sizes: ${format === "deck" ? "full 1168×440, wide 1168×300, two-thirds 720×440, half 560×400, third 360×320, strip 1168×150" : "full 662×380, tall 662×620, half 316×300, strip 662×130"}.`,
                "",
                `Layouts for ${format}:`,
                layoutCatalog(format),
              ].join("\n"),
            ),
          ],
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const planStoryline = tool(
    "plan_storyline",
    "Write the storyline (ghost deck) before building pages: one entry per page with its layout and action title. Returns a title-only read-through and lint (topic labels instead of messages, overlong titles, wrong layouts). Call again to revise.",
    {
      pages: z
        .array(z.object({ layout: z.string(), title: z.string().optional(), message: z.string().optional().describe("What the page proves / which element supports the title") }))
        .min(1),
      governing_thought: z.string().optional().describe("The single answer the whole document argues (top of the pyramid)"),
    },
    async ({ pages, governing_thought }) => {
      try {
        const doc = requireDoc(job);
        const issues = lintTitles(doc.format, pages);
        const md = [
          `# Storyline plan: ${doc.title}`,
          governing_thought ? `\n**Governing thought:** ${governing_thought}\n` : "",
          ...pages.map((p, i) => `${i + 1}. [${p.layout}] ${p.title ?? ""}${p.message ? `\n   - ${p.message}` : ""}`),
        ].join("\n");
        fs.writeFileSync(path.join(job.dir, "storyline-plan.md"), md + "\n");
        fs.writeFileSync(path.join(job.dir, "storyline-plan.json"), JSON.stringify({ governing_thought, pages }, null, 2));
        ctx.emit({ type: "status", message: `Storyline: ${pages.length} pages planned` });
        const readThrough = pages.filter((p) => p.title && !["cover", "agenda", "contents", "back-cover"].includes(p.layout)).map((p) => `  ${p.title}`).join("\n");
        return {
          content: [
            text(
              [
                `Saved storyline-plan.md (${pages.length} pages).`,
                "",
                "Title read-through (does it tell the whole story on its own? does each title follow from the previous one?):",
                readThrough,
                "",
                issues.length ? `Issues:\n${issues.map((i) => `- ${i}`).join("\n")}` : "No issues found.",
              ].join("\n"),
            ),
          ],
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const inspectData = tool(
    "inspect_data",
    "Read a data file the user supplied (CSV, TSV, JSON or XLSX, in inputs/) and get column summaries plus the first rows as a table. Use the exact numbers in charts; never invent data.",
    {
      path: z.string().describe("Path relative to the job folder, e.g. inputs/sales.xlsx"),
      sheet: z.string().optional().describe("XLSX sheet name (default: all sheets)"),
      max_rows: z.number().int().min(1).max(500).optional(),
    },
    async (a) => {
      try {
        const abs = path.resolve(job.dir, a.path);
        const rel = path.relative(job.dir, abs);
        if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Only files inside the job folder can be read.");
        if (!fs.existsSync(abs)) throw new Error(`File not found: ${a.path}. Available: ${fs.readdirSync(path.join(job.dir, "inputs")).join(", ") || "none"}`);
        const tables = await loadTables(abs, a.sheet);
        return { content: [text(tables.map((t) => summarize(t, a.max_rows ?? 40)).join("\n\n"))] };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const createChart = tool(
    "create_chart",
    "Create or update a chart element (SVG + HTML, themed, fitted to its page slot at render time). Returns a PNG preview and QA warnings. Data must come from the brief or data files.",
    { ...chartShape, preview_size: previewSize },
    async ({ preview_size, ...a }) => {
      try {
        return await elementReply(ctx, { kind: "chart", ...a } as ElementSpec, preview_size);
      } catch (err) {
        return fail(err);
      }
    },
  );

  const createDiagram = tool(
    "create_diagram",
    "Create or update a diagram element: process, timeline, roadmap (Gantt), matrix (2×2), pyramid, funnel, tree (issue/driver tree) or cycle. Returns a PNG preview and QA warnings.",
    { ...diagramShape, preview_size: previewSize },
    async ({ preview_size, ...a }) => {
      try {
        return await elementReply(ctx, { kind: "diagram", ...a } as ElementSpec, preview_size);
      } catch (err) {
        return fail(err);
      }
    },
  );

  const createTable = tool(
    "create_table",
    "Create or update a table element (consulting style: hairlines, right-aligned numbers, optional Harvey balls, RAG dots, checkmarks, inline bars, deltas, total rows). Returns a PNG preview.",
    { ...tableShape, preview_size: previewSize },
    async ({ preview_size, ...a }) => {
      try {
        return await elementReply(ctx, { kind: "table", ...a } as ElementSpec, preview_size);
      } catch (err) {
        return fail(err);
      }
    },
  );

  const createKpis = tool(
    "create_kpis",
    "Create or update a row/grid of KPI tiles (headline figure, label, delta, note, optional sparkline). Returns a PNG preview.",
    { ...kpiShape, preview_size: previewSize },
    async ({ preview_size, ...a }) => {
      try {
        return await elementReply(ctx, { kind: "kpis", ...a } as ElementSpec, preview_size ?? "strip");
      } catch (err) {
        return fail(err);
      }
    },
  );

  const writePageTool = tool(
    "write_page",
    "Create or overwrite page N with a layout and its slots. Chrome (tracker, page number, sources, running header, exhibit numbers) is added automatically. Returns the rendered page and layout diagnostics; fix every ERROR and re-call for the same index.",
    {
      index: z.number().int().min(1).max(120).describe("1-based page number"),
      insert: z.boolean().optional().describe("true = insert before the existing page N (later pages shift by one) instead of overwriting"),
      layout: z.string().describe("Layout id from the catalogue (setup_document lists them)"),
      title: z.string().optional().describe("Deck: the action title (full-sentence takeaway, ≤ 2 lines). Report: the page heading. Section/chapter: its name."),
      subtitle: z.string().optional().describe("Unit line / sub-heading under the title, e.g. 'Revenue by segment, EUR m, 2021–25'"),
      tracker: z.string().optional().describe("Override the tracker label (deck), default = current section"),
      slots: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}).describe("Layout slots. Text accepts light markdown (**bold**, - bullets, 1. lists, ### subhead, ==highlight==) or HTML using the component classes; elements via their id or <x-el id=…>."),
      source: z.string().optional().describe("Source line for the page's data, e.g. 'Eurostat; company reports; team analysis'"),
      notes: z.array(z.string()).optional().describe("Numbered footnotes (reference them with ^1^ in text)"),
      speaker_notes: z.string().optional().describe("What the presenter says; exported to storyline.md"),
    },
    async (a) => {
      try {
        const doc = requireDoc(job);
        const def = LAYOUT_MAP.get(a.layout);
        if (!def) throw new Error(`Unknown layout "${a.layout}". Valid for ${doc.format}: ${[...LAYOUT_MAP.values()].filter((l) => l.formats.includes(doc.format)).map((l) => l.id).join(", ")}`);
        const pages = listPages(job.dir);
        const max = pages.length ? Math.max(...pages.map((p) => p.index)) : 0;
        if (a.index > max + 1) throw new Error(`Page ${a.index} would leave a gap: the document has ${max} page(s). Use index ${max + 1}.`);
        if (a.insert && a.index <= max) insertGap(job.dir, a.index);
        const slots = Object.fromEntries(Object.entries(a.slots ?? {}).map(([k, v]) => [k, String(v)]));
        const spec: PageSpec = { layout: a.layout, title: a.title, subtitle: a.subtitle, tracker: a.tracker, slots, source: a.source, notes: a.notes, speaker_notes: a.speaker_notes };
        writePage(job.dir, a.index, spec);
        const r = await renderPagePreview(job, a.index);
        ctx.emit({ type: "page", index: a.index, path: path.relative(job.dir, r.previewPath), layout: a.layout, title: a.title ?? "" });
        const d = r.diagnostics;
        const lines = [
          `Page ${a.index} (${a.layout}) rendered: ${d.wordCount} words${d.titleLines ? `, title ${d.titleLines} line(s)` : ""}.`,
          ...r.notes.map((n) => `NOTE: ${n}`),
          ...r.errors.map((e) => `ERROR: ${e}`),
          ...d.errors.map((e) => `ERROR: ${e}`),
          ...d.warnings.map((w) => `WARNING: ${w}`),
          r.errors.length + d.errors.length ? "Fix the errors and call write_page again for this index." : "No layout errors. Look at the image: hierarchy, alignment, line breaks, emptiness, does the body prove the title?",
        ];
        return { content: [text(lines.join("\n")), ...(r.preview.length ? [jpeg(r.preview)] : [])] };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const viewPage = tool(
    "view_page",
    "Re-render page N with the current state (page numbers, trackers and exhibit numbers can change as pages are added) and show it again.",
    { index: z.number().int().min(1) },
    async ({ index }) => {
      try {
        const r = await renderPagePreview(job, index);
        const d = r.diagnostics;
        return { content: [text([`Page ${index}.`, ...r.errors.map((e) => `ERROR: ${e}`), ...d.errors.map((e) => `ERROR: ${e}`), ...d.warnings.map((w) => `WARNING: ${w}`)].join("\n")), jpeg(r.preview)] };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const removePageTool = tool(
    "remove_page",
    "Delete page N. Later pages move up (renumbered 1…N without gaps).",
    { index: z.number().int().min(1) },
    async ({ index }) => {
      try {
        removePage(job.dir, index);
        return { content: [text(`Removed page ${index}. Pages now: ${listPages(job.dir).map((p) => `${p.index}:${p.spec.layout}`).join(", ") || "none"}`)] };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const movePageTool = tool(
    "move_page",
    "Move page `from` to position `to` (others shift).",
    { from: z.number().int().min(1), to: z.number().int().min(1) },
    async ({ from, to }) => {
      try {
        movePage(job.dir, from, to);
        return { content: [text(`Moved. Order now: ${listPages(job.dir).map((p) => `${p.index}:${p.spec.layout}${p.spec.title ? ` "${p.spec.title.slice(0, 40)}"` : ""}`).join(" | ")}`)] };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const review = tool(
    "review_document",
    "Re-render every page and return a contact sheet, the title read-through and all open issues. Use it before exporting to check rhythm and consistency (margins, title lengths, chart colours, units, sources) and the storyline.",
    {},
    async () => {
      try {
        const doc = requireDoc(job);
        const pages = listPages(job.dir);
        if (!pages.length) return { content: [text("No pages yet.")] };
        const issues: string[] = [];
        for (const p of pages) {
          const r = await renderPagePreview(job, p.index);
          for (const e of [...r.errors, ...r.diagnostics.errors]) issues.push(`p${p.index} ERROR: ${e}`);
          for (const w of r.diagnostics.warnings) issues.push(`p${p.index} WARNING: ${w}`);
        }
        issues.push(...lintTitles(doc.format, pages.map((p) => p.spec)).map((i) => `lint: ${i}`));
        const elements = readElements(job.dir);
        const usedEls = new Set(pages.flatMap((p) => [...JSON.stringify(p.spec.slots ?? {}).matchAll(/[a-z0-9][a-z0-9-]*/g)].map((m) => m[0])));
        const unused = Object.keys(elements).filter((id) => !usedEls.has(id));
        if (unused.length) issues.push(`Unused elements (fine if intentional): ${unused.join(", ")}`);
        const sheet = await contactSheet(job);
        fs.writeFileSync(path.join(job.dir, "storyline.md"), storylineMarkdown(doc, pages));
        ctx.emit({ type: "review", pages: pages.length, issues: issues.length });
        return {
          content: [
            text(
              [
                `${pages.length} pages, ${FORMATS[doc.format].label}, theme ${doc.theme}.`,
                "",
                "Title read-through:",
                ...pages.map((p) => `${String(p.index).padStart(2)}. [${p.spec.layout}] ${p.spec.title ?? p.spec.slots?.statement ?? ""}`),
                "",
                issues.length ? `Open issues (${issues.length}):\n${issues.join("\n")}` : "No open issues.",
              ].join("\n"),
            ),
            ...(sheet ? [jpeg(sheet)] : []),
          ],
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const exportTool = tool(
    "export_document",
    "Final step. Renders every page as a high-resolution PNG, saves each element as an exhibit PNG, and builds the PDF (with a hidden text layer and bookmarks) plus storyline.md and manifest.json.",
    { file_name: z.string().regex(/^[\w.-]+\.pdf$/).optional().describe("PDF file name, default presentation.pdf / report.pdf") },
    async ({ file_name }) => {
      try {
        ctx.emit({ type: "status", message: "Exporting PNGs and PDF" });
        const r = await exportDocument(job, { fileName: file_name, onPage: (i, n) => ctx.emit({ type: "status", message: `Rendering page ${i}/${n} at export resolution` }) });
        ctx.stats.exported = true;
        const rel = (p: string) => path.relative(job.dir, p);
        ctx.emit({ type: "export", pdf: rel(r.pdf), pages: r.pngs.map(rel) });
        return {
          content: [
            text(
              [
                `PDF: ${rel(r.pdf)} (${(r.bytes / 1e6).toFixed(1)} MB, ${r.pngs.length} pages).`,
                `Page PNGs: png/ (${r.pngs.length}). Exhibit PNGs: exhibits/ (${r.exhibits.length}). Storyline: ${rel(r.storyline)}.`,
                ...r.warnings.map((w) => `WARNING: ${w}`),
              ].join("\n"),
            ),
          ],
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [setupDocument, planStoryline, inspectData, createChart, createDiagram, createTable, createKpis, writePageTool, viewPage, removePageTool, movePageTool, review, exportTool];

  if (imagesEnabled()) {
    const generate = tool(
      "generate_image",
      `Generate one image with OpenAI (${isMockMode() ? "MOCK placeholder mode" : process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare"}) into assets/. Raw material only: photos, abstract backgrounds, illustrations. Never text, numbers, charts or logos (those are HTML). Max ${ctx.maxImages} per document.`,
      {
        name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/).describe("File stem, e.g. 'cover-city'"),
        prompt: z.string().min(10).describe("Subject and composition only, e.g. 'Warehouse aisle with autonomous carts, seen from eye level, empty space on the left'"),
        style: z.enum(["photo", "abstract", "illustration", "texture", "cutout", "raw"]).default("photo"),
        aspect: z.enum(["landscape", "portrait", "square", "wide", "tall"]).default("landscape").describe("deck cover image (right 44%): portrait; image-text half page: portrait; report cover band / chapter band: wide"),
        quality: z.enum(["medium", "high"]).optional(),
      },
      async (a) => {
        try {
          if (ctx.stats.images >= ctx.maxImages) throw new Error(`Image budget reached (${ctx.maxImages}). Reuse existing images in assets/.`);
          const doc = requireDoc(job);
          const r = await generateImage(a, job.dir, doc.theme, job.brand);
          if (!r.cached) ctx.stats.images++;
          ctx.emit({ type: "image", path: r.file });
          const thumb = await thumbnail(r.abs, 420);
          return { content: [text(`Saved ${r.file} (${r.size}, ${r.model}${r.cached ? ", cached" : ""}${r.mock ? ", placeholder art" : ""}). Use it as the slot value "${r.file}" (image slots) or <img src="${r.file}">.`), jpeg(thumb)] };
        } catch (err) {
          return fail(err);
        }
      },
    );
    tools.push(generate);
  }
  return tools;
}

export function createDeckServer(ctx: ToolContext) {
  return createSdkMcpServer({ name: SERVER_NAME, version: "0.1.0", tools: buildTools(ctx) });
}

export const isFormatOrAuto = (s: unknown): s is FormatId | "auto" => s === "auto" || isFormat(s);
export const isThemeOrAuto = (s: unknown): s is ThemeId | "auto" => s === "auto" || isTheme(s);
export { pageName };
