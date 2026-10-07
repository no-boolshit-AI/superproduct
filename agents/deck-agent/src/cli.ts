#!/usr/bin/env tsx
import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describeAuth, readJob, runJob } from "./agent.js";
import type { JobOptions } from "./events.js";
import { imagesEnabled, isMockMode } from "./images.js";
import { resolveBrand } from "./product.js";
import { closeBrowser } from "./render/renderer.js";
import { isFormatOrAuto, isThemeOrAuto } from "./tools.js";

const HELP = `Usage: npm run deck -- [brief text] [options]

  -f, --file <path>       Brief from a file (markdown/txt); combined with inline text if both given
      --format <f>        auto (default) | deck (16:9) | report (A4 portrait)
  -t, --theme <t>         auto (default) | strategy (McKinsey-style) | corporate | executive | swiss | editorial
  -n, --pages <n>         Target page count
  -i, --input <path>      A file for the agent: data (csv/xlsx/json), documents (md/txt/pdf), images. Repeatable.
      --audience <text>   Who will read/see it
      --lang <code>       Output language, e.g. en, de, ro
      --product <dir>     Product folder for brand, voice and facts, or "none" (default: $PRODUCT_DIR, then the
                          nearest product/ folder above the agent)
      --brand <path>      Brand file; overrides the product folder's brand (default: product folder, then
                          $BRAND_FILE, then ./brand.json)
  -m, --model <id>        Claude model (default $CLAUDE_MODEL / SDK default)
      --budget <usd>      Stop when Claude spend reaches this (default $MAX_BUDGET_USD)
      --revise <job-id>   Revise an existing job; the brief text becomes the change request
  -q, --quiet             Only print the final summary

Examples:
  npm run deck -- --file briefs/board-strategy.md --theme strategy --pages 14
  npm run deck -- "Market entry assessment for e-bikes in Romania" --format report -i data/market.xlsx
  npm run deck -- --revise 20261006-142233-market-entry "Make page 4 a waterfall and add an appendix with the raw data"
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string", short: "f" },
    format: { type: "string" },
    theme: { type: "string", short: "t" },
    pages: { type: "string", short: "n" },
    input: { type: "string", short: "i", multiple: true },
    audience: { type: "string" },
    lang: { type: "string" },
    brand: { type: "string" },
    product: { type: "string" },
    model: { type: "string", short: "m" },
    budget: { type: "string" },
    revise: { type: "string" },
    quiet: { type: "boolean", short: "q" },
    help: { type: "boolean", short: "h" },
  },
});

const brief = [values.file ? fs.readFileSync(values.file, "utf8") : "", positionals.join(" ")].filter(Boolean).join("\n\n").trim();
if (values.help || !brief) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}
const format = values.format ?? "auto";
const theme = values.theme ?? "auto";
if (!isFormatOrAuto(format)) throw new Error("--format must be auto, deck or report");
if (!isThemeOrAuto(theme)) throw new Error("--theme must be auto, strategy, corporate, executive, swiss or editorial");
for (const f of values.input ?? []) if (!fs.existsSync(f)) throw new Error(`Input not found: ${f}`);

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
console.log(dim(`Claude auth: ${describeAuth()}`));
{
  const r = resolveBrand({ brandPath: values.brand, product: values.product });
  console.log(dim(`Brand: ${r.brand.name} (${r.brand.source ?? "brand file"})${r.product ? `  ·  product context: ${r.product.name}${r.houseTheme ? `, house theme ${r.houseTheme}` : ""}` : "  ·  no product folder"}`));
}
console.log(dim(`Images: ${imagesEnabled() ? (isMockMode() ? "mock placeholders" : process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare") : "off (no OPENAI_API_KEY)"}`));

function onMessage(msg: SDKMessage) {
  if (msg.type === "system" && msg.subtype === "init") console.log(dim(`Model: ${msg.model}`));
  if (values.quiet) return;
  if (msg.type === "assistant") {
    for (const b of msg.message.content) if (b.type === "text" && b.text.trim()) console.log(`\n${b.text.trim()}`);
  } else if (msg.type === "user" && Array.isArray(msg.message.content)) {
    for (const block of msg.message.content) {
      if (typeof block === "object" && block.type === "tool_result") {
        const parts = Array.isArray(block.content) ? block.content : [{ type: "text", text: String(block.content ?? "") }];
        const txt = parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
        const issues = txt.split("\n").filter((l) => /^(ERROR|WARNING)/.test(l));
        if (block.is_error || issues.length) console.log(dim(`  ${(issues.length ? issues : [txt.slice(0, 200)]).join("\n  ")}`));
      }
    }
  }
}

const options: JobOptions = {
  brief,
  format,
  theme,
  pages: values.pages ? Number(values.pages) : undefined,
  audience: values.audience,
  language: values.lang,
  // absolute paths, so a revision started from another folder (or the web UI) finds the same files
  brandPath: values.brand ? path.resolve(values.brand) : undefined,
  product: values.product && !/^(none|off|false|0)$/i.test(values.product) ? path.resolve(values.product) : values.product,
  model: values.model,
  maxBudgetUsd: values.budget ? Number(values.budget) : undefined,
  inputs: (values.input ?? []).map((f) => path.resolve(f)),
};
if (values.revise && !readJob(values.revise)) throw new Error(`No job ${values.revise} in out/`);

try {
  const job = await runJob({
    options,
    reviseJobId: values.revise,
    instructions: values.revise ? brief : undefined,
    onMessage,
    emit: (e) => {
      if (e.type === "tool" && !values.quiet) console.log(dim(`→ ${e.summary}`));
      if (e.type === "status") console.log(dim(`· ${e.message}`));
      if (e.type === "error") console.error(`! ${e.message}`);
    },
  });
  console.log(`\n${"─".repeat(64)}\n${job.summary ?? job.error ?? ""}\n`);
  console.log(`Job:    ${job.id}`);
  console.log(`Folder: ${path.relative(process.cwd(), job.dir) || job.dir}`);
  if (job.pdf) console.log(`PDF:    ${path.relative(process.cwd(), path.join(job.dir, job.pdf))}`);
  console.log(dim(`Cost: $${(job.costUsd ?? 0).toFixed(2)}`));
  process.exitCode = job.status === "done" ? 0 : 1;
} finally {
  await closeBrowser();
}
