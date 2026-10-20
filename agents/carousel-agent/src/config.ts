import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outputDir } from "../../../lib/workspace.mjs";
import { paletteFromBrandColors, type Palette } from "./palette.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DESIGN_DIR = path.join(ROOT, "src", "design");
/** Where runs go without --out: $OUTPUT_DIR, else the workspace's out/carousel (read when a run starts, after .env). */
export const defaultOutDir = () => path.resolve(process.env.OUTPUT_DIR || outputDir("carousel"));

export type Format = "square" | "portrait";
export const FORMATS: Record<Format, { width: number; height: number; label: string }> = {
  square: { width: 1080, height: 1080, label: "1080×1080 (1:1)" },
  portrait: { width: 1080, height: 1350, label: "1080×1350 (4:5)" },
};

/** Visual styles (src/styles.ts, src/design/styles/<id>.css). One per post. */
export const STYLE_IDS = ["consulting", "bold", "minimal", "editorial", "tech", "paper"] as const;
export type StyleId = (typeof STYLE_IDS)[number];
export const isStyleId = (s: unknown): s is StyleId => STYLE_IDS.includes(s as StyleId);

type FontFiles = Partial<Record<"300" | "400" | "500" | "600" | "700" | "800" | "900", string>> | null;

export interface Brand {
  name: string;
  /**
   * logo: shown on brand-coloured (dark) slides; logoOnLight: on light/white slides (defaults to logo);
   * mark: a square monogram or app icon (`.logo-mark`).
   */
  wordmark: { text: string; logo: string | null; logoOnLight?: string | null; mark?: string | null; font?: "serif" | "sans" };
  colors: {
    /** The slide canvas: a colour that carries light type. */
    primary: string;
    primaryDeep: string;
    /** Glow and duotone highlight. */
    primaryLight: string;
    /** Second glow colour. */
    violet: string;
    surface: string;
    ink: string;
    onPrimary: string;
    /** Fill of the CTA, pills, next arrow, badges and bars on brand slides (default white). */
    accent?: string;
    /** Text on that fill (default: the canvas colour). */
    onAccent?: string;
    /** Highlighted words and numbers (class "accent") on brand slides (default: onPrimary). */
    accentOnCanvas?: string;
    /** Highlighted words and numbers on light slides (default: the canvas colour). */
    accentOnLight?: string;
    /** Tint of shadows and vignettes (default deep navy). */
    shade?: string;
    /** Bottom colour of the frosted glass panel (default: primaryLight). */
    glassTint?: string;
  };
  /** A face counts as the brand's when it has files (or fontFaceCss covers it); otherwise each style uses its own. */
  fonts: {
    sans: { family: string; files: FontFiles };
    serif: { family: string; files: FontFiles };
    /** Headline face (a product's font.family.display). */
    display?: { family: string; files: FontFiles };
    /** A narrow headline face (a product's font.family.condensed). */
    condensed?: { family: string; files: FontFiles };
    mono?: { family: string; files: FontFiles };
  };
  imageStyle: string;
  /**
   * The brand's colour roles for the styles other than consulting (which uses `colors`). Set for a product folder and
   * for an explicit brand file; absent for the default brand.json, so each style shows its own designed palette.
   */
  palette?: Palette;
  /** "brand" (default): the brand's fonts in every style; "style": each style keeps its own type. */
  fontsMode?: "brand" | "style";
  /** The product's house style (product.json → agents.carousel.style), preferred when the agent picks. */
  houseStyle?: StyleId;
  /** Ready-made @font-face rules (from the product folder); families it covers need no `files`. */
  fontFaceCss?: string;
  /** Where the brand came from (brand file path or product folder), for logs and run.json. */
  source?: string;
}

export const DEFAULT_BRAND_FILE = path.join(ROOT, "brand.json");

/** Load brand.json (or a custom path). Relative logo/font paths resolve against the brand file. */
export function loadBrand(brandPath = process.env.BRAND_FILE?.trim() || DEFAULT_BRAND_FILE): Brand {
  const abs = path.resolve(brandPath);
  const brand = JSON.parse(fs.readFileSync(abs, "utf8")) as Brand;
  const base = path.dirname(abs);
  const resolve = (p: string | null | undefined) => (p ? path.resolve(base, p) : null);
  brand.wordmark.logo = resolve(brand.wordmark.logo);
  if (brand.wordmark.logoOnLight !== undefined) brand.wordmark.logoOnLight = resolve(brand.wordmark.logoOnLight);
  for (const key of ["sans", "serif", "display", "mono", "condensed"] as const) {
    const files = brand.fonts[key]?.files;
    if (files) for (const [w, p] of Object.entries(files)) (files as Record<string, string>)[w] = resolve(p)!;
  }
  if (brand.wordmark.mark) brand.wordmark.mark = resolve(brand.wordmark.mark);
  brand.source ??= `brand file: ${path.relative(process.cwd(), abs) || abs}`;
  // An explicit brand file colours every style; the default one only defines the classic consulting look.
  if (abs !== DEFAULT_BRAND_FILE) brand.palette ??= paletteFromBrandColors(brand.colors);
  return brand;
}

export interface RunContext {
  dir: string; // absolute run directory: assets/, slides/, build/, preview/, png/
  format: Format;
  brand: Brand;
  /** The product this carousel is for (from the product folder), if any. */
  product?: { dir: string; name: string; context: string };
  /** The visual style; null until the agent picks one with set_style (--style auto). */
  style: StyleId | null;
  /** True when the user fixed the style (--style <id>): set_style can't change it. */
  styleFixed?: boolean;
  /** One standalone graphic (an image post) instead of a swipeable carousel. */
  single?: boolean;
}

/** run.json: what a run used, so `npm run render` can rebuild it the same way. */
export function updateRunRecord(dir: string, patch: Record<string, unknown>) {
  const file = path.join(dir, "run.json");
  const run = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  fs.writeFileSync(file, JSON.stringify({ ...run, ...patch }, null, 2));
}

export function createRunDir(outRoot: string, slug: string): string {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const safe = slug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "carousel";
  const dir = path.resolve(outRoot, `${stamp}-${safe}`);
  for (const sub of ["assets", "slides", "build", "preview", "png"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  return dir;
}

export const slideFile = (n: number) => `slide-${String(n).padStart(2, "0")}`;

export function listSlides(runDir: string): string[] {
  const dir = path.join(runDir, "slides");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^slide-\d+\.html$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}
