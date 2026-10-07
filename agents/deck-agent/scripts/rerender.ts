#!/usr/bin/env tsx
/** Re-render and re-export an existing job without Claude, optionally switching theme or brand:
 *  npm run rerender -- <job-id-or-folder> [--theme editorial] [--brand brands/x.json] [--product <dir>|none] [--dpi 300]
 *  Without --brand / --product it uses what the job used (job.json), else the usual resolution. */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { OUTPUT_DIR } from "../src/config.js";
import { resolveBrand } from "../src/product.js";
import { listPages, readDoc, writeDoc } from "../src/document.js";
import { contactSheet, exportDocument, renderPagePreview } from "../src/pipeline.js";
import { closeBrowser } from "../src/render/renderer.js";
import { isTheme } from "../src/themes.js";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { theme: { type: "string" }, brand: { type: "string" }, product: { type: "string" }, dpi: { type: "string" } } });
const target = positionals[0];
if (!target) { console.log("Usage: npm run rerender -- <job-id-or-folder> [--theme t] [--brand file] [--product dir|none] [--dpi 300]"); process.exit(1); }
const dir = fs.existsSync(target) ? path.resolve(target) : path.join(OUTPUT_DIR, target);
const doc = readDoc(dir);
if (!doc) throw new Error(`No doc.json in ${dir}`);
if (values.theme) { if (!isTheme(values.theme)) throw new Error("Unknown theme"); doc.theme = values.theme; writeDoc(dir, doc); }
if (values.dpi) process.env.EXPORT_DPI = values.dpi;
let record: { options?: { brandPath?: string; product?: string }; product?: { dir: string } | null } = {};
try { record = JSON.parse(fs.readFileSync(path.join(dir, "job.json"), "utf8")); } catch {}
const explicit = values.brand !== undefined || values.product !== undefined;
const resolved = resolveBrand(
  explicit
    ? { brandPath: values.brand, product: values.product }
    : { brandPath: record.options?.brandPath, product: record.options?.product ?? (record.product === null ? "none" : record.product?.dir) },
);
console.log(`Brand: ${resolved.brand.name} (${resolved.brand.source ?? "brand file"})`);
const job = { dir, brand: resolved.brand };
try {
  for (const p of listPages(dir)) {
    const r = await renderPagePreview(job, p.index);
    const errs = [...r.errors, ...r.diagnostics.errors];
    console.log(`p${p.index} ${p.spec.layout}${errs.length ? "\n   " + errs.join("\n   ") : " ✓"}`);
  }
  const sheet = await contactSheet(job);
  if (sheet) fs.writeFileSync(path.join(dir, "contact-sheet.jpg"), sheet);
  const r = await exportDocument(job);
  console.log(`→ ${r.pdf} (${(r.bytes / 1e6).toFixed(1)} MB)`);
} finally {
  await closeBrowser();
}
