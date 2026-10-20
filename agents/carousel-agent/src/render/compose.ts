import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { DESIGN_DIR, FORMATS, type Brand, type Format, type StyleId } from "../config.js";
import { iconCss } from "../design/icons.js";
import { paletteVars } from "../palette.js";
import { STYLES, type FontSpec } from "../styles.js";

const require = createRequire(import.meta.url);

type FontFace = Brand["fonts"]["sans"];

/** Bundled fallback fonts (fontsource). Brand fonts override these by role. */
function bundledFontFiles(pkg: string, prefix: string, weight: string, style: "normal" | "italic") {
  const dir = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "files");
  return ["latin", "latin-ext"]
    .map((sub) => path.join(dir, `${prefix}-${sub}-${weight}-${style}.woff2`))
    .filter((f) => fs.existsSync(f));
}

const face = (family: string, weight: string, file: string, style = "normal") =>
  `@font-face{font-family:"${family}";font-style:${style};font-weight:${weight};font-display:block;src:url("${pathToFileURL(file).href}")}`;

const STACK = {
  sans: "ui-sans-serif,system-ui,sans-serif",
  serif: "ui-serif,Georgia,serif",
  mono: "ui-monospace,Menlo,monospace",
};

/**
 * The face for each type role. A brand face (one with files, or covered by the product's @font-face rules) wins for
 * every role it has, unless the brand sets fontsMode "style"; otherwise the style's bundled face is used. The display
 * role takes the brand face of the style's kind: display (or sans), serif or condensed.
 */
export function resolveFonts(brand: Brand, styleId: StyleId) {
  const style = STYLES[styleId].fonts;
  const faces: string[] = brand.fontFaceCss ? [brand.fontFaceCss] : [];
  const useBrand = brand.fontsMode !== "style";
  const covered = (family: string) => !!brand.fontFaceCss?.includes(`font-family:"${family}"`);
  const brandFace = (f: FontFace | undefined) => (useBrand && f && (f.files || covered(f.family)) ? f : undefined);
  const added = new Set<string>();
  const bundled = new Map<string, { spec: FontSpec; weights: Set<string>; italic: Set<string> }>();

  const pick = (brandFont: FontFace | undefined, spec: FontSpec): string => {
    if (brandFont) {
      if (brandFont.files && !added.has(brandFont.family)) {
        added.add(brandFont.family);
        for (const [w, f] of Object.entries(brandFont.files)) if (f) faces.push(face(brandFont.family, w, f));
      }
      return brandFont.family;
    }
    const entry = bundled.get(spec.family) ?? { spec, weights: new Set<string>(), italic: new Set<string>() };
    spec.weights.forEach((w) => entry.weights.add(w));
    spec.italic?.forEach((w) => entry.italic.add(w));
    bundled.set(spec.family, entry);
    return spec.family;
  };

  const b = brand.fonts;
  const kind = style.display.kind;
  const brandDisplay = kind === "serif" ? brandFace(b.serif) : kind === "condensed" ? brandFace(b.condensed) : (brandFace(b.display) ?? brandFace(b.sans));
  const display = pick(brandDisplay, style.display);
  const body = pick(brandFace(b.sans), style.body);
  const mono = pick(brandFace(b.mono), style.mono);
  const serif = pick(brandFace(b.serif), style.serif);
  const condensed = style.condensed ? pick(brandFace(b.condensed), style.condensed) : body;

  for (const { spec, weights, italic } of bundled.values()) {
    for (const w of weights) for (const f of bundledFontFiles(spec.pkg, spec.prefix, w, "normal")) faces.push(face(spec.family, w, f));
    for (const w of italic) for (const f of bundledFontFiles(spec.pkg, spec.prefix, w, "italic")) faces.push(face(spec.family, w, f, "italic"));
  }
  const displayStack = style.display.kind === "serif" && display !== body ? STACK.serif : STACK.sans;
  const vars =
    `--font-display:"${display}",${displayStack};--font-body:"${body}",${STACK.sans};--font-sans:var(--font-body);` +
    `--font-mono:"${mono}",${STACK.mono};--font-serif:"${serif}",${STACK.serif};--font-condensed:"${condensed}",${STACK.sans};`;
  return { faces: faces.join("\n"), vars, families: { display, body, mono, serif, condensed } };
}

const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\A ")}"`;
const url = (file: string) => `url("${pathToFileURL(file).href}")`;
const MIME: Record<string, string> = { ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
/** Masks are fetched in CORS mode, which file:// URLs fail (and that also breaks other uses of the same URL): inline them. */
const dataUrl = (file: string) =>
  `url("data:${MIME[path.extname(file).toLowerCase()] ?? "image/png"};base64,${fs.readFileSync(file).toString("base64")}")`;

const rgbOf = (hex: string) => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)).join(" ");
};

function brandVars(brand: Brand, format: Format, style: StyleId, fontVars: string): string {
  const c = brand.colors;
  const { width, height } = FORMATS[format];
  const logo = brand.wordmark.logo;
  const logoOnLight = brand.wordmark.logoOnLight ?? logo;
  const mark = brand.wordmark.mark ?? null;
  const initial = cssString((brand.wordmark.text || brand.name).trim().charAt(0).toUpperCase());
  // Optional accent roles: only set when the brand defines them, so the classic look stays exactly as it was.
  const optional = [
    c.accent ? `--hi:${c.accent};` : "",
    c.onAccent ? `--on-hi:${c.onAccent};` : "",
    c.accent ? `--hi-light:${c.accent};` : "",
    c.onAccent ? `--on-hi-light:${c.onAccent};` : "",
    c.accentOnCanvas ? `--accent-on-canvas:${c.accentOnCanvas};` : "",
    c.accentOnLight ? `--accent-on-light:${c.accentOnLight};` : "",
    c.accent ? `--bar:${c.accent};` : "",
    c.shade ? `--shade-rgb:${rgbOf(c.shade)};` : "",
    c.glassTint ? `--glass-tint:${c.glassTint};` : "",
  ].join("");
  const logos = [
    logo ? `--logo-on-dark:${url(logo)};--logo-mask:${dataUrl(logo)};` : "",
    logoOnLight ? `--logo-on-light:${url(logoOnLight)};` : "",
    mark ? `--mark-logo:${url(mark)};` : "",
  ].join("");
  const rules = [
    `:root{
  --w:${width}px;--h:${height}px;
  --brand:${c.primary};--brand-deep:${c.primaryDeep};--brand-light:${c.primaryLight};--violet:${c.violet};
  --surface:${c.surface};--ink:${c.ink};--on-brand:${c.onPrimary};${optional}
  ${fontVars}
  --wordmark-text:${cssString(brand.wordmark.text)};${logos}
  ${brand.palette ? paletteVars(brand.palette) : ""}
}`,
    brand.wordmark.font === "sans" && style === "consulting" ? `body .wordmark{font-family:var(--font-body);font-weight:500;letter-spacing:-0.03em}` : "",
    logo
      ? `body .wordmark::before{content:none}body .wordmark{width:var(--wm-w,220px);height:var(--wm-h,72px);background:var(--logo) var(--wm-pos,left bottom)/contain no-repeat}`
      : // no logo: the watermark shows the wordmark's initial instead
        `body .watermark--logo{-webkit-mask:none;mask:none;background:none;width:auto;height:auto}body .watermark--logo::before{content:${initial}}`,
    mark
      ? ""
      : `body .logo-mark{display:grid;place-items:center;background:var(--btn);color:var(--on-btn);border-radius:22%;font:800 calc(var(--mark-size,112px)*.5)/1 var(--font-display)}body .logo-mark::before{content:${initial}}`,
  ];
  return rules.filter(Boolean).join("\n");
}

const cssCache = new Map<string, string>();
const designCss = (rel: string) => {
  if (!cssCache.has(rel)) cssCache.set(rel, fs.readFileSync(path.join(DESIGN_DIR, rel), "utf8"));
  return cssCache.get(rel)!;
};

/** Strip anything a slide fragment must not contain and normalise it to one `.slide` root. */
export function sanitizeFragment(input: string): { html: string; notes: string[] } {
  const notes: string[] = [];
  let html = input.trim();
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) {
    html = body[1].trim();
    notes.push("Stripped <html>/<head>/<body>: write only the <section class=\"slide\"> fragment.");
  }
  if (/<script/i.test(html)) {
    html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    notes.push("Removed <script> tags (not allowed).");
  }
  if (/<link[^>]+stylesheet/i.test(html)) {
    html = html.replace(/<link[^>]*>/gi, "");
    notes.push("Removed <link> tags: the design system and fonts are injected automatically.");
  }
  if (/(src|href)=["']https?:/i.test(html) || /url\(["']?https?:/i.test(html))
    notes.push("External URLs are blocked at render time; use generated images from assets/.");
  if (!/class=["'][^"']*\bslide\b/.test(html)) {
    html = `<section class="slide">\n${html}\n</section>`;
    notes.push('No .slide root found: wrapped the fragment in <section class="slide">.');
  }
  return { html, notes };
}

/** Build a complete, self-contained HTML document for one slide. */
export function composeSlideDocument(fragment: string, opts: { runDir: string; format: Format; brand: Brand; style: StyleId }): string {
  const base = pathToFileURL(opts.runDir.endsWith(path.sep) ? opts.runDir : opts.runDir + path.sep).href;
  const fonts = resolveFonts(opts.brand, opts.style);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<base href="${base}">
<style>${fonts.faces}</style>
<style>${brandVars(opts.brand, opts.format, opts.style, fonts.vars)}</style>
<style>${iconCss()}</style>
<style>${designCss("base.css")}</style>
<style>${designCss(`styles/${opts.style}.css`)}</style>
<style>html,body{width:var(--w);height:var(--h);overflow:hidden}</style>
</head>
<body data-format="${opts.format}" data-style="${opts.style}">
${fragment}
</body>
</html>`;
}
