import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  try {
    return await chromium.launch({ executablePath });
  } catch (err) {
    throw new Error(
      `Could not start Chromium (${(err as Error).message.split("\n")[0]}). ` +
        `Run "npx playwright install chromium" or set CHROMIUM_PATH to a Chrome/Chromium binary.`,
    );
  }
}

// tsx/esbuild wraps named functions with __name(); provide it inside pages so
// functions passed to page.evaluate() keep working when run through tsx.
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
}

export interface RenderOptions {
  width: number;
  height: number;
  scale?: number; // deviceScaleFactor (2 → 2160px wide PNG)
  type?: "png" | "jpeg";
  quality?: number; // jpeg only
  diagnose?: boolean;
}

/** Wait until web fonts, images and backdrop filters have settled. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }),
      ),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/**
 * Auto-fit: shrink hero numbers/headlines that would overflow their panel
 * (.stat__value, .card__value, .mega, [data-fit]) in 2px steps.
 */
function fitTextInPage() {
  const els = Array.from(document.querySelectorAll<HTMLElement>(".stat__value, .card__value, .mega, [data-fit]"));
  for (const el of els) {
    const box = el.closest<HTMLElement>("[data-fit-box], .card, .glass, .slide");
    if (!box) continue;
    const row = el.closest<HTMLElement>(".stat") ?? el;
    const bs = getComputedStyle(box);
    const br = box.getBoundingClientRect();
    const left = br.left + parseFloat(bs.paddingLeft);
    const right = br.right - parseFloat(bs.paddingRight);
    const min = parseFloat(el.dataset.fitMin || "36");
    let size = parseFloat(getComputedStyle(el).fontSize);
    const overflows = () => {
      const r = row.getBoundingClientRect();
      return r.left < left - 0.5 || r.right > right + 0.5 || el.scrollWidth > el.clientWidth + 1;
    };
    while (size > min && overflows()) {
      size -= 2;
      el.style.fontSize = `${size}px`;
    }
  }
  // Keep sibling values visually consistent: every value in a .cards row / fit group gets the smallest size.
  for (const group of Array.from(document.querySelectorAll<HTMLElement>(".cards, [data-fit-group]"))) {
    const vals = Array.from(group.querySelectorAll<HTMLElement>(".card__value, .stat__value, [data-fit]"));
    if (vals.length < 2) continue;
    const min = Math.min(...vals.map((v) => parseFloat(getComputedStyle(v).fontSize)));
    for (const v of vals) v.style.fontSize = `${min}px`;
  }
}

/** Layout QA that runs inside the page. Text is measured by its glyph boxes, not its block box. */
function diagnoseInPage(): { errors: string[]; warnings: string[]; wordCount: number } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slide = document.querySelector(".slide") as HTMLElement | null;
  if (!slide) return { errors: ["No .slide element in the fragment."], warnings, wordCount: 0 };
  const sr = slide.getBoundingClientRect();

  for (const img of Array.from(document.images)) {
    if (!img.complete || img.naturalWidth === 0) errors.push(`Image failed to load: ${img.getAttribute("src")}`);
  }

  const describe = (el: Element) => {
    const cls = el.getAttribute("class");
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}> "${text.slice(0, 48)}${text.length > 48 ? "…" : ""}"`;
  };

  const skip = (el: Element) => !!el.closest(".bg, [data-allow-overflow]");
  const textEls = Array.from(slide.querySelectorAll("*")).filter(
    (el) => !skip(el) && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || "").trim()),
  );

  const glyphBox = (el: Element) => {
    const range = document.createRange();
    let box: { l: number; t: number; r: number; b: number } | null = null;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== 3 || !(n.textContent || "").trim()) continue;
      range.selectNodeContents(n);
      // Glyph rects use the font's content area, which is taller than a tight line-height:
      // trim the half-leading so adjacent lines/blocks don't count as overlapping.
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      for (const rect of Array.from(range.getClientRects())) {
        if (!rect.width) continue;
        const inset = Number.isFinite(lh) && rect.height > lh ? (rect.height - lh) / 2 : 0;
        const t = rect.top + inset, b = rect.bottom - inset;
        box = box
          ? { l: Math.min(box.l, rect.left), t: Math.min(box.t, t), r: Math.max(box.r, rect.right), b: Math.max(box.b, b) }
          : { l: rect.left, t, r: rect.right, b };
      }
    }
    return box;
  };

  const SAFE = 40;
  const boxes: { el: Element; box: { l: number; t: number; r: number; b: number } }[] = [];
  for (const el of textEls) {
    const box = glyphBox(el);
    if (!box) continue;
    boxes.push({ el, box });
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (box.l < sr.left - 1 || box.r > sr.right + 1 || box.t < sr.top - 1 || box.b > sr.bottom + 1)
      errors.push(`Text is cut off by the slide edge: ${describe(el)}`);
    else if (box.l < sr.left + SAFE || box.r > sr.right - SAFE || box.t < sr.top + SAFE || box.b > sr.bottom - SAFE)
      warnings.push(`Text sits within ${SAFE}px of the slide edge (LinkedIn crops/rounds corners): ${describe(el)}`);
    const fs = parseFloat(cs.fontSize);
    if (fs < 22) warnings.push(`Font size ${fs}px is too small to read on a phone (min 22px): ${describe(el)}`);
    const he = el as HTMLElement;
    if (cs.display !== "inline" && he.scrollWidth > he.clientWidth + 2 && cs.whiteSpace !== "pre")
      warnings.push(`Text overflows its box horizontally (long word or nowrap): ${describe(el)}`);
  }

  // Clipped text inside overflow:hidden ancestors (e.g. a .glass panel or .card that is too small)
  for (const { el, box } of boxes) {
    let p = el.parentElement;
    while (p && p !== slide) {
      const cs = getComputedStyle(p);
      const boxed = p.matches(".glass, .card, .pill, .cta, .badge, .photo");
      if (boxed || cs.overflow !== "visible" || cs.overflowY !== "visible") {
        const pr = p.getBoundingClientRect();
        if (box.b > pr.bottom + 1 || box.r > pr.right + 1 || box.t < pr.top - 1 || box.l < pr.left - 1) {
          errors.push(`Text spills out of / is clipped by <${p.tagName.toLowerCase()} class="${p.className}">: ${describe(el)}`);
          break;
        }
      }
      p = p.parentElement;
    }
  }

  // Overlapping text blocks (that are not nested in each other)
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.box.r, b.box.r) - Math.max(a.box.l, b.box.l);
      const oy = Math.min(a.box.b, b.box.b) - Math.max(a.box.t, b.box.t);
      if (ox > 4 && oy > 4) errors.push(`Overlapping text: ${describe(a.el)} and ${describe(b.el)}`);
    }

  // Content taller than the canvas (flex column overflow)
  const flowKids = Array.from(slide.children).filter((c) => {
    const pos = getComputedStyle(c).position;
    return pos !== "absolute" && pos !== "fixed" && !c.matches(".photo--bleed-bottom, [data-allow-overflow]");
  });
  const lastBottom = Math.max(0, ...flowKids.map((c) => c.getBoundingClientRect().bottom));
  const padBottom = parseFloat(getComputedStyle(slide).paddingBottom);
  if (lastBottom > sr.bottom - padBottom + 2)
    warnings.push(`Content runs ${Math.round(lastBottom - (sr.bottom - padBottom))}px into the bottom padding: cut copy or reduce sizes.`);

  const wordCount = (slide.innerText || "").split(/\s+/).filter(Boolean).length;
  if (wordCount > 70) warnings.push(`${wordCount} words on one slide: aim for ≤ 60 so it reads in 3 seconds.`);
  return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), wordCount };
}

/** Render a composed HTML file to an image buffer, optionally with layout diagnostics. */
export async function renderHtmlFile(htmlPath: string, opts: RenderOptions): Promise<{ buffer: Buffer; diagnostics?: Diagnostics }> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: opts.scale ?? 1,
  });
  await context.addInitScript({ content: NAME_SHIM });
  // Slides are self-contained: block all network access.
  await context.route(/^https?:/, (route) => route.abort());
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await settle(page);
    await page.evaluate(fitTextInPage);
    const diagnostics = opts.diagnose ? await page.evaluate(diagnoseInPage) : undefined;
    const buffer = await page.screenshot({
      type: opts.type ?? "png",
      quality: opts.type === "jpeg" ? (opts.quality ?? 82) : undefined,
      clip: { x: 0, y: 0, width: opts.width, height: opts.height },
      animations: "disabled",
    });
    return { buffer, diagnostics };
  } finally {
    await context.close();
  }
}

/** Render an arbitrary HTML string (used for thumbnails, contact sheets and mock images). */
export async function renderHtmlString(
  html: string,
  opts: { width: number; height: number; type?: "png" | "jpeg"; quality?: number; transparent?: boolean; scale?: number },
): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: opts.scale ?? 1 });
  await context.addInitScript({ content: NAME_SHIM });
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await settle(page);
    return await page.screenshot({
      type: opts.type ?? "png",
      quality: opts.type === "jpeg" ? (opts.quality ?? 80) : undefined,
      omitBackground: opts.transparent ?? false,
      clip: { x: 0, y: 0, width: opts.width, height: opts.height },
    });
  } finally {
    await context.close();
  }
}

/** Downscaled JPEG preview of an image file, for handing back to the model. */
export async function thumbnail(imagePath: string, maxSide = 512): Promise<Buffer> {
  const data = fs.readFileSync(imagePath).toString("base64");
  const ext = imagePath.toLowerCase().endsWith(".png") ? "png" : imagePath.toLowerCase().endsWith(".webp") ? "webp" : "jpeg";
  const html = `<html><body style="margin:0;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/24px 24px">
<img id="i" src="data:image/${ext};base64,${data}" style="display:block;max-width:${maxSide}px;max-height:${maxSide}px"></body></html>`;
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
