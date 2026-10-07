/** Slot text handling: light markdown for plain text, element placeholders, and sanitising untrusted HTML. */
import { ID_RE } from "./config.js";

export const escapeHtml = (s: string) => s.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const inline = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<i>$2</i>")
    .replace(/\^(\w{1,3})\^/g, "<sup>$1</sup>")
    .replace(/==(.+?)==/g, '<span class="hl">$1</span>');

const looksLikeHtml = (s: string) => /<\/?[a-z][\w-]*(\s[^>]*)?\/?>/i.test(s);

/** Tiny markdown: paragraphs, "- " bullets (2-space indent = nested), "1. " lists, "### " headings, **bold**, *italic*, ==highlight==. */
export function md(src: string): string {
  const lines = src.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: { text: string; sub: string[] }[] } | null = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(
      `<${list.type}>${list.items
        .map((it) => `<li>${inline(it.text)}${it.sub.length ? `<ul>${it.sub.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>` : ""}</li>`)
        .join("")}</${list.type}>`,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const sub = line.match(/^(\s{2,}|\t)[-*•]\s+(.*)$/);
    const ul = line.match(/^[-*•]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (sub && list) { list.items[list.items.length - 1]?.sub.push(sub[2]); continue; }
    if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      if (list && list.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push({ text: (ul ?? ol)![1], sub: [] });
      continue;
    }
    if (h) { flushPara(); flushList(); out.push(`<h${h[1].length === 2 ? 2 : h[1].length === 3 ? 3 : 4}>${inline(h[2])}</h${h[1].length === 2 ? 2 : h[1].length === 3 ? 3 : 4}>`); continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return out.join("\n");
}

/** Single-line text (titles, labels): escape + inline markdown, keep <br>/<b>/<i>/<span class> if author used them. */
export function line(src: string | undefined): string {
  if (!src) return "";
  if (looksLikeHtml(src)) return sanitize(src).html;
  return inline(src).replace(/\n/g, "<br>");
}

/** Slot body: markdown for plain text, sanitised HTML otherwise; then element placeholders. */
export function block(src: string | undefined): string {
  if (!src) return "";
  const html = looksLikeHtml(src) ? sanitize(src).html : md(src);
  return expandElements(html);
}

/** `<x-el id="x" height="240"></x-el>` → mount point for the element runtime. */
export function expandElements(html: string): string {
  return html.replace(/<x-el\b([^>]*?)\/?>(\s*<\/x-el>)?/gi, (_, attrs: string) => {
    const id = attrs.match(/\bid\s*=\s*["']?([a-z0-9-]+)/i)?.[1] ?? "";
    const h = attrs.match(/\bheight\s*=\s*["']?(\d+)/i)?.[1];
    const w = attrs.match(/\bwidth\s*=\s*["']?(\d+%?)/i)?.[1];
    const style = [h ? `height:${h}px` : "", w ? `width:${/%$/.test(w) ? w : w + "px"}` : ""].filter(Boolean).join(";");
    return `<div class="el" data-el="${id}"${style ? ` style="${style}"` : ""}></div>`;
  });
}

/** Slot that expects an element: a bare id becomes a filling mount point. */
export function elementSlot(src: string | undefined, fill = true): string {
  if (!src) return "";
  const t = src.trim();
  if (ID_RE.test(t)) return `<div class="el${fill ? " fill" : ""}" data-el="${t}"></div>`;
  return block(t);
}

const BLOCKED_TAGS = /<\s*\/?\s*(script|iframe|object|embed|frame|frameset|form|input|button|textarea|select|link|meta|base|style|video|audio|svg:script)\b[^>]*>/gi;

/** Strip anything that could escape the page: scripts, event handlers, external URLs, forms. Returns notes on what was removed. */
export function sanitize(input: string): { html: string; notes: string[] } {
  const notes: string[] = [];
  let html = input;
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (body) { html = body[1]; notes.push("Stripped <html>/<body>: slots take fragments only."); }
  if (/<script[\s\S]*?<\/script>/i.test(html)) { html = html.replace(/<script[\s\S]*?<\/script>/gi, ""); notes.push("Removed <script> (not allowed)."); }
  if (/<style[\s\S]*?<\/style>/i.test(html)) { html = html.replace(/<style[\s\S]*?<\/style>/gi, ""); notes.push("Removed <style> blocks: use component classes and inline style attributes."); }
  if (BLOCKED_TAGS.test(html)) { html = html.replace(BLOCKED_TAGS, ""); notes.push("Removed disallowed tags (iframe/form/link/media…)."); }
  if (/\son[a-z]+\s*=/i.test(html)) { html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ""); notes.push("Removed inline event handlers."); }
  if (/(src|href|xlink:href)\s*=\s*["']?\s*(https?:|\/\/|javascript:|file:)/i.test(html) || /url\(\s*["']?\s*(https?:|\/\/|file:)/i.test(html)) {
    html = html
      .replace(/(src|href|xlink:href)\s*=\s*(["'])\s*(https?:|\/\/|javascript:|file:)[^"']*\2/gi, '$1=""')
      .replace(/url\(\s*["']?\s*(https?:|\/\/|file:)[^)]*\)/gi, "none");
    notes.push("Removed external/absolute URLs: images must come from assets/ in the job folder.");
  }
  if (/(src|href)\s*=\s*["']?\.\.\//i.test(html)) { html = html.replace(/(src|href)\s*=\s*(["'])\.\.\/[^"']*\2/gi, '$1=""'); notes.push("Removed ../ paths."); }
  return { html, notes };
}

/** Split a slot into blocks separated by a line containing only `---`. */
export function splitBlocks(src: string): string[] {
  return src
    .split(/\n\s*---+\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
