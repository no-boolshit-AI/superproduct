/** Page layouts for 16:9 decks and A4 reports. Each layout fills named slots into a fixed grid. */
import type { FormatId } from "./config.js";
import { block, elementSlot, escapeHtml, line, splitBlocks } from "./html.js";
import type { ThemeId } from "./themes.js";

export interface DocMeta {
  format: FormatId;
  theme: ThemeId;
  title: string;
  subtitle?: string;
  client?: string;
  author?: string;
  date?: string;
  confidentiality?: string;
  language?: string;
  running_title?: string;
}

export interface PageSpec {
  layout: string;
  title?: string;
  subtitle?: string;
  tracker?: string;
  slots: Record<string, string>;
  source?: string;
  notes?: string[];
  speaker_notes?: string;
}

export interface TocEntry {
  n: string;
  title: string;
  sub?: string;
  page: number;
  minor?: boolean;
}

export interface PageCtx {
  format: FormatId;
  theme: ThemeId;
  doc: DocMeta;
  pageNo: number;
  total: number;
  section?: string;
  chapter?: string;
  exhibitNo?: number;
  toc: TocEntry[];
}

export interface Rendered {
  body: string;
  cls?: string[];
  decor?: boolean;
  /** Extra HTML placed before the head (absolute images etc.) */
  before?: string;
}

export interface LayoutDef {
  id: string;
  formats: FormatId[];
  label: string;
  description: string;
  slots: Record<string, string>;
  required?: string[];
  /** full: header + footer chrome. bare: no header (layout draws its own title), footer kept. none: no chrome at all. */
  chrome: "full" | "bare" | "none";
  /** Pages of this layout become dark ("inverse") in these themes. */
  inverseIn?: ThemeId[];
  render(p: PageSpec, ctx: PageCtx): Rendered;
}

const s = (p: PageSpec, k: string) => (p.slots?.[k] ?? "").trim();
const yes = (v: string) => /^(1|y|yes|true|on)$/i.test(v.trim());
const pad2 = (n: number | string) => String(n).padStart(2, "0");

/** Blocks separated by `---` → cards/panels. A block may start with `icon: name` and/or `### Title`. */
function blocksToCards(src: string, kind: "card" | "panel", variant = ""): { html: string; count: number } {
  if (/<(div|section|article)\b/i.test(src)) {
    const count = (src.match(/class=["'][^"']*\b(card|panel|col)\b/g) ?? []).length || 1;
    return { html: block(src), count };
  }
  const blocks = splitBlocks(src);
  const html = blocks
    .map((b) => {
      let body = b;
      let icon = "";
      let big = "";
      let hl = false;
      const im = body.match(/^icon:\s*([a-z0-9-]+)\s*\n/i);
      if (im) { icon = `<i class="icon icon--${im[1]}${kind === "card" ? " icon--lg" : ""}"></i>`; body = body.slice(im[0].length); }
      const bm = body.match(/^big:\s*(.+)\n/i);
      if (bm) { big = `<div class="big">${escapeHtml(bm[1].trim())}</div>`; body = body.slice(bm[0].length); }
      const hm = body.match(/^highlight\s*\n/i);
      if (hm) { hl = true; body = body.slice(hm[0].length); }
      const tm = body.match(/^#{2,4}\s+(.+)\n?/);
      let title = "";
      if (tm) { title = `<h3>${line(tm[1])}</h3>`; body = body.slice(tm[0].length); }
      const cls = kind === "card" ? `card${variant ? " card--" + variant : ""}${hl ? (variant === "line" ? " is-hl" : " card--accent") : ""}` : `panel${hl ? " panel--hl" : ""}`;
      return `<div class="${cls}">${icon}${big}${title}${block(body)}</div>`;
    })
    .join("\n");
  return { html, count: blocks.length };
}

/** Bullet list where each item reads "**Lead.** support" → numbered key-point rows. */
function keyPoints(src: string, numbered = true): string {
  if (/<(div|section)\b/i.test(src)) return block(src);
  const items = src
    .split(/\n(?=\s*(?:[-*•]|\d+[.)])\s+)/)
    .map((t) => t.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  return items
    .map((it, i) => {
      const m = it.match(/^\*\*(.+?)\*\*\s*[:.—–-]?\s*([\s\S]*)$/);
      const lead = m ? m[1] : "";
      const rest = m ? m[2] : it;
      const num = numbered ? `<div class="kp-num">${i + 1}</div>` : "";
      // "**Lead.** support" → heading + text; "**Lead** continues…" / "**Lead:** …" → one paragraph with a bold lead
      if (lead && !/[.!?]$/.test(lead.trim())) return `<div class="kp">${num}<div><p><b>${line(lead)}</b> ${line(rest)}</p></div></div>`;
      return `<div class="kp">${num}${lead ? `<h3>${line(lead)}</h3>` : ""}<div>${block(rest)}</div></div>`;
    })
    .join("");
}

function exhibitFigure(p: PageSpec, ctx: PageCtx, opts: { fill: boolean; height?: string }) {
  const el = s(p, "exhibit") || s(p, "element");
  if (!el) return "";
  const title = s(p, "exhibit_title");
  const sub = s(p, "exhibit_subtitle");
  const src = s(p, "exhibit_source");
  const notes = s(p, "exhibit_notes");
  const h = opts.height || s(p, "exhibit_height");
  const mount = /^[a-z0-9][a-z0-9-]*$/.test(el)
    ? `<div class="el${opts.fill && !h ? " fill" : ""}" data-el="${el}"${h ? ` style="height:${parseInt(h, 10)}px"` : ""}></div>`
    : block(el);
  const label = ctx.exhibitNo ? `<div class="exhibit-label">Exhibit ${ctx.exhibitNo}</div>` : "";
  const foot = notes || src ? `<div class="exhibit-foot">${notes ? block(notes) : ""}${src ? `<p><b>Source:</b> ${line(src)}</p>` : ""}</div>` : "";
  return `<figure class="exhibit exhibit--rule${opts.fill ? " fill" : ""}" style="margin:0">${label}${title ? `<h3 class="exhibit-title">${line(title)}</h3>` : ""}${sub ? `<p class="exhibit-sub">${line(sub)}</p>` : ""}<div class="exhibit-body">${mount}</div>${foot}</figure>`;
}

const DARK_DIVIDERS: ThemeId[] = ["strategy", "corporate", "executive", "swiss", "editorial"];

export const LAYOUTS: LayoutDef[] = [
  {
    id: "cover",
    formats: ["deck", "report"],
    label: "Cover",
    description: "Title page: kicker (client / occasion), title, subtitle, date, optional image. Uses the document title if no title is given.",
    slots: {
      kicker: "Small label above the title, e.g. client name, 'Board meeting' or 'Research report'",
      date: "e.g. 'October 2026'",
      presenter: "Optional: team or author line",
      image: "Optional: assets/… image (deck: right 44%, report: bottom band)",
      confidentiality: "Optional notice; 'default' uses the brand's confidentiality line",
    },
    chrome: "none",
    inverseIn: ["strategy", "executive"],
    render(p, ctx) {
      const title = p.title || ctx.doc.title;
      const img = s(p, "image");
      const conf = s(p, "confidentiality");
      return {
        decor: true,
        cls: img ? ["has-image"] : [],
        before: img ? `<div class="cover-image"><img src="${escapeHtml(img)}" alt=""></div>` : "",
        body: `<div class="cover-wrap">
  ${s(p, "kicker") || ctx.doc.client ? `<div class="cover-kicker">${line(s(p, "kicker") || ctx.doc.client)}</div>` : ""}
  <h1 class="cover-title">${line(title)}</h1>
  ${p.subtitle || ctx.doc.subtitle ? `<div class="cover-sub">${line(p.subtitle || ctx.doc.subtitle)}</div>` : ""}
</div>
<div class="cover-meta"><span>${line(s(p, "date") || ctx.doc.date)}</span>${s(p, "presenter") || ctx.doc.author ? `<span>${line(s(p, "presenter") || ctx.doc.author)}</span>` : ""}<span class="wordmark"></span></div>
${conf ? `<div class="cover-conf" style="margin-top:14px">${line(conf === "default" ? ctx.doc.confidentiality ?? "" : conf)}</div>` : ""}`,
      };
    },
  },
  {
    id: "agenda",
    formats: ["deck"],
    label: "Agenda",
    description: "Numbered agenda. One item per line ('Title — optional detail'). `active` highlights the current item when repeated before each section.",
    slots: { items: "One item per line: 'Market context — where growth comes from'", active: "Optional 1-based item number to highlight" },
    required: ["items"],
    chrome: "full",
    render(p) {
      const active = parseInt(s(p, "active"), 10);
      const items = s(p, "items")
        .split("\n")
        .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
        .filter(Boolean);
      return {
        body: `<div class="agenda">${items
          .map((it, i) => {
            const [t, sub] = it.split(/\s+[—–]\s+|\s+-\s+/);
            return `<div class="agenda-item${active === i + 1 ? " is-active" : ""}"><span class="agenda-n">${pad2(i + 1)}</span><span class="agenda-t">${line(t)}${sub ? `<small>${line(sub)}</small>` : ""}</span></div>`;
          })
          .join("")}</div>`,
      };
    },
  },
  {
    id: "section",
    formats: ["deck"],
    label: "Section divider",
    description: "Opens a chapter of the deck: big number, section title, one-line intro. Its title (or `tracker`) becomes the tracker label on following pages.",
    slots: { number: "e.g. '01' or 'A' (appendix)", intro: "Optional one-sentence intro", tracker: "Optional short name for the tracker on following pages" },
    chrome: "bare",
    inverseIn: DARK_DIVIDERS,
    render(p) {
      return {
        decor: true,
        body: `<div class="sec-wrap">${s(p, "number") ? `<div class="sec-num">${line(s(p, "number"))}</div>` : ""}<h1 class="sec-title">${line(p.title)}</h1>${s(p, "intro") || p.subtitle ? `<div class="sec-sub">${line(s(p, "intro") || p.subtitle)}</div>` : ""}</div>`,
      };
    },
  },
  {
    id: "executive-summary",
    formats: ["deck"],
    label: "Executive summary",
    description: "Action title + 3–6 numbered key messages. Write each as a bullet '- **Lead sentence.** Supporting evidence with numbers.' The leads alone should tell the whole story.",
    slots: { points: "Bullets: '- **Lead.** Support…'", numbered: "yes (default) / no" },
    required: ["points"],
    chrome: "full",
    render(p) {
      const pts = s(p, "points");
      const n = (pts.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) ?? []).length;
      return { body: `<div class="exec${n > 5 ? " is-dense" : ""}">${keyPoints(pts, s(p, "numbered") ? yes(s(p, "numbered")) : true)}</div>` };
    },
  },
  {
    id: "scr",
    formats: ["deck", "report"],
    label: "Situation – Complication – Resolution",
    description: "Classic consulting storyline page: three labelled rows. Good as the executive summary of a short deck or a problem statement.",
    slots: { situation: "What is stable and known", complication: "What changed / why act now", resolution: "What we recommend", labels: "Optional custom labels, comma-separated" },
    required: ["situation", "complication", "resolution"],
    chrome: "full",
    render(p) {
      const labels = (s(p, "labels") || "Situation,Complication,Resolution").split(",").map((x) => x.trim());
      const rows = ["situation", "complication", "resolution"].map(
        (k, i) => `<div class="scr-row${i === 2 ? " is-res" : ""}"><div class="scr-label">${escapeHtml(labels[i] ?? k)}</div><div>${block(s(p, k))}</div></div>`,
      );
      return { body: `<div class="scr">${rows.join("")}</div>` };
    },
  },
  {
    id: "exhibit",
    formats: ["deck", "report"],
    label: "Exhibit (full-width chart/diagram/table)",
    description: "Action title + one element filling the page width + optional takeaway bar. The workhorse page of a consulting deck.",
    slots: { element: "Element id (or HTML with <x-el>)", takeaway: "Optional one-sentence so-what shown in a bar below", exhibit_title: "Report: exhibit title (numbered automatically)" },
    required: ["element"],
    chrome: "full",
    render(p, ctx) {
      if (ctx.format === "report") return { body: exhibitFigure(p, ctx, { fill: true }) + (s(p, "takeaway") ? `<div class="takeaway" style="margin-top:14px">${line(s(p, "takeaway"))}</div>` : "") };
      return { body: `${elementSlot(s(p, "element"))}${s(p, "takeaway") ? `<div class="takeaway">${line(s(p, "takeaway"))}</div>` : ""}` };
    },
  },
  {
    id: "chart-takeaways",
    formats: ["deck"],
    label: "Chart + takeaways",
    description: "Element on ~62% of the width, takeaway panel beside it. Use when the chart needs interpretation.",
    slots: {
      element: "Element id (or HTML)",
      takeaways: "Bullets; '**Lead.** support' works well. 2–4 points.",
      takeaways_title: "Panel heading (default 'Key takeaways')",
      side: "right (default) / left",
      chart_header: "Optional small header above the chart, e.g. the unit 'Revenue, EUR m'",
    },
    required: ["element", "takeaways"],
    chrome: "full",
    render(p) {
      const tk = s(p, "takeaways");
      const isKp = /\*\*/.test(tk);
      return {
        body: `<div class="ct${s(p, "side") === "left" ? " is-left" : ""}">
<div class="ct-main">${s(p, "chart_header") ? `<h4 style="margin-bottom:10px">${line(s(p, "chart_header"))}</h4>` : ""}${elementSlot(s(p, "element"))}</div>
<div class="ct-side"><h3>${line(s(p, "takeaways_title") || "Key takeaways")}</h3>${isKp ? keyPoints(tk, true) : block(tk)}</div>
</div>`,
      };
    },
  },
  {
    id: "two-column",
    formats: ["deck", "report"],
    label: "Two columns",
    description: "Side-by-side comparison: today vs. tomorrow, option A vs. B, problem vs. solution, two charts. Each column takes text and/or <x-el>.",
    slots: { left_title: "Heading", left: "Content (markdown or HTML, may contain <x-el id=…>)", right_title: "Heading", right: "Content", arrow: "yes = arrow between columns (from → to)", highlight: "left / right: accent the heading of that column" },
    required: ["left", "right"],
    chrome: "full",
    render(p) {
      const hl = s(p, "highlight");
      const col = (k: "left" | "right") =>
        `<div class="tc-col${hl === k ? " is-hl" : ""}">${s(p, `${k}_title`) ? `<h3>${line(s(p, `${k}_title`))}</h3>` : ""}${/^[a-z0-9][a-z0-9-]*$/.test(s(p, k)) ? elementSlot(s(p, k)) : block(s(p, k))}</div>`;
      const arrow = yes(s(p, "arrow"));
      return { body: `<div class="tc${arrow ? " has-arrow" : ""}">${col("left")}${arrow ? '<div class="tc-arrow"></div>' : ""}${col("right")}</div>` };
    },
  },
  {
    id: "columns",
    formats: ["deck", "report"],
    label: "Columns / pillars",
    description:
      "2–5 equal columns: pillars, levers, options, principles. Separate blocks with a line '---'. Each block may start with 'icon: name', 'big: €2bn', 'highlight' and '### Title', then text.",
    slots: { columns: "Blocks separated by ---", style: "cards (default) / line (rule on top, no box) / plain", footer: "Optional takeaway sentence below" },
    required: ["columns"],
    chrome: "full",
    render(p) {
      const style = s(p, "style") || "cards";
      const { html } = style === "plain" ? blocksToCards(s(p, "columns"), "panel") : blocksToCards(s(p, "columns"), "card", style === "line" ? "line" : "");
      return { body: `<div class="cols">${html}</div>${s(p, "footer") ? `<div class="takeaway cols-foot">${line(s(p, "footer"))}</div>` : ""}` };
    },
  },
  {
    id: "grid",
    formats: ["deck", "report"],
    label: "Grid of panels",
    description: "2×2 / 3×2 grid of panels, each with a heading and text or an element (<x-el id=…>). Blocks separated by '---', each starting with '### Title'.",
    slots: { cells: "Blocks separated by ---", cols: "Number of columns (default: 2 for ≤4 cells, else 3)" },
    required: ["cells"],
    chrome: "full",
    render(p) {
      const { html, count } = blocksToCards(s(p, "cells"), "panel");
      const cols = parseInt(s(p, "cols"), 10) || (count <= 2 ? 2 : count <= 4 ? 2 : 3);
      return { body: `<div class="grid-cells" style="--cols:${cols}">${html}</div>` };
    },
  },
  {
    id: "kpi-dashboard",
    formats: ["deck"],
    label: "KPI dashboard",
    description: "Row of KPI tiles on top (a kpis element) and one or two elements/text panels below.",
    slots: { kpis: "kpis element id", main: "Element id, HTML, or 2 blocks separated by --- (each '### Title' + <x-el id=…> or text)", kpi_height: "Optional px height of the KPI row (default 150)" },
    required: ["kpis"],
    chrome: "full",
    render(p) {
      const main = s(p, "main");
      let mainHtml = "";
      if (/^[a-z0-9][a-z0-9-]*$/.test(main)) mainHtml = `<div class="kd-main is-full"><div>${elementSlot(main)}</div></div>`;
      else if (main) mainHtml = `<div class="kd-main">${blocksToCards(main, "panel").html}</div>`;
      const h = parseInt(s(p, "kpi_height"), 10);
      return { body: `<div class="kd"${h ? ` style="--kd-kpi-h:${h}px"` : ""}><div class="kd-kpis">${elementSlot(s(p, "kpis"))}</div>${mainHtml}</div>` };
    },
  },
  {
    id: "statement",
    formats: ["deck", "report"],
    label: "Statement / big number / quote",
    description: "One big idea: a statement, a hero number with explanation, or a quote (quote: yes + attribution). Use sparingly for rhythm.",
    slots: { statement: "The sentence (≤ 20 words); ==text== highlights in accent", number: "Optional hero number instead, e.g. '€1.2bn'", support: "Optional supporting sentence", attribution: "Quote source (name, role)", quote: "yes = render as quote" },
    chrome: "full",
    render(p) {
      const q = yes(s(p, "quote"));
      return {
        cls: q ? ["is-quote"] : [],
        body: `<div class="st">${s(p, "number") ? `<div class="st-num">${line(s(p, "number"))}</div>` : ""}${s(p, "statement") ? `<div class="st-big">${line(s(p, "statement"))}</div>` : ""}${s(p, "support") ? `<div class="st-support">${block(s(p, "support"))}</div>` : ""}${s(p, "attribution") ? `<div class="st-by">— ${line(s(p, "attribution"))}</div>` : ""}</div>`,
      };
    },
  },
  {
    id: "image-text",
    formats: ["deck"],
    label: "Image + text",
    description: "Full-height image on one half (assets/… file), title and text on the other. For case examples, people, products, places.",
    slots: { image: "assets/… path", body: "Text (markdown/HTML)", caption: "Optional caption on the image", side: "Image side: right (default) / left" },
    required: ["image", "body"],
    chrome: "full",
    render(p) {
      const side = s(p, "side") === "left" ? "left" : "right";
      return {
        cls: [`is-${side}`],
        before: `<div class="it-img" style="${side === "right" ? "right:0" : "left:0"}"><img src="${escapeHtml(s(p, "image"))}" alt="">${s(p, "caption") ? `<div class="it-cap">${line(s(p, "caption"))}</div>` : ""}</div>`,
        body: `<div class="it"><div class="it-text">${block(s(p, "body"))}</div></div>`,
      };
    },
  },
  {
    id: "closing",
    formats: ["deck"],
    label: "Closing / next steps / contact",
    description: "Final page: closing message, short body (e.g. next steps) and contacts.",
    slots: { message: "Closing line (defaults to the page title)", body: "Optional text or next-steps list", contacts: "Optional contacts, one per block separated by ---: '**Name**\\nRole\\nemail'" },
    chrome: "bare",
    inverseIn: DARK_DIVIDERS,
    render(p) {
      const contacts = s(p, "contacts") ? splitBlocks(s(p, "contacts")).map((b) => `<div>${block(b)}</div>`).join("") : "";
      return {
        decor: true,
        body: `<div class="cl"><div><h1 class="cl-msg">${line(s(p, "message") || p.title || "Thank you")}</h1>${s(p, "body") ? `<div class="cl-body">${block(s(p, "body"))}</div>` : ""}</div><div class="cl-contacts">${contacts}</div></div>`,
      };
    },
  },
  {
    id: "contents",
    formats: ["report"],
    label: "Contents",
    description: "Table of contents. Leave `items` empty to build it automatically from summary/chapter pages with page numbers.",
    slots: { items: "Optional manual list, one per line 'Title — page'", depth: "auto list depth: 1 = chapters only (default), 2 = also article headings" },
    chrome: "full",
    render(p, ctx) {
      const manual = s(p, "items");
      const entries = manual
        ? manual.split("\n").filter(Boolean).map((l, i) => {
            const [t, pg] = l.replace(/^\s*[-*•]\s*/, "").split(/\s+[—–]\s+/);
            return { n: pad2(i + 1), title: t, page: parseInt(pg, 10) || 0 } as TocEntry;
          })
        : ctx.toc.filter((e) => !e.minor || s(p, "depth") === "2");
      return {
        body: `<div class="toc">${entries
          .map((e) => `<div class="toc-item${e.minor ? " is-minor" : ""}"><span class="toc-n">${e.minor ? "" : escapeHtml(e.n)}</span><span class="toc-t">${line(e.title)}${e.sub ? `<small>${line(e.sub)}</small>` : ""}</span><span class="toc-p">${e.page || ""}</span></div>`)
          .join("")}</div>`,
      };
    },
  },
  {
    id: "summary",
    formats: ["report"],
    label: "Executive summary (report)",
    description: "Report summary: a lead paragraph (the answer), a highlighted box of 3–6 key findings, then two columns of body text.",
    slots: { lead: "The answer in 2–3 sentences", findings: "Bullets '- **Finding.** evidence'", findings_title: "Box heading (default 'Key findings')", body: "Optional supporting text (flows in 2 columns)" },
    required: ["findings"],
    chrome: "full",
    render(p) {
      return {
        body: `<div class="sm">${s(p, "lead") ? `<div class="sm-lead">${block(s(p, "lead"))}</div>` : ""}<div class="sm-findings"><h4>${line(s(p, "findings_title") || "Key findings")}</h4>${keyPoints(s(p, "findings"))}</div>${s(p, "body") ? `<div class="sm-body">${block(s(p, "body"))}</div>` : ""}</div>`,
      };
    },
  },
  {
    id: "chapter",
    formats: ["report"],
    label: "Chapter opener",
    description: "Starts a chapter: number, title, standfirst, optional image band and optional opening text. Sets the running header.",
    slots: { number: "e.g. '1' or '01'", standfirst: "2–3 sentence summary of the chapter", image: "Optional assets/… image band", body: "Optional opening text (2 columns)", dark: "yes = dark page" },
    chrome: "bare",
    render(p) {
      const img = s(p, "image");
      return {
        cls: [...(img ? ["has-image"] : []), ...(yes(s(p, "dark")) ? ["inverse"] : [])],
        body: `${img ? `<div class="ch-image"><img src="${escapeHtml(img)}" alt=""></div>` : ""}<div class="ch-wrap">${s(p, "number") ? `<div class="ch-num">${line(s(p, "number"))}</div>` : ""}<h1 class="ch-title">${line(p.title)}</h1>${s(p, "standfirst") ? `<div class="ch-standfirst">${block(s(p, "standfirst"))}</div>` : ""}${s(p, "body") ? `<div class="ch-body">${block(s(p, "body"))}</div>` : ""}</div>`,
      };
    },
  },
  {
    id: "article",
    formats: ["report"],
    label: "Article page (text + exhibit)",
    description:
      "Body text in 1–2 columns with an optional numbered exhibit above or below and an optional sidebar/pull quote. The page title is the section heading (omit it on continuation pages).",
    slots: {
      standfirst: "Optional intro under the heading",
      body: "Body text (markdown: ### subheads, paragraphs, bullets). Must fit: split long text over several pages.",
      columns: "1 or 2 (default 2)",
      exhibit: "Optional element id",
      exhibit_title: "Exhibit title: the so-what as a full sentence",
      exhibit_subtitle: "Unit line, e.g. 'Revenue, EUR bn, 2020–25'",
      exhibit_source: "Source line",
      exhibit_notes: "Footnotes for the exhibit",
      exhibit_position: "top / bottom (default top)",
      exhibit_height: "px height of the element (default ~300)",
      aside: "Optional sidebar content (narrow right column)",
      pullquote: "Optional pull quote in the sidebar",
    },
    chrome: "full",
    render(p, ctx) {
      const pos = s(p, "exhibit_position") || "top";
      const ex = s(p, "exhibit") ? exhibitFigure(p, ctx, { fill: false, height: s(p, "exhibit_height") || "300" }) : "";
      const cols = s(p, "columns") === "1" ? 1 : 2;
      const text = s(p, "body") ? `<div class="ar-text" style="--ar-cols:${cols}">${block(s(p, "body"))}</div>` : "";
      const aside = s(p, "aside") || s(p, "pullquote");
      const main = aside
        ? `<div class="ar-side">${text.replace("--ar-cols:2", "--ar-cols:1")}<div class="ar-aside">${s(p, "pullquote") ? `<div class="pullquote">${line(s(p, "pullquote"))}</div>` : ""}${s(p, "aside") ? `<div class="box">${block(s(p, "aside"))}</div>` : ""}</div></div>`
        : text;
      const head = s(p, "standfirst") ? `<div class="ar-head"><div class="ar-standfirst">${block(s(p, "standfirst"))}</div></div>` : "";
      return { body: `<div class="ar">${head}${pos === "top" ? ex : ""}${main}${pos === "bottom" ? ex : ""}</div>` };
    },
  },
  {
    id: "exhibit-page",
    formats: ["report"],
    label: "Full-page exhibit",
    description: "One numbered exhibit using the whole page: exhibit title (the so-what), unit line, element, notes, source, and an optional short commentary below.",
    slots: { element: "Element id", exhibit_title: "Full-sentence so-what (defaults to the page title)", exhibit_subtitle: "Unit line", exhibit_notes: "Footnotes", exhibit_source: "Source (or use the page `source`)", commentary: "Optional 1–2 short paragraphs under the exhibit" },
    required: ["element"],
    chrome: "full",
    render(p, ctx) {
      const q: PageSpec = { ...p, slots: { ...p.slots, exhibit_title: s(p, "exhibit_title") || p.title || "", exhibit_subtitle: s(p, "exhibit_subtitle") || p.subtitle || "", exhibit_source: s(p, "exhibit_source") || p.source || "" } };
      return { body: `${exhibitFigure(q, ctx, { fill: true })}${s(p, "commentary") ? `<div class="xp-commentary">${block(s(p, "commentary"))}</div>` : ""}` };
    },
  },
  {
    id: "numbers",
    formats: ["report"],
    label: "Key numbers",
    description: "'At a glance' page: a grid of KPI tiles (kpis element, use columns 2–3) and an optional paragraph.",
    slots: { kpis: "kpis element id", body: "Optional text below" },
    required: ["kpis"],
    chrome: "full",
    render(p) {
      return { body: `<div class="nb"><div class="nb-kpis">${elementSlot(s(p, "kpis"))}</div>${s(p, "body") ? `<div class="nb-body">${block(s(p, "body"))}</div>` : ""}</div>` };
    },
  },
  {
    id: "back-cover",
    formats: ["report"],
    label: "Back cover",
    description: "Last page: about / methodology / contacts and a disclaimer.",
    slots: { body: "About this report, methodology, contacts", disclaimer: "Legal / confidentiality text" },
    chrome: "none",
    inverseIn: DARK_DIVIDERS,
    render(p) {
      return { body: `<div class="bc"><div class="wordmark"></div>${s(p, "body") ? `<div class="bc-body">${block(s(p, "body"))}</div>` : ""}${s(p, "disclaimer") ? `<div class="bc-disclaimer">${block(s(p, "disclaimer"))}</div>` : ""}</div>` };
    },
  },
  {
    id: "custom",
    formats: ["deck", "report"],
    label: "Custom",
    description: "Free composition inside the standard chrome. `body` is HTML using the component classes (row, stack, cols-2/3, card, panel, box, big, takeaway, <x-el>). Use only when no layout fits.",
    slots: { body: "HTML/markdown content" },
    required: ["body"],
    chrome: "full",
    render(p) {
      return { body: `<div class="custom">${block(s(p, "body"))}</div>` };
    },
  },
];

export const LAYOUT_MAP = new Map(LAYOUTS.map((l) => [l.id, l]));

export function layoutsFor(format: FormatId): LayoutDef[] {
  return LAYOUTS.filter((l) => l.formats.includes(format));
}

/** Markdown catalogue for the system prompt / tool replies. */
export function layoutCatalog(format: FormatId): string {
  return layoutsFor(format)
    .map((l) => {
      const slots = Object.entries(l.slots)
        .map(([k, v]) => `    - \`${k}\`${l.required?.includes(k) ? " (required)" : ""}: ${v}`)
        .join("\n");
      return `- **${l.id}**: ${l.label}. ${l.description}\n${slots}`;
    })
    .join("\n");
}
