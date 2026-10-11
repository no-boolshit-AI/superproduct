/**
 * Product folder → landing page.
 *
 * The product folder (the workspace's product/ by default; see lib/product.mjs and its README.md) is the source of truth for
 * the brand, voice and facts. For a site it becomes:
 * - PRODUCT.md in the site folder: the set_brand values, logo files, the main actions, and the compiled product context
 *   (BRIEF.md of the product plus the content and design profiles). Read-only for the agent.
 * - public/assets/brand/: the product's logo files (logo.svg, logo-inverse.svg, mark.svg), used by the nav, the footer
 *   and as the favicon.
 * product.json → agents.landing-page.brand sets the set_brand values explicitly; without it they come from the tokens.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { findProductDir, loadProduct, luminance, type Product } from "../../../lib/product.mjs";
import { FONT_IDS, FONTS, ROUNDNESS, type BrandInput, type FontId } from "./brand.js";
import { ROOT } from "./config.js";

export type { Product };

/** product.json → agents.landing-page. Colour values may be {token} references such as "{color.lime}". */
export interface LandingProductConfig {
  /** Context profiles to compile into PRODUCT.md (default: content, design). */
  profiles?: string[];
  /** set_brand values. Anything left out is derived from the tokens. */
  brand?: Partial<BrandInput>;
  /** Extra product files (paths inside the product folder) copied to public/assets/product/. */
  assets?: string[];
}

/** --product <dir|id|none> → PRODUCT_DIR → the workspace's product/ (see lib/product.mjs). Null when there is none. */
export function resolveProduct(explicit?: string): Product | null {
  const dir = findProductDir({ explicit, from: ROOT });
  return dir ? loadProduct(dir) : null;
}

const isFontId = (v: unknown): v is FontId => typeof v === "string" && (FONT_IDS as string[]).includes(v);
const isHex = (v: unknown): v is string => typeof v === "string" && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

/** set_brand's font id for a family name ("Instrument Sans" → instrument-sans), if it is in the list. */
export function fontIdFor(family: string | undefined): FontId | undefined {
  if (!family) return undefined;
  const want = family.toLowerCase().replace(/\s+variable$/, "").trim();
  return FONT_IDS.find((id) => FONTS[id].family.toLowerCase().replace(/\s+variable$/, "") === want);
}

/** The font role (sans/serif) a typography token uses, e.g. typography.heading → "sans". */
function typographyRole(p: Product, names: string[]): "sans" | "serif" | undefined {
  for (const n of names) {
    const fam = (p.token(`typography.${n}`)?.value as { fontFamily?: unknown } | undefined)?.fontFamily;
    const first = Array.isArray(fam) ? String(fam[0]) : typeof fam === "string" ? fam.split(",")[0].replace(/["']/g, "").trim() : undefined;
    if (!first) continue;
    if (first === p.fontFamily("serif")) return "serif";
    if (first === p.fontFamily("sans")) return "sans";
  }
  return undefined;
}

function headingWeight(p: Product): BrandInput["headingWeight"] {
  for (const n of ["heading", "title", "h2", "h1"]) {
    const w = Number((p.token(`typography.${n}`)?.value as { fontWeight?: unknown } | undefined)?.fontWeight);
    if ([400, 500, 600, 700].includes(w)) return w as BrandInput["headingWeight"];
  }
  return undefined;
}

/** The set_brand values for a product, and notes on anything that had to be approximated. */
export function brandInputFor(p: Product): { input: BrandInput; notes: string[] } {
  const cfg = p.agentConfig<LandingProductConfig>("landing-page") ?? {};
  const b = cfg.brand ?? {};
  const r = p.roles;
  const notes: string[] = [];
  const fontFor = (role: "sans" | "serif" | undefined, explicit: unknown, label: string): FontId | undefined => {
    if (isFontId(explicit)) return explicit;
    if (!role) return undefined;
    const family = p.fontFamily(role);
    const id = fontIdFor(family);
    if (id) return id;
    if (!family || /^(ui-|system-ui|sans-serif|serif)/.test(family)) return undefined;
    const fallback: FontId = role === "serif" ? "source-serif-4" : "inter";
    notes.push(`${label}: ${family} isn't in set_brand's font list, so ${FONTS[fallback].family} stands in. Add the font to the template to use it.`);
    return fallback;
  };
  const headRole = typographyRole(p, ["heading", "title", "display", "h1"]) ?? "sans";
  const bodyRole = typographyRole(p, ["body", "paragraph", "text"]) ?? "sans";
  const displayFont = fontFor(headRole, b.displayFont, "Headings") ?? "inter";
  const bodyFont = fontFor(bodyRole, b.bodyFont, "Body") ?? "inter";
  const serif = p.fontFamily("serif");
  const accentFont = isFontId(b.accentFont) ? b.accentFont : serif && fontIdFor(serif) && fontIdFor(serif) !== displayFont ? fontIdFor(serif) : undefined;
  const background = isHex(b.background) ? b.background : r.background.toLowerCase() !== "#ffffff" && luminance(r.background) >= 0.8 ? r.background : undefined;
  const roundness = b.roundness && b.roundness in ROUNDNESS ? b.roundness : p.shape in ROUNDNESS ? p.shape : "soft";
  const input: BrandInput = {
    primary: isHex(b.primary) ? b.primary : r.primary,
    secondary: isHex(b.secondary) ? b.secondary : r.secondary.toLowerCase() !== r.primary.toLowerCase() ? r.secondary : undefined,
    dark: isHex(b.dark) ? b.dark : r.inverse,
    background,
    displayFont,
    bodyFont,
    accentFont,
    headingWeight: b.headingWeight ?? headingWeight(p),
    roundness: roundness as BrandInput["roundness"],
  };
  for (const k of Object.keys(input) as (keyof BrandInput)[]) if (input[k] === undefined) delete input[k];
  return { input, notes };
}

export interface ProductFiles {
  /** Public URLs of the logo files copied into the site, by kind. */
  logos: { logo?: string; logoInverse?: string; mark?: string };
  /** Public URLs of extra product assets. */
  assets: string[];
}

/** Copy the product's logos (and configured extra assets) into the site's public/ folder. */
export function copyProductFiles(p: Product, siteDir: string): ProductFiles {
  const brandDir = path.join(siteDir, "public", "assets", "brand");
  const out: ProductFiles = { logos: {}, assets: [] };
  const put = (src: string | null, name: string): string | undefined => {
    if (!src || !existsSync(src)) return undefined;
    mkdirSync(brandDir, { recursive: true });
    const file = `${name}${path.extname(src).toLowerCase()}`;
    copyFileSync(src, path.join(brandDir, file));
    return `/assets/brand/${file}`;
  };
  out.logos.logo = put(p.logo("primary"), "logo");
  out.logos.logoInverse = put(p.logo("inverse"), "logo-inverse");
  out.logos.mark = put(p.logo("mark"), "mark");
  const cfg = p.agentConfig<LandingProductConfig>("landing-page") ?? {};
  for (const rel of cfg.assets ?? []) {
    const src = p.resolve(rel);
    if (!src.startsWith(p.dir + path.sep) || !existsSync(src)) continue;
    const dir = path.join(siteDir, "public", "assets", "product");
    mkdirSync(dir, { recursive: true });
    copyFileSync(src, path.join(dir, path.basename(src)));
    out.assets.push(`/assets/product/${path.basename(src)}`);
  }
  return out;
}

/** PRODUCT.md for the site folder: brand values for set_brand, logos, actions, then the compiled product context. */
export function productDoc(p: Product, files: ProductFiles): string {
  const { input, notes } = brandInputFor(p);
  const cta = (p.manifest.cta ?? {}) as Record<string, { label: string; url: string; note?: string }>;
  const ctaLines = Object.entries(cta).map(([k, v]) => `- ${k}: **${v.label}** → ${v.url}${v.note ? ` (${v.note})` : ""}`);
  const logoLines = [
    files.logos.logo && `- ${files.logos.logo}: the logo for light backgrounds. Set site.config.ts → brand.logoSrc to it (nav and footer).`,
    files.logos.logoInverse && `- ${files.logos.logoInverse}: the logo for dark (inverse) sections.`,
    files.logos.mark && `- ${files.logos.mark}: the mark alone; set_brand uses it as the favicon.`,
  ].filter(Boolean);
  const brandLines = [
    `- primary: ${input.primary}`,
    input.secondary && `- secondary: ${input.secondary}`,
    input.dark && `- dark: ${input.dark}`,
    input.background && `- background: ${input.background}`,
    `- displayFont: ${input.displayFont} · bodyFont: ${input.bodyFont}${input.accentFont ? ` · accentFont: ${input.accentFont}` : ""}`,
    input.headingWeight && `- headingWeight: ${input.headingWeight}`,
    `- roundness: ${input.roundness ?? "soft"}`,
  ].filter(Boolean);
  return [
    `# Product: ${p.name}`,
    "",
    `This file is generated from the product folder (${path.basename(p.dir)}/), the source of truth for ${p.name}'s brand, voice and facts. It is read-only. BRIEF.md says what this page is for; where the two disagree, BRIEF.md wins.`,
    "",
    "## Brand for set_brand",
    "",
    "Call set_brand with exactly these values unless BRIEF.md has its own Brand section:",
    "",
    ...brandLines,
    ...(notes.length ? ["", ...notes.map((n) => `Note: ${n}`)] : []),
    "",
    "Follow the visual rules in the brand guidelines below (how the accent is used, imagery, what to avoid).",
    ...(logoLines.length ? ["", "## Logo files (in public/)", "", ...logoLines] : []),
    ...(files.assets.length ? ["", "## Product images (in public/)", "", ...files.assets.map((a) => `- ${a}`), "", "Check their alt text and rights notes in the context below before using them."] : []),
    ...(ctaLines.length ? ["", "## Actions (use these labels and links unless BRIEF.md names others)", "", ...ctaLines] : []),
    "",
    "---",
    "",
    p.context("landing-page", { maxChars: 40000, purpose: "a marketing landing page" }),
    "",
  ].join("\n");
}
