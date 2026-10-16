/**
 * The storyboard sheet as an image: storyboard.html (the sketch sheet the agent draws for review) photographed at its
 * full height with the Chrome HyperFrames renders with, so the person (and the agent, and an orchestrating agent)
 * can look at it without opening a browser.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { HF_BIN } from "./config.js";
import { hfEnv } from "./hyperframes.js";

/** The sheet's layout width (the agent draws it at this width). */
export const SHEET_WIDTH = 1600;
/** Taller pages are cut here (a sheet of 12+ cells in 3 columns is ~8000 px). */
const MAX_HEIGHT = 14000;

let chrome: string | null | undefined;

/** HYPERFRAMES_BROWSER_PATH, else the Chrome `hyperframes browser ensure` installed (`hyperframes browser path`). */
export function browserPath(): string | null {
  if (chrome !== undefined) return chrome;
  const env = process.env.HYPERFRAMES_BROWSER_PATH?.trim();
  if (env && fs.existsSync(env)) return (chrome = env);
  const r = spawnSync(HF_BIN, ["browser", "path"], { env: hfEnv(), encoding: "utf8", timeout: 30_000 });
  const line = String(r.stdout ?? "")
    .split("\n")
    .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
    .filter(Boolean)
    .reverse()
    .find((l) => path.isAbsolute(l) && fs.existsSync(l));
  return (chrome = line ?? null);
}

export interface SheetShot {
  ok: boolean;
  /** the image written (absolute) */
  file?: string;
  width?: number;
  height?: number;
  /** cells found (elements with id="frame-NN") */
  cells?: number;
  /** the page was taller than MAX_HEIGHT and was cut */
  cut?: boolean;
  error?: string;
}

/** Photograph an HTML page at SHEET_WIDTH × its full height into a JPEG. Never throws. */
export async function renderSheet(htmlAbs: string, outJpg: string, opts: { timeoutMs?: number } = {}): Promise<SheetShot> {
  if (!fs.existsSync(htmlAbs)) return { ok: false, error: `${path.basename(htmlAbs)} doesn't exist` };
  const exe = browserPath();
  if (!exe) return { ok: false, error: "no Chrome for HyperFrames (npm run setup, or HYPERFRAMES_BROWSER_PATH)" };
  let browser: { close(): Promise<void>; newPage(): Promise<any> } | null = null;
  try {
    const { default: puppeteer } = await import("puppeteer-core");
    const headless = /headless[-_]shell/i.test(exe) ? "shell" : true;
    browser = await puppeteer.launch({
      executablePath: exe,
      headless,
      args: ["--allow-file-access-from-files", "--hide-scrollbars", "--force-color-profile=srgb", "--font-render-hinting=none", ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])],
    });
    const page = await browser!.newPage();
    page.setDefaultTimeout(opts.timeoutMs ?? 45_000);
    await page.setViewport({ width: SHEET_WIDTH, height: 1000, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlAbs).href, { waitUntil: "load" });
    const info = (await page.evaluate(async () => {
      await (document as any).fonts?.ready;
      await new Promise((r) => setTimeout(r, 150));
      const d = document.documentElement;
      return { height: Math.max(d.scrollHeight, document.body?.scrollHeight ?? 0), cells: document.querySelectorAll('[id^="frame-"]').length };
    })) as { height: number; cells: number };
    const height = Math.max(200, Math.min(MAX_HEIGHT, Math.ceil(info.height)));
    fs.mkdirSync(path.dirname(outJpg), { recursive: true });
    await page.screenshot({ path: outJpg, type: "jpeg", quality: 86, clip: { x: 0, y: 0, width: SHEET_WIDTH, height }, captureBeyondViewport: true });
    return { ok: true, file: outJpg, width: SHEET_WIDTH, height, cells: info.cells, cut: info.height > MAX_HEIGHT };
  } catch (e) {
    return { ok: false, error: (e as Error).message.split("\n")[0] };
  } finally {
    await browser?.close().catch(() => {});
  }
}
