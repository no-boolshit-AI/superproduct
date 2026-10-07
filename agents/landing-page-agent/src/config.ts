import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env from the project root if present (Node >= 20.12).
const envFile = path.join(ROOT, ".env");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* ignore malformed .env; real env vars still apply */
  }
}
// An empty `ANTHROPIC_API_KEY=` line would otherwise shadow a Claude subscription login.
for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) {
  if (process.env[k] === "") delete process.env[k];
}

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  root: ROOT,
  styleguideDir: path.join(ROOT, "styleguide"),
  templateDir: path.join(ROOT, "template"),
  sitesDir: path.resolve(process.env.LPA_SITES_DIR ?? path.join(ROOT, "sites")),
  /** Model alias or full ID passed to the Agent SDK. */
  model: process.env.LPA_MODEL ?? "opus",
  maxBudgetUsd: num(process.env.LPA_MAX_BUDGET_USD, 8),
  maxTurns: num(process.env.LPA_MAX_TURNS, 120),
  /** Max visual review rounds the agent is told to do. */
  reviewRounds: num(process.env.LPA_REVIEW_ROUNDS, 2),
  port: num(process.env.LPA_PORT, 8787),
  apiToken: process.env.LPA_API_TOKEN ?? "",
  concurrency: Math.max(1, num(process.env.LPA_CONCURRENCY, 1)),
  chromiumPath: process.env.LPA_CHROMIUM_PATH || undefined,
  /** Extra words that must never appear in generated copy (comma separated). */
  denylist: (process.env.LPA_DENYLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export type Config = typeof config;
