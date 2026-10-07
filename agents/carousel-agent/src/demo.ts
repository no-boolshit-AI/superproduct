// Renders the example carousel in examples/demo without calling Claude.
// Images come from OpenAI if OPENAI_API_KEY is set, otherwise offline mock art.
//   npm run demo            → square
//   npm run demo -- portrait
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ROOT, type Format, type RunContext } from "./config.js";
import { resolveBrand } from "./agent.js";
import { generateImage } from "./images/generate.js";
import { contactSheet, exportCarousel, writeSlide } from "./slides.js";
import { closeBrowser } from "./render/renderer.js";

const format = (process.argv[2] as Format) || "square";
const dir = path.join(ROOT, "out", `demo-${format}`);
for (const sub of ["assets", "slides", "build", "preview", "png"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
// The product folder's brand when there is one (a quick brand preview), else brand.json. PRODUCT_DIR=none for the classic look.
const { brand } = resolveBrand({});
console.log(`brand  ${brand.name} (${brand.source ?? "brand file"})`);
const ctx: RunContext = { dir, format, brand };

const images = [
  { name: "hero-shelves", style: "3d-mono" as const, aspect: format === "portrait" ? ("portrait" as const) : ("square" as const),
    prompt: "Rows of minimal, unbranded household-care bottles and jars standing on simple retail shelves, seen straight on, slightly from below." },
  { name: "team-photo", style: "photo" as const, aspect: "landscape" as const,
    prompt: "Two smiling female colleagues in light knitwear talking in a bright corridor of a modern office, one wearing round glasses, candid moment." },
];

try {
  for (const img of images) {
    const r = await generateImage({ ...img, resolution: "hd", quality: "high" }, dir, ctx.brand);
    console.log(`image  ${r.file}  ${r.size}  ${r.model}${r.cached ? " (cached)" : ""}`);
  }
  const demoDir = path.join(ROOT, "examples", "demo");
  const files = fs.readdirSync(demoDir).filter((f) => f.endsWith(".html")).sort();
  for (const [i, f] of files.entries()) {
    const res = await writeSlide(ctx, i + 1, fs.readFileSync(path.join(demoDir, f), "utf8"));
    const d = res.diagnostics;
    console.log(`slide  ${i + 1}  words=${d.wordCount}  errors=${d.errors.length}  warnings=${d.warnings.length}`);
    for (const m of [...d.errors.map((e) => "  ✗ " + e), ...d.warnings.map((w) => "  ! " + w)]) console.log(m);
  }
  const sheet = await contactSheet(ctx);
  if (sheet) fs.writeFileSync(path.join(dir, "contact-sheet.jpg"), sheet);
  const out = await exportCarousel(ctx, {
    caption: "Demo carousel rendered from examples/demo.",
    altText: files.map((f) => `Demo ${f}`),
  });
  console.log(`\nPNG: ${path.relative(ROOT, path.dirname(out.pngs[0]))}/  PDF: ${path.relative(ROOT, out.pdf)}`);
} finally {
  await closeBrowser();
}
