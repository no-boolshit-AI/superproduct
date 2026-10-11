/**
 * Product folder → collage defaults: masthead, a `brand` palette, optional brand fonts and the prompt context.
 *
 * The product folder (the workspace's product/ by default; see lib/product.mjs and its README.md) defines the brand as design
 * tokens with semantic colour roles. product.json → agents["collage-post"] can pin the palette colours (`brandPalette`),
 * the default palette (`palette`, e.g. "brand"), the masthead and whether slides use the brand fonts (`fonts: "brand"`).
 */
import path from "node:path";
import { contrast, darken, findProductDir, lighten, loadProduct, mix, type Product } from "../../../lib/product.mjs";
import { getPalette, registerPalette, type PaletteBase } from "./palettes.js";
import { ROOT } from "./paths.js";

export type { Product };

export interface CollageProductConfig {
  profiles?: string[];
  /** Default palette for this product, e.g. "brand" (the palette derived below) or one of the built-in ones. */
  palette?: string;
  /** Pin any of the eight palette colours; values may be {token} references. */
  brandPalette?: Partial<PaletteBase>;
  /** "brand": headlines and body in the product's serif and sans; "style": keep the collage fonts. */
  fonts?: "brand" | "style";
  masthead?: string;
}

export interface ActiveProduct {
  product: Product;
  dir: string;
  masthead: string;
  /** Default palette for jobs of this product. */
  palette: string;
  brandFonts: boolean;
}

/** --product <dir|id|none> → PRODUCT_DIR → the workspace's product/ (see lib/product.mjs). */
export function resolveProduct(explicit?: string): Product | null {
  const dir = findProductDir({ explicit, from: ROOT });
  return dir ? loadProduct(dir) : null;
}

/** A dark collage palette built from the product's colour roles, with anything pinned in product.json on top. */
export function brandPaletteFor(p: Product): PaletteBase {
  const r = p.roles;
  const o = p.agentConfig<CollageProductConfig>("collage-post").brandPalette ?? {};
  const bg = o.bg ?? (contrast(r.inverse, "#ffffff") >= 12 ? r.inverse : darken(r.inverse, 0.5));
  const ink = o.ink ?? [r.accent, r.primary, lighten(r.accent, 0.5)].find((c) => contrast(c, bg) >= 4.5) ?? "#ffffff";
  const ink2 = o.ink2 ?? mix(ink, "#ffffff", 0.6);
  let loud = o.loud;
  if (!loud) {
    // a deep, saturated take on the brand colour that keeps ink and ink2 readable (the "loud" slide)
    const base = r.accent;
    for (let t = 0.3; t <= 0.9; t += 0.05) {
      const c = darken(base, t);
      if (contrast(ink, c) >= 4.5 && contrast(ink2, c) >= 4.5) {
        loud = c;
        break;
      }
    }
    loud ??= darken(base, 0.75);
  }
  return {
    name: "brand",
    label: o.label ?? p.name,
    mode: o.mode ?? "dark",
    mood: o.mood ?? `The ${p.name} brand colours. Use it unless the brief asks for another palette.`,
    bg,
    ink,
    ink2,
    loud,
    deep: o.deep ?? mix(loud, bg, 0.45),
    slab: o.slab ?? mix(loud, bg, 0.3),
    frame: o.frame ?? darken(bg, 0.4),
    onInk: o.onInk ?? bg,
  };
}

let cache: { key: string; value: ActiveProduct | null } | undefined;

/**
 * The product for this process (PRODUCT_DIR, else the workspace's product/), with its `brand` palette registered.
 * Cached per PRODUCT_DIR value; the CLI sets PRODUCT_DIR from --product before reading defaults.
 */
export function activeProduct(): ActiveProduct | null {
  const key = process.env.PRODUCT_DIR ?? "";
  if (cache?.key === key) return cache.value;
  const product = resolveProduct();
  let value: ActiveProduct | null = null;
  if (product) {
    registerPalette(brandPaletteFor(product));
    const cfg = product.agentConfig<CollageProductConfig>("collage-post");
    const palette = cfg.palette && (cfg.palette === "auto" || getPalette(cfg.palette)) ? cfg.palette : "brand";
    value = { product, dir: product.dir, masthead: cfg.masthead ?? product.wordmark, palette, brandFonts: cfg.fonts === "brand" };
  }
  cache = { key, value };
  return value;
}

/** Product loaded from a job's recorded folder (revisions); null if it's gone. */
export function productAt(dir: string | undefined): Product | null {
  if (!dir) return null;
  try {
    return loadProduct(dir);
  } catch {
    return null;
  }
}

/** Compiled context for the system prompt and the job's PRODUCT.md. */
export function productContext(p: Product): string {
  return p.context("collage-post", { maxChars: 24000 });
}

/** Font files to copy into the job's _design/fonts/brand/ and the CSS that switches .hl/.body to them. */
export function brandFontKit(p: Product): { files: string[]; css: string; serif?: string; sans?: string } {
  const serif = p.fontFamily("serif");
  const sans = p.fontFamily("sans");
  const families = [serif, sans].filter((f): f is string => !!f && p.fontFiles([f]).length > 0);
  if (!families.length) return { files: [], css: "" };
  const faces = p.fontFaceCss({ families, url: (abs) => `fonts/brand/${path.basename(abs)}` });
  const vars = [
    families.includes(serif ?? "") ? `--serif:"${serif}",Georgia,"Times New Roman",serif;` : "",
    families.includes(sans ?? "") ? `--sans:"${sans}","Helvetica Neue",Arial,sans-serif;` : "",
  ].join("");
  return {
    files: p.fontFiles(families),
    // html:root outranks the :root in collage.css, which is imported after this file
    css: `/* Brand fonts from the product folder (${p.name}) */\n${faces}\nhtml:root{${vars}}\n`,
    serif: families.includes(serif ?? "") ? serif : undefined,
    sans: families.includes(sans ?? "") ? sans : undefined,
  };
}
