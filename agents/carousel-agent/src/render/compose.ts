import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { DESIGN_DIR, FORMATS, type Brand, type Format } from "../config.js";
import { iconCss } from "../design/icons.js";

const require = createRequire(import.meta.url);

/** Bundled fallback fonts (fontsource). Brand fonts in brand.json override these. */
function bundledFontFiles(pkg: string, prefix: string, weights: string[]) {
  const dir = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "files");
  const out: Record<string, string[]> = {};
  for (const w of weights) {
    out[w] = ["latin", "latin-ext"]
      .map((sub) => path.join(dir, `${prefix}-${sub}-${w}-normal.woff2`))
      .filter((f) => fs.existsSync(f));
  }
  return out;
}

function fontFaces(brand: Brand): string {
  const faces: string[] = brand.fontFaceCss ? [brand.fontFaceCss] : [];
  const covered = (family: string) => !!brand.fontFaceCss?.includes(`font-family:"${family}"`);
  const add = (family: string, files: Record<string, string[]>) => {
    for (const [weight, list] of Object.entries(files))
      for (const file of list)
        faces.push(
          `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url("${pathToFileURL(file).href}")}`,
        );
  };
  const { sans, serif } = brand.fonts;
  if (sans.files) add(sans.family, Object.fromEntries(Object.entries(sans.files).map(([w, f]) => [w, [f!]])));
  else if (!covered(sans.family)) add(sans.family, bundledFontFiles("@fontsource/inter-tight", "inter-tight", ["300", "400", "500"]));
  if (serif.files) add(serif.family, Object.fromEntries(Object.entries(serif.files).map(([w, f]) => [w, [f!]])));
  else if (!covered(serif.family)) add(serif.family, bundledFontFiles("@fontsource/source-serif-4", "source-serif-4", ["400", "500"]));
  return faces.join("\n");
}

const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\A ")}"`;

const rgbOf = (hex: string) => {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)).join(" ");
};

function brandVars(brand: Brand, format: Format): string {
  const c = brand.colors;
  const { width, height } = FORMATS[format];
  const logo = brand.wordmark.logo;
  const logoOnLight = brand.wordmark.logoOnLight ?? null;
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
  return `:root{
  --w:${width}px;--h:${height}px;
  --brand:${c.primary};--brand-deep:${c.primaryDeep};--brand-light:${c.primaryLight};--violet:${c.violet};
  --surface:${c.surface};--ink:${c.ink};--on-brand:${c.onPrimary};${optional}
  --font-sans:"${brand.fonts.sans.family}",ui-sans-serif,system-ui,sans-serif;
  --font-serif:"${brand.fonts.serif.family}",ui-serif,Georgia,serif;
  --wordmark-text:${cssString(brand.wordmark.text)};
}
${brand.wordmark.font === "sans" ? `body .wordmark{font-family:var(--font-sans);font-weight:500;letter-spacing:-0.03em}` : ""}
${
  logo
    ? `body .wordmark::before{content:none}body .wordmark{width:220px;height:72px;background:url("${pathToFileURL(logo).href}") left bottom/contain no-repeat}`
    : ""
}
${logo && logoOnLight && logoOnLight !== logo ? `body .slide--light .wordmark,body .slide--white .wordmark{background-image:url("${pathToFileURL(logoOnLight).href}")}` : ""}`;
}

let systemCssCache: string | null = null;
const systemCss = () => (systemCssCache ??= fs.readFileSync(path.join(DESIGN_DIR, "system.css"), "utf8"));

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
export function composeSlideDocument(fragment: string, opts: { runDir: string; format: Format; brand: Brand }): string {
  const base = pathToFileURL(opts.runDir.endsWith(path.sep) ? opts.runDir : opts.runDir + path.sep).href;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<base href="${base}">
<style>${fontFaces(opts.brand)}</style>
<style>${brandVars(opts.brand, opts.format)}</style>
<style>${iconCss()}</style>
<style>${systemCss()}</style>
<style>html,body{width:var(--w);height:var(--h);overflow:hidden}</style>
</head>
<body data-format="${opts.format}">
${fragment}
</body>
</html>`;
}
