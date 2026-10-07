import "./env.js";
import { activeProduct } from "./product.js";
import type { ImageQuality } from "./tools/openaiImage.js";

export interface JobOptions {
  /** The brief: topic, angle, audience, and/or finished copy. */
  brief: string;
  /** Number of slides, or "auto" (agent decides: 1 for a single post, 5–7 for a carousel). */
  slides: number | "auto";
  /** Palette name, or "auto" (agent picks from the topic). */
  palette: string;
  /** Masthead text on every slide. */
  brand: string;
  /** Claude model for the agent (alias like "opus"/"sonnet" or a full model id). */
  model: string;
  imageModel: string;
  imageQuality: ImageQuality;
  /** Max images GPT Image may generate per job (Commons downloads don't count). */
  maxImages: number;
  /** Allow CC BY / CC BY-SA images (credits required). Public domain / CC0 are always allowed. */
  allowAttribution: boolean;
  /** PNG export scale: 1 = 1080x1350, 2 = 2160x2700. */
  scale: 1 | 2;
  /** Hard stop for the Claude spend of one run, in USD. */
  maxBudgetUsd: number;
  /** Product folder this post is for (facts, voice, brand palette); undefined = none. */
  product?: string;
  /** Use the product's fonts for headlines and body instead of the collage fonts. */
  brandFonts?: boolean;
}

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

/**
 * Defaults for a new job. Precedence: CLI flags (applied by the caller) → the product folder → .env → built-ins.
 * With a product folder the masthead is its wordmark and the palette its `brand` palette (or the one it names).
 */
export function defaults(): JobOptions {
  const env = process.env;
  const product = activeProduct();
  return {
    brief: "",
    slides: env.SLIDES && env.SLIDES !== "auto" ? num(env.SLIDES, 7) : "auto",
    palette: product?.palette ?? (env.PALETTE || "auto"),
    brand: product?.masthead ?? (env.BRAND_NAME || "Your Brand"),
    product: product?.dir,
    brandFonts: product?.brandFonts ?? false,
    model: env.AGENT_MODEL || "opus",
    imageModel: env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare",
    imageQuality: (env.OPENAI_IMAGE_QUALITY as ImageQuality) || "medium",
    maxImages: num(env.MAX_IMAGES, 10),
    allowAttribution: env.ALLOW_CC_BY === "1" || env.ALLOW_CC_BY === "true",
    scale: env.EXPORT_SCALE === "2" ? 2 : 1,
    maxBudgetUsd: num(env.MAX_BUDGET_USD, 6),
  };
}

export function checkKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_USE_BEDROCK && !process.env.CLAUDE_CODE_USE_VERTEX)
    missing.push("ANTHROPIC_API_KEY");
  return missing;
}
