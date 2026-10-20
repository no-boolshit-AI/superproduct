/**
 * Product folder → carousel brand + prompt context.
 *
 * The product folder (the workspace's product/ by default; see lib/product.mjs and its README.md) holds the brand as design
 * tokens with semantic colour roles. The consulting look needs a canvas that carries light type, so the canvas is the
 * primary colour when white reads on it, otherwise the product's dark inverse colour, with the primary as the accent.
 * The other styles read the roles through a palette (src/palette.ts), plus the product's bright highlight colours.
 * product.json → agents.carousel can set every colour explicitly, the house style, the highlights and the fonts.
 */
import { colorToHex, contrast, darken, findProductDir, lighten, loadProduct, mix, readableOn, toOklch, type Product } from "../../../lib/product.mjs";
import { isStyleId, ROOT, type Brand, type StyleId } from "./config.js";
import { buildPalette } from "./palette.js";

export type { Product };

/** Explicit colour choices for this agent (product.json → agents.carousel.brand); values may be {token} references. */
export interface CarouselProductConfig {
  brand?: {
    canvas?: string;
    canvasDeep?: string;
    glow?: string;
    glow2?: string;
    glassTint?: string;
    accent?: string;
    onAccent?: string;
    accentOnLight?: string;
    surface?: string;
    ink?: string;
    onCanvas?: string;
  };
  wordmark?: "logo" | "text";
  imageStyle?: string;
  /** House style, preferred when the agent picks one (--style auto). */
  style?: StyleId;
  /** Bright fills for stickers, markers, tickers and tags (default: the bright, saturated colours in the tokens). */
  highlights?: string[];
  /** "brand" (default): the product's fonts in every style; "style": each style keeps its own type. */
  fonts?: "brand" | "style";
}

const DEFAULT_SANS = "Inter Tight";
const DEFAULT_SERIF = "Source Serif 4";

/** --product <dir|id|none> → PRODUCT_DIR → the workspace's product/ (see lib/product.mjs). Null when there is none. */
export function resolveProduct(explicit?: string): Product | null {
  const dir = findProductDir({ explicit, from: ROOT });
  return dir ? loadProduct(dir) : null;
}

export function brandFromProduct(p: Product): Brand {
  const r = p.roles;
  const cfg = p.agentConfig<CarouselProductConfig>("carousel");
  const o = cfg.brand ?? {};
  const canvas = o.canvas ?? (contrast(r.primary, "#ffffff") >= 3 ? r.primary : r.inverse);
  const canvasIsPrimary = canvas.toLowerCase() === r.primary.toLowerCase();
  const onCanvas = o.onCanvas ?? readableOn(canvas, ["#ffffff", r.text]);
  // On a primary-coloured canvas the classic look keeps white pills with primary text; on a dark canvas the
  // product's accent takes that job.
  const accent = o.accent ?? (canvasIsPrimary ? "#ffffff" : r.accent);
  const onAccent = o.onAccent ?? (canvasIsPrimary ? canvas : r.onAccent);
  const canvasDeep = o.canvasDeep ?? darken(canvas, 0.35);
  const glow = o.glow ?? (canvasIsPrimary ? lighten(canvas, 0.35) : r.accent);
  const glow2 = o.glow2 ?? (r.secondary.toLowerCase() !== canvas.toLowerCase() ? r.secondary : mix(canvas, "#ffffff", 0.25));
  const withFiles = (family: string | undefined) => (family && p.fontFiles([family]).length ? family : undefined);
  const sans = withFiles(p.fontFamily("sans"));
  const serif = withFiles(p.fontFamily("serif"));
  const display = withFiles(p.fontFamily("display"));
  const mono = withFiles(p.fontFamily("mono"));
  const narrow = withFiles(p.fontFamily("condensed"));
  const useLogo = cfg.wordmark !== "text";
  const logoDark = useLogo ? (p.logo("inverse") ?? null) : null;
  const logoLight = useLogo ? (p.logo("primary") ?? null) : null;
  if (cfg.style !== undefined && !isStyleId(cfg.style))
    throw new Error(`product.json agents.carousel.style: "${cfg.style}" isn't a style (consulting, bold, minimal, editorial, tech, paper)`);
  return {
    name: p.name,
    wordmark: {
      text: p.wordmark,
      // brand slides are dark or saturated: the inverse logo there, the normal one on light slides
      logo: logoDark ?? logoLight,
      logoOnLight: logoLight,
      mark: useLogo ? (p.logo("mark") ?? null) : null,
      font: "sans",
    },
    colors: {
      primary: canvas,
      primaryDeep: canvasDeep,
      primaryLight: glow,
      violet: glow2,
      surface: o.surface ?? r.background,
      ink: o.ink ?? r.text,
      onPrimary: onCanvas,
      accent,
      onAccent,
      accentOnCanvas: contrast(accent, canvas) >= 3 ? accent : onCanvas,
      accentOnLight: o.accentOnLight ?? r.accentText,
      shade: darken(canvasDeep, 0.55),
      // a dark canvas keeps a dark frosted panel; a bright accent at the bottom of the glass would muddy it
      glassTint: o.glassTint ?? (canvasIsPrimary ? undefined : mix(canvas, glow, 0.22)),
    },
    fonts: {
      sans: { family: sans ?? DEFAULT_SANS, files: null },
      serif: { family: serif ?? DEFAULT_SERIF, files: null },
      ...(display ? { display: { family: display, files: null } } : {}),
      ...(mono ? { mono: { family: mono, files: null } } : {}),
      ...(narrow ? { condensed: { family: narrow, files: null } } : {}),
    },
    fontFaceCss: p.fontFaceCss({ families: [...new Set([sans, serif, display, mono, narrow].filter((f): f is string => !!f))] }),
    imageStyle: cfg.imageStyle || p.imageStyle || `monochrome ${canvas} with ${glow} highlights`,
    palette: buildPalette({
      primary: r.primary,
      onPrimary: r.onPrimary,
      accent: r.accent,
      onAccent: r.onAccent,
      accentText: r.accentText,
      background: r.background,
      surface: r.surface,
      text: r.text,
      textMuted: r.textMuted,
      border: r.border,
      darkCandidates: [r.inverse, r.text],
      highlights: cfg.highlights ?? highlightColors(p),
      shape: p.shape,
    }),
    fontsMode: cfg.fonts === "style" ? "style" : "brand",
    houseStyle: cfg.style,
    source: `product folder: ${p.name}`,
  };
}

/**
 * The product's highlight fills: bright, saturated colours in its tokens (a lime, a yellow), never the roles. These
 * carry dark text, so they suit stickers, markers and tickers. Up to three, in token order.
 */
export function highlightColors(p: Product): string[] {
  const out: string[] = [];
  for (const [key, t] of p.tokens) {
    if (t.type !== "color" || !key.startsWith("color.") || key.startsWith("color.role.")) continue;
    let hex: string;
    try {
      hex = colorToHex(t.value);
    } catch {
      continue;
    }
    const { l, c } = toOklch(hex);
    if (l >= 0.78 && c >= 0.13 && !out.includes(hex)) out.push(hex);
  }
  return out.slice(0, 3);
}

/** Compiled product context for the system prompt (BRIEF.md + voice, messaging, facts). */
export function productContext(p: Product): string {
  return p.context("carousel", { maxChars: 24000 });
}
