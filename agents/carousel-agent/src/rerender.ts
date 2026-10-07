// Re-render and re-export an existing run after editing slides/*.html by hand.
//   npm run render -- out/2026-10-06-12-00-my-carousel
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { listSlides, loadBrand, type Format, type RunContext } from "./config.js";
import { brandFromProduct, resolveProduct } from "./product.js";
import { exportCarousel, renderSlide } from "./slides.js";
import { closeBrowser } from "./render/renderer.js";

const dir = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !fs.existsSync(path.join(dir, "slides"))) {
  console.log("Usage: npm run render -- <run folder>");
  process.exit(1);
}
const run = fs.existsSync(path.join(dir, "run.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8")) : {};
// Same brand as the original run: its brand file, else its product folder (if still there), else the default.
const product = !run.brand && run.product && fs.existsSync(path.join(run.product, "product.json")) ? resolveProduct(run.product) : null;
const ctx: RunContext = { dir, format: (run.format ?? "square") as Format, brand: run.brand ? loadBrand(run.brand) : product ? brandFromProduct(product) : loadBrand() };
const manifest = fs.existsSync(path.join(dir, "manifest.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) : {};

try {
  for (const f of listSlides(dir)) {
    const index = Number(path.basename(f).match(/\d+/)![0]);
    const { diagnostics: d } = await renderSlide(ctx, index);
    console.log(`slide ${index}: ${d.errors.length} errors, ${d.warnings.length} warnings`);
    for (const m of [...d.errors, ...d.warnings]) console.log(`  ${m}`);
  }
  const out = await exportCarousel(ctx, {
    caption: manifest.caption ?? undefined,
    altText: manifest.slides?.map((s: { alt: string | null }) => s.alt ?? "") ?? [],
  });
  console.log(`Exported ${out.pngs.length} PNGs and ${path.relative(process.cwd(), out.pdf)}`);
} finally {
  await closeBrowser();
}
