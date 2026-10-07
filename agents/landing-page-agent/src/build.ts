import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export type BuildResult = { ok: boolean; durationMs: number; output: string };

const ANSI = /\x1b\[[0-9;]*m/g;

/** Locate the `next` CLI: the site's own node_modules, else the shared sites/node_modules. */
function nextBin(siteDir: string): { bin: string; turbopackRoot: string } {
  const local = path.join(siteDir, "node_modules", "next", "dist", "bin", "next");
  if (existsSync(local)) return { bin: local, turbopackRoot: siteDir };
  const shared = path.join(config.sitesDir, "node_modules", "next", "dist", "bin", "next");
  if (existsSync(shared)) return { bin: shared, turbopackRoot: config.sitesDir };
  throw new Error(`Next.js not installed. Run \`npm run setup\` (expects ${shared}).`);
}

/** `next build` with static export. Returns the tail of the log for the agent. */
export function buildSite(siteDir: string, timeoutMs = 300_000): Promise<BuildResult> {
  const { bin, turbopackRoot } = nextBin(siteDir);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, "build"], {
      cwd: siteDir,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", LPA_TURBOPACK_ROOT: turbopackRoot, FORCE_COLOR: "0" },
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = log.replace(ANSI, "").split("\n");
      const ok = code === 0 && existsSync(path.join(siteDir, "out", "index.html"));
      resolve({ ok, durationMs: Date.now() - started, output: lines.slice(-120).join("\n").trim() });
    });
  });
}
