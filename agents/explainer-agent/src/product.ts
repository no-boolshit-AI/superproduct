/**
 * Product folder → the video's brand kit.
 *
 * The product folder (the workspace's product/ by default; see lib/product.mjs and its README.md) holds the brand as design
 * tokens with semantic colour roles. HyperFrames' explainer workflow remixes one of its frame presets onto brand
 * colours and fonts from capture/extracted/tokens.json (Step 2, build-frame.mjs), so the kit becomes:
 *  - tokens.json: the colours in roles (ground, ink, accent, readable accent) and the display/body family;
 *  - the font files the way HyperFrames' website capture leaves them (capture/assets/fonts/ plus their @font-face rules
 *    in capture/extracted/page.html), so build-frame and the caption builder load them with unicode and weight ranges
 *    intact; the frames load the copies in assets/fonts/captured-*;
 *  - logos under assets/brand/;
 *  - a "Brand kit" section appended to frame.md (design.md for workflows without build-frame), which the frame
 *    workers read: fonts, how the accent may be used, the logo files and the call to action.
 * product.json → agents.explainer can override any of it (see ExplainerProductConfig).
 */
import path from "node:path";
import { contrast, findProductDir, loadProduct, mix, readableOn, withContrast, type Product } from "../../../lib/product.mjs";
import { ROOT, isStyle, lookOf, type Look, type Style } from "./config.js";

export type { Product };

/** product.json → agents.explainer. Colour values may be {token} references such as "{color.brand}". */
export interface ExplainerProductConfig {
  /** Context profiles from product.json → context to compile for the agent (default: content, design). */
  profiles?: string[];
  /** The video's ground: "light" (the product's background colour, default) or "dark" (its inverse colour). */
  ground?: "light" | "dark";
  colors?: { canvas?: string; ink?: string; accent?: string; accent2?: string };
  /** Families (or the roles sans / serif / mono) for display + body text and an occasional accent face. */
  fonts?: { display?: string; body?: string; accent?: string };
  /** HyperFrames frame preset to prefer (a folder name in hyperframes-creative/frame-presets). */
  preset?: string;
  /** Default visual style for this product's videos ("editorial" | "vox-collage" | "default"); --style overrides it. */
  style?: string;
  /** The editorial style's look for this product ("colour-field" | "paper-data" | "documentary" | "duotone"); --look overrides it. */
  look?: string;
  /** Narration voice id used when --voice is on and no --voice-id is given. */
  voice?: string;
  /** Which product.json → cta entry closes the video (default: primary). */
  cta?: string;
  /** One paragraph of art direction for every video, e.g. "grid-paper texture on dark bands". */
  notes?: string;
  /**
   * Generated pictures: the house illustration style as a prompt-ready description (default: brand.imageStyle) and
   * reference illustrations (paths relative to the product folder) sent with every image request.
   */
  images?: { style?: string; references?: string[] };
}

export interface BrandColors {
  canvas: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  /** the accent where it must be read as text or a thin line on the ground */
  accentText: string;
  /** contrast band (the opposite ground) and its text */
  band: string;
  onBand: string;
}

export interface BrandKit {
  name: string;
  wordmark: string;
  /** "product folder: <name>" or "none (HyperFrames preset palette)" */
  source: string;
  ground: "light" | "dark";
  colors: BrandColors | null;
  fonts: { display?: string; body?: string; accent?: string; weights: number[] };
  /** @font-face rules for the frames: every brand face, unicode and weight ranges intact, from assets/fonts/captured-<name> */
  fontFaceCss: string;
  /** the same rules pointing at assets/fonts/<name>, as HyperFrames' capture writes them into capture/extracted/page.html */
  captureFontFaceCss: string;
  /** font files: absolute source → flat file name */
  fontFiles: { abs: string; name: string }[];
  logos: { light?: string; dark?: string; mark?: string };
  cta?: { label: string; url: string };
  preset?: string;
  /** the product's default style, when product.json names a known one */
  style?: Style;
  /** the product's editorial look, when product.json names a known one */
  look?: Look;
  voice?: string;
  notes?: string;
  imageStyle?: string;
  /** the illustration style for generated pictures: description and reference files (absolute, existing) */
  illustration?: { style: string; references: string[] };
  warnings: string[];
}

/** --product <dir|id|none> → PRODUCT_DIR → the workspace's product/ (see lib/product.mjs). Null when there is none. */
export function resolveProduct(explicit?: string): Product | null {
  const dir = findProductDir({ explicit, from: ROOT });
  return dir ? loadProduct(dir) : null;
}

export function explainerConfig(p: Product): ExplainerProductConfig {
  return p.agentConfig<ExplainerProductConfig>("explainer") ?? {};
}

const hexOk = (c: string | undefined): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);

/** Max − min channel of a #rrggbb: HyperFrames' own test for "is this colourful enough to be an accent". */
export function chroma(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** The family a typography token uses, e.g. typography.heading → "Instrument Sans". */
function typographyFamily(p: Product, names: string[]): string | undefined {
  for (const n of names) {
    const v = p.token(`typography.${n}`)?.value as { fontFamily?: unknown } | undefined;
    const fam = v?.fontFamily;
    const first = Array.isArray(fam) ? String(fam[0]) : typeof fam === "string" ? fam.split(",")[0] : undefined;
    const name = first?.replace(/["']/g, "").trim();
    if (name) return name;
  }
  return undefined;
}

/** A role (sans/serif/mono) or family → a family the product ships files for; undefined otherwise. */
function familyWithFiles(p: Product, choice: string | undefined): string | undefined {
  if (!choice) return undefined;
  const family = ["sans", "serif", "mono"].includes(choice) ? p.fontFamily(choice) : choice;
  if (!family || /^(ui-|system-ui|sans-serif|serif|monospace)/.test(family)) return undefined;
  return p.fontFiles([family]).length ? family : undefined;
}

/** "400 700" → [400, 500, 600, 700]; "500" → [500]. */
function weightsOf(spec: string | undefined): number[] {
  const nums = String(spec ?? "400")
    .split(/\s+/)
    .map((x) => parseInt(x, 10))
    .filter((x) => Number.isFinite(x));
  if (nums.length >= 2) {
    const out: number[] = [];
    for (let w = Math.ceil(nums[0] / 100) * 100; w <= nums[1]; w += 100) out.push(w);
    return out;
  }
  return nums.length ? [nums[0]] : [400];
}

export function brandKit(p: Product | null): BrandKit {
  if (!p)
    return { name: "none", wordmark: "", source: "none (HyperFrames preset palette)", ground: "light", colors: null, fonts: { weights: [] }, fontFaceCss: "", captureFontFaceCss: "", fontFiles: [], logos: {}, warnings: [] };
  const cfg = explainerConfig(p);
  const r = p.roles;
  const warnings: string[] = [];
  const ground = cfg.ground === "dark" ? "dark" : "light";
  const pick = (ref: string | undefined, fallback: string) => {
    const c = ref ? p.color(ref) : undefined;
    if (ref && !hexOk(c)) warnings.push(`agents.explainer colour "${ref}" isn't a colour; using ${fallback}`);
    return hexOk(c) ? c : fallback;
  };
  const canvas = pick(cfg.colors?.canvas, ground === "dark" ? r.inverse : r.background);
  const ink = pick(cfg.colors?.ink, ground === "dark" ? r.onInverse : r.text);
  const accent = pick(cfg.colors?.accent, r.accent);
  const accentText = pick(cfg.colors?.accent2, contrast(accent, canvas) >= 4.5 ? accent : ground === "light" && contrast(r.accentText, canvas) >= 4.5 ? r.accentText : withContrast(accent, canvas, 4.5));
  const colors: BrandColors = {
    canvas,
    ink,
    muted: ground === "dark" ? mix(ink, canvas, 0.3) : r.textMuted,
    accent,
    // the product's own on-accent colour when it reads; otherwise the most readable of its colours
    onAccent: hexOk(r.onAccent) && contrast(r.onAccent, accent) >= 4.5 ? r.onAccent : readableOn(accent, [r.onAccent, r.text, r.inverse, r.onInverse, "#000000", "#ffffff"]),
    accentText,
    band: ground === "dark" ? r.background : r.inverse,
    onBand: ground === "dark" ? r.text : r.onInverse,
  };
  if (cfg.style && !isStyle(cfg.style)) warnings.push(`agents.explainer.style "${cfg.style}" isn't a style this agent knows; using the default`);
  if (cfg.look && !lookOf(cfg.look)) warnings.push(`agents.explainer.look "${cfg.look}" isn't a look this agent knows; the agent picks one`);
  if (chroma(accent) <= 40) warnings.push(`the accent ${accent} is nearly grey, so HyperFrames keeps its preset accent; set agents.explainer.colors.accent`);

  const display = familyWithFiles(p, cfg.fonts?.display ?? typographyFamily(p, ["display", "heading", "title", "h1", "h2"]) ?? "sans");
  const body = familyWithFiles(p, cfg.fonts?.body ?? typographyFamily(p, ["body", "paragraph", "text"]) ?? "sans") ?? display;
  let accentFont = familyWithFiles(p, cfg.fonts?.accent ?? typographyFamily(p, ["heading-accent", "display-accent", "quote", "accent"]) ?? "serif");
  if (accentFont === display || accentFont === body) accentFont = undefined;
  const families = [...new Set([display, body, accentFont].filter((f): f is string => !!f))];
  // HyperFrames' capture convention: flat file names, the source under capture/assets/fonts/<name> and the copy the
  // frames load under assets/fonts/captured-<name>
  const used = new Set<string>();
  const fontFiles = families.flatMap((f) => p.fontFiles([f])).map((abs) => {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[-.]+/, "");
    let name = clean(path.basename(abs)) || "font.woff2";
    if (used.has(name)) name = `${clean(path.basename(path.dirname(abs)))}-${name}`;
    for (let n = 2; used.has(name); n++) name = name.replace(/(-\d+)?(\.[a-z0-9]+)$/, `-${n}$2`);
    used.add(name);
    return { abs, name };
  });
  const nameOf = (abs: string) => fontFiles.find((f) => f.abs === abs)?.name ?? path.basename(abs);
  const fontFaceCss = families.length ? p.fontFaceCss({ families, url: (abs: string) => `assets/fonts/captured-${nameOf(abs)}` }) : "";
  const captureFontFaceCss = families.length ? p.fontFaceCss({ families, url: (abs: string) => `assets/fonts/${nameOf(abs)}` }) : "";
  const weights = [
    ...new Set(
      p.fonts
        .filter((f) => f.family === display)
        .flatMap((f) => f.files.map((x) => x.weight))
        .flatMap((w) => weightsOf(w)),
    ),
  ].sort((a, b) => a - b);

  const refs = (cfg.images?.references ?? []).map((r) => ({ rel: r, abs: p.resolve(r) }));
  for (const r of refs) {
    if (!p.exists(r.rel)) warnings.push(`agents.explainer.images.references: ${r.rel} doesn't exist`);
    else if (!/\.(png|jpe?g|webp)$/i.test(r.rel)) warnings.push(`agents.explainer.images.references: ${r.rel} isn't a PNG, JPEG or WebP`);
  }
  const references = refs.filter((r) => p.exists(r.rel) && /\.(png|jpe?g|webp)$/i.test(r.rel)).map((r) => r.abs);
  const illustrationStyle = cfg.images?.style?.trim() || p.imageStyle?.trim();

  const ctaKey = cfg.cta ?? "primary";
  const cta = p.manifest.cta?.[ctaKey] ?? p.manifest.cta?.primary;
  return {
    name: p.name,
    wordmark: p.wordmark,
    source: `product folder: ${p.name}`,
    ground,
    colors,
    fonts: { display, body, accent: accentFont, weights: weights.length ? weights : [400, 700] },
    fontFaceCss,
    captureFontFaceCss,
    fontFiles,
    logos: { light: p.logo("primary") ?? undefined, dark: p.logo("inverse") ?? undefined, mark: p.logo("mark") ?? undefined },
    cta: cta ? { label: cta.label, url: cta.url } : undefined,
    preset: cfg.preset,
    style: isStyle(cfg.style) ? cfg.style : undefined,
    look: lookOf(cfg.look),
    voice: cfg.voice,
    notes: cfg.notes,
    imageStyle: p.imageStyle || undefined,
    illustration: illustrationStyle || references.length ? { style: illustrationStyle ?? "", references } : undefined,
    warnings,
  };
}

/** capture/extracted/tokens.json for HyperFrames' build-frame.mjs (colours in roles via colorStats, the brand families). */
export function tokensJson(kit: BrandKit, title: string, description: string): Record<string, unknown> {
  const c = kit.colors && chroma(kit.colors.accent) > 40 ? kit.colors : null;
  const fonts = [...new Set([kit.fonts.display, kit.fonts.body].filter((f): f is string => !!f))].map((family) => ({ family, weights: kit.fonts.weights }));
  return {
    title,
    description,
    colors: c ? [...new Set([c.canvas, c.ink, c.accent, c.accentText])] : [],
    fonts,
    // build-frame reads roles by function: canvas = most background area, ink = most text, accent = the colour used
    // as fills and in interactive roles, accent2 = the readable accent
    colorStats: c
      ? [
          { hex: c.canvas, areaBg: 1000, maxArea: 1000, bgCount: 50, interactiveBg: 0, textCount: 0, count: 100 },
          { hex: c.ink, areaBg: 0, maxArea: 0, bgCount: 0, interactiveBg: 0, textCount: 100, count: 100 },
          { hex: c.accent, areaBg: 20, maxArea: 20, bgCount: 10, interactiveBg: 20, textCount: 0, count: 30 },
          ...(c.accentText !== c.accent ? [{ hex: c.accentText, areaBg: 0, maxArea: 0, bgCount: 0, interactiveBg: 0, textCount: 10, count: 10 }] : []),
        ]
      : [],
  };
}

export const BRAND_MARKER = "<!-- explainer-agent:brand-kit -->";

const host = (url: string) => url.replace(/^mailto:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\?.*$/, "");

/** The section appended to frame.md after Step 2, so every frame worker builds in the brand. */
export function brandSection(kit: BrandKit, logos: { light?: string; dark?: string; mark?: string }): string {
  if (kit.name === "none") return "";
  const lines: string[] = [BRAND_MARKER, `## Brand kit (from the product folder · explainer-agent)`, ""];
  lines.push(`This video is for **${kit.name}**. These rules come from the product's design tokens and win over any preset prose that disagrees.`, "");
  if (kit.fontFaceCss) {
    lines.push(
      "**Fonts.** Local files in `assets/fonts/` — never link Google Fonts for them. Paste this `<style>` into every frame's `<template>`; it covers every brand face (an auto-generated font block above holds a subset of the same rules):",
      "",
      "```html",
      "<style>",
      kit.fontFaceCss.trim(),
      "</style>",
      "```",
      "",
    );
    const fam = [kit.fonts.display && `display and body: "${kit.fonts.display}"${kit.fonts.body && kit.fonts.body !== kit.fonts.display ? ` / "${kit.fonts.body}"` : ""}`, kit.fonts.accent && `accent face: "${kit.fonts.accent}", for one quote or statement at most, never body copy`].filter(Boolean);
    if (fam.length) lines.push(`- ${fam.join("; ")}.`, "");
  }
  const c = kit.colors;
  if (c) {
    const fillOnly = contrast(c.accent, c.canvas) < 3;
    lines.push("**Colours.**");
    lines.push(`- Ground \`${c.canvas}\`, ink \`${c.ink}\`, muted text \`${c.muted}\`.`);
    lines.push(
      fillOnly
        ? `- Accent \`${c.accent}\` is a fill, not a text colour on this ground: a button, a highlight bar behind one word, a marker, a progress line. Type on it is \`${c.onAccent}\`.`
        : `- Accent \`${c.accent}\`: highlights, buttons, one marked word; type on an accent fill is \`${c.onAccent}\`.`,
    );
    if (c.accentText !== c.accent) lines.push(`- The accent as text or a thin line on this ground: \`${c.accentText}\`.`);
    lines.push(`- A contrast band (one or two per video at most): \`${c.band}\` with \`${c.onBand}\` type.`, "");
  }
  const logoLines = [
    logos.light && `\`${logos.light}\` on light grounds`,
    logos.dark && `\`${logos.dark}\` on dark grounds`,
    logos.mark && `\`${logos.mark}\` as a small mark`,
  ].filter(Boolean);
  if (logoLines.length) lines.push(`**Logo.** ${logoLines.join(", ")}. Place the file; never redraw or retype it. The last frame carries the wordmark and the call to action.`, "");
  else if (kit.wordmark) lines.push(`**Wordmark.** "${kit.wordmark}" set in the display face on the last frame, with the call to action.`, "");
  if (kit.cta) lines.push(`**Call to action.** "${kit.cta.label}" · ${host(kit.cta.url)}`, "");
  if (kit.notes) lines.push(`**Art direction.** ${kit.notes}`, "");
  return lines.join("\n");
}

/** Compiled product context for the system prompt (BRIEF.md + the explainer's profiles, by default content and design). */
export function productContext(p: Product): string {
  return p.context("explainer", { maxChars: 30000, purpose: "explainer videos: motion graphics with on-screen text and optional narration" });
}
