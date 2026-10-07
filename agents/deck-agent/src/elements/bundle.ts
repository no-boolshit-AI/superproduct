import path from "node:path";
import { buildSync } from "esbuild";
import { SRC_DIR } from "../config.js";

let cached: string | null = null;

/** The in-browser element runtime as one IIFE script (built on first use with esbuild). */
export function runtimeScript(): string {
  if (cached) return cached;
  const res = buildSync({
    entryPoints: [path.join(SRC_DIR, "elements", "runtime", "index.ts")],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    write: false,
    minify: false,
    legalComments: "none",
  });
  cached = res.outputFiles[0].text;
  return cached;
}
