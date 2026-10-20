// Renders every layout in every style (or one) without Claude, with layout QA, and writes contact sheets.
//   npm run gallery                         → out/gallery/square/<style>.jpg (+ QA report), classic brand
//   npm run gallery -- portrait --style bold
//   npm run gallery -- --product default    → in the product folder's brand (or --product <dir|id>; default: none)
//   npm run gallery -- --docs               → also docs/styles.jpg (each style's sample carousel) and docs/layouts.jpg
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { isStyleId, ROOT, STYLE_IDS, type Format, type RunContext, type StyleId } from "./config.js";
import { resolveBrand } from "./agent.js";
import { loadLayouts } from "./layouts.js";
import { prepareSampleAssets } from "./samples.js";
import { writeSlide } from "./slides.js";
import { STYLES } from "./styles.js";
import { closeBrowser, renderHtmlString } from "./render/renderer.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { style: { type: "string" }, product: { type: "string" }, docs: { type: "boolean" }, real: { type: "boolean" } },
});
const format = (positionals[0] as Format) || "square";
if (!["square", "portrait"].includes(format)) throw new Error("format must be square or portrait");
if (values.style && !isStyleId(values.style)) throw new Error(`--style must be one of ${STYLE_IDS.join(", ")}`);
if (!values.real) process.env.IMAGE_MOCK = "1";
const styles: StyleId[] = values.style ? [values.style as StyleId] : [...STYLE_IDS];
// The classic brand by default, so each style shows its own palette; --product default|<dir|id> for a product's.
const { brand } = resolveBrand({ product: values.product === undefined ? "none" : values.product === "default" ? undefined : values.product });
const tag = values.product === undefined ? "" : "-product";
const root = path.join(ROOT, "out", "gallery", `${format}${tag}`);
const layouts = loadLayouts();
const H = format === "portrait" ? 1350 : 1080;

async function sheet(items: { label: string; jpg: string }[], cols: number, tw: number, title?: string) {
  const th = Math.round((tw * H) / 1080), gap = 20, cap = 30;
  const rows = Math.ceil(items.length / cols);
  const W = cols * tw + (cols + 1) * gap;
  const top = title ? 56 : 0;
  const Hh = top + rows * (th + cap) + (rows + 1) * gap;
  const cells = items
    .map((it) => `<figure style="margin:0"><img src="data:image/jpeg;base64,${fs.readFileSync(it.jpg).toString("base64")}" style="width:${tw}px;height:${th}px;display:block;box-shadow:0 2px 10px rgba(0,0,0,.18)"><figcaption style="font:500 17px system-ui;color:#555;padding-top:7px">${it.label}</figcaption></figure>`)
    .join("");
  const head = title ? `<div style="font:600 26px system-ui;color:#222;padding:${gap}px ${gap}px 0">${title}</div>` : "";
  const html = `<html><body style="margin:0;background:#ececf0">${head}<div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:${gap}px;padding:${gap}px">${cells}</div></body></html>`;
  return renderHtmlString(html, { width: W, height: Hh, type: "jpeg", quality: 82 });
}

let errors = 0;
const report: string[] = [];
const previews: Record<string, Record<string, string>> = {};
try {
  console.log(`brand  ${brand.name} (${brand.source ?? "brand file"})  format ${format}`);
  for (const style of styles) {
    const dir = path.join(root, style);
    for (const sub of ["assets", "slides", "build", "preview", "png"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
    await prepareSampleAssets(dir, brand, style, format);
    const ctx: RunContext = { dir, format, brand, style };
    previews[style] = {};
    for (const [i, layout] of layouts.entries()) {
      const r = await writeSlide(ctx, i + 1, layout.html);
      previews[style][layout.id] = r.previewPath;
      const d = r.diagnostics;
      errors += d.errors.length;
      const line = `${style.padEnd(10)} ${layout.id.padEnd(12)} words=${String(d.wordCount).padEnd(3)} errors=${d.errors.length} warnings=${d.warnings.length}`;
      console.log(line);
      report.push(line, ...d.errors.map((e) => `    ✗ ${e}`), ...d.warnings.map((w) => `    ! ${w}`));
      for (const m of [...d.errors.map((e) => `    ✗ ${e}`), ...d.warnings.map((w) => `    ! ${w}`)]) console.log(m);
    }
    const out = path.join(root, `${style}.jpg`);
    fs.writeFileSync(out, await sheet(layouts.map((l) => ({ label: l.id, jpg: previews[style][l.id] })), 5, 300, `${STYLES[style].label}: every layout`));
    console.log(`sheet  ${path.relative(ROOT, out)}`);
  }
  fs.writeFileSync(path.join(root, "qa.txt"), report.join("\n") + "\n");

  // docs/ ships with the public kit: only the neutral brand goes there, never a product's.
  if (values.docs && values.product !== undefined) console.log("docs   skipped: --docs renders the neutral brand only (drop --product)");
  else if (values.docs && styles.length === STYLE_IDS.length) {
    const docs = path.join(ROOT, "docs");
    fs.mkdirSync(docs, { recursive: true });
    const overview = styles.flatMap((s) => STYLES[s].sample.map((id, n) => ({ label: n === 0 ? `${STYLES[s].label} · ${id}` : id, jpg: previews[s][id] })));
    fs.writeFileSync(path.join(docs, "styles.jpg"), await sheet(overview, 4, 280));
    // Each layout in the first style it suits
    const home = (id: string) => styles.find((s) => STYLES[s].layouts.includes(id)) ?? "consulting";
    fs.writeFileSync(path.join(docs, "layouts.jpg"), await sheet(layouts.map((l) => ({ label: `${l.id} (${home(l.id)})`, jpg: previews[home(l.id)][l.id] })), 5, 240));
    console.log("docs   docs/styles.jpg, docs/layouts.jpg");
  }
} finally {
  await closeBrowser();
}
console.log(errors ? `\n${errors} layout error(s); see ${path.relative(ROOT, path.join(root, "qa.txt"))}` : `\nNo layout errors → ${path.relative(ROOT, root)}`);
process.exit(errors ? 1 : 0);
