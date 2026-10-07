import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import type { MountResult } from "../elements/types.js";

let browserPromise: Promise<Browser> | null = null;

const ARGS = ["--disable-background-networking", "--disable-component-update", "--no-pings", "--disable-features=Translate,OptimizationHints,MediaRouter,AutofillServerCommunication"];

async function launch(): Promise<Browser> {
  const attempts: { label: string; run: () => Promise<Browser> }[] = [];
  if (process.env.CHROMIUM_PATH?.trim()) attempts.push({ label: "CHROMIUM_PATH", run: () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH!.trim(), args: ARGS }) });
  attempts.push({ label: "Playwright Chromium", run: () => chromium.launch({ args: ARGS }) });
  attempts.push({ label: "installed Google Chrome", run: () => chromium.launch({ channel: "chrome", args: ARGS }) });
  if (fs.existsSync("/opt/pw-browsers/chromium")) attempts.push({ label: "/opt/pw-browsers/chromium", run: () => chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ARGS }) });
  const errors: string[] = [];
  for (const a of attempts) {
    try {
      return await a.run();
    } catch (err) {
      errors.push(`${a.label}: ${(err as Error).message.split("\n")[0]}`);
    }
  }
  throw new Error(`Could not start a browser. Run "npm run setup" (installs Chromium) or set CHROMIUM_PATH.\n${errors.join("\n")}`);
}

// tsx/esbuild wraps named functions with __name(); provide it in pages so page.evaluate() callbacks work.
const NAME_SHIM = "window.__name = window.__name || ((fn) => fn);";

export function getBrowser(): Promise<Browser> {
  browserPromise ??= launch();
  return browserPromise;
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close();
}

export interface Diagnostics {
  errors: string[];
  warnings: string[];
  wordCount: number;
  titleLines: number;
}

export interface TextRun {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
}

export interface ElementBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderResult {
  buffer: Buffer;
  diagnostics?: Diagnostics;
  mounts: MountResult[];
  text?: TextRun[];
  boxes?: ElementBox[];
}

export interface RenderOptions {
  width: number;
  height: number;
  scale?: number;
  type?: "png" | "jpeg";
  quality?: number;
  diagnose?: { minFont: number; safe: number; format: string };
  extractText?: boolean;
  transparent?: boolean;
}

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }))),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/** Layout QA inside the page. Text is measured by glyph boxes, not block boxes. */
function diagnoseInPage(opts: { minFont: number; safe: number; format: string }) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pageEl = document.querySelector(".page") as HTMLElement | null;
  if (!pageEl) return { errors: ["No .page element."], warnings, wordCount: 0, titleLines: 0 };
  const pr = pageEl.getBoundingClientRect();
  for (const img of Array.from(document.images)) if (!img.complete || img.naturalWidth === 0) errors.push(`Image failed to load: ${img.getAttribute("src")} (images must be files under assets/).`);

  const describe = (el: Element) => {
    const cls = (el.getAttribute("class") || "").split(" ").slice(0, 2).join(" ");
    const t = (el.textContent || "").trim().replace(/\s+/g, " ");
    return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}> "${t.slice(0, 50)}${t.length > 50 ? "…" : ""}"`;
  };
  const inChrome = (el: Element) => !!el.closest(".pg-foot, .rp-head, .rp-foot, .cover-meta, .cover-conf");
  const textEls = Array.from(pageEl.querySelectorAll("*")).filter(
    (el) => !el.closest(".decor, [data-allow-overflow]") && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim()),
  );
  type Box = { l: number; t: number; r: number; b: number };
  const glyphBox = (el: Element): Box | null => {
    const range = document.createRange();
    let box: Box | null = null;
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== 3 || !(n.textContent || "").trim()) continue;
      range.selectNodeContents(n);
      for (const rect of Array.from(range.getClientRects())) {
        if (!rect.width) continue;
        const inset = Number.isFinite(lh) && rect.height > lh ? (rect.height - lh) / 2 : 0;
        const t = rect.top + inset, b = rect.bottom - inset;
        box = box ? { l: Math.min(box.l, rect.left), t: Math.min(box.t, t), r: Math.max(box.r, rect.right), b: Math.max(box.b, b) } : { l: rect.left, t, r: rect.right, b };
      }
    }
    return box;
  };
  const boxes: { el: Element; box: Box }[] = [];
  let small = 0;
  let smallEx = "";
  for (const el of textEls) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none") continue;
    const box = glyphBox(el);
    if (!box) continue;
    boxes.push({ el, box });
    if (box.l < pr.left - 1 || box.r > pr.right + 1 || box.t < pr.top - 1 || box.b > pr.bottom + 1) errors.push(`Text is cut off by the page edge: ${describe(el)}`);
    else if (!inChrome(el) && !el.closest(".el") && (box.l < pr.left + opts.safe || box.r > pr.right - opts.safe || box.t < pr.top + opts.safe || box.b > pr.bottom - opts.safe))
      warnings.push(`Text sits within ${opts.safe}px of the page edge: ${describe(el)}`);
    const fs = parseFloat(cs.fontSize);
    const short = (el.textContent || "").trim().length <= 2 || el.tagName === "SUP";
    if (fs < opts.minFont - 0.01 && !short) { small++; smallEx ||= `${fs}px ${describe(el)}`; }
  }
  if (small) warnings.push(`${small} text element(s) below the ${opts.minFont}px minimum (e.g. ${smallEx}).`);

  const reported = new Set<Element>();
  for (const c of Array.from(pageEl.querySelectorAll<HTMLElement>(".ar-text, .sm-body, .ch-body, .xp-commentary"))) {
    const cols = parseInt(getComputedStyle(c).columnCount) || 1;
    const overW = c.scrollWidth - c.clientWidth;
    const overH = c.scrollHeight - c.clientHeight;
    const lh = parseFloat(getComputedStyle(c).lineHeight) || 18;
    if (overW > 3 || overH > 3) {
      const lines = overW > 3 ? Math.round((overW / (c.clientWidth / cols)) * (c.clientHeight / lh)) : Math.round((overH / lh) * cols);
      const wpl = (c.clientWidth / cols) / (parseFloat(getComputedStyle(c).fontSize) * 3);
      errors.push(`Body text does not fit: about ${Math.max(1, lines)} line(s) too long (≈${Math.round(lines * wpl)} words). Cut it, shrink the exhibit, or continue on the next page (article layout without a title).`);
      reported.add(c.closest(".pg-body") ?? c);
    }
  }
  // clipped / overflowing containers
  const containers = Array.from(pageEl.querySelectorAll<HTMLElement>(
    ".pg-body, .card, .panel, .box, .kpi, .tc-col, .ct-side, .ct-main, .cols > *, .grid-cells > *, .kd-main > *, .it-text, .exec, .scr, .sm, .ar, .ar-aside, .ch-wrap, .cl, .st, .agenda, .toc, .exhibit, .takeaway, .dg-node, .dg-abs, .custom, .nb",
  ));
  for (const c of containers) {
    if (c.closest(".decor")) continue;
    const over = c.scrollHeight - c.clientHeight;
    if (over > 3 && !Array.from(reported).some((r) => r.contains(c) || c.contains(r))) {
      reported.add(c);
      errors.push(`Content overflows ${describe(c).split(">")[0]}> by ${over}px: cut text, use a denser layout, or split the page.`);
    }
  }
  // clipped by overflow:hidden ancestors
  for (const { el, box } of boxes) {
    let p = el.parentElement;
    while (p && p !== pageEl) {
      const cs = getComputedStyle(p);
      if (cs.overflow !== "visible" || cs.overflowY !== "visible") {
        const r = p.getBoundingClientRect();
        if (box.b > r.bottom + 1.5 || box.r > r.right + 1.5 || box.t < r.top - 1.5 || box.l < r.left - 1.5) {
          errors.push(`Text is clipped by its container: ${describe(el)}`);
          break;
        }
      }
      p = p.parentElement;
    }
  }
  // overlapping text
  const overlaps: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.box.r, b.box.r) - Math.max(a.box.l, b.box.l);
      const oy = Math.min(a.box.b, b.box.b) - Math.max(a.box.t, b.box.t);
      if (ox > 3 && oy > 3) {
        const where = a.el.closest(".el")?.getAttribute("data-el");
        overlaps.push(`Overlapping text${where ? ` in element "${where}"` : ""}: ${describe(a.el)} and ${describe(b.el)}`);
      }
    }
  errors.push(...overlaps.slice(0, 6));
  if (overlaps.length > 6) errors.push(`…and ${overlaps.length - 6} more overlaps.`);

  // empty-looking page: content ends in the top part of the body
  const body = pageEl.querySelector<HTMLElement>(".pg-body");
  const contentLayout = pageEl.matches(".L-exhibit, .L-chart-takeaways, .L-two-column, .L-columns, .L-grid, .L-kpi-dashboard, .L-executive-summary, .L-scr, .L-custom, .L-article, .L-exhibit-page, .L-summary, .L-numbers, .L-image-text");
  if (body && contentLayout) {
    const br = body.getBoundingClientRect();
    let bottom = br.top;
    for (const { el, box } of boxes) if (body.contains(el)) bottom = Math.max(bottom, box.b);
    for (const e of Array.from(body.querySelectorAll<HTMLElement>(".el, img, .takeaway"))) bottom = Math.max(bottom, e.getBoundingClientRect().bottom);
    const used = (bottom - br.top) / Math.max(1, br.height);
    if (used < (opts.format === "deck" ? 0.55 : 0.62)) warnings.push(`Content fills only the top ${Math.round(used * 100)}% of the page body; add supporting content (chart, example, implication) or use a layout that fills the space.`);
  }
  // action title length
  let titleLines = 0;
  const title = pageEl.querySelector<HTMLElement>(".pg-title");
  if (title) {
    const lh = parseFloat(getComputedStyle(title).lineHeight) || 1;
    titleLines = Math.round(title.getBoundingClientRect().height / lh);
    if (titleLines > (opts.format === "deck" ? 2 : 3)) warnings.push(`The title runs to ${titleLines} lines; tighten it to ${opts.format === "deck" ? 2 : 3} lines (≈ 15 words).`);
  }
  const wordCount = (pageEl.innerText || "").split(/\s+/).filter(Boolean).length;
  const limit = opts.format === "deck" ? 190 : 720;
  if (wordCount > limit) warnings.push(`${wordCount} words on this page (guide ≤ ${limit}). Consider cutting or splitting.`);
  return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), wordCount, titleLines };
}

/** Visible text as positioned runs (one per line fragment) for the PDF's invisible text layer. */
function extractTextInPage(): { text: string; x: number; y: number; w: number; h: number; size: number }[] {
  const out: { text: string; x: number; y: number; w: number; h: number; size: number }[] = [];
  const root = document.querySelector(".page");
  if (!root) return out;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const txt = node.textContent || "";
    if (!txt.trim()) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === "hidden" || cs.opacity === "0" || cs.display === "none" || parent.closest("[aria-hidden=true]")) continue;
    const size = parseFloat(cs.fontSize);
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    let cur: { text: string; x: number; y: number; w: number; h: number; size: number } | null = null;
    while ((m = re.exec(txt))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      if (!rects.length) continue;
      const r = rects[0];
      if (r.height > r.width * 2.5 && m[0].length > 2) continue; // rotated label
      if (cur && Math.abs(r.top - cur.y) < Math.max(2, r.height * 0.3) && r.left >= cur.x + cur.w - 1) {
        cur.text += " " + m[0];
        cur.w = r.right - cur.x;
        cur.h = Math.max(cur.h, r.height);
      } else {
        if (cur) out.push(cur);
        cur = { text: m[0], x: r.left, y: r.top, w: r.width, h: r.height, size };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Render a composed HTML file: mount elements, run QA, optionally extract text, screenshot. */
export async function renderHtmlFile(htmlPath: string, opts: RenderOptions): Promise<RenderResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: Math.ceil(opts.width), height: Math.ceil(opts.height) }, deviceScaleFactor: opts.scale ?? 1 });
  await context.addInitScript({ content: NAME_SHIM });
  await context.route(/^(https?|wss?):/, (route) => route.abort()); // pages are self-contained: no network
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const mounts = (await page.evaluate(() => (window as unknown as { DeckElements?: { mountAll: () => unknown } }).DeckElements?.mountAll() ?? [])) as MountResult[];
    await settle(page);
    const diagnostics = opts.diagnose ? await page.evaluate(diagnoseInPage, opts.diagnose) : undefined;
    const text = opts.extractText ? await page.evaluate(extractTextInPage) : undefined;
    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".el[data-el]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.el!, x: r.left, y: r.top, w: r.width, h: r.height };
      }),
    );
    const buffer = await page.screenshot({
      type: opts.type ?? "png",
      quality: opts.type === "jpeg" ? (opts.quality ?? 82) : undefined,
      clip: { x: 0, y: 0, width: opts.width, height: opts.height },
      omitBackground: opts.transparent ?? false,
      animations: "disabled",
    });
    return { buffer, diagnostics, mounts, text, boxes };
  } finally {
    await context.close();
  }
}

/** Render an element region of an already composed page file as its own PNG (exhibit export). */
export async function renderRegions(htmlPath: string, opts: { width: number; height: number; scale: number; regions: ElementBox[] }): Promise<Buffer[]> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: opts.scale });
  await context.addInitScript({ content: NAME_SHIM });
  await context.route(/^(https?|wss?):/, (route) => route.abort());
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => (window as unknown as { DeckElements?: { mountAll: () => unknown } }).DeckElements?.mountAll());
    await settle(page);
    const out: Buffer[] = [];
    for (const r of opts.regions) {
      const pad = 8;
      out.push(
        await page.screenshot({
          type: "png",
          clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(opts.width - Math.max(0, r.x - pad), r.w + pad * 2), height: Math.min(opts.height - Math.max(0, r.y - pad), r.h + pad * 2) },
        }),
      );
    }
    return out;
  } finally {
    await context.close();
  }
}

/** Render an arbitrary HTML string (contact sheets, thumbnails). */
export async function renderHtmlString(html: string, opts: { width: number; height: number; type?: "png" | "jpeg"; quality?: number; scale?: number }): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: opts.scale ?? 1 });
  await context.addInitScript({ content: NAME_SHIM });
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await settle(page);
    return await page.screenshot({ type: opts.type ?? "png", quality: opts.type === "jpeg" ? (opts.quality ?? 80) : undefined, clip: { x: 0, y: 0, width: opts.width, height: opts.height } });
  } finally {
    await context.close();
  }
}

/** Downscaled JPEG of an image file, for handing back to the model. */
export async function thumbnail(imagePath: string, maxSide = 512): Promise<Buffer> {
  const data = fs.readFileSync(imagePath).toString("base64");
  const ext = imagePath.toLowerCase().endsWith(".png") ? "png" : imagePath.toLowerCase().endsWith(".webp") ? "webp" : "jpeg";
  const html = `<html><body style="margin:0;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/24px 24px"><img id="i" src="data:image/${ext};base64,${data}" style="display:block;max-width:${maxSide}px;max-height:${maxSide}px"></body></html>`;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const el = await page.$("#i");
    return (await el!.screenshot({ type: "jpeg", quality: 78 })) as Buffer;
  } finally {
    await page.close();
  }
}
