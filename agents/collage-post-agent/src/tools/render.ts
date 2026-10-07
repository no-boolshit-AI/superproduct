import { chromium, type Browser } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const CANVAS = { width: 1080, height: 1350 } as const;

let browserPromise: Promise<Browser> | null = null;

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
      .then((b) => {
        b.on("disconnected", () => (browserPromise = null)); // a crashed browser gets relaunched next time
        return b;
      })
      .catch((err) => {
        browserPromise = null;
        throw new Error(
          `Could not start Chromium for rendering (${err.message}). Run "npx playwright install chromium" once.`,
        );
      });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => {});
}

export interface SlideResult {
  html: string;
  image: string;
  warnings: string[];
}

export interface RenderOptions {
  /** deviceScaleFactor: 1 = 1080x1350, 2 = 2160x2700 */
  scale?: number;
  type?: "png" | "jpeg";
  quality?: number;
}

/** Render each slide's .canvas to an image file in outDir. */
export async function renderSlides(htmlFiles: string[], outDir: string, opts: RenderOptions = {}): Promise<SlideResult[]> {
  const { scale = 1, type = "png", quality = 85 } = opts;
  await mkdir(outDir, { recursive: true });
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { ...CANVAS }, deviceScaleFactor: scale });
  // Slides may only load files from their own job folder: no network, no other local files (e.g. ../.env).
  const roots = [...new Set(htmlFiles.map((f) => path.dirname(path.resolve(f))))];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    if (url.startsWith("file://")) {
      const p = path.resolve(fileURLToPath(url));
      if (roots.some((r) => p === r || p.startsWith(r + path.sep))) return route.continue();
    }
    return route.abort("accessdenied");
  });
  const results: SlideResult[] = [];
  try {
    for (const file of htmlFiles) {
      const page = await context.newPage();
      const warnings: string[] = [];
      page.on("pageerror", (e) => warnings.push(`JavaScript error: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") warnings.push(`Console error: ${m.text()}`);
      });
      page.on("requestfailed", (r) =>
        warnings.push(
          r.failure()?.errorText.includes("ACCESS_DENIED")
            ? `Blocked (outside the job folder / external): ${r.url().replace(/^file:\/\//, "").slice(0, 120)}`
            : `Failed to load ${r.url().replace(/^file:\/\//, "")}`,
        ),
      );
      await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
      try {
        await page.waitForSelector('html[data-ready="1"]', { timeout: 20_000, state: "attached" });
      } catch {
        warnings.push("Slide never became ready (is _design/collage.js included?)");
      }
      const pageWarnings = await page.evaluate(
        () => ((window as unknown as { __collage?: { warnings: string[] } }).__collage?.warnings ?? []),
      );
      warnings.push(...pageWarnings);
      const ext = type === "jpeg" ? "jpg" : "png";
      const image = path.join(outDir, path.basename(file).replace(/\.html?$/i, `.${ext}`));
      const canvas = await page.$(".canvas");
      if (canvas) {
        await canvas.screenshot({ path: image, type, ...(type === "jpeg" ? { quality } : {}) });
      } else {
        await page.screenshot({ path: image, type, clip: { x: 0, y: 0, ...CANVAS } });
      }
      results.push({ html: file, image, warnings: [...new Set(warnings)] });
      await page.close();
    }
  } finally {
    await context.close();
  }
  return results;
}

/**
 * Small labelled previews of source images on a checkerboard (so failed transparency is obvious).
 * Returns base64 JPEG for an MCP image block.
 */
export async function imagePreviews(items: { file: string; label: string }[], height = 300): Promise<string> {
  const cells = items
    .map(
      (it) =>
        `<figure><div class="chk"><img src="${pathToFileURL(it.file).href}"></div><figcaption>${it.label
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</figcaption></figure>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#151515;color:#ccc;font:13px/1.25 system-ui,sans-serif}
    main{display:flex;flex-wrap:wrap;gap:10px;padding:10px;width:${Math.min(4, items.length) * 260}px}
    figure{margin:0;width:250px}
    .chk{height:${height}px;display:flex;align-items:center;justify-content:center;
      background:repeating-conic-gradient(#6a6a6a 0 25%,#9a9a9a 0 50%) 0 0/20px 20px}
    img{max-width:250px;max-height:${height}px;display:block}
    figcaption{padding:5px 0 0;word-break:break-all}
  </style></head><body><main>${cells}</main></body></html>`;
  const tmp = path.join(os.tmpdir(), `collage-preview-${process.pid}-${Date.now()}.html`);
  await writeFile(tmp, html);
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: Math.min(4, items.length) * 260 + 10, height: 400 } });
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
    const buf = await page.screenshot({ type: "jpeg", quality: 72, fullPage: true });
    return buf.toString("base64");
  } finally {
    await page.close();
    await rm(tmp, { force: true });
  }
}

/** A single JPEG showing all slides side by side, labelled, for quick visual QA. */
export async function contactSheet(images: string[], outFile: string, cols = 4): Promise<string> {
  const tileW = 360;
  const columns = Math.min(cols, Math.max(1, images.length));
  const items = images
    .map(
      (img, i) =>
        `<figure><img src="${pathToFileURL(img).href}"><figcaption>${i + 1} · ${path.basename(img)}</figcaption></figure>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#111;color:#bbb;font:14px/1.2 system-ui,sans-serif}
    main{display:grid;grid-template-columns:repeat(${columns},${tileW}px);gap:14px;padding:14px;width:max-content}
    figure{margin:0} img{display:block;width:${tileW}px;height:${tileW * 1.25}px;object-fit:cover}
    figcaption{padding:6px 0 0}
  </style></head><body><main>${items}</main></body></html>`;
  const tmp = outFile.replace(/\.jpe?g$/i, "") + ".html";
  await writeFile(tmp, html);
  const browser = await getBrowser();
  const page = await browser.newPage({ viewport: { width: columns * (tileW + 14) + 14, height: 600 } });
  try {
    await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
    await page.screenshot({ path: outFile, type: "jpeg", quality: 78, fullPage: true });
  } finally {
    await page.close();
    await rm(tmp, { force: true });
  }
  return outFile;
}
