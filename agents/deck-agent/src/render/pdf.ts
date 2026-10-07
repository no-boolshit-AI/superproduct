/** PDF assembly: one PNG per page, an invisible text layer (search/copy/screen readers) and section bookmarks. */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFHexString,
  PDFArray,
  PDFRef,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextRenderingMode,
  setCharacterSqueeze,
  showText,
  moveText,
  TextRenderingMode,
  type PDFFont,
  type PDFDict,
} from "pdf-lib";
import type { TextRun } from "./renderer.js";

const require = createRequire(import.meta.url);

export interface PdfPage {
  png: Buffer;
  cssWidth: number;
  cssHeight: number;
  text?: TextRun[];
}

export interface PdfOptions {
  pageSize: [number, number];
  title: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  language?: string;
  outline?: { title: string; page: number }[]; // page: 0-based
  textLayer: boolean;
}

function textFontBytes(): Buffer | null {
  try {
    return fs.readFileSync(path.join(path.dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf", "DejaVuSans.ttf"));
  } catch {
    return null;
  }
}

function addOutline(doc: PDFDocument, items: { title: string; page: number }[]) {
  if (!items.length) return;
  const ctx = doc.context;
  const pages = doc.getPages();
  const outlineRef = ctx.nextRef();
  const refs: PDFRef[] = items.map(() => ctx.nextRef());
  items.forEach((it, i) => {
    const page = pages[Math.max(0, Math.min(pages.length - 1, it.page))];
    const dest = PDFArray.withContext(ctx);
    dest.push(page.ref);
    dest.push(PDFName.of("Fit"));
    const dict: Record<string, unknown> = {
      Title: PDFHexString.fromText(it.title),
      Parent: outlineRef,
      Dest: dest,
    };
    if (i > 0) dict.Prev = refs[i - 1];
    if (i < items.length - 1) dict.Next = refs[i + 1];
    ctx.assign(refs[i], ctx.obj(dict as never));
  });
  ctx.assign(
    outlineRef,
    ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: PDFNumber.of(items.length) } as never),
  );
  doc.catalog.set(PDFName.of("Outlines"), outlineRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

function drawInvisibleText(page: ReturnType<PDFDocument["addPage"]>, font: PDFFont, fontKey: PDFName, runs: TextRun[], k: number, pageH: number) {
  const ops = [];
  for (const run of runs) {
    const text = run.text.replace(/[\u0000-\u001f]/g, "");
    if (!text.trim()) continue;
    const size = Math.max(1, run.size * k);
    let natural = 0;
    try {
      natural = font.widthOfTextAtSize(text, size);
    } catch {
      continue;
    }
    if (natural <= 0) continue;
    const squeeze = Math.max(10, Math.min(400, ((run.w * k) / natural) * 100));
    const baseline = pageH - (run.y + run.h / 2 + run.size * 0.32) * k;
    ops.push(
      pushGraphicsState(),
      beginText(),
      setFontAndSize(fontKey, size),
      setTextRenderingMode(TextRenderingMode.Invisible),
      setCharacterSqueeze(squeeze),
      moveText(run.x * k, baseline),
      showText(font.encodeText(text)),
      endText(),
      popGraphicsState(),
    );
  }
  if (ops.length) page.pushOperators(...ops);
}

export async function buildPdf(pages: PdfPage[], opts: PdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  let font: PDFFont | null = null;
  if (opts.textLayer) {
    const bytes = textFontBytes();
    if (bytes) font = await doc.embedFont(bytes, { subset: true });
  }
  const [pw, ph] = opts.pageSize;
  for (const p of pages) {
    const page = doc.addPage([pw, ph]);
    const img = await doc.embedPng(p.png);
    page.drawImage(img, { x: 0, y: 0, width: pw, height: ph });
    if (font && p.text?.length) {
      const key = (page.node as unknown as { newFontDictionary(name: string, ref: PDFRef): PDFName }).newFontDictionary(font.name, font.ref);
      drawInvisibleText(page, font, key, p.text, pw / p.cssWidth, ph);
    }
  }
  doc.setTitle(opts.title, { showInWindowTitleBar: true });
  if (opts.author) doc.setAuthor(opts.author);
  if (opts.subject) doc.setSubject(opts.subject);
  if (opts.keywords?.length) doc.setKeywords(opts.keywords);
  doc.setCreator("deck-agent");
  doc.setProducer("deck-agent (Claude Agent SDK + Playwright + pdf-lib)");
  if (opts.language) doc.catalog.set(PDFName.of("Lang"), PDFHexString.fromText(opts.language));
  addOutline(doc, opts.outline ?? []);
  void (null as unknown as PDFDict);
  return doc.save();
}
