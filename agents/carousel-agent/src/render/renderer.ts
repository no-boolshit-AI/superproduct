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
  /** Where the logo and the first headline sit (px from the slide's top-left), for cross-slide consistency checks. */
  marks: { logo?: number[]; heading?: number[] };
}

/** Composition rules that depend on the style. */
export interface QaOptions {
  /** The tallest empty horizontal band allowed, as a share of the canvas height (1 = no check). */
  maxBand?: number;
}

export interface RenderOptions {
  width: number;
  height: number;
  scale?: number; // deviceScaleFactor (2 → 2160px wide PNG)
  type?: "png" | "jpeg";
  quality?: number; // jpeg only
  diagnose?: boolean;
  qa?: QaOptions;
}

/** Wait until web fonts, images (incl. CSS background, mask and border images) and backdrop filters have settled. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }),
      ),
    );
    // CSS images load lazily and aren't in document.images: logos, masks, textures. Preload each one.
    const urls = new Set<string>();
    for (const el of Array.from(document.querySelectorAll("*")))
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = getComputedStyle(el, pseudo);
        for (const v of [cs.backgroundImage, cs.maskImage, cs.getPropertyValue("-webkit-mask-image"), cs.borderImageSource])
          for (const m of (v || "").matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]);
      }
    await Promise.all(
      Array.from(urls).map((src) => new Promise<void>((r) => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = src; })),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/**
 * Auto-fit: shrink hero numbers/headlines that would overflow their panel
 * (.stat__value, .card__value, .mega, .hero, .chip, [data-fit]) in 2px steps.
 */
function fitTextInPage() {
  const els = Array.from(document.querySelectorAll<HTMLElement>(".stat__value, .card__value, .mega, .hero, .chip, [data-fit]"));
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
function diagnoseInPage(opts: QaOptions = {}): Diagnostics {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slide = document.querySelector(".slide") as HTMLElement | null;
  if (!slide) return { errors: ["No .slide element in the fragment."], warnings, wordCount: 0, marks: {} };
  const sr = slide.getBoundingClientRect();

  for (const img of Array.from(document.images)) {
    if (!img.complete || img.naturalWidth === 0) errors.push(`Image failed to load: ${img.getAttribute("src")}`);
  }

  const describe = (el: Element) => {
    const cls = el.getAttribute("class");
    const text = (el.textContent || "").trim().replace(/\s+/g, " ");
    return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ""}> "${text.slice(0, 48)}${text.length > 48 ? "…" : ""}"`;
  };

  // Decoration that may run off the canvas or sit behind text: background layers, the ticker band, the watermark.
  const skip = (el: Element) => !!el.closest(".bg, .ticker, .watermark, [data-allow-overflow]");
  // UI mocks inside windows and devices: illustrative, so small type and bleeding off the edge are fine.
  const decor = (el: Element) => el.closest(".window, .device, .ui");
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
    if (cs.visibility === "hidden" || cs.opacity === "0" || decor(el)) continue;
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
    if (decor(el)) continue;
    let p = el.parentElement;
    while (p && p !== slide) {
      const cs = getComputedStyle(p);
      const boxed = p.matches(".glass, .card, .panel, .pill, .tag, .sticker, .chip, .cta, .badge, .avatar, .photo");
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
      // Stacked stickers overlap on purpose (their tilted boxes do, their words don't); so do texts in one UI mock.
      const group = a.el.closest(".stickers, .window, .device");
      if (group && group === b.el.closest(".stickers, .window, .device")) continue;
      const ox = Math.min(a.box.r, b.box.r) - Math.max(a.box.l, b.box.l);
      const oy = Math.min(a.box.b, b.box.b) - Math.max(a.box.t, b.box.t);
      if (ox > 4 && oy > 4) errors.push(`Overlapping text: ${describe(a.el)} and ${describe(b.el)}`);
    }

  // Content taller than the canvas (flex column overflow)
  const flowKids = Array.from(slide.children).filter((c) => {
    const pos = getComputedStyle(c).position;
    return pos !== "absolute" && pos !== "fixed" && !c.matches(".photo--bleed-bottom, .bleed, .bleed-right, [data-allow-overflow]");
  });
  const lastBottom = Math.max(0, ...flowKids.map((c) => c.getBoundingClientRect().bottom));
  const padBottom = parseFloat(getComputedStyle(slide).paddingBottom);
  const into = Math.round(lastBottom - (sr.bottom - padBottom));
  if (into > 8) errors.push(`Content runs ${into}px into the bottom margin: cut copy or reduce sizes (the margin is the safe area).`);
  else if (into > 2) warnings.push(`Content runs ${into}px into the bottom margin: cut copy or reduce sizes.`);

  // ---- Composition: the things a designer would catch at a glance ----
  type Box = { l: number; t: number; r: number; b: number };
  const rectOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  };
  const hit = (a: Box, b: Box, min = 6) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > min && Math.min(a.b, b.b) - Math.max(a.t, b.t) > min;
  const shown = (el: Element) => {
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  };
  // The outermost elements of a list (one element can appear twice: as text and as a block).
  const outermost = <T extends { el: Element }>(xs: T[]) =>
    xs.filter((x, i) => xs.findIndex((y) => y.el === x.el) === i && !xs.some((y) => y.el !== x.el && y.el.contains(x.el)));

  // Blocks in the flow that touch: the space mt-auto should have given them ran out, or a margin is missing.
  // A label (kicker, tag, pill) sits tight on its title on purpose; a cta--overlap overlaps the panel on purpose.
  const flow = flowKids.filter(shown);
  for (let i = 1; i < flow.length; i++) {
    const prev = flow[i - 1], cur = flow[i];
    if (cur.matches(".cta--overlap") || prev.matches(".kicker, .tag, .pill")) continue;
    const gap = cur.getBoundingClientRect().top - prev.getBoundingClientRect().bottom;
    if (gap < -2) warnings.push(`${describe(cur)} overlaps ${describe(prev)}: give it its own space.`);
    else if (gap < 10) warnings.push(`${describe(cur)} sits ${Math.round(gap)}px below ${describe(prev)}: the blocks look glued together. Give it ≥ 24px, cutting copy if there is no room.`);
  }

  // Content that runs into the chrome: the next cue, a positioned logo, the counter, progress or swipe hint.
  const CHROME = ".next, .wordmark:not(.wordmark--inline), .logo-mark:not(.logo-mark--inline), .counter, .swipe, .progress, .topbar";
  const BLOCKS = ".panel, .card, .cta, .pill, .tag, .sticker, .chip, .device, .window, .avatar, .app-icon, .icon-list__item, .meta__item, .badge, .bars, .donut, .stat";
  const chromeName = (el: Element) =>
    el.matches(".next") ? "next-slide cue" : el.matches(".wordmark") ? "logo" : el.matches(".logo-mark") ? "logo mark"
      : el.matches(".progress") ? "progress bar" : el.matches(".swipe") ? "swipe hint" : el.matches(".counter") ? "page counter" : "top bar";
  const content = [
    ...boxes.filter(({ el }) => !el.closest(CHROME)),
    ...Array.from(slide.querySelectorAll(BLOCKS)).filter((el) => shown(el) && !skip(el) && !el.closest(CHROME)).map((el) => ({ el, box: rectOf(el) })),
  ];
  for (const c of Array.from(slide.querySelectorAll(CHROME)).filter(shown)) {
    const cb = rectOf(c);
    for (const { el } of outermost(content.filter(({ el, box }) => !c.contains(el) && hit(box, cb))).slice(0, 2))
      errors.push(`${describe(el)} runs into the ${chromeName(c)}: keep its corner free (end the block higher, make it narrower, or drop the cue).`);
  }

  // A floating sticker over a UI mock, a button or a face hides content (text under it is already an overlap error).
  const COVERABLE = ".ui-line, .ui-btn, .ui-card, .ui-bubble, .ui-stat, .ui-title, .ui-bar, .ui-check, .ui-code, .ui-pill, .cta, .avatar, .badge, .card__icon";
  for (const st of Array.from(slide.querySelectorAll(".sticker--float")).filter(shown)) {
    const sb = rectOf(st);
    const under = [
      ...boxes.filter(({ el }) => decor(el) && !st.contains(el)),
      ...Array.from(slide.querySelectorAll(COVERABLE)).filter((el) => shown(el) && !st.contains(el)).map((el) => ({ el, box: rectOf(el) })),
    ].filter(({ box }) => hit(box, sb, 4));
    if (under.length)
      warnings.push(`The floating sticker ${describe(st)} covers ${describe(outermost(under)[0].el)}: pin it to a corner or edge of the block (half on, half off; wrap the block in .anchor), never over content.`);
  }

  // A UI mock that leaves most of its screen empty looks unfinished.
  for (const ui of Array.from(slide.querySelectorAll(".ui")).filter(shown)) {
    const ub = rectOf(ui);
    const cs = getComputedStyle(ui);
    const room = ub.b - ub.t - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const kids = Array.from(ui.children).filter(shown);
    if (room < 200 || !kids.length) continue;
    const used = (Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) - Math.min(...kids.map((k) => k.getBoundingClientRect().top))) / room;
    if (used < 0.6)
      warnings.push(`The UI mock fills ${Math.round(used * 100)}% of its screen: add a ui-bar and more rows or cards, raise its font size (style="font-size:28px"), or use a smaller device.`);
  }

  // The tallest empty horizontal band (backgrounds, effects and the faint watermark don't count; hairlines don't fill).
  const maxBand = opts.maxBand ?? 1;
  if (maxBand < 1 && !slide.querySelector(":scope > .bg img")) {
    const FILL = `${BLOCKS}, ${CHROME}, .glass, .photo, .cutout, .shape, .band, .ui, .ticker, .diamonds, .dots-scale, .logos, .people, .stickers, .wordmark, .logo-mark`;
    const spans = [
      ...boxes.map(({ el, box }) => ({ el, t: box.t, b: box.b })),
      ...Array.from(slide.querySelectorAll(FILL)).filter((el) => shown(el) && !el.closest(".bg, .watermark")).map((el) => ({ el, ...rectOf(el) })),
    ].sort((a, b) => a.t - b.t);
    const pad = parseFloat(getComputedStyle(slide).getPropertyValue("--pad")) || 96;
    const zoneTop = sr.top + pad, zoneBottom = sr.bottom - pad;
    let cursor = zoneTop, above: Element | null = null;
    let worst = { gap: 0, above: null as Element | null, below: null as Element | null };
    for (const s of spans) {
      if (s.t > cursor && Math.min(s.t, zoneBottom) - cursor > worst.gap) worst = { gap: Math.min(s.t, zoneBottom) - cursor, above, below: s.el };
      if (s.b > cursor) { cursor = s.b; above = s.el; }
    }
    if (zoneBottom - cursor > worst.gap) worst = { gap: zoneBottom - cursor, above, below: null };
    const H = sr.bottom - sr.top;
    if (worst.gap > maxBand * H) {
      const where = worst.above && worst.below ? `between ${describe(worst.above)} and ${describe(worst.below)}` : worst.above ? `below ${describe(worst.above)}` : `above ${describe(worst.below!)}`;
      warnings.push(
        `An empty band ${Math.round(worst.gap)}px tall (${Math.round((worst.gap / H) * 100)}% of the slide) ${where}: the slide looks unfinished. ` +
          `Fill it: scale the content up (bigger type, cards instead of a plain list, a larger device), add the slide's supporting element, or centre the main block (my-auto).`,
      );
    }
  }

  // Where the logo and the first headline sit, for the cross-slide check in review_carousel.
  const at = (b: Box) => [Math.round(b.l - sr.left), Math.round(b.t - sr.top)];
  const logo = slide.querySelector(".wordmark, .logo-mark");
  // Headlines on the canvas only: one inside a panel or card is indented on purpose.
  const heading = boxes.find(
    ({ el }) => el.matches(".hero, .h1, .h2, .display") && !el.closest(".panel, .card, .glass, .window, .device") && getComputedStyle(el).textAlign !== "center",
  );
  const marks = { logo: logo && shown(logo) ? at(rectOf(logo)) : undefined, heading: heading ? at(heading.box) : undefined };

  // Words a reader has to read: not the ticker, the watermark or UI mock copy.
  const words = (el: Element) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || "")
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
  const wordCount = boxes.filter(({ el }) => !decor(el)).reduce((n, { el }) => n + words(el), 0);
  if (wordCount > 70) warnings.push(`${wordCount} words on one slide: aim for ≤ 60 so it reads in 3 seconds.`);
  return { errors: Array.from(new Set(errors)), warnings: Array.from(new Set(warnings)), wordCount, marks };
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
    const diagnostics = opts.diagnose ? await page.evaluate(diagnoseInPage, opts.qa ?? {}) : undefined;
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
