import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DESIGN_DIR, type Brand, type BrandColors } from "./config.js";

const require = createRequire(import.meta.url);

export type ThemeId = "strategy" | "corporate" | "executive" | "swiss" | "editorial";

interface FontNeed {
  pkg: string; // fontsource package
  weights: number[];
  italic?: number[];
}

export interface Theme {
  id: ThemeId;
  label: string;
  description: string;
  bestFor: string;
  fonts: FontNeed[];
  /** Short note for the agent on how this theme wants to be used. */
  guidance: string;
  /** Palette description used in image prompts. */
  imagePalette: string;
  /** Dark pages throughout (light type on a dark background). A brand's darkColors apply to these themes. */
  dark?: boolean;
}

export const THEMES: Record<ThemeId, Theme> = {
  strategy: {
    id: "strategy",
    imagePalette: "deep navy #051C2C, electric blue #2251FF, cyan #00A9F4, cool greys and white",
    label: "Strategy consulting (McKinsey-style)",
    description:
      "White pages, deep navy ink, one electric-blue accent, serif action titles over a clean sans body. Hairlines, no decoration, every exhibit sourced.",
    bestFor: "Board and steering-committee decks, strategy reviews, due diligence, McKinsey/BCG/Bain-style reports",
    fonts: [
      { pkg: "@fontsource/source-serif-4", weights: [400, 500, 600], italic: [400] },
      { pkg: "@fontsource/inter", weights: [300, 400, 500, 600, 700] },
    ],
    guidance:
      "Use for anything that should read like a top-tier consulting deliverable. Action titles are full sentences. Charts are navy/grey with the accent reserved for the one series or bar that carries the message. Keep backgrounds white except cover and section dividers.",
  },
  corporate: {
    id: "corporate",
    imagePalette: "deep blue #12355B, teal #00A19B, warm amber #F2A900, light grey",
    label: "Modern corporate",
    description:
      "Friendly, confident corporate look: bold sans headings, soft grey cards with rounded corners, teal/blue palette with an amber highlight, icons.",
    bestFor: "Company presentations, quarterly business reviews, product and sales decks, internal updates, annual reports",
    fonts: [{ pkg: "@fontsource/ibm-plex-sans", weights: [300, 400, 500, 600, 700], italic: [400] }],
    guidance:
      "Cards, icons and KPI tiles work well. Use the accent colours generously but keep one colour per meaning. Titles can be shorter than consulting action titles but must still state the point.",
  },
  executive: {
    id: "executive",
    dark: true,
    imagePalette: "very dark navy #0B1320, muted gold #D0A85C, soft blue #6FA8FF, low-key lighting",
    label: "Executive dark",
    description: "Dark navy pages, light type, muted gold accent, large thin numbers. Premium, keynote-like.",
    bestFor: "Investor and board keynotes, vision and strategy narratives, leadership offsites, few-words-per-page decks",
    fonts: [
      { pkg: "@fontsource/inter-tight", weights: [300, 400, 500, 600] },
      { pkg: "@fontsource/inter", weights: [300, 400, 500, 600] },
    ],
    guidance:
      "Fewer words per page, bigger numbers, more statement pages. Gold is the highlight; never more than one gold element per chart.",
  },
  swiss: {
    id: "swiss",
    imagePalette: "black, white, light greys and a single signal red #E30613",
    label: "Swiss minimal",
    description: "International typographic style: black on white, one signal red, strict grid, heavy hairlines, tight grotesk headlines.",
    bestFor: "Design-led companies, research summaries, architecture/engineering, product strategy, anything that should feel precise",
    fonts: [
      { pkg: "@fontsource/inter-tight", weights: [400, 500, 600, 700] },
      { pkg: "@fontsource/inter", weights: [400, 500, 600] },
    ],
    guidance: "Lean on typography and alignment. Red is used sparingly for the single most important mark on each page.",
  },
  editorial: {
    id: "editorial",
    imagePalette: "warm paper #F7F3EC, forest green #233A33, terracotta #B5462C, ochre #D8A657",
    label: "Editorial",
    description: "Warm paper background, Playfair Display headlines, serif body in reports, terracotta and forest accents, pull quotes.",
    bestFor: "Whitepapers, thought-leadership and research reports, annual reviews, ESG/impact reports, long-form narratives",
    fonts: [
      { pkg: "@fontsource/playfair-display", weights: [400, 500, 600, 700], italic: [400, 500] },
      { pkg: "@fontsource/source-serif-4", weights: [400, 500, 600], italic: [400] },
      { pkg: "@fontsource/inter", weights: [400, 500, 600] },
    ],
    guidance: "Use chapter openers, pull quotes and generous margins. Charts stay simple; photography (user-supplied or generated) suits this theme best.",
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
export const isTheme = (s: unknown): s is ThemeId => typeof s === "string" && s in THEMES;

const fontCssCache = new Map<string, string>();

/** @font-face rules for one fontsource package, rewritten to absolute file:// URLs (works offline, no network). */
function fontsourceCss(need: FontNeed): string {
  const key = JSON.stringify(need);
  const hit = fontCssCache.get(key);
  if (hit) return hit;
  const dir = path.dirname(require.resolve(`${need.pkg}/package.json`));
  const files = [...need.weights.map((w) => `${w}.css`), ...(need.italic ?? []).map((w) => `${w}-italic.css`)];
  const css = files
    .map((f) => path.join(dir, f))
    .filter((f) => fs.existsSync(f))
    .map((f) =>
      fs
        .readFileSync(f, "utf8")
        .replace(/url\(\.\/files\/([^)]+)\)/g, (_, file) => `url("${pathToFileURL(path.join(dir, "files", file)).href}")`)
        .replace(/font-display:\s*swap/g, "font-display: block"),
    )
    .join("\n");
  fontCssCache.set(key, css);
  return css;
}

function brandFontCss(brand: Brand): string {
  const out: string[] = [];
  for (const key of ["heading", "body"] as const) {
    const f = brand.fonts[key];
    if (!f) continue;
    for (const [weight, file] of Object.entries(f.files)) {
      const italic = /italic/i.test(weight);
      const w = parseInt(weight, 10) || 400;
      out.push(
        `@font-face{font-family:"${f.family}";font-style:${italic ? "italic" : "normal"};font-weight:${w};font-display:block;src:url("${pathToFileURL(file).href}")}`,
      );
    }
  }
  return out.join("\n");
}

export function fontCss(theme: ThemeId, brand: Brand): string {
  return [...THEMES[theme].fonts.map(fontsourceCss), brandFontCss(brand), brand.fontFaceCss ?? ""].join("\n");
}

const cssFile = (name: string) => fs.readFileSync(path.join(DESIGN_DIR, name), "utf8");

export function themeCss(theme: ThemeId): string {
  return cssFile(path.join("themes", `${theme}.css`));
}

export function baseCss(): string {
  return cssFile("base.css");
}

const cssStr = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\A ")}"`;

const COLOR_VARS: [keyof BrandColors, string[]][] = [
  ["accent", ["--accent"]],
  ["accent2", ["--accent-2"]],
  ["onAccent", ["--on-accent"]],
  ["accentText", ["--accent-text"]],
  ["accentOnDark", ["--accent-on-dark"]],
  ["dark", ["--dark"]],
  ["onDark", ["--on-dark"]],
  ["ink", ["--ink", "--line-strong"]],
  ["ink2", ["--ink-2"]],
  ["muted", ["--muted"]],
  ["line", ["--line"]],
  ["pageBg", ["--page-bg"]],
  ["surface", ["--surface"]],
  ["surface2", ["--surface-2"]],
  ["chartMuted", ["--c-muted"]],
  ["chartAxis", ["--c-axis"]],
];

/** A colour value safe to put in a CSS declaration (hex, rgb(), hsl(), oklch(), color-mix(), var()). */
const safeColor = (v: unknown): v is string => typeof v === "string" && v.length < 120 && !/[;{}<>"\\]/.test(v) && /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch|oklab|color-mix|var)a?\(.+\)|[a-z]+)$/i.test(v.trim());
const safeVarValue = (v: unknown): v is string | number => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length < 300 && !/[;{}<>\\]/.test(v));

/**
 * Brand overrides layered on top of the theme. Only what the brand sets is overridden.
 * Colours go on .page (so .page.inverse can still swap ink and background on dark pages); fonts and extra variables
 * go on .page[data-format] so they also beat a theme's format-specific font choices.
 */
export function brandCss(brand: Brand, theme?: ThemeId): string {
  const dark = !!(theme && THEMES[theme].dark);
  const c: BrandColors = (dark && brand.darkColors) || brand.colors || {};
  const vars: string[] = [];
  for (const [key, names] of COLOR_VARS) {
    const v = c[key];
    if (safeColor(v)) for (const n of names) vars.push(`${n}:${v}`);
  }
  // derived variables are declared on :root in the themes, so set them again wherever their source changes
  const hl = c.highlight ?? c.accent;
  if (safeColor(hl)) vars.push(`--hl:${hl}`);
  if (safeColor(c.accentText)) vars.push(`--bullet:${c.accentText}`);
  if (safeColor(c.node)) vars.push(`--node:${c.node}`);
  if (safeColor(c.onDark)) vars.push(`--on-dark-muted:color-mix(in srgb, ${c.onDark} 72%, transparent)`);
  if (safeColor(c.dark)) vars.push(`--dark-deep:color-mix(in srgb, ${c.dark} 72%, #000)`);
  (c.series ?? []).filter(safeColor).slice(0, 8).forEach((col, i) => vars.push(`--c${i + 1}:${col}`));
  vars.push(`--wordmark:${cssStr(brand.wordmark.text)}`);

  const fontVars: string[] = [];
  const fam = brand.families ?? {};
  const head = fam.heading ?? (brand.fonts.heading ? `"${brand.fonts.heading.family}",var(--font-head-fallback)` : undefined);
  const body = fam.body ?? (brand.fonts.body ? `"${brand.fonts.body.family}",var(--font-body-fallback)` : undefined);
  if (head) fontVars.push(`--font-head:${head}`);
  if (body) fontVars.push(`--font-body:${body}`, `--font-ui:${body}`);
  if (fam.numbers) fontVars.push(`--font-num:${fam.numbers}`);
  if (fam.accent) fontVars.push(`--font-accent:${fam.accent}`);
  for (const [k, v] of Object.entries(brand.vars ?? {})) if (/^--[a-z0-9-]+$/i.test(k) && safeVarValue(v)) fontVars.push(`${k}:${v}`);

  const rules = [`.page{${vars.join(";")}}`];
  if (fontVars.length) rules.push(`.page[data-format]{${fontVars.join(";")}}`);
  if (brand.highlightStyle === "marker" && !dark) {
    const marker = safeColor(brand.markerColor) ? brand.markerColor : `color-mix(in srgb, var(--accent) 70%, transparent)`;
    rules.push(
      `.page:not(.inverse) .hl{color:var(--on-accent);background:${marker};padding:0 .12em;border-radius:2px;-webkit-box-decoration-break:clone;box-decoration-break:clone}`,
      // on dark or accent-filled cards the marker would vanish or clash: back to plain accent text there
      `.page .card--dark .hl,.page .box--dark .hl,.page .card--accent .hl,.page .box--accent .hl{background:none;padding:0;color:var(--accent-text, var(--accent))}`,
    );
  }
  if (safeColor(brand.surfaceRing) && !dark) {
    const ring = `box-shadow:inset 0 0 0 1px ${brand.surfaceRing}`;
    rules.push(
      `.page:not(.inverse) :is(.card:not(.card--line,.card--outline,.card--accent,.card--dark),.box:not(.box--accent,.box--dark,.box--outline),.kpis:not(.kpis--plain,.kpis--cards) .kpi:not(.is-hl),.L-summary .sm-findings){${ring}}`,
    );
  }
  const onLight = dark ? (brand.wordmark.logoOnDark ?? brand.wordmark.logo) : brand.wordmark.logo;
  const onDark = brand.wordmark.logoOnDark ?? (dark ? brand.wordmark.logo : null);
  if (onLight) {
    rules.push(
      `.wordmark{background:url("${pathToFileURL(onLight).href}") right center/contain no-repeat;color:transparent!important;min-width:110px}.wordmark::before{content:""!important}`,
      // the back cover shows the logo larger and on its own line
      `.L-back-cover .bc .wordmark{height:28px;min-width:160px;background-position:left center}`,
    );
    if (onDark && onDark !== onLight) rules.push(`.page.inverse .wordmark,.card--dark .wordmark,.box--dark .wordmark{background-image:url("${pathToFileURL(onDark).href}")}`);
  }
  return rules.join("\n");
}
