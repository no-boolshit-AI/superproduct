/** Assemble complete, self-contained HTML documents for pages and element previews. */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FORMATS, type Brand, type FormatId } from "./config.js";
import { iconCss } from "./design/icons.js";
import { runtimeScript } from "./elements/bundle.js";
import type { ElementSpec } from "./elements/types.js";
import { escapeHtml, line, sanitize } from "./html.js";
import { LAYOUT_MAP, type DocMeta, type PageCtx, type PageSpec } from "./layouts.js";
import { baseCss, brandCss, fontCss, themeCss, type ThemeId } from "./themes.js";

export interface ComposeResult {
  html: string;
  notes: string[];
  errors: string[];
  elementIds: string[];
}

function head(runDir: string, format: FormatId, theme: ThemeId, brand: Brand, lang: string, w: number, h: number) {
  const base = pathToFileURL(runDir.endsWith(path.sep) ? runDir : runDir + path.sep).href;
  return `<!doctype html>
<html lang="${escapeHtml(lang || "en")}">
<head>
<meta charset="utf-8">
<base href="${base}">
<style>${fontCss(theme, brand)}</style>
<style>${baseCss()}</style>
<style>${themeCss(theme)}</style>
<style>${iconCss()}</style>
<style>${brandCss(brand, theme)}</style>
<style>html,body{width:${w}px;height:${h}px;overflow:hidden}</style>
</head>`;
}

function scripts(elements: Record<string, ElementSpec>, ids: string[]) {
  const used: Record<string, ElementSpec> = {};
  for (const id of ids) if (elements[id]) used[id] = elements[id];
  const json = JSON.stringify(used).replace(/</g, "\\u003c");
  return `<script>window.__ELEMENTS=${json};</script>\n<script>${runtimeScript()}</script>`;
}

const elementIdsIn = (html: string) => [...new Set([...html.matchAll(/data-el="([a-z0-9-]+)"/g)].map((m) => m[1]))];

/** Collect sanitiser notes from every slot so the agent learns what was stripped. */
function sanitizeSlots(spec: PageSpec): { spec: PageSpec; notes: string[] } {
  const notes: string[] = [];
  const slots: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec.slots ?? {})) {
    const val = typeof v === "string" ? v : String(v ?? "");
    const r = /<[a-z]/i.test(val) ? sanitize(val) : { html: val, notes: [] };
    for (const n of r.notes) notes.push(`${k}: ${n}`);
    slots[k] = r.html;
  }
  return { spec: { ...spec, slots }, notes };
}

export function composePage(opts: {
  runDir: string;
  doc: DocMeta;
  brand: Brand;
  spec: PageSpec;
  ctx: PageCtx;
  elements: Record<string, ElementSpec>;
}): ComposeResult {
  const { runDir, doc, brand, ctx } = opts;
  const errors: string[] = [];
  const { spec, notes } = sanitizeSlots(opts.spec);
  const def = LAYOUT_MAP.get(spec.layout);
  const fmt = FORMATS[doc.format];
  if (!def) {
    errors.push(`Unknown layout "${spec.layout}".`);
    return { html: "", notes, errors, elementIds: [] };
  }
  if (!def.formats.includes(doc.format)) errors.push(`Layout "${def.id}" is not available for the ${doc.format} format.`);
  for (const k of def.required ?? []) if (!spec.slots?.[k]?.trim()) errors.push(`Layout "${def.id}" needs the slot \`${k}\`.`);
  const unknown = Object.keys(spec.slots ?? {}).filter((k) => !(k in def.slots));
  if (unknown.length) notes.push(`Ignored unknown slot(s) for ${def.id}: ${unknown.join(", ")}. Valid: ${Object.keys(def.slots).join(", ")}.`);

  const r = def.render(spec, ctx);
  const inverse = def.inverseIn?.includes(doc.theme) || r.cls?.includes("inverse");
  const cls = ["page", `page--${doc.format}`, `L-${def.id}`, ...(inverse ? ["inverse"] : []), ...(r.cls ?? []).filter((c) => c !== "inverse")];

  const notesHtml = [
    ...(spec.notes ?? []).map((n, i) => `<p><sup>${i + 1}</sup> ${line(n)}</p>`),
    spec.source ? `<p class="src"><b>Source:</b> ${line(spec.source)}</p>` : "",
  ].join("");
  const showNum = def.chrome !== "none";
  let chromeHead = "";
  let chromeFoot = "";
  if (doc.format === "deck") {
    if (def.chrome === "full") {
      chromeHead = `<header class="pg-head"><div class="tracker">${line(ctx.section)}</div>${spec.title ? `<h1 class="pg-title">${line(spec.title)}</h1>` : ""}${spec.subtitle ? `<p class="pg-subtitle">${line(spec.subtitle)}</p>` : ""}</header>`;
    }
    if (def.chrome !== "none") chromeFoot = `<footer class="pg-foot"><div class="pg-notes">${notesHtml}</div><div class="wordmark"></div>${showNum ? `<div class="pg-num">${ctx.pageNo}</div>` : ""}</footer>`;
  } else {
    if (def.chrome === "full") {
      const running = doc.running_title || doc.title;
      chromeHead = `<div class="rp-head"><span>${line(running)}</span><span>${line(ctx.chapter)}</span></div>${spec.title && def.id !== "exhibit-page" ? `<header class="pg-head" style="margin-bottom:${def.id === "article" ? 14 : 20}px"><h1 class="pg-title">${line(spec.title)}</h1>${spec.subtitle ? `<p class="pg-subtitle">${line(spec.subtitle)}</p>` : ""}</header>` : ""}`;
    }
    if (def.chrome !== "none")
      chromeFoot = `<footer class="rp-foot"><div class="pg-notes">${def.id === "exhibit-page" ? (spec.notes ?? []).map((n, i) => `<p><sup>${i + 1}</sup> ${line(n)}</p>`).join("") : notesHtml}</div><div class="pg-num">${ctx.pageNo}</div></footer>`;
  }

  const pageHtml = `<div class="${cls.join(" ")}" data-format="${doc.format}" data-theme="${doc.theme}" data-layout="${def.id}">
${r.decor ? '<div class="decor"></div>' : ""}${r.before ?? ""}
${chromeHead}
<main class="pg-body">
${r.body}
</main>
${chromeFoot}
</div>`;
  const elementIds = elementIdsIn(pageHtml);
  for (const id of elementIds) if (!opts.elements[id]) errors.push(`Element "${id}" does not exist yet.`);
  const html = `${head(runDir, doc.format, doc.theme, brand, doc.language ?? "en", fmt.width, fmt.height)}
<body>
${pageHtml}
${scripts(opts.elements, elementIds)}
</body>
</html>`;
  return { html, notes, errors, elementIds };
}

/** A single element on a small canvas with the document's theme, for the element tools' preview. */
export function composeElementPreview(opts: {
  runDir: string;
  doc: Pick<DocMeta, "format" | "theme" | "language">;
  brand: Brand;
  spec: ElementSpec;
  width: number;
  height: number;
}): { html: string; width: number; height: number } {
  const pad = 24;
  const W = opts.width + pad * 2, H = opts.height + pad * 2;
  const pageHtml = `<div class="page page--${opts.doc.format} el-preview" data-format="${opts.doc.format}" data-theme="${opts.doc.theme}" style="--w:${W}px;--h:${H}px;padding:${pad}px">
<div class="el" data-el="${opts.spec.id}" style="width:${opts.width}px;height:${opts.height}px"></div>
</div>`;
  return {
    html: `${head(opts.runDir, opts.doc.format, opts.doc.theme, opts.brand, opts.doc.language ?? "en", W, H)}
<body>
${pageHtml}
${scripts({ [opts.spec.id]: opts.spec }, [opts.spec.id])}
</body>
</html>`,
    width: W,
    height: H,
  };
}
