/**
 * Renders every layout template with the bundled sample images in one or more palettes.
 *   npm run preview                 -> all palettes
 *   npm run preview -- orchid acid  -> just these
 *   npm run preview -- brand        -> the product folder's palette, masthead and fonts
 * Output: output/_preview/<palette>/png/*.png and output/_preview/<palette>/contact.jpg
 */
import { copyFile, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LAYOUTS_DIR, OUTPUT_DIR, SAMPLES_DIR } from "../src/paths.js";
import { PALETTE_NAMES } from "../src/palettes.js";
import { prepareJobDir } from "../src/workspace.js";
import { closeBrowser, contactSheet, renderSlides } from "../src/tools/render.js";
import { activeProduct, brandFontKit } from "../src/product.js";

const product = activeProduct(); // registers the `brand` palette when there is a product folder

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const palettes = wanted.length ? wanted : PALETTE_NAMES;
const layouts = (await readdir(LAYOUTS_DIR)).filter((f) => f.endsWith(".html")).sort();

try {
  for (const palette of palettes) {
    if (!PALETTE_NAMES.includes(palette)) throw new Error(`Unknown palette "${palette}". Known: ${PALETTE_NAMES.join(", ")}`);
    const dir = path.join(OUTPUT_DIR, "_preview", palette);
    const kit = palette === "brand" && product?.brandFonts ? brandFontKit(product.product) : undefined;
    await prepareJobDir(dir, kit ? { fontFiles: kit.files, css: kit.css } : {});
    for (const f of await readdir(SAMPLES_DIR)) {
      if (/\.(png|jpe?g|webp)$/i.test(f)) await copyFile(path.join(SAMPLES_DIR, f), path.join(dir, "assets", f));
    }
    const files: string[] = [];
    for (const l of layouts) {
      let html = (await readFile(path.join(LAYOUTS_DIR, l), "utf8")).replace(/data-palette="[^"]*"/, `data-palette="${palette}"`);
      if (palette === "brand" && product) html = html.replace(/(<p class="mast">)[^<]*(<\/p>)/, `$1${product.masthead}$2`);
      const out = path.join(dir, l);
      await writeFile(out, html);
      files.push(out);
    }
    const results = await renderSlides(files, path.join(dir, "png"));
    const sheet = await contactSheet(results.map((r) => r.image), path.join(dir, "contact.jpg"), 4);
    console.log(`\n${palette}: ${sheet}`);
    for (const r of results) {
      console.log(`  ${path.basename(r.image)}${r.warnings.length ? "" : "  ✓"}`);
      for (const w of r.warnings) console.log(`     ! ${w}`);
    }
  }
} finally {
  await closeBrowser();
}
