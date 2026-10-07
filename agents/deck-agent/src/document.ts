/** On-disk document state of a job: doc.json, pages/page-NN.json, elements/<id>.json. */
import fs from "node:fs";
import path from "node:path";
import { pageName } from "./config.js";
import type { ElementSpec } from "./elements/types.js";
import { LAYOUT_MAP, type DocMeta, type PageCtx, type PageSpec, type TocEntry } from "./layouts.js";

export const SUBDIRS = ["assets", "inputs", "elements", "pages", "build", "preview", "png", "exhibits"] as const;

export function initJobDir(dir: string) {
  for (const d of SUBDIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
}

const readJson = <T>(p: string): T | null => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
};
const writeJson = (p: string, v: unknown) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2));
};

export const readDoc = (dir: string) => readJson<DocMeta>(path.join(dir, "doc.json"));
export const writeDoc = (dir: string, doc: DocMeta) => writeJson(path.join(dir, "doc.json"), doc);

export function listPages(dir: string): { index: number; spec: PageSpec }[] {
  const pd = path.join(dir, "pages");
  if (!fs.existsSync(pd)) return [];
  return fs
    .readdirSync(pd)
    .map((f) => f.match(/^page-(\d+)\.json$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ index: Number(m[1]), spec: readJson<PageSpec>(path.join(pd, m[0]))! }))
    .filter((p) => p.spec)
    .sort((a, b) => a.index - b.index);
}

export const pagePath = (dir: string, index: number) => path.join(dir, "pages", `${pageName(index)}.json`);
export const readPage = (dir: string, index: number) => readJson<PageSpec>(pagePath(dir, index));
export const writePage = (dir: string, index: number, spec: PageSpec) => writeJson(pagePath(dir, index), spec);

function pageArtifacts(dir: string, index: number) {
  const n = pageName(index);
  return [`pages/${n}.json`, `build/${n}.html`, `preview/${n}.jpg`, `png/${n}.png`].map((p) => path.join(dir, p));
}

/** Rename page files so pages are numbered 1…N in the given order. */
function renumber(dir: string, order: number[]) {
  const tmp = order.map((idx, i) => {
    const t = path.join(dir, "pages", `tmp-${i}.json`);
    fs.renameSync(pagePath(dir, idx), t);
    for (const p of pageArtifacts(dir, idx).slice(1)) fs.rmSync(p, { force: true });
    return t;
  });
  tmp.forEach((t, i) => fs.renameSync(t, pagePath(dir, i + 1)));
}

export function removePage(dir: string, index: number) {
  const pages = listPages(dir);
  if (!pages.some((p) => p.index === index)) throw new Error(`Page ${index} does not exist.`);
  for (const p of pageArtifacts(dir, index)) fs.rmSync(p, { force: true });
  renumber(dir, pages.filter((p) => p.index !== index).map((p) => p.index));
}

export function movePage(dir: string, from: number, to: number) {
  const order = listPages(dir).map((p) => p.index);
  const i = order.indexOf(from);
  if (i < 0) throw new Error(`Page ${from} does not exist.`);
  order.splice(i, 1);
  order.splice(Math.max(0, Math.min(order.length, to - 1)), 0, from);
  renumber(dir, order);
}

/** Insert an empty slot at `at` by shifting later pages up by one. */
export function insertGap(dir: string, at: number) {
  const pages = listPages(dir).filter((p) => p.index >= at).sort((a, b) => b.index - a.index);
  for (const p of pages) {
    fs.renameSync(pagePath(dir, p.index), pagePath(dir, p.index + 1));
    for (const a of pageArtifacts(dir, p.index).slice(1)) fs.rmSync(a, { force: true });
  }
}

export function readElements(dir: string): Record<string, ElementSpec> {
  const ed = path.join(dir, "elements");
  const out: Record<string, ElementSpec> = {};
  if (!fs.existsSync(ed)) return out;
  for (const f of fs.readdirSync(ed)) {
    if (!f.endsWith(".json")) continue;
    const spec = readJson<ElementSpec>(path.join(ed, f));
    if (spec) out[spec.id] = spec;
  }
  return out;
}

export const writeElement = (dir: string, spec: ElementSpec) => writeJson(path.join(dir, "elements", `${spec.id}.json`), spec);

const hasExhibit = (format: string, p: PageSpec) =>
  format === "report" &&
  (p.layout === "exhibit-page" || (p.layout === "exhibit" && !!(p.slots?.element || p.slots?.exhibit)) || (p.layout === "article" && !!p.slots?.exhibit));

/** Per-page context: page numbers, current section/chapter, exhibit numbers, table of contents. */
export function pageContexts(dir: string, doc: DocMeta): Map<number, PageCtx> {
  const pages = listPages(dir);
  const toc: TocEntry[] = [];
  let chapterN = 0;
  for (const p of pages) {
    if (p.spec.layout === "summary") toc.push({ n: "", title: p.spec.title || "Executive summary", page: p.index });
    if (p.spec.layout === "chapter") {
      chapterN++;
      const n = p.spec.slots?.number || String(chapterN);
      toc.push({ n: n.padStart(2, "0"), title: p.spec.title ?? "", page: p.index });
    }
    if (p.spec.layout === "article" && p.spec.title) toc.push({ n: "", title: p.spec.title, page: p.index, minor: true });
    if (p.spec.layout === "section" && doc.format === "deck") toc.push({ n: p.spec.slots?.number ?? "", title: p.spec.title ?? "", page: p.index });
  }
  const map = new Map<number, PageCtx>();
  let section = "";
  let chapter = "";
  let exhibit = 0;
  for (const p of pages) {
    if (p.spec.layout === "section") section = p.spec.slots?.tracker || p.spec.title || "";
    if (p.spec.layout === "chapter") chapter = p.spec.title || "";
    if (p.spec.layout === "summary") chapter = p.spec.title || "Executive summary";
    const ex = hasExhibit(doc.format, p.spec) ? ++exhibit : undefined;
    map.set(p.index, {
      format: doc.format,
      theme: doc.theme,
      doc,
      pageNo: p.index,
      total: pages.length,
      section: p.spec.tracker ?? (LAYOUT_MAP.get(p.spec.layout)?.chrome === "full" ? section : ""),
      chapter,
      exhibitNo: ex,
      toc,
    });
  }
  return map;
}
