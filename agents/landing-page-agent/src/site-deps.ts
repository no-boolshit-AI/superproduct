/**
 * The packages every generated site builds with (Next.js, React, Tailwind, the fonts) are installed once, next to the
 * sites: <sitesDir>/node_modules, from sites/package.json in this agent. A site resolves them by walking up from its
 * folder, and build.ts points Turbopack's root at <sitesDir>. The sites live in the workspace, so the first run in a
 * workspace installs them there (and again when this agent's sites/package.json changes).
 *
 *   npm run setup   →   tsx src/site-deps.ts   (also run by buildLandingPage and buildSite when they're missing)
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "./config.js";

/** sites/package.json + package-lock.json in this agent: the list of packages the sites need. */
const MANIFEST_DIR = path.join(config.root, "sites");
const FILES = ["package.json", "package-lock.json"];

const read = (f: string) => (existsSync(f) ? readFileSync(f, "utf8") : null);

/** True when `dir` has this agent's site packages installed. */
export function siteDepsReady(dir = config.sitesDir): boolean {
  return existsSync(path.join(dir, "node_modules", "next", "package.json")) && read(path.join(dir, "package.json")) === read(path.join(MANIFEST_DIR, "package.json"));
}

let installing: Promise<boolean> | null = null;

/** Install the site packages into `dir` when they're missing or out of date. Resolves to whether it installed. */
export function ensureSiteDeps(dir = config.sitesDir): Promise<boolean> {
  if (siteDepsReady(dir)) return Promise.resolve(false);
  // one install at a time (the API server can run several jobs)
  installing ??= install(dir).finally(() => (installing = null));
  return installing;
}

async function install(dir: string): Promise<boolean> {
  mkdirSync(dir, { recursive: true });
  if (path.resolve(dir) !== path.resolve(MANIFEST_DIR)) for (const f of FILES) if (existsSync(path.join(MANIFEST_DIR, f))) copyFileSync(path.join(MANIFEST_DIR, f), path.join(dir, f));
  console.log(`Installing the sites' packages (Next.js, Tailwind, fonts) into ${dir}: once per workspace, about a minute…`);
  const code = await new Promise<number>((resolve) => {
    const child = spawn("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", () => resolve(1));
    child.on("close", (c) => resolve(c ?? 1));
  });
  if (code !== 0) throw new Error(`npm install in ${dir} failed (exit ${code}). Run it there by hand, or npm run setup.`);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const installed = await ensureSiteDeps();
  if (!installed) console.log(`Site packages already installed in ${config.sitesDir}`);
}
