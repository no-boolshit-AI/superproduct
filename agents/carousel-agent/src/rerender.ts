// Re-render and re-export an existing run after editing slides/*.html by hand.
//   npm run render -- 2026-10-06-12-00-my-carousel        (a run in the output root, workspace/out/carousel)
//   npm run render -- path/to/2026-10-06-12-00-my-carousel
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { defaultOutDir, isStyleId, listSlides, loadBrand, type Format, type RunContext } from "./config.js";
import { brandFromProduct, resolveProduct } from "./product.js";
import { exportCarousel, renderSlide } from "./slides.js";
import { closeBrowser } from "./render/renderer.js";

const arg = process.argv[2] ?? "";
const dir = [path.resolve(arg), path.join(defaultOutDir(), arg)].find((d) => arg && fs.existsSync(path.join(d, "slides")));
if (!dir) {
  console.log("Usage: npm run render -- <run id in the output root, or run folder>");
  process.exit(1);
}
const run = fs.existsSync(path.join(dir, "run.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8")) : {};
// Same brand as the original run: its brand file, else its product folder (the current one if that folder has moved,
// e.g. into the workspace), else the default.
const recorded = run.product && fs.existsSync(path.join(run.product, "product.json"));
if (!run.brand && run.product && !recorded) console.log(`The run's product folder ${run.product} is gone; using the current product folder.`);
const product = !run.brand && run.product ? resolveProduct(recorded ? run.product : undefined) : null;
// Runs from before styles existed are consulting carousels.
const ctx: RunContext = {
  dir,
  format: (run.format ?? "square") as Format,
  brand: run.brand ? loadBrand(run.brand) : product ? brandFromProduct(product) : loadBrand(),
  style: isStyleId(run.style) ? run.style : "consulting",
  single: run.kind === "single",
};
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
  console.log(`Exported ${out.pngs.length} PNG(s)${out.pdf ? ` and ${path.relative(process.cwd(), out.pdf)}` : ""} (style ${ctx.style})`);
} finally {
  await closeBrowser();
}
