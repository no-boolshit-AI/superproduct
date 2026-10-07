import fs from "node:fs";
import path from "node:path";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createRunDir, DEFAULT_BRAND_FILE, loadBrand, type Brand, type Format, type RunContext } from "./config.js";
import { brandFromProduct, productContext, resolveProduct, type Product } from "./product.js";
import { buildSystemPrompt } from "./prompt.js";
import { createCarouselServer, SERVER_NAME, TOOL_NAMES } from "./tools.js";
import { closeBrowser } from "./render/renderer.js";
import { isMockMode } from "./images/generate.js";

export interface CarouselRequest {
  brief: string;
  format?: Format;
  slides?: number;
  outDir?: string;
  /** Brand file; beats the product folder's brand. */
  brandPath?: string;
  /** Product folder (--product): a path, or "none" to run without one. Default: PRODUCT_DIR, else the nearest product/. */
  product?: string;
  assets?: string[]; // user files copied into assets/ (photos, product shots, logos)
  model?: string;
  maxBudgetUsd?: number;
  onMessage?: (msg: SDKMessage) => void;
}

export interface CarouselRun {
  dir: string;
  summary: string;
  costUsd: number;
  turns: number;
  ok: boolean;
}

/**
 * Environment for the Claude Code process. Auth, in the CLI's order of precedence:
 *  - ANTHROPIC_API_KEY: pay-as-you-go API key
 *  - CLAUDE_CODE_OAUTH_TOKEN: your Claude subscription (Pro/Max/Team), from `claude setup-token`
 *  - nothing set: the Claude Code login already on this machine (`claude` → /login), i.e. your subscription
 * Empty values (e.g. `ANTHROPIC_API_KEY=` left in .env) are removed so they don't shadow the subscription login.
 */
export function agentEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "carousel-agent/0.1.0" };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) if (!env[k]?.trim()) delete env[k];
  return env;
}

export function describeAuth(): string {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "Anthropic API key (ANTHROPIC_API_KEY)";
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim()) return "Claude subscription (CLAUDE_CODE_OAUTH_TOKEN)";
  return "Claude subscription via this machine's Claude Code login";
}

/**
 * Brand and product for a run. Precedence: --brand (an explicit brand file) → the product folder's brand → BRAND_FILE
 * → ./brand.json. The product context (facts, voice) is used whenever a product folder is found, even with a brand file.
 */
export function resolveBrand(req: Pick<CarouselRequest, "brandPath" | "product">): { brand: Brand; product: Product | null } {
  const product = resolveProduct(req.product);
  const brand = req.brandPath ? loadBrand(req.brandPath) : product ? brandFromProduct(product) : loadBrand();
  return { brand, product };
}

/** The brand file a run used, or null when the brand came from the product folder. */
function brandFileUsed(req: Pick<CarouselRequest, "brandPath">, product: Product | null): string | null {
  if (req.brandPath) return path.resolve(req.brandPath);
  if (product) return null;
  return path.resolve(process.env.BRAND_FILE?.trim() || DEFAULT_BRAND_FILE);
}

export async function runCarouselAgent(req: CarouselRequest): Promise<CarouselRun> {
  const format = req.format ?? "square";
  const { brand, product } = resolveBrand(req);
  const dir = createRunDir(req.outDir ?? "out", req.brief.split(/\s+/).slice(0, 6).join(" "));
  const ctx: RunContext = { dir, format, brand, product: product ? { dir: product.dir, name: product.name, context: productContext(product) } : undefined };

  const copied: string[] = [];
  for (const src of req.assets ?? []) {
    const dest = path.join("assets", `user-${path.basename(src).toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`);
    fs.copyFileSync(path.resolve(src), path.join(dir, dest));
    copied.push(dest);
  }
  fs.writeFileSync(path.join(dir, "brief.md"), req.brief);
  if (ctx.product) fs.writeFileSync(path.join(dir, "product-context.md"), ctx.product.context);
  fs.writeFileSync(
    path.join(dir, "run.json"),
    JSON.stringify({ format, brand: brandFileUsed(req, product), product: ctx.product?.dir ?? null, brandSource: brand.source ?? null }, null, 2),
  );

  const prompt = [
    "Create a LinkedIn carousel from this brief.",
    "",
    "<brief>",
    req.brief.trim(),
    "</brief>",
    "",
    `Slides: ${req.slides ? `exactly ${req.slides}` : "your call (4–6)"}`,
    `Format: ${format}`,
    copied.length ? `User-provided images (already in the run folder; use directly in slides or as reference_images): ${copied.join(", ")}` : "",
    isMockMode() ? "Note: OPENAI_API_KEY is not set, so generate_image returns mock placeholder art. Design as if they were real." : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const server = createCarouselServer(ctx);
  let summary = "";
  let costUsd = 0;
  let turns = 0;
  let ok = false;

  try {
    for await (const msg of query({
      prompt,
      options: {
        systemPrompt: buildSystemPrompt(ctx),
        model: req.model ?? process.env.CLAUDE_MODEL ?? undefined,
        cwd: dir,
        mcpServers: { [SERVER_NAME]: server },
        tools: ["Read"], // built-ins: only Read (briefs, reference files). Everything else goes through our tools.
        allowedTools: ["Read", ...TOOL_NAMES],
        permissionMode: "dontAsk", // anything not pre-approved is denied, never prompted
        settingSources: [], // isolate from the user's ~/.claude settings and CLAUDE.md files
        maxTurns: 80,
        maxBudgetUsd: req.maxBudgetUsd ?? (process.env.MAX_BUDGET_USD ? Number(process.env.MAX_BUDGET_USD) : undefined),
        env: agentEnv(),
      },
    })) {
      req.onMessage?.(msg);
      if (msg.type === "result") {
        costUsd = msg.total_cost_usd;
        turns = msg.num_turns;
        ok = msg.subtype === "success" && !msg.is_error;
        summary = msg.subtype === "success" ? msg.result : `Stopped: ${msg.subtype}`;
      }
    }
  } finally {
    await closeBrowser();
  }
  return { dir, summary, costUsd, turns, ok };
}
