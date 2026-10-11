/**
 * Product folder → deck brand + prompt context.
 *
 * The product folder (the workspace's product/ by default; see lib/product.mjs and its README.md) holds the brand as design
 * tokens with semantic colour roles. They map onto the theme variables, so every theme takes the product's colours,
 * fonts and logo and keeps its own layout character. A light accent (one that can't be read as text on the page, like
 * a lime) stays a fill: text, icons and thin lines use the product's accent-text colour, and ==highlights== become a
 * marker behind the words. product.json → agents.deck can override any of it (see DeckProductConfig).
 */
import path from "node:path";
import { contrast, darken, findProductDir, hexToRgb, loadProduct, mix, readableOn, withContrast, type Product } from "../../../lib/product.mjs";
import { brandPathDefault, loadBrand, ROOT, type Brand, type BrandColors } from "./config.js";
import { isTheme, type ThemeId } from "./themes.js";

export type { Product };

/** A font role from the product's tokens (sans, serif, mono) or a font family name. */
type FontChoice = string;

/** product.json → agents.deck. Colour values may be {token} references such as "{color.lime}". */
export interface DeckProductConfig {
  /** Context profiles from product.json → context to compile for the agent (default: content, sales). */
  profiles?: string[];
  /** House theme: used unless the brief asks for another style or --theme fixes one. */
  theme?: string;
  /** Confidentiality line in the footer and on the back cover. */
  confidentiality?: string;
  /** Image prompt style; defaults to product.json → brand.imageStyle. */
  imageStyle?: string;
  /** Which font plays which part. Defaults come from the typography tokens (heading, body, *-accent). */
  fonts?: { heading?: FontChoice; body?: FontChoice; numbers?: FontChoice; accent?: FontChoice };
  /** Colour overrides for light themes and for dark themes (executive). */
  colors?: BrandColors;
  darkColors?: BrandColors;
  /** "marker" or "text" for ==highlights==; default: marker when the accent can't be read as text on the page. */
  highlightStyle?: "text" | "marker";
  /** Extra CSS custom properties, e.g. {"--title-weight": "500", "--accent-style": "normal"}. */
  vars?: Record<string, string | number>;
  /** "logo" (default when the product has logo files) or "text". */
  wordmark?: "logo" | "text";
}

export interface ResolvedBrand {
  brand: Brand;
  product: Product | null;
  /** The brand file used, or null when the brand came from the product folder. */
  brandFile: string | null;
  /** House theme from the product, if it names a valid one. */
  houseTheme?: ThemeId;
}

/** --product <dir|id|none> → PRODUCT_DIR → the workspace's product/ (see lib/product.mjs). Null when there is none. */
export function resolveProduct(explicit?: string): Product | null {
  const dir = findProductDir({ explicit, from: ROOT });
  return dir ? loadProduct(dir) : null;
}

/**
 * Brand and product for a job. Precedence: --brand (an explicit brand file) → the product folder's brand → BRAND_FILE
 * → ./brand.json. The product context (facts, voice) is used whenever a product folder is found, even with a brand file.
 */
export function resolveBrand(o: { brandPath?: string; product?: string }): ResolvedBrand {
  const product = resolveProduct(o.product);
  const cfg = product ? deckConfig(product) : undefined;
  const houseTheme = cfg?.theme && isTheme(cfg.theme) ? cfg.theme : undefined;
  if (o.brandPath) {
    const file = path.resolve(o.brandPath);
    return { brand: loadBrand(file), product, brandFile: file, houseTheme };
  }
  if (product) return { brand: brandFromProduct(product), product, brandFile: null, houseTheme };
  const file = brandPathDefault();
  return { brand: loadBrand(file), product: null, brandFile: file };
}

export function deckConfig(p: Product): DeckProductConfig {
  return p.agentConfig<DeckProductConfig>("deck") ?? {};
}

const dist = (a: string, b: string) => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

/** Up to 8 chart series colours from candidates: distinct from each other and visible on the page. */
function seriesFrom(candidates: (string | undefined)[], bg: string, text: string): string[] {
  const out: string[] = [];
  const pool = [...candidates, ...[0.3, 0.55, 0.75, 0.15, 0.85].map((t) => mix(text, bg, t))];
  for (const c of pool) {
    if (!c || !/^#[0-9a-f]{6}$/i.test(c)) continue;
    if (contrast(c, bg) < 1.25) continue;
    if (out.some((o) => dist(o, c) < 46)) continue;
    out.push(c);
    if (out.length === 8) break;
  }
  return out;
}

/** The font role (sans/serif/mono) or family a typography token uses, e.g. typography.heading → "sans". */
function typographyFont(p: Product, names: string[]): string | undefined {
  for (const n of names) {
    const v = p.token(`typography.${n}`)?.value as { fontFamily?: unknown } | undefined;
    const fam = v?.fontFamily;
    const first = Array.isArray(fam) ? String(fam[0]) : typeof fam === "string" ? fam.split(",")[0] : undefined;
    const name = first?.replace(/["']/g, "").trim();
    if (!name) continue;
    for (const role of ["sans", "serif", "mono"]) if (p.fontFamily(role) === name) return role;
    return name;
  }
  return undefined;
}

/** A CSS font stack for a role or family, or undefined when its files are missing (the theme's font is better then). */
function stackFor(p: Product, choice: string | undefined): { stack: string; family: string } | undefined {
  if (!choice) return undefined;
  const isRole = ["sans", "serif", "mono"].includes(choice);
  const family = isRole ? p.fontFamily(choice) : choice;
  if (!family) return undefined;
  const generic = /^(ui-|system-ui|sans-serif|serif|monospace)/.test(family);
  if (!generic && !p.fontFiles([family]).length) return undefined;
  const stack = (isRole ? p.fontStack(choice) : undefined) ?? `"${family}", var(--font-body-fallback)`;
  return { stack, family };
}

export function brandFromProduct(p: Product): Brand {
  const r = p.roles;
  const cfg = deckConfig(p);
  const bg = r.background;
  const inv = r.inverse;
  const onInv = r.onInverse;

  // ── light pages ────────────────────────────────────────────────────────────
  const accentOnDark = withContrast(r.accent, inv, 3);
  const secondaryOnDark = r.secondary && r.secondary.toLowerCase() !== r.accent.toLowerCase() && contrast(r.secondary, inv) >= 3 ? r.secondary : undefined;
  const accent2 = secondaryOnDark ?? accentOnDark;
  const lightAccent = contrast(r.accent, bg) < 3; // e.g. lime on off-white: a fill, never text
  const colors: BrandColors = {
    accent: r.accent,
    onAccent: r.onAccent,
    accentText: r.accentText,
    accentOnDark,
    accent2,
    // the highlighted bar in charts is a fill, so it keeps the accent even when the accent is light
    highlight: r.accent,
    dark: inv,
    onDark: onInv,
    ink: r.text,
    ink2: r.textMuted,
    muted: r.textSubtle,
    line: r.border,
    pageBg: bg,
    surface: r.surface,
    surface2: mix(r.surface, r.text, 0.07),
    node: inv,
    chartMuted: mix(r.text, bg, 0.74),
    chartAxis: r.textSubtle,
    series: seriesFrom([r.text, r.accentText, r.accent, r.textSubtle, r.secondary, mix(r.accentText, bg, 0.45)], bg, r.text),
    ...(cfg.colors ?? {}),
  };

  // ── dark themes: the product's inverse colour becomes the page ─────────────
  const darkAccent = contrast(r.accent, inv) >= 3 ? r.accent : accentOnDark;
  const darkColors: BrandColors = {
    accent: darkAccent,
    onAccent: readableOn(darkAccent, [r.onAccent, inv, onInv]),
    accentText: accentOnDark,
    accentOnDark,
    accent2,
    highlight: darkAccent,
    dark: darken(inv, 0.45),
    onDark: onInv,
    ink: onInv,
    ink2: mix(onInv, inv, 0.22),
    muted: mix(onInv, inv, 0.42),
    line: mix(onInv, inv, 0.8),
    pageBg: inv,
    surface: mix(inv, onInv, 0.07),
    surface2: mix(inv, onInv, 0.12),
    node: mix(inv, onInv, 0.16),
    chartMuted: mix(onInv, inv, 0.66),
    chartAxis: mix(onInv, inv, 0.45),
    series: seriesFrom([onInv, darkAccent, secondaryOnDark, mix(onInv, inv, 0.45), mix(darkAccent, inv, 0.45)], inv, onInv),
    ...(cfg.darkColors ?? {}),
  };

  // ── fonts ──────────────────────────────────────────────────────────────────
  const f = cfg.fonts ?? {};
  const heading = stackFor(p, f.heading ?? typographyFont(p, ["heading", "title", "h1", "h2", "display"]) ?? "sans");
  const body = stackFor(p, f.body ?? typographyFont(p, ["body", "paragraph", "text"]) ?? "sans");
  const accentFont = stackFor(p, f.accent ?? typographyFont(p, ["heading-accent", "display-accent", "quote", "accent"]));
  const numbers = stackFor(p, f.numbers) ?? heading;
  const used = [heading, body, accentFont, numbers].filter((x): x is { stack: string; family: string } => !!x).map((x) => x.family);

  // ── logo ───────────────────────────────────────────────────────────────────
  const useLogo = cfg.wordmark !== "text";
  const logo = useLogo ? p.logo("primary") : null;
  const logoOnDark = useLogo ? p.logo("inverse") : null;

  const company = (p.manifest.company ?? {}) as Record<string, string>;
  const holder = company.legalName ?? company.name;
  return {
    name: p.name,
    wordmark: { text: p.wordmark, logo: logo ?? logoOnDark, logoOnDark: logoOnDark ?? null },
    colors,
    darkColors,
    fonts: {},
    families: { heading: heading?.stack, body: body?.stack, numbers: numbers?.stack, accent: accentFont?.stack },
    fontFaceCss: p.fontFaceCss({ families: [...new Set(used)] }),
    vars: Object.fromEntries(Object.entries(cfg.vars ?? {}).map(([k, v]) => [k, String(v)])),
    highlightStyle: cfg.highlightStyle ?? (lightAccent ? "marker" : "text"),
    markerColor: lightAccent ? `color-mix(in srgb, ${r.accent} 70%, transparent)` : undefined,
    surfaceRing: contrast(r.surface, bg) < 1.2 ? r.border : undefined,
    confidentiality: cfg.confidentiality ?? (holder ? `${holder}. Confidential.` : "Confidential."),
    imageStyle: cfg.imageStyle || p.imageStyle || undefined,
    imagePalette: `${bg} background, ${r.text} ink, ${r.accent} accent used sparingly${secondaryOnDark ? `, ${r.secondary}` : ""}`,
    source: `product folder: ${p.name}`,
  };
}

/** Compiled product context for the system prompt (BRIEF.md + the deck's profiles, by default content and sales). */
export function productContext(p: Product): string {
  return p.context("deck", { maxChars: 40000, purpose: "business presentations and reports" });
}
