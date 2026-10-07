import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "./config.js";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain",
  ".mp4": "video/mp4",
};

/** Minimal static file server for a Next.js `out/` folder. */
export function serveStatic(root: string, port = 0): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file)) {
      const notFound = path.join(root, "404.html");
      res.writeHead(404, { "content-type": TYPES[".html"] });
      if (existsSync(notFound)) createReadStream(notFound).pipe(res);
      else res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: p } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${p}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

export type Shot = { label: string; file: string; base64: string; mediaType: "image/jpeg" };

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, chunk: 1100, isMobile: false },
  mobile: { width: 390, height: 844, chunk: 1400, isMobile: true },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

/**
 * Screenshot the built site and slice the full page into readable chunks.
 * Chunks are saved under .lpa/screens and returned as base64 JPEGs.
 */
export async function screenshotSite(
  siteDir: string,
  opts: { viewports?: ViewportName[]; maxChunks?: number } = {},
): Promise<{ shots: Shot[]; pageHeights: Record<string, number> }> {
  const outDir = path.join(siteDir, "out");
  if (!existsSync(path.join(outDir, "index.html"))) throw new Error("No build output. Run build_site first.");
  const screensDir = path.join(siteDir, ".lpa", "screens");
  mkdirSync(screensDir, { recursive: true });

  const server = await serveStatic(outDir);
  const browser = await chromium.launch({ executablePath: config.chromiumPath });
  const shots: Shot[] = [];
  const pageHeights: Record<string, number> = {};
  try {
    for (const name of opts.viewports ?? ["desktop", "mobile"]) {
      const vp = VIEWPORTS[name];
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1,
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      await page.goto(server.url, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      pageHeights[name] = height;

      const full = path.join(screensDir, `${name}-full.png`);
      await page.screenshot({ path: full, fullPage: true });

      const maxChunks = opts.maxChunks ?? (name === "desktop" ? 8 : 6);
      const chunk = Math.max(vp.chunk, Math.ceil(height / maxChunks));
      for (let y = 0, i = 1; y < height; y += chunk, i++) {
        const h = Math.min(chunk, height - y);
        const file = path.join(screensDir, `${name}-${String(i).padStart(2, "0")}.jpg`);
        const buf = await page.screenshot({ path: file, fullPage: true, type: "jpeg", quality: 72, clip: { x: 0, y, width: vp.width, height: h } });
        shots.push({ label: `${name} ${i} (y ${y}–${y + h} of ${height}px)`, file, base64: buf.toString("base64"), mediaType: "image/jpeg" });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return { shots, pageHeights };
}
