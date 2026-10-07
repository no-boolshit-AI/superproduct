/** Regenerates design/palettes.css from src/palettes.ts and prints a contrast report. */
import { PALETTES, contrast } from "../src/palettes.js";
import { writePalettesCss } from "../src/workspace.js";

await writePalettesCss();
console.log("design/palettes.css written\n");
console.log("palette        ink/bg  ink2/loud  onInk/ink");
for (const p of PALETTES) {
  const row = [contrast(p.ink, p.bg), contrast(p.ink2, p.loud), contrast(p.onInk, p.ink)].map((n) => n.toFixed(1).padStart(8));
  console.log(p.name.padEnd(13), row.join(" "));
}
