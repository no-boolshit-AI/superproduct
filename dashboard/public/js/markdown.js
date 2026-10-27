// A small Markdown renderer for the agents' documents (briefs, captions, storyboards, the product folder): headings,
// paragraphs, lists, tables, quotes, code, links and emphasis. Everything is escaped first; links only keep http(s),
// mailto and relative targets, resolved against `base` (the document's folder URL).

import { esc } from "./ui.js";

const safeHref = (href, base) => {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h)) return h;
  if (/^[a-z][\w+.-]*:/i.test(h) || h.startsWith("//")) return null;
  if (h.startsWith("#")) return null;
  try {
    return base ? new URL(h, new URL(base, location.href)).pathname : h;
  } catch {
    return null;
  }
};

function inline(text, base) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, alt, src) => {
      const url = safeHref(src.replace(/&amp;/g, "&"), base);
      return url && !/^(https?:|mailto:)/i.test(url) ? `<img src="${esc(url)}" alt="${alt}" loading="lazy">` : alt;
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, label, href) => {
      const url = safeHref(href.replace(/&amp;/g, "&"), base);
      return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
    })
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, (m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

/** Markdown text → HTML string. Front matter (--- … ---) is left out. */
export function markdown(src, { base } = {}) {
  const lines = String(src ?? "")
    .replace(/^﻿/, "")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .split(/\r?\n/);
  return blocks(lines, base);
}

function blocks(lines, base) {
  const out = [];
  let i = 0;
  const para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "), base)}</p>`);
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (!line.trim()) {
      flush();
      i++;
    } else if ((m = line.match(/^\s*(```|~~~)\s*([\w-]*)/))) {
      flush();
      const fence = m[1];
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
    } else if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
      flush();
      const level = Math.min(6, m[1].length + 1);
      out.push(`<h${level}>${inline(m[2], base)}</h${level}>`);
      i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      i++;
    } else if (/^\s*>/.test(line)) {
      flush();
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${blocks(quote, base)}</blockquote>`);
    } else if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]));
      const td = (tag, c, k) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c, base)}</${tag}>`;
      out.push(`<div class="md-table"><table><thead><tr>${head.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, k) => td("td", c, k)).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+/))) {
      flush();
      const indent = m[1].length;
      const ordered = /\d/.test(m[2]);
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const im = l.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (im && im[1].length <= indent + 1) {
          items.push([im[3]]);
          i++;
        } else if (items.length && l.trim() && (/^\s/.test(l) || !/^\S/.test(l)) && l.match(/^\s*/)[0].length > indent) {
          items[items.length - 1].push(l.slice(Math.min(l.match(/^\s*/)[0].length, indent + 2)));
          i++;
        } else if (!l.trim() && i + 1 < lines.length && lines[i + 1].match(/^(\s*)([-*+]|\d+[.)])\s+/) && lines[i + 1].match(/^\s*/)[0].length >= indent) {
          i++;
        } else break;
      }
      const li = items.map(([lead, ...rest]) => {
        // lines that only continue the item's text belong to its first paragraph
        let first = lead;
        while (rest.length && rest[0].trim() && !/^\s*([-*+]|\d+[.)])\s+|^\s*(```|~~~|#|>|\|)/.test(rest[0])) first += ` ${rest.shift().trim()}`;
        const task = first.match(/^\[([ xX])\]\s+(.*)$/);
        const head = task ? `<input type="checkbox" disabled${task[1] !== " " ? " checked" : ""}> ${inline(task[2], base)}` : inline(first, base);
        return `<li>${head}${rest.length ? blocks(rest, base) : ""}</li>`;
      });
      out.push(ordered ? `<ol>${li.join("")}</ol>` : `<ul>${li.join("")}</ul>`);
    } else {
      para.push(line.trim());
      i++;
    }
  }
  flush();
  return out.join("\n");
}
