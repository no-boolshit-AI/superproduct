#!/usr/bin/env tsx
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describeAuth, resolveBrand, runCarouselAgent } from "./agent.js";
import { isMockMode } from "./images/generate.js";
import type { Format } from "./config.js";

const HELP = `Usage: npm run generate -- [brief text] [options]

  -f, --file <path>       Read the brief from a file (markdown, txt). Combined with inline text if both given.
  -n, --slides <n>        Exact number of slides (default: agent decides, 4–6)
      --format <f>        square (1080×1080, default) | portrait (1080×1350)
  -a, --asset <path>      Your own image to use (photo, product shot). Repeatable.
      --brand <path>      Brand file; overrides the product folder's brand (default: the product's, else $BRAND_FILE,
                          else ./brand.json)
      --product <dir|id>  Product folder, or the id of one in workspace/products (default: $PRODUCT_DIR, else
                          workspace/product); "none" to ignore it
  -o, --out <dir>         Output root (default: $OUTPUT_DIR, else workspace/out/carousel)
  -m, --model <id>        Claude model (default: $CLAUDE_MODEL or the SDK default)
      --budget <usd>      Stop when the run's Claude spend reaches this (default: $MAX_BUDGET_USD)
  -q, --quiet             Only print the final summary

Example:
  npm run generate -- --file ../../workspace/briefs/reckitt.md --slides 5 --format portrait
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string", short: "f" },
    slides: { type: "string", short: "n" },
    format: { type: "string" },
    asset: { type: "string", short: "a", multiple: true },
    brand: { type: "string" },
    product: { type: "string" },
    out: { type: "string", short: "o" },
    model: { type: "string", short: "m" },
    budget: { type: "string" },
    quiet: { type: "boolean", short: "q" },
    help: { type: "boolean", short: "h" },
  },
});

const brief = [values.file ? fs.readFileSync(values.file, "utf8") : "", positionals.join(" ")].filter(Boolean).join("\n\n").trim();
if (values.help || !brief) {
  console.log(HELP);
  process.exit(values.help ? 0 : 1);
}
const format = (values.format ?? "square") as Format;
if (!["square", "portrait"].includes(format)) throw new Error(`--format must be square or portrait`);

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const short = (v: unknown, n = 110) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

const resolved = resolveBrand({ brandPath: values.brand, product: values.product });
console.log(dim(`Claude auth: ${describeAuth()}`));
console.log(dim(`Brand: ${resolved.brand.name} (${resolved.brand.source ?? "brand file"})${resolved.product ? `  ·  product context: ${resolved.product.name}` : "  ·  no product folder"}`));
console.log(dim(`Images: ${isMockMode() ? "MOCK placeholders (no OPENAI_API_KEY or IMAGE_MOCK=1)" : process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare"}`));

function log(msg: SDKMessage) {
  if (msg.type === "system" && msg.subtype === "init") {
    console.log(dim(`Model: ${msg.model}  credential source: ${msg.apiKeySource === "none" ? "subscription / OAuth" : msg.apiKeySource}`));
    return;
  }
  if (values.quiet) return;
  if (msg.type === "assistant") {
    for (const block of msg.message.content) {
      if (block.type === "text" && block.text.trim()) console.log(`\n${block.text.trim()}`);
      if (block.type === "tool_use") {
        const name = block.name.replace(/^mcp__carousel__/, "");
        const input = block.input as Record<string, unknown>;
        const detail =
          name === "write_slide" ? `#${input.index}`
          : name === "generate_image" ? `${input.name} [${input.style ?? "3d-mono"}] ${short(input.prompt, 80)}`
          : short(input, 80);
        console.log(dim(`→ ${name} ${detail}`));
      }
    }
  } else if (msg.type === "user" && Array.isArray(msg.message.content)) {
    for (const block of msg.message.content) {
      if (typeof block === "object" && block.type === "tool_result") {
        const parts = Array.isArray(block.content) ? block.content : [{ type: "text", text: String(block.content ?? "") }];
        const txt = parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
        const issues = txt.split("\n").filter((l) => /^(ERROR|WARNING)/.test(l));
        if (block.is_error || issues.length) console.log(dim(`  ${issues.length ? issues.join("\n  ") : short(txt, 200)}`));
      }
    }
  }
}

const run = await runCarouselAgent({
  brief,
  format,
  slides: values.slides ? Number(values.slides) : undefined,
  outDir: values.out,
  brandPath: values.brand,
  product: values.product,
  assets: values.asset,
  model: values.model,
  maxBudgetUsd: values.budget ? Number(values.budget) : undefined,
  onMessage: log,
});

console.log(`\n${"─".repeat(60)}\n${run.summary}\n`);
console.log(`Output: ${path.relative(process.cwd(), run.dir) || run.dir}`);
console.log(dim(`Turns: ${run.turns}  Claude cost: $${run.costUsd.toFixed(2)}`));
process.exit(run.ok ? 0 : 1);
