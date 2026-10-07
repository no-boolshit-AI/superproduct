/* Browser-side helpers for element renderers: formatting, colours, measuring, scales, SVG. */
import type { NumberFormat } from "../types.js";

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Escape, then allow **bold** and line breaks (\n). */
export const rich = (s: unknown) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");

const MINUS = "−";

export function fmt(v: number | null | undefined, f: NumberFormat = {}, opts: { sign?: boolean; auto?: number } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  const decimals = f.decimals ?? opts.auto ?? 0;
  const abs = Math.abs(v);
  let s = abs.toFixed(decimals);
  const useThousands = f.thousands ?? abs >= 10000;
  if (useThousands) {
    const [int, dec] = s.split(".");
    s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dec ? "." + dec : "");
  }
  const sign = v < 0 && Number(s.replace(/,/g, "")) !== 0 ? MINUS : opts.sign && v > 0 ? "+" : "";
  return `${sign}${f.prefix ?? ""}${s}${f.suffix ?? ""}`;
}

/** Decimals that show the data faithfully when the author did not specify any. */
export function autoDecimals(values: (number | null | undefined)[]): number {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return 0;
  if (v.every((x) => Math.abs(x - Math.round(x)) < 1e-9)) return 0;
  const max = Math.max(...v.map(Math.abs));
  if (max >= 100) return 0;
  if (v.every((x) => Math.abs(x * 10 - Math.round(x * 10)) < 1e-9)) return 1;
  return max >= 10 ? 1 : 2;
}

const TOKENS = new Set(["accent", "accent-2", "dark", "ink", "ink-2", "muted", "pos", "neg", "warn", "hl", "surface", "node", "line"]);

/** Theme token or literal colour → CSS colour value. */
export function col(c: string | undefined, fallback: string): string {
  if (!c) return fallback;
  const t = c.trim().replace(/^--/, "");
  if (/^c[1-8]$/.test(t)) return `var(--${t})`;
  if (t === "muted") return "var(--c-muted)";
  if (TOKENS.has(t)) return `var(--${t})`;
  if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\()/i.test(t)) return t;
  return fallback;
}

export const seriesColor = (i: number) => `var(--c${(i % 8) + 1})`;

/** Relative luminance (WCAG) of a CSS colour, resolved in the element's context (var() included). */
function luminanceOf(el: HTMLElement, cssColor: string): number | null {
  let c = cssColor;
  for (let i = 0; i < 3; i++) {
    const m = c.match(/^var\((--[a-z0-9-]+)(?:,\s*(.+))?\)$/i);
    if (!m) break;
    c = getComputedStyle(el).getPropertyValue(m[1]).trim() || m[2]?.trim() || "";
  }
  if (!c || /var\(|color-mix/i.test(c)) return null;
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  probe.fillStyle = "#000";
  probe.fillStyle = c;
  const v = String(probe.fillStyle);
  let rgb: number[];
  if (v.startsWith("#")) rgb = [1, 3, 5].map((k) => parseInt(v.slice(k, k + 2), 16));
  else rgb = (v.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]).slice(0, 3);
  const lin = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/**
 * A colour for text that names or labels a series. A series colour that is too light to read on the page (a lime, a
 * pale grey) is mixed towards the ink, so the label keeps the series' hue but stays legible.
 */
export function textOn(el: HTMLElement, cssColor: string): string {
  const fg = luminanceOf(el, cssColor);
  const bg = luminanceOf(el, "var(--page-bg)");
  if (fg === null || bg === null) return cssColor;
  const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  return ratio >= 2.2 ? cssColor : `color-mix(in srgb, ${cssColor} 42%, var(--ink))`;
}

let probe: CanvasRenderingContext2D | null = null;
/** Resolve a CSS colour (incl. var()) to rgb and decide whether text on it should be light. */
export function isDark(el: HTMLElement, cssColor: string): boolean {
  let c = cssColor;
  const m = c.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (m) c = getComputedStyle(el).getPropertyValue(m[1]).trim() || "#000";
  const vm = c.match(/^var\((--[a-z0-9-]+)\)$/i);
  if (vm) c = getComputedStyle(el).getPropertyValue(vm[1]).trim() || "#000";
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return true;
  probe.fillStyle = "#000";
  probe.fillStyle = c;
  const v = String(probe.fillStyle);
  let r = 0, g = 0, b = 0;
  if (v.startsWith("#")) {
    r = parseInt(v.slice(1, 3), 16); g = parseInt(v.slice(3, 5), 16); b = parseInt(v.slice(5, 7), 16);
  } else {
    const p = v.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
    [r, g, b] = p;
  }
  const lin = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L < 0.42;
}

/** Measures text/HTML inside the element so fonts and sizes match the final render exactly. */
export class Measurer {
  private box: HTMLDivElement;
  constructor(private host: HTMLElement) {
    this.box = document.createElement("div");
    this.box.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
    host.appendChild(this.box);
  }
  /** Size of a label block. With maxWidth it wraps; returns line count too. */
  size(html: string, opts: { maxWidth?: number; cls?: string; style?: string } = {}) {
    const d = document.createElement("div");
    d.className = opts.cls ?? "";
    d.style.cssText = `position:static;display:inline-block;${opts.maxWidth ? `width:max-content;max-width:${opts.maxWidth}px;white-space:normal;` : "white-space:nowrap;"}${opts.style ?? ""}`;
    d.innerHTML = html;
    this.box.appendChild(d);
    const r = d.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(d).lineHeight) || parseFloat(getComputedStyle(d).fontSize) * 1.2;
    const out = { w: Math.ceil(r.width), h: Math.ceil(r.height), lines: Math.max(1, Math.round(r.height / lh)), lh };
    d.remove();
    return out;
  }
  done() {
    this.box.remove();
  }
}

export function fontSize(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).fontSize) || 13;
}

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): { min: number; max: number; step: number; ticks: number[] } {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  return { min: lo, max: hi, step, ticks };
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export class Svg {
  parts: string[] = [];
  defs: string[] = [];
  add(s: string) { this.parts.push(s); return this; }
  rect(x: number, y: number, w: number, h: number, fill: string, extra = "") {
    if (h < 0) { y += h; h = -h; }
    if (w < 0) { x += w; w = -w; }
    return this.add(`<rect x="${r(x)}" y="${r(y)}" width="${r(Math.max(0, w))}" height="${r(Math.max(0, h))}" style="fill:${fill}" ${extra}/>`);
  }
  line(x1: number, y1: number, x2: number, y2: number, cls: string, extra = "") {
    return this.add(`<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" class="${cls}" ${extra}/>`);
  }
  path(d: string, style: string, cls = "") {
    return this.add(`<path d="${d}" style="${style}" ${cls ? `class="${cls}"` : ""}/>`);
  }
  circle(cx: number, cy: number, rad: number, style: string, cls = "") {
    return this.add(`<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(rad)}" style="${style}" ${cls ? `class="${cls}"` : ""}/>`);
  }
  arrowDef() {
    if (!this.defs.length)
      this.defs.push(`<marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ann-head"/></marker>`);
    return "url(#ah)";
  }
  toString(w: number, h: number) {
    return `<svg width="${r(w)}" height="${r(h)}" viewBox="0 0 ${r(w)} ${r(h)}" xmlns="http://www.w3.org/2000/svg">${this.defs.length ? `<defs>${this.defs.join("")}</defs>` : ""}${this.parts.join("")}</svg>`;
  }
}

export const r = (n: number) => Math.round(n * 10) / 10;

/** Absolutely positioned HTML label. anchor: where (x,y) sits on the label box. */
export function label(
  html: string,
  x: number,
  y: number,
  opts: { cls?: string; anchor?: "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br"; width?: number; style?: string } = {},
): string {
  const a = opts.anchor ?? "tl";
  const tx = a[1] === "l" ? "0" : a[1] === "c" ? "-50%" : "-100%";
  const ty = a[0] === "t" ? "0" : a[0] === "m" ? "-50%" : "-100%";
  const width = opts.width !== undefined ? `width:${r(opts.width)}px;` : "";
  return `<div class="${opts.cls ?? "ch-lbl"}" style="left:${r(x)}px;top:${r(y)}px;transform:translate(${tx},${ty});${width}${opts.style ?? ""}">${html}</div>`;
}

/** Spread label centres apart so boxes of height h don't overlap (keeps order). */
export function spread(items: { y: number; h: number }[], min: number, max: number): number[] {
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.y - b.y);
  const ys = order.map((o) => o.y);
  for (let k = 0; k < 40; k++) {
    let moved = false;
    for (let i = 1; i < order.length; i++) {
      const need = (order[i - 1].h + order[i].h) / 2 + 2;
      const gap = ys[i] - ys[i - 1];
      if (gap < need) {
        const d = (need - gap) / 2;
        ys[i - 1] -= d;
        ys[i] += d;
        moved = true;
      }
    }
    for (let i = 0; i < order.length; i++) {
      ys[i] = Math.max(min + order[i].h / 2, Math.min(max - order[i].h / 2, ys[i]));
    }
    if (!moved) break;
  }
  const out = new Array(items.length);
  order.forEach((o, k) => (out[o.i] = ys[k]));
  return out;
}

export function sum(a: (number | null | undefined)[]): number {
  return a.reduce<number>((s, v) => s + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);
}
