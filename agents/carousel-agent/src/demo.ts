// Renders a style's sample carousel (its sample layouts from src/design/layouts) without calling Claude.
// Images come from OpenAI if OPENAI_API_KEY is set, otherwise offline mock art.
//   npm run demo                      → consulting, square
//   npm run demo -- portrait bold     → out/demo-bold-portrait/
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { isStyleId, ROOT, STYLE_IDS, type Format, type RunContext, type StyleId } from "./config.js";
import { resolveBrand } from "./agent.js";
import { layoutById } from "./layouts.js";
import { prepareSampleAssets } from "./samples.js";
import { STYLES } from "./styles.js";
import { contactSheet, exportCarousel, writeSlide } from "./slides.js";
import { closeBrowser } from "./render/renderer.js";

const args = process.argv.slice(2);
const format = (args.find((a) => a === "square" || a === "portrait") as Format) || "square";
const style = (args.find((a) => isStyleId(a)) as StyleId) || "consulting";
const unknown = args.filter((a) => a !== format && a !== style);
if (unknown.length) throw new Error(`Unknown argument(s) ${unknown.join(", ")}: use square|portrait and one of ${STYLE_IDS.join(", ")}`);

const dir = path.join(ROOT, "out", `demo-${style}-${format}`);
for (const sub of ["assets", "slides", "build", "preview", "png"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
// The product folder's brand when there is one (a quick brand preview), else brand.json. PRODUCT_DIR=none for each style's own look.
const { brand } = resolveBrand({});
console.log(`brand  ${brand.name} (${brand.source ?? "brand file"})  style ${style}`);
const ctx: RunContext = { dir, format, brand, style };
const layouts = STYLES[style].sample.map((id) => layoutById(id)!);

try {
  for (const line of await prepareSampleAssets(dir, brand, style, format, layouts.flatMap((l) => l.assets))) console.log(`image  ${line}`);
  for (const [i, layout] of layouts.entries()) {
    const res = await writeSlide(ctx, i + 1, layout.html);
    const d = res.diagnostics;
    console.log(`slide  ${i + 1}  ${layout.id.padEnd(12)} words=${d.wordCount}  errors=${d.errors.length}  warnings=${d.warnings.length}`);
    for (const m of [...d.errors.map((e) => "  ✗ " + e), ...d.warnings.map((w) => "  ! " + w)]) console.log(m);
  }
  const sheet = await contactSheet(ctx);
  if (sheet) fs.writeFileSync(path.join(dir, "contact-sheet.jpg"), sheet);
  const out = await exportCarousel(ctx, {
    caption: `Demo carousel in the ${STYLES[style].label} style, rendered from the layout library.`,
    altText: layouts.map((l) => `Demo slide: ${l.id} layout`),
  });
  console.log(`\nPNG: ${path.relative(ROOT, path.dirname(out.pngs[0]))}/  PDF: ${out.pdf ? path.relative(ROOT, out.pdf) : "-"}`);
} finally {
  await closeBrowser();
}
