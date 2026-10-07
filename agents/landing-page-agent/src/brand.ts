/**
 * Brand theming: turns a brand's own colours, typefaces and shape preferences
 * into styles/brand.css (CSS variables that override the token defaults) and
 * app/fonts.ts (self-hosted font imports). Colour scales are generated in
 * OKLCH so every brand hue gets an even 50–950 ramp, and accent choices are
 * contrast-checked against WCAG 2.x.
 */
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------- colour maths

type RGB = [number, number, number];
type OKLCH = { l: number; c: number; h: number };

export function hexToRgb(hex: string): RGB {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as RGB;
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function rgbToOklch(rgb: RGB): OKLCH {
  const [r, g, b] = rgb.map(toLinear) as RGB;
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function oklchToLinear({ l, c, h }: OKLCH): RGB {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** OKLCH → sRGB hex, reducing chroma until the colour fits the sRGB gamut. */
export function oklchToHex(color: OKLCH): string {
  let c = color.c;
  for (let i = 0; i < 40; i++) {
    const lin = oklchToLinear({ ...color, c });
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbToHex(lin.map(toGamma) as RGB);
    c *= 0.94;
  }
  return rgbToHex(oklchToLinear({ ...color, c: 0 }).map(toGamma) as RGB);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------------------------------------------------------------- scales

export const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Stop = (typeof STOPS)[number];
export type Scale = Record<Stop, string>;

const LIGHTNESS: Record<Stop, number> = { 50: 0.975, 100: 0.945, 200: 0.89, 300: 0.81, 400: 0.72, 500: 0.635, 600: 0.555, 700: 0.475, 800: 0.395, 900: 0.315, 950: 0.235 };
const CHROMA_CURVE: Record<Stop, number> = { 50: 0.12, 100: 0.22, 200: 0.42, 300: 0.65, 400: 0.85, 500: 0.97, 600: 1, 700: 0.94, 800: 0.82, 900: 0.66, 950: 0.5 };

/** Even 50–950 ramp around a brand colour; the input colour itself replaces the closest stop. */
export function generateScale(hex: string): { scale: Scale; anchor: Stop } {
  const base = rgbToOklch(hexToRgb(hex));
  const peak = Math.max(base.c, 0.012);
  const scale = {} as Scale;
  for (const s of STOPS) scale[s] = oklchToHex({ l: LIGHTNESS[s], c: peak * CHROMA_CURVE[s], h: base.h });
  let anchor: Stop = 500;
  let best = Infinity;
  for (const s of STOPS) {
    const d = Math.abs(LIGHTNESS[s] - base.l);
    if (d < best) [best, anchor] = [d, s];
  }
  scale[anchor] = hex.toLowerCase().startsWith("#") ? hex.toLowerCase() : `#${hex.toLowerCase()}`;
  return { scale, anchor };
}

// ---------------------------------------------------------------- fonts

export const FONTS = {
  inter: { family: "Inter Variable", pkg: "@fontsource-variable/inter", feel: "neutral, highly legible sans" },
  manrope: { family: "Manrope Variable", pkg: "@fontsource-variable/manrope", feel: "modern geometric sans, friendly tech" },
  "dm-sans": { family: "DM Sans Variable", pkg: "@fontsource-variable/dm-sans", feel: "soft low-contrast sans, approachable" },
  "plus-jakarta-sans": { family: "Plus Jakarta Sans Variable", pkg: "@fontsource-variable/plus-jakarta-sans", feel: "contemporary sans with character, startups" },
  "space-grotesk": { family: "Space Grotesk Variable", pkg: "@fontsource-variable/space-grotesk", feel: "technical grotesk, engineering and data products (headings)" },
  "ibm-plex-sans": { family: "IBM Plex Sans Variable", pkg: "@fontsource-variable/ibm-plex-sans", feel: "corporate, engineered, enterprise" },
  outfit: { family: "Outfit Variable", pkg: "@fontsource-variable/outfit", feel: "rounded geometric, consumer and lifestyle" },
  "instrument-sans": { family: "Instrument Sans Variable", pkg: "@fontsource-variable/instrument-sans", feel: "crisp editorial sans, studios and consultancies" },
  fraunces: { family: "Fraunces Variable", pkg: "@fontsource-variable/fraunces", feel: "warm soft serif, editorial headings" },
  "source-serif-4": { family: "Source Serif 4 Variable", pkg: "@fontsource-variable/source-serif-4", feel: "classic book serif, finance, law, publishing" },
  "crimson-pro": { family: "Crimson Pro Variable", pkg: "@fontsource-variable/crimson-pro", feel: "elegant old-style serif, accents and quotes" },
} as const;

export type FontId = keyof typeof FONTS;
export const FONT_IDS = Object.keys(FONTS) as FontId[];

// ---------------------------------------------------------------- brand theme

export const ROUNDNESS = {
  sharp: { sm: 2, md: 4, lg: 6, xl: 10, button: 4 },
  soft: { sm: 6, md: 10, lg: 16, xl: 24, button: 10 },
  round: { sm: 10, md: 16, lg: 24, xl: 32, button: 9999 },
} as const;

export type BrandInput = {
  primary: string;
  secondary?: string;
  /** Dark colour for inverse sections; defaults to the brand's own 950 stop. */
  dark?: string;
  /** Page background when the brand uses an off-white or tinted one (must be very light); default white. */
  background?: string;
  displayFont: FontId;
  bodyFont: FontId;
  /** Optional third face, e.g. a serif for quotes. Exposed as font-accent via --font-accent-family. */
  accentFont?: FontId;
  headingWeight?: 400 | 500 | 600 | 700;
  roundness?: keyof typeof ROUNDNESS;
};

export type BrandReport = {
  accent: string;
  onAccent: string;
  accentText: string;
  inverse: string;
  checks: { pair: string; ratio: number; pass: boolean }[];
  notes: string[];
};

const INK = "#16171a";
const WHITE = "#ffffff";

/** Pick button fill, button label and link colour that all pass WCAG AA. */
function chooseAccent(scale: Scale, anchor: Stop, primary: string, textBgs: string[]) {
  const notes: string[] = [];
  let accent = primary;
  let onAccent = contrast(primary, WHITE) >= contrast(primary, INK) ? WHITE : INK;
  if (contrast(accent, onAccent) < 4.5) {
    // Walk darker (white label) or lighter (ink label) until the button label passes.
    const order = onAccent === WHITE ? STOPS.filter((s) => s >= anchor) : [...STOPS].reverse().filter((s) => s <= anchor);
    const hit = order.find((s) => contrast(scale[s], onAccent) >= 4.5);
    if (hit) {
      accent = scale[hit];
      notes.push(`Button fill moved from the brand colour to brand-${hit} so its label reaches 4.5:1.`);
    }
  }
  const accentIndex = STOPS.findIndex((s) => scale[s] === accent);
  const hover =
    onAccent === WHITE
      ? scale[STOPS[Math.min(STOPS.length - 1, (accentIndex < 0 ? STOPS.indexOf(anchor) : accentIndex) + 1)]!]
      : scale[STOPS[Math.max(0, (accentIndex < 0 ? STOPS.indexOf(anchor) : accentIndex) - 1)]!];
  // Link / accent text must reach 4.5:1 on every light background it sits on (canvas, surface, brand tint).
  const passes = (c: string) => textBgs.every((bg) => contrast(c, bg) >= 4.5);
  const textStop = STOPS.find((s) => s >= 500 && passes(scale[s])) ?? 950;
  const accentText = passes(primary) ? primary : scale[textStop];
  if (accentText !== primary) notes.push(`Accent text uses brand-${textStop} (the brand colour itself is too light for text).`);
  return { accent, onAccent, hover, accentText, notes };
}

export function buildBrand(raw: BrandInput): { css: string; fontsTs: string; report: BrandReport } {
  const norm = (h?: string) => (h ? rgbToHex(hexToRgb(h)) : undefined);
  const input: BrandInput = { ...raw, primary: norm(raw.primary)!, secondary: norm(raw.secondary), dark: norm(raw.dark), background: norm(raw.background) };
  const { scale, anchor } = generateScale(input.primary);
  const second = generateScale(input.secondary ?? oklchToHex({ ...rgbToOklch(hexToRgb(input.primary)), h: (rgbToOklch(hexToRgb(input.primary)).h + 40) % 360 })).scale;
  const notes: string[] = [];
  let canvas = WHITE;
  let surface = "#f6f6f4";
  const neutrals: string[] = [];
  if (input.background && input.background !== WHITE) {
    if (luminance(input.background) < 0.8) {
      notes.push(`Background ${input.background} ignored: page backgrounds must be very light. Use dark sections (tone="inverse") for dark areas.`);
    } else {
      canvas = input.background;
      const bg = rgbToOklch(hexToRgb(canvas));
      const shade = (dl: number) => oklchToHex({ ...bg, l: Math.max(0, bg.l - dl), c: Math.min(bg.c + 0.003, 0.03) });
      surface = shade(0.025);
      neutrals.push(`  --color-canvas: ${canvas};`, `  --color-surface: ${surface};`, `  --color-subtle: ${shade(0.05)};`, `  --color-card: ${WHITE};`);
    }
  }
  const picked = chooseAccent(scale, anchor, input.primary, [WHITE, canvas, surface, scale[50]]);
  const { accent, onAccent, hover, accentText } = picked;
  notes.unshift(...picked.notes);
  let inverse = input.dark ?? scale[950];
  if (contrast(inverse, WHITE) < 12) {
    const base = rgbToOklch(hexToRgb(inverse));
    inverse = oklchToHex({ l: Math.min(base.l, 0.2), c: Math.min(base.c, 0.05), h: base.h });
    notes.push("Inverse background darkened so white text stays comfortably readable.");
  }
  const r = ROUNDNESS[input.roundness ?? "soft"];
  const display = FONTS[input.displayFont];
  const body = FONTS[input.bodyFont];
  const accentFace = input.accentFont ? FONTS[input.accentFont] : undefined;

  const checks = [
    { pair: "button label on accent", ratio: contrast(onAccent, accent) },
    { pair: "accent text on canvas", ratio: contrast(accentText, canvas) },
    { pair: "accent text on surface", ratio: contrast(accentText, surface) },
    { pair: "white on inverse", ratio: contrast(WHITE, inverse) },
    { pair: "ink on brand-50", ratio: contrast(INK, scale[50]) },
  ].map((c) => ({ ...c, ratio: Math.round(c.ratio * 100) / 100, pass: c.ratio >= 4.5 }));

  const lines = [
    "/* Generated by set_brand — edit through the tool, not by hand. */",
    `/* primary ${input.primary}${input.secondary ? ` · secondary ${input.secondary}` : ""}${input.dark ? ` · dark ${input.dark}` : ""}${canvas !== WHITE ? ` · background ${canvas}` : ""} · ${input.displayFont}/${input.bodyFont} · ${input.roundness ?? "soft"} */`,
    ":root {",
    ...STOPS.map((s) => `  --color-brand-${s}: ${scale[s]};`),
    ...STOPS.filter((s) => s !== 950).map((s) => `  --color-second-${s}: ${second[s]};`),
    `  --color-accent: ${accent};`,
    `  --color-accent-hover: ${hover};`,
    `  --color-accent-soft: ${scale[50]};`,
    `  --color-accent-line: ${scale[200]};`,
    `  --color-accent-text: ${accentText};`,
    `  --color-on-accent: ${onAccent};`,
    `  --color-inverse: ${inverse};`,
    ...neutrals,
    `  --font-display-family: "${display.family}";`,
    `  --font-body-family: "${body.family}";`,
    `  --font-accent-family: "${(accentFace ?? display).family}";`,
    `  --heading-weight: ${input.headingWeight ?? 600};`,
    `  --radius-sm: ${r.sm}px;`,
    `  --radius-md: ${r.md}px;`,
    `  --radius-lg: ${r.lg}px;`,
    `  --radius-xl: ${r.xl}px;`,
    `  --radius-button: ${r.button}px;`,
    "}",
    "",
  ];

  const pkgs = [...new Set([display.pkg, body.pkg, accentFace?.pkg, "@fontsource-variable/jetbrains-mono"].filter(Boolean))];
  const fontsTs = `// Generated by set_brand. Self-hosted fonts (no network at build time).\n${pkgs.map((p) => `import "${p}";`).join("\n")}\n`;

  return {
    css: lines.join("\n"),
    fontsTs,
    report: { accent, onAccent, accentText, inverse, checks, notes },
  };
}

export function writeBrand(siteDir: string, input: BrandInput): BrandReport {
  const { css, fontsTs, report } = buildBrand(input);
  writeFileSync(path.join(siteDir, "styles", "brand.css"), css);
  writeFileSync(path.join(siteDir, "app", "fonts.ts"), fontsTs);
  // Favicon: the product's own mark when the product folder supplied one, else a mark in the brand colour.
  const mark = path.join(siteDir, "public", "assets", "brand", "mark.svg");
  if (existsSync(mark)) copyFileSync(mark, path.join(siteDir, "app", "icon.svg"));
  else {
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${report.accent}"/><circle cx="16" cy="16" r="5" fill="${report.onAccent}"/></svg>\n`;
    writeFileSync(path.join(siteDir, "app", "icon.svg"), icon);
  }
  return report;
}

export function formatBrandReport(r: BrandReport, input: BrandInput): string {
  return [
    `Brand applied: accent ${r.accent} (label ${r.onAccent}), accent text ${r.accentText}, inverse ${r.inverse}${input.background ? `, background ${input.background}` : ""}.`,
    `Type: ${FONTS[input.displayFont].family} / ${FONTS[input.bodyFont].family}${input.accentFont ? ` / ${FONTS[input.accentFont].family}` : ""}; heading weight ${input.headingWeight ?? 600}; ${input.roundness ?? "soft"} corners.`,
    ...r.checks.map((c) => `- ${c.pair}: ${c.ratio}:1 ${c.pass ? "✓" : "✗"}`),
    ...r.notes.map((n) => `- ${n}`),
  ].join("\n");
}
