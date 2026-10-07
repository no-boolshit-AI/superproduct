/** Build a demo document (no Claude) into a job folder: used by demo.ts, gallery.ts and tests. */
import fs from "node:fs";
import path from "node:path";
import { OUTPUT_DIR } from "../src/config.js";
import { resolveBrand } from "../src/product.js";
import { initJobDir, writeDoc, writeElement, writePage } from "../src/document.js";
import { contactSheet, exportDocument, renderPagePreview, type Job } from "../src/pipeline.js";
import type { DemoDoc } from "./demo-content.js";

export async function buildDemo(name: string, demo: DemoDoc, opts: { export: boolean; brandPath?: string; product?: string; outRoot?: string; quiet?: boolean }) {
  const dir = path.join(opts.outRoot ?? OUTPUT_DIR, name);
  fs.rmSync(dir, { recursive: true, force: true });
  initJobDir(dir);
  const job: Job = { dir, brand: resolveBrand({ brandPath: opts.brandPath, product: opts.product }).brand };
  writeDoc(dir, demo.doc);
  for (const e of demo.elements) writeElement(dir, e);
  demo.pages.forEach((p, i) => writePage(dir, i + 1, p));
  let issues = 0;
  for (let i = 1; i <= demo.pages.length; i++) {
    const r = await renderPagePreview(job, i);
    const lines = [...r.errors.map((e) => `ERROR ${e}`), ...r.diagnostics.errors.map((e) => `ERROR ${e}`), ...r.diagnostics.warnings.map((w) => `warn  ${w}`), ...r.notes.map((n) => `note  ${n}`)];
    issues += r.errors.length + r.diagnostics.errors.length;
    if (!opts.quiet || lines.some((l) => l.startsWith("ERROR"))) console.log(`${name} p${i} ${demo.pages[i - 1].layout}${lines.length ? "\n   " + lines.join("\n   ") : " ✓"}`);
  }
  const sheet = await contactSheet(job);
  if (sheet) fs.writeFileSync(path.join(dir, "contact-sheet.jpg"), sheet);
  if (opts.export) {
    const t = Date.now();
    const ex = await exportDocument(job);
    console.log(`${name}: ${path.relative(process.cwd(), ex.pdf)} (${(ex.bytes / 1e6).toFixed(1)} MB, ${ex.pngs.length} pages, ${ex.exhibits.length} exhibits, ${((Date.now() - t) / 1000).toFixed(1)}s)`);
    for (const w of ex.warnings) console.log(`   export: ${w}`);
  }
  return { dir, issues };
}
