/** Rendering is sandboxed to the slide's own folder, and layout checks fire. */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SAMPLES_DIR } from "../src/paths.js";
import { prepareJobDir } from "../src/workspace.js";
import { closeBrowser, renderSlides } from "../src/tools/render.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "collage-render-"));
await prepareJobDir(dir);
copyFileSync(path.join(SAMPLES_DIR, "sample-portrait.jpg"), path.join(dir, "assets", "p.jpg"));
const head = `<!doctype html><html lang="en" data-palette="acid"><head><meta charset="utf-8"><link rel="stylesheet" href="_design/collage.css"><script src="_design/collage.js" defer></script></head>`;
writeFileSync(path.join(dir, "slide-01.html"), `${head}<body><main class="canvas L-cover grain">
  <img class="img hero duo-hero" src="assets/p.jpg" alt=""><p class="mast">Brand</p>
  <h1 class="txt hl" data-fit data-min="84">Short headline</h1></main></body></html>`);
writeFileSync(path.join(dir, "slide-02.html"), `${head}<body><main class="canvas L-cover">
  <img class="img hero" src="/etc/hostname" alt=""><img class="img" src="https://example.com/x.png" alt="">
  <p class="mast">Brand</p>
  <h1 class="txt hl" data-fit data-min="120">This headline is far too long to ever fit into the cover box at the minimum size we allow here, so it overflows</h1>
  <p class="txt body dek">Dek that collides with the headline box on purpose</p>
  <style>.dek{top:900px!important}</style></main></body></html>`);
try {
  const [ok, bad] = await renderSlides([path.join(dir, "slide-01.html"), path.join(dir, "slide-02.html")], path.join(dir, "png"));
  assert.deepEqual(ok.warnings, [], "clean slide has no warnings");
  const w = bad.warnings.join("\n");
  assert.match(w, /Blocked .*etc\/hostname/, "local file outside the job is blocked");
  assert.match(w, /Blocked .*example\.com/, "network is blocked");
  assert.match(w, /overflows its box at minimum size/);
  assert.match(w, /overlap/);
  console.log("✓ render sandbox + checks OK");
} finally {
  await closeBrowser();
}
