import "./env.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { outputDir } from "../../../lib/workspace.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SRC_DIR = path.join(ROOT, "src");
export const DESIGN_DIR = path.join(SRC_DIR, "design");
/** Where jobs go: $OUTPUT_DIR, else the workspace's out/deck (see lib/workspace.mjs). */
export const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || outputDir("deck"));

/** Page formats. CSS px are 96 dpi, so 1 px = 0.75 pt in the PDF. */
export type FormatId = "deck" | "report";
export interface FormatSpec {
  id: FormatId;
  label: string;
  width: number; // CSS px
  height: number;
  pdf: [number, number]; // page size in PDF points
  inches: [number, number];
  previewScale: number; // scale of the JPEG preview handed to Claude
  minFont: number; // px; smaller text is flagged
  safe: number; // px from the page edge that text should keep clear of
}

export const FORMATS: Record<FormatId, FormatSpec> = {
  deck: {
    id: "deck",
    label: "16:9 presentation (13.33 × 7.5 in)",
    width: 1280,
    height: 720,
    pdf: [960, 540],
    inches: [13.333, 7.5],
    previewScale: 1,
    minFont: 11,
    safe: 24,
  },
  report: {
    id: "report",
    label: "A4 portrait report (210 × 297 mm)",
    width: 794,
    height: 1123,
    pdf: [595.28, 841.89],
    inches: [8.268, 11.693],
    previewScale: 1.25,
    minFont: 9,
    safe: 28,
  },
};

export const isFormat = (s: unknown): s is FormatId => s === "deck" || s === "report";

/** Pixel scale for the final PNGs from EXPORT_DPI (default 200 dpi). */
export function exportScale(): number {
  const dpi = Math.min(400, Math.max(96, Number(process.env.EXPORT_DPI) || 200));
  return dpi / 96;
}

export interface BrandFontFiles {
  family: string;
  /** weight → file path (woff2/woff/ttf/otf), relative to the brand file */
  files: Record<string, string>;
}

/** Theme colours a brand can override. Anything left out keeps the theme's palette. */
export type BrandColorKey =
  | "accent" // fills: highlighted cards, tags, KPI tiles, badges
  | "accent2" // second accent; on dark pages it marks bullets and section numbers
  | "onAccent" // text on accent fills
  | "accentText" // the accent as text, icons, bullets and thin lines on the page background
  | "accentOnDark" // the accent as text on dark pages and dark cards
  | "highlight" // the highlighted bar or series in charts
  | "dark" // dark pages and dark cards
  | "onDark"
  | "ink"
  | "ink2"
  | "muted"
  | "line"
  | "pageBg"
  | "surface"
  | "surface2"
  | "node" // diagram nodes
  | "chartMuted" // context bars and series next to the highlight
  | "chartAxis";
export type BrandColors = Partial<Record<BrandColorKey, string>> & { series?: string[] };

export interface Brand {
  name: string;
  /** logo: for light pages; logoOnDark: for dark pages (falls back to logo). */
  wordmark: { text: string; logo: string | null; logoOnDark?: string | null };
  /** Optional overrides of theme colours (light pages). */
  colors: BrandColors;
  /** Colours for dark themes (executive). Without them, dark themes keep their own palette and only take the accents. */
  darkColors?: BrandColors;
  /** Optional font overrides: heading and/or body family with local files. */
  fonts: { heading?: BrandFontFiles; body?: BrandFontFiles };
  /** Font stacks (CSS font-family values) from a product folder, and the @font-face rules that load them. */
  families?: { heading?: string; body?: string; numbers?: string; accent?: string };
  fontFaceCss?: string;
  /** Extra CSS custom properties for every page, e.g. {"--title-weight": "500"}. */
  vars?: Record<string, string>;
  /** "marker": ==highlighted== text gets the accent behind it (for light accents that can't be text); "text" (default): accent-coloured text. */
  highlightStyle?: "text" | "marker";
  /** Marker colour (default: the accent at 70%). */
  markerColor?: string;
  /** A hairline around filled cards, boxes and tiles, for surfaces that barely differ from the page (white cards on off-white). */
  surfaceRing?: string;
  confidentiality?: string;
  imageStyle?: string;
  /** Palette words for image prompts; replaces the theme's palette when set. */
  imagePalette?: string;
  /** Where the brand came from, for logs: a brand file path or "product folder: <name>". */
  source?: string;
}

export function brandPathDefault(): string {
  return path.resolve(process.env.BRAND_FILE?.trim() || path.join(ROOT, "brand.json"));
}

/** Load a brand file. Relative logo / font paths resolve against the brand file's folder. */
export function loadBrand(brandPath = brandPathDefault()): Brand {
  const abs = path.resolve(brandPath);
  const raw = JSON.parse(fs.readFileSync(abs, "utf8")) as Partial<Brand>;
  const base = path.dirname(abs);
  const resolve = (p: string | null | undefined) => (p ? path.resolve(base, p) : null);
  const brand: Brand = {
    name: raw.name ?? "Your Company",
    wordmark: { text: raw.wordmark?.text ?? raw.name ?? "Your Company", logo: resolve(raw.wordmark?.logo), logoOnDark: resolve(raw.wordmark?.logoOnDark) },
    colors: raw.colors ?? {},
    darkColors: raw.darkColors,
    fonts: raw.fonts ?? {},
    vars: raw.vars,
    highlightStyle: raw.highlightStyle,
    markerColor: raw.markerColor,
    surfaceRing: raw.surfaceRing,
    confidentiality: raw.confidentiality,
    imageStyle: raw.imageStyle,
    imagePalette: raw.imagePalette,
    source: abs,
  };
  for (const key of ["heading", "body"] as const) {
    const f = brand.fonts[key];
    if (f) for (const [w, p] of Object.entries(f.files)) f.files[w] = resolve(p)!;
  }
  return brand;
}

export function slugify(s: string, max = 48): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "document"
  );
}

export const pageName = (n: number) => `page-${String(n).padStart(2, "0")}`;
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
