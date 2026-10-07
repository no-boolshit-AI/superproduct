#!/usr/bin/env tsx
/**
 * Renders the demo deck and report in every theme and writes overview sheets to docs/: `npm run gallery`.
 * Shows the themes' own look; `npm run gallery -- --product ../../product` shows them in a product's brand instead
 * (written to docs/themes-*-product.jpg).
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { OUTPUT_DIR, ROOT } from "../src/config.js";
import { renderHtmlString, closeBrowser } from "../src/render/renderer.js";
import { THEME_IDS, THEMES } from "../src/themes.js";
import { strategyDeck, strategyReport } from "./demo-content.js";
import { buildDemo } from "./demo-lib.js";

const DECK_PAGES = [1, 5, 6, 8, 10, 11, 13, 15];
const REPORT_PAGES = [1, 3, 6, 7, 9, 10];

async function sheet(rows: { label: string; files: string[] }[], tileW: number, aspect: number, out: string) {
  const tileH = Math.round(tileW / aspect);
  const cols = Math.max(...rows.map((r) => r.files.length));
  const labelW = 150, gap = 14;
  const W = labelW + cols * (tileW + gap) + gap, H = rows.length * (tileH + gap) + gap;
  const html = `<html><body style="margin:0;background:#dfe3e8;font:600 15px system-ui">${rows
    .map((r, i) => `<div style="position:absolute;left:${gap}px;top:${gap + i * (tileH + gap)}px;width:${labelW - gap}px;height:${tileH}px;display:flex;align-items:center;color:#1b2430">${r.label}</div>${r.files
      .map((f, j) => `<img src="data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}" style="position:absolute;left:${labelW + j * (tileW + gap)}px;top:${gap + i * (tileH + gap)}px;width:${tileW}px;height:${tileH}px;box-shadow:0 1px 4px rgba(0,0,0,.2)">`)
      .join("")}`)
    .join("")}</body></html>`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await renderHtmlString(html, { width: W, height: H, type: "jpeg", quality: 82 }));
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

const { values } = parseArgs({ options: { product: { type: "string" } } });
const product = values.product ?? "none";
const suffix = product === "none" ? "" : "-product";

try {
  const root = path.join(OUTPUT_DIR, "_gallery");
  const deckRows = [], reportRows = [];
  for (const t of THEME_IDS) {
    const d = await buildDemo(`deck-${t}`, strategyDeck(t), { export: false, outRoot: root, quiet: true, product });
    const r = await buildDemo(`report-${t}`, strategyReport(t), { export: false, outRoot: root, quiet: true, product });
    deckRows.push({ label: THEMES[t].label, files: DECK_PAGES.map((p) => path.join(d.dir, "preview", `page-${String(p).padStart(2, "0")}.jpg`)) });
    reportRows.push({ label: THEMES[t].label, files: REPORT_PAGES.map((p) => path.join(r.dir, "preview", `page-${String(p).padStart(2, "0")}.jpg`)) });
  }
  await sheet(deckRows, 300, 16 / 9, path.join(ROOT, "docs", `themes-deck${suffix}.jpg`));
  await sheet(reportRows, 190, 794 / 1123, path.join(ROOT, "docs", `themes-report${suffix}.jpg`));
} finally {
  await closeBrowser();
}
