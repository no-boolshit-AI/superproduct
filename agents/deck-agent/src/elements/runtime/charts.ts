/* Chart renderers. Marks are SVG; every word is an absolutely positioned HTML label so the
   browser wraps text with the real font and the PDF text layer can pick it up. */
import type { ChartSpec } from "../types.js";
import { autoDecimals, col, esc, fmt, isDark, label, linear, Measurer, niceTicks, r, rich, seriesColor, spread, sum, Svg, textOn } from "./util.js";

/** Decimals needed to print axis ticks with this step faithfully. */
const stepDecimals = (step: number) => { const s = String(Math.round(step * 1e6) / 1e6); return s.includes(".") ? s.split(".")[1].length : 0; };

export interface Ctx {
  el: HTMLElement;
  W: number;
  H: number;
  fs: number;
  m: Measurer;
  warn: (msg: string) => void;
  /** Set by renderers whose content is shorter than the slot (the mount shrinks or centres it). */
  usedH?: number;
}

const clampLines = (n: number) => `display:-webkit-box;-webkit-line-clamp:${n};-webkit-box-orient:vertical;overflow:hidden;`;

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function prepSeries(spec: ChartSpec, n: number, ctx: Ctx) {
  const series = (spec.series ?? []).map((s) => ({ ...s, values: [...s.values] }));
  for (const s of series) {
    if (s.values.length !== n) {
      ctx.warn(`Series "${s.name}" has ${s.values.length} values for ${n} categories (padded/truncated).`);
      s.values = Array.from({ length: n }, (_, i) => s.values[i] ?? null);
    }
  }
  return series;
}

function legendRow(items: { name: string; color: string }[], ctx: Ctx, maxW: number) {
  const html = `<div class="ch-legend-row" style="max-width:${r(maxW)}px">${items
    .map((it) => `<span class="ch-leg"><i class="ch-sw" style="background:${it.color}"></i>${esc(it.name)}</span>`)
    .join("")}</div>`;
  const inner = items
    .map((it) => `<span class="ch-leg" style="position:static"><i class="ch-sw" style="background:${it.color}"></i>${esc(it.name)}</span>`)
    .join("");
  const size = ctx.m.size(`<div style="display:flex;flex-wrap:wrap;gap:4px 18px;max-width:${r(maxW)}px">${inner}</div>`, { maxWidth: maxW });
  return { html, h: size.h };
}

/** Column-type charts: single, grouped, stacked (incl. 100%). */
export function columnChart(ctx: Ctx, spec: ChartSpec, mode: "single" | "grouped" | "stacked"): string {
  const { W, H, fs, m } = ctx;
  let cats = [...(spec.categories ?? [])];
  need(cats.length, "Column charts need `categories`.");
  let series = prepSeries(spec, cats.length, ctx);
  need(series.length, "Column charts need at least one entry in `series`.");
  if (mode === "single" && series.length > 1) mode = "grouped";
  const percent = mode === "stacked" && !!spec.percent;
  const k = series.length;

  let highlight = new Set(spec.highlight ?? []);
  if (mode === "single" && spec.sort && spec.sort !== "none") {
    const idx = cats.map((_, i) => i).sort((a, b) => ((series[0].values[a] ?? 0) - (series[0].values[b] ?? 0)) * (spec.sort === "asc" ? 1 : -1));
    cats = idx.map((i) => cats[i]);
    series = series.map((s) => ({ ...s, values: idx.map((i) => s.values[i]) }));
    highlight = new Set([...highlight].map((h) => idx.indexOf(h)));
  }
  const n = cats.length;

  // stacked values (normalised for percent)
  const stackVals = series.map((s) => s.values.map((v) => v ?? 0));
  if (percent) {
    for (let i = 0; i < n; i++) {
      const tot = sum(stackVals.map((s) => Math.max(0, s[i])));
      for (const s of stackVals) s[i] = tot ? (Math.max(0, s[i]) / tot) * 100 : 0;
    }
  }
  const all = series.flatMap((s) => s.values);
  const auto = autoDecimals(all);
  const nf = spec.number ?? {};
  const f = (v: number | null, sign = false) => (percent ? fmt(v, { decimals: 0, suffix: "%" }) : fmt(v, nf, { auto, sign }));
  const colors = series.map((s, j) => col(s.color, mode === "single" ? "var(--c1)" : seriesColor(j)));
  const dl = spec.data_labels ?? "auto";

  // ---- legend
  const legendMode = spec.legend ?? "auto";
  const showLegend = k > 1 && legendMode !== "none";
  const legendPos = legendMode === "auto" ? (mode === "stacked" ? "right" : "top") : legendMode;

  let top = 2;
  let legendHtml = "";
  if (showLegend && legendPos === "top") {
    const lg = legendRow(series.map((s, j) => ({ name: s.name, color: colors[j] })), ctx, W);
    legendHtml = lg.html;
    top += lg.h + fs * 0.9;
  }
  const dlH = fs * 1.3;
  const labelsAbove = dl !== "none" && (mode !== "stacked" || (spec.totals ?? k > 1) && !percent);
  if (labelsAbove) top += dlH + 2;
  const pillH = fs * 1.9;
  if (spec.cagr) top += pillH + fs * 0.9;

  let right = 0;
  const legendNames = series.map((s) => esc(s.name));
  if (showLegend && legendPos === "right") {
    const wMax = Math.max(...legendNames.map((t) => m.size(t, { maxWidth: W * 0.24 }).w));
    right = Math.min(W * 0.26, wMax + 18);
  }
  if (spec.reference_line?.label) right = Math.max(right, Math.min(W * 0.22, m.size(esc(spec.reference_line.label), { maxWidth: W * 0.2 }).w + 10));

  // value axis
  const showAxis = spec.value_axis ?? false;
  let vmin = 0, vmax = 0;
  if (mode === "stacked") {
    for (let i = 0; i < n; i++) {
      vmax = Math.max(vmax, sum(stackVals.map((s) => Math.max(0, s[i]))));
      vmin = Math.min(vmin, sum(stackVals.map((s) => Math.min(0, s[i]))));
    }
  } else {
    for (const v of all) if (typeof v === "number") { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); }
  }
  if (percent) vmax = 100;
  if (spec.reference_line) { vmax = Math.max(vmax, spec.reference_line.value); vmin = Math.min(vmin, spec.reference_line.value); }
  if (spec.y_min !== undefined) vmin = spec.y_min;
  if (spec.y_max !== undefined) vmax = spec.y_max;
  let ticks: number[] = [];
  if (showAxis) {
    const t = niceTicks(vmin, vmax, 5);
    vmin = spec.y_min ?? t.min; vmax = spec.y_max ?? t.max; ticks = t.ticks.filter((v) => v >= vmin - 1e-9 && v <= vmax + 1e-9);
  }
  if (vmax === vmin) vmax = vmin + 1;

  let left = 0;
  if (showAxis) {
    left = Math.max(...ticks.map((t) => m.size(esc(f(t))).w)) + 8;
    if (spec.y_title) left += fs * 1.5;
  }

  // ---- category labels
  const plotW = W - left - right;
  const band = plotW / n;
  const labelW = Math.max(20, band * 0.94);
  let maxLines = 1, labelH = 0;
  const catHtml = cats.map((c, i) => (highlight.has(i) ? `<b>${rich(c)}</b>` : rich(c)));
  for (const c of catHtml) {
    const s = m.size(c, { maxWidth: labelW, cls: "ch-lbl--wrap" });
    maxLines = Math.max(maxLines, s.lines);
    labelH = Math.max(labelH, s.h);
  }
  if (maxLines > 3) {
    ctx.warn(`Category labels wrap to ${maxLines} lines (clamped to 3): shorten them or give the chart more width.`);
    labelH = m.size("A<br>A<br>A", { cls: "ch-lbl--wrap" }).h;
  }
  const bottom = labelH + fs * 0.55 + (spec.x_title ? fs * 1.7 : 0);
  const plotTop = top, plotBottom = H - bottom;
  if (plotBottom - plotTop < fs * 4) ctx.warn("Chart area is very small: give the element more height or remove labels.");
  const y = linear(vmin, vmax, plotBottom, plotTop);

  const svg = new Svg();
  const labels: string[] = [];
  const barCap = Math.max(fs * 4, Math.min(fs * 9, (plotBottom - plotTop) * 0.5));
  const groupW = mode === "grouped" ? Math.min(band * 0.82, barCap * Math.min(k, 3) * 0.8) : Math.min(band * 0.62, barCap);
  const xc = (i: number) => left + band * (i + 0.5);

  // gridlines + axis
  if (showAxis) {
    for (const t of ticks) {
      if (spec.gridlines && t !== 0) svg.line(left, y(t), W - right, y(t), "grid");
      labels.push(label(esc(f(t)), left - 6, y(t), { anchor: "mr", cls: "ch-lbl ch-axis-t" }));
    }
    if (spec.y_title) labels.push(label(esc(spec.y_title), 0, (plotTop + plotBottom) / 2, { cls: "ch-lbl ch-axis-t", anchor: "tc", style: "transform:translate(-50%,0) rotate(-90deg) translate(0,-50%);transform-origin:50% 0;" }));
  }

  const tops: number[] = []; // top y of each column incl. label, for annotations
  let skippedLabels = 0;
  for (let i = 0; i < n; i++) {
    const cx = xc(i);
    if (mode === "single") {
      const v = series[0].values[i];
      const color = highlight.size ? (highlight.has(i) ? "var(--hl)" : "var(--c-muted)") : colors[0];
      if (v === null) { tops.push(y(0)); continue; }
      svg.rect(cx - groupW / 2, y(0), groupW, y(v) - y(0), color);
      let t = Math.min(y(v), y(0));
      if (dl !== "none") {
        const txt = esc(f(v));
        const inside = dl === "inside" && Math.abs(y(v) - y(0)) > dlH * 1.6;
        if (inside) labels.push(label(txt, cx, y(v) + (v >= 0 ? 4 : -4), { anchor: v >= 0 ? "tc" : "bc", cls: `ch-dl${isDark(ctx.el, color) ? " ch-dl--in" : ""}` }));
        else if (v >= 0) { labels.push(label(txt, cx, y(v) - 3, { anchor: "bc", cls: "ch-dl" })); t = y(v) - dlH; }
        else labels.push(label(txt, cx, y(v) + 3, { anchor: "tc", cls: "ch-dl" }));
      }
      tops.push(t);
    } else if (mode === "grouped") {
      const bw = groupW / k;
      let t = y(0);
      series.forEach((s, j) => {
        const v = s.values[i];
        if (v === null) return;
        const x0 = cx - groupW / 2 + j * bw;
        const color = spec.highlight_series !== undefined ? (j === spec.highlight_series ? "var(--hl)" : "var(--c-muted)") : colors[j];
        svg.rect(x0 + 1, y(0), bw - 2, y(v) - y(0), color);
        t = Math.min(t, y(v));
        if (dl !== "none") {
          const txt = esc(f(v));
          const w = m.size(txt, { cls: "ch-dl" }).w;
          if (w <= bw + 6 || dl === "all") {
            labels.push(label(txt, x0 + bw / 2, v >= 0 ? y(v) - 2 : y(v) + 2, { anchor: v >= 0 ? "bc" : "tc", cls: "ch-dl", style: "font-size:.92em" }));
            if (v >= 0) t = Math.min(t, y(v) - dlH);
          } else skippedLabels++;
        }
      });
      tops.push(t);
    } else {
      let pos = 0, neg = 0;
      stackVals.forEach((sv, j) => {
        const v = sv[i];
        if (!v) return;
        const base = v >= 0 ? pos : neg;
        const y0 = y(base), y1 = y(base + v);
        const color = colors[j];
        svg.rect(cx - groupW / 2, y0, groupW, y1 - y0, color, `stroke="var(--page-bg)" stroke-width="1"`);
        if (dl !== "none") {
          const txt = esc(percent ? fmt(v, { decimals: 0, suffix: "%" }) : f(series[j].values[i]));
          const s = m.size(txt, { cls: "ch-dl" });
          if (Math.abs(y1 - y0) >= s.h + 2 && s.w <= groupW - 4) {
            labels.push(label(txt, cx, (y0 + y1) / 2, { anchor: "mc", cls: `ch-dl${isDark(ctx.el, color) ? " ch-dl--in" : ""}`, style: "font-weight:500" }));
          } else if (dl === "all") skippedLabels++;
        }
        if (v >= 0) pos += v; else neg += v;
      });
      let t = y(pos);
      if (labelsAbove) {
        const total = sum(series.map((s) => s.values[i] ?? 0));
        labels.push(label(esc(f(total)), cx, y(pos) - 3, { anchor: "bc", cls: "ch-dl ch-total" }));
        t -= dlH;
      }
      tops.push(t);
    }
    labels.push(label(catHtml[i], cx, plotBottom + fs * 0.45, { anchor: "tc", cls: "ch-lbl ch-lbl--wrap", width: labelW, style: maxLines > 3 ? clampLines(3) : "" }));
  }
  if (skippedLabels) ctx.warn(`${skippedLabels} data label(s) skipped because the bars are too narrow; use fewer categories/series or a wider slot.`);

  svg.line(left, y(0), W - right, y(0), "ax ax--base");
  if (spec.x_title) labels.push(label(esc(spec.x_title), left + plotW / 2, H, { anchor: "bc", cls: "ch-lbl ch-axis-t" }));

  // reference line
  if (spec.reference_line) {
    const ry = y(spec.reference_line.value);
    svg.line(left, ry, W - right, ry, "conn", `style="stroke:var(--ink)"`);
    if (spec.reference_line.label) labels.push(label(esc(spec.reference_line.label), W - right + 6, ry, { anchor: "ml", cls: "ch-lbl ch-note", style: `white-space:normal;width:${r(right - 6)}px` }));
  }

  // direct legend at the right of the last column
  if (showLegend && legendPos === "right") {
    const last = n - 1;
    let base = 0;
    const items = series.map((s, j) => {
      const v = mode === "stacked" ? stackVals[j][last] : (s.values[last] ?? 0);
      const mid = mode === "stacked" ? y(base + v / 2) : plotTop + (j + 0.5) * fs * 1.6;
      if (mode === "stacked") base += v;
      const sz = m.size(legendNames[j], { maxWidth: right - 14 });
      return { y: mid, h: sz.h };
    });
    const ys = spread(items, plotTop, plotBottom);
    const lx = xc(last) + groupW / 2 + 10;
    series.forEach((s, j) => {
      labels.push(label(`<span style="color:${colors[j]};filter:saturate(1)">■</span> ${legendNames[j]}`, lx, ys[j], { anchor: "ml", cls: "ch-lbl", style: `white-space:normal;width:${r(W - lx)}px;line-height:1.15` }));
    });
  }

  // CAGR / growth annotation
  if (spec.cagr) {
    const { from, to } = spec.cagr;
    if (from < 0 || to >= n || from >= to) ctx.warn(`cagr indexes ${from}→${to} are out of range (0…${n - 1}).`);
    else {
      const val = (i: number) => (mode === "stacked" ? sum(series.map((s) => s.values[i] ?? 0)) : (series[0].values[i] ?? 0));
      const a = val(from), b = val(to);
      let txt = spec.cagr.label;
      if (!txt) {
        if (a > 0 && b > 0) {
          const rate = (Math.pow(b / a, 1 / (to - from)) - 1) * 100;
          txt = `CAGR ${rate >= 0 ? "+" : "−"}${Math.abs(rate).toFixed(1)}%`;
        } else txt = "";
      }
      const x1 = xc(from), x2 = xc(to);
      let y1 = tops[from] - 8, y2 = tops[to] - 8;
      // raise the line so it clears every column in between
      let lift = 0;
      for (let i = from + 1; i < to; i++) {
        const t = (xc(i) - x1) / (x2 - x1);
        const ly = y1 + (y2 - y1) * t;
        lift = Math.max(lift, ly - (tops[i] - 8));
      }
      const midT = 0.5;
      const pillY = y1 + (y2 - y1) * midT - lift;
      const pillW = m.size(esc(txt), { cls: "ch-pill" }).w + 20;
      const midX = (x1 + x2) / 2;
      // keep pill clear of columns under it
      let clear = 0;
      for (let i = from; i <= to; i++) if (Math.abs(xc(i) - midX) < pillW / 2 + groupW / 2) clear = Math.max(clear, pillY + pillH / 2 + 4 - tops[i]);
      lift += Math.max(0, clear);
      y1 -= lift; y2 -= lift;
      const minY = pillH / 2 + 1;
      const shift = Math.max(0, minY - Math.min(y1, y2, y1 + (y2 - y1) * midT));
      y1 += shift; y2 += shift;
      svg.add(`<path d="M${r(x1)},${r(y1)} L${r(x2)},${r(y2)}" class="ann" marker-end="${svg.arrowDef()}"/>`);
      if (txt) labels.push(`<div class="ch-pill" style="left:${r(midX)}px;top:${r(y1 + (y2 - y1) * midT)}px">${esc(txt)}</div>`);
    }
  }

  return svg.toString(W, H) + legendHtml + labels.join("");
}

/** Horizontal bars: ranked lists, comparisons with long labels. */
export function barChart(ctx: Ctx, spec: ChartSpec, mode: "single" | "grouped" | "stacked"): string {
  const { W, H, fs, m } = ctx;
  let cats = [...(spec.categories ?? [])];
  need(cats.length, "Bar charts need `categories`.");
  let series = prepSeries(spec, cats.length, ctx);
  need(series.length, "Bar charts need at least one entry in `series`.");
  if (mode === "single" && series.length > 1) mode = "grouped";
  const percent = mode === "stacked" && !!spec.percent;
  const k = series.length;
  let highlight = new Set(spec.highlight ?? []);
  if (mode === "single" && spec.sort && spec.sort !== "none") {
    const idx = cats.map((_, i) => i).sort((a, b) => ((series[0].values[a] ?? 0) - (series[0].values[b] ?? 0)) * (spec.sort === "asc" ? 1 : -1));
    cats = idx.map((i) => cats[i]);
    series = series.map((s) => ({ ...s, values: idx.map((i) => s.values[i]) }));
    highlight = new Set([...highlight].map((h) => idx.indexOf(h)));
  }
  const n = cats.length;
  const stackVals = series.map((s) => s.values.map((v) => v ?? 0));
  if (percent)
    for (let i = 0; i < n; i++) {
      const tot = sum(stackVals.map((s) => Math.max(0, s[i])));
      for (const s of stackVals) s[i] = tot ? (Math.max(0, s[i]) / tot) * 100 : 0;
    }
  const all = series.flatMap((s) => s.values);
  const auto = autoDecimals(all);
  const nf = spec.number ?? {};
  const f = (v: number | null) => (percent ? fmt(v, { decimals: 0, suffix: "%" }) : fmt(v, nf, { auto }));
  const colors = series.map((s, j) => col(s.color, mode === "single" ? "var(--c1)" : seriesColor(j)));
  const dl = spec.data_labels ?? "auto";

  let top = 0;
  let legendHtml = "";
  if (k > 1 && spec.legend !== "none") {
    const lg = legendRow(series.map((s, j) => ({ name: s.name, color: colors[j] })), ctx, W);
    legendHtml = lg.html;
    top += lg.h + fs * 0.9;
  }

  const catHtml = cats.map((c, i) => (highlight.has(i) ? `<b>${rich(c)}</b>` : rich(c)));
  const maxLabelW = W * 0.34;
  const labelW = Math.min(maxLabelW, Math.max(...catHtml.map((c) => m.size(c, { maxWidth: maxLabelW, cls: "ch-lbl--left" }).w)) + 2);
  const gap = fs * 0.9;

  let vmin = 0, vmax = 0;
  if (mode === "stacked")
    for (let i = 0; i < n; i++) {
      vmax = Math.max(vmax, sum(stackVals.map((s) => Math.max(0, s[i]))));
      vmin = Math.min(vmin, sum(stackVals.map((s) => Math.min(0, s[i]))));
    }
  else for (const v of all) if (typeof v === "number") { vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); }
  if (percent) vmax = 100;
  if (spec.reference_line) vmax = Math.max(vmax, spec.reference_line.value);
  if (spec.y_min !== undefined) vmin = spec.y_min;
  if (spec.y_max !== undefined) vmax = spec.y_max;
  if (vmax === vmin) vmax = vmin + 1;

  // reserve room for value labels at bar ends
  const showTotals = mode === "stacked" && !percent && (spec.totals ?? k > 1);
  let valW = 0;
  if (dl !== "none" && (mode !== "stacked" || showTotals)) {
    const texts = mode === "stacked" ? cats.map((_, i) => f(sum(series.map((s) => s.values[i] ?? 0)))) : all.map((v) => f(v));
    valW = Math.max(0, ...texts.map((t) => m.size(esc(t), { cls: "ch-dl" }).w)) + 6;
  }
  let negW = 0;
  if (vmin < 0 && dl !== "none") negW = valW;
  const plotL = labelW + gap + negW;
  const plotR = W - valW - 2;
  const x = linear(vmin, vmax, plotL, plotR);
  const bottom = spec.x_title ? fs * 1.8 : 2;
  const band = Math.min((H - top - bottom) / n, fs * (mode === "grouped" ? 2.2 * k + 1.6 : 5.2));
  ctx.usedH = top + band * n + bottom + (spec.reference_line?.label ? fs * 1.4 : 0);
  const thick = mode === "grouped" ? Math.min(band * 0.8, fs * 1.6 * k) : Math.min(band * 0.64, fs * 2.4);
  if (band < fs * 1.25) ctx.warn(`Rows are only ${Math.round(band)}px tall: too many categories for this height.`);

  const svg = new Svg();
  const labels: string[] = [];
  for (let i = 0; i < n; i++) {
    const cy = top + band * (i + 0.5);
    const lab = m.size(catHtml[i], { maxWidth: labelW, cls: "ch-lbl--left" });
    if (lab.h > band + 2) ctx.warn(`Label "${cats[i].slice(0, 30)}" is taller than its row; shorten it.`);
    labels.push(label(catHtml[i], labelW, cy, { anchor: "mr", cls: "ch-lbl ch-lbl--left", width: labelW }));
    if (mode === "single") {
      const v = series[0].values[i];
      if (v === null) continue;
      const color = highlight.size ? (highlight.has(i) ? "var(--hl)" : "var(--c-muted)") : colors[0];
      svg.rect(x(0), cy - thick / 2, x(v) - x(0), thick, color);
      if (dl !== "none") {
        const inside = dl === "inside" && Math.abs(x(v) - x(0)) > valW + 8;
        if (inside) labels.push(label(esc(f(v)), x(v) - 6, cy, { anchor: "mr", cls: `ch-dl${isDark(ctx.el, color) ? " ch-dl--in" : ""}` }));
        else labels.push(label(esc(f(v)), v >= 0 ? x(v) + 5 : x(v) - 5, cy, { anchor: v >= 0 ? "ml" : "mr", cls: "ch-dl" }));
      }
    } else if (mode === "grouped") {
      const bh = thick / k;
      series.forEach((s, j) => {
        const v = s.values[i];
        if (v === null) return;
        const y0 = cy - thick / 2 + j * bh;
        const color = spec.highlight_series !== undefined ? (j === spec.highlight_series ? "var(--hl)" : "var(--c-muted)") : colors[j];
        svg.rect(x(0), y0 + 0.5, x(v) - x(0), bh - 1, color);
        if (dl !== "none" && bh >= fs * 0.95) labels.push(label(esc(f(v)), v >= 0 ? x(v) + 4 : x(v) - 4, y0 + bh / 2, { anchor: v >= 0 ? "ml" : "mr", cls: "ch-dl", style: "font-size:.9em" }));
      });
    } else {
      let pos = 0;
      stackVals.forEach((sv, j) => {
        const v = sv[i];
        if (!v) return;
        const x0 = x(pos), x1 = x(pos + v);
        svg.rect(x0, cy - thick / 2, x1 - x0, thick, colors[j], `stroke="var(--page-bg)" stroke-width="1"`);
        if (dl !== "none") {
          const txt = esc(percent ? fmt(v, { decimals: 0, suffix: "%" }) : f(series[j].values[i]));
          const s = m.size(txt, { cls: "ch-dl" });
          if (x1 - x0 >= s.w + 6 && thick >= s.h) labels.push(label(txt, (x0 + x1) / 2, cy, { anchor: "mc", cls: `ch-dl${isDark(ctx.el, colors[j]) ? " ch-dl--in" : ""}`, style: "font-weight:500" }));
        }
        pos += v;
      });
      if (showTotals && dl !== "none") labels.push(label(esc(f(sum(series.map((s) => s.values[i] ?? 0)))), x(pos) + 5, cy, { anchor: "ml", cls: "ch-dl ch-total" }));
    }
  }
  const plotEnd = top + band * n;
  svg.line(x(0), top, x(0), plotEnd, "ax ax--base");
  if (spec.reference_line) {
    const rx = x(spec.reference_line.value);
    svg.line(rx, top - 2, rx, plotEnd, "conn", `style="stroke:var(--ink)"`);
    if (spec.reference_line.label) labels.push(label(esc(spec.reference_line.label), rx, plotEnd + 2, { anchor: "tc", cls: "ch-lbl ch-note" }));
  }
  if (spec.x_title) labels.push(label(esc(spec.x_title), (plotL + plotR) / 2, plotEnd + fs * 1.8, { anchor: "bc", cls: "ch-lbl ch-axis-t" }));
  return svg.toString(W, Math.min(H, Math.ceil(ctx.usedH ?? H))) + legendHtml + labels.join("");
}

/** Line and (stacked) area charts with direct end labels instead of a legend. */
export function lineChart(ctx: Ctx, spec: ChartSpec, area: boolean): string {
  const { W, H, fs, m } = ctx;
  const cats = spec.categories ?? [];
  need(cats.length >= 2, "Line charts need at least 2 `categories`.");
  const series = prepSeries(spec, cats.length, ctx);
  need(series.length, "Line charts need at least one entry in `series`.");
  const n = cats.length, k = series.length;
  const nf = spec.number ?? {};
  const auto = autoDecimals(series.flatMap((s) => s.values));
  const f = (v: number | null) => fmt(v, nf, { auto });
  const hs = spec.highlight_series;
  const colors = series.map((s, j) => (hs !== undefined && j !== hs ? "var(--c-muted)" : col(s.color, hs !== undefined ? "var(--hl)" : seriesColor(j))));
  const dl = spec.data_labels ?? (k <= 3 ? "ends" : "none");

  // stacked values for area
  const stacked = series.map((s) => s.values.map((v) => v ?? 0));
  if (area) for (let j = 1; j < k; j++) for (let i = 0; i < n; i++) stacked[j][i] += stacked[j - 1][i];

  let vmin = Infinity, vmax = -Infinity;
  const src = area ? stacked : series.map((s) => s.values);
  for (const s of src) for (const v of s) if (typeof v === "number") { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
  if (area || (vmin >= 0 && vmin / (vmax || 1) < 0.35)) vmin = Math.min(0, vmin);
  if (spec.reference_line) { vmin = Math.min(vmin, spec.reference_line.value); vmax = Math.max(vmax, spec.reference_line.value); }
  const t = niceTicks(spec.y_min ?? vmin, spec.y_max ?? vmax, 5);
  vmin = spec.y_min ?? t.min; vmax = spec.y_max ?? t.max;
  const ticks = t.ticks.filter((v) => v >= vmin - 1e-9 && v <= vmax + 1e-9);
  const tickFmt = (v: number) => fmt(v, { ...nf, decimals: Math.max(nf.decimals ?? 0, stepDecimals(t.step)) });
  const showAxis = spec.value_axis ?? true;
  const grid = spec.gridlines ?? true;

  let top = fs * 0.7;
  let legendHtml = "";
  const legendTop = spec.legend === "top" || (spec.legend !== "none" && spec.legend !== "right" && k > 4);
  if (legendTop && k > 1) {
    const lg = legendRow(series.map((s, j) => ({ name: s.name, color: colors[j] })), ctx, W);
    legendHtml = lg.html;
    top += lg.h + fs * 0.6;
  }
  if (dl === "all") top += fs * 1.3;

  // end labels
  const endHtml = series.map((s, j) => {
    const lastIdx = [...s.values].map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop() ?? n - 1;
    const v = s.values[lastIdx];
    const valTxt = dl === "none" ? "" : ` <b style="color:${textOn(ctx.el, colors[j])}">${esc(f(v))}</b>`;
    return { html: `<span style="color:${hs !== undefined && j !== hs ? "var(--muted)" : textOn(ctx.el, colors[j])};font-weight:600">${esc(s.name)}</span>${valTxt}`, lastIdx };
  });
  let right = fs * 0.5;
  if (!legendTop && spec.legend !== "none") right = Math.min(W * 0.3, Math.max(...endHtml.map((e) => m.size(e.html, { maxWidth: W * 0.28 }).w)) + 12);
  else if (dl !== "none") right = Math.max(...series.map((s) => m.size(esc(f(s.values[n - 1] ?? 0))).w)) + 10;

  let left = 0;
  if (showAxis) left = Math.max(...ticks.map((v) => m.size(esc(tickFmt(v))).w)) + 10 + (spec.y_title ? fs * 1.5 : 0);
  const catLabelH = m.size("Ag", {}).h;
  const bottom = catLabelH + fs * 0.6 + (spec.x_title ? fs * 1.7 : 0);
  const plotTop = top, plotBottom = H - bottom;
  const pad = Math.min(fs * 1.2, (W - left - right) / (n * 2));
  const x = (i: number) => left + pad + (i * (W - left - right - 2 * pad)) / (n - 1);
  const y = linear(vmin, vmax, plotBottom, plotTop);

  const svg = new Svg();
  const labels: string[] = [];
  for (const tv of ticks) {
    if (grid && tv !== vmin) svg.line(left, y(tv), W - right, y(tv), "grid");
    if (showAxis) labels.push(label(esc(tickFmt(tv)), left - 8, y(tv), { anchor: "mr", cls: "ch-lbl ch-axis-t" }));
  }
  svg.line(left, y(Math.max(vmin, Math.min(0, vmax))), W - right, y(Math.max(vmin, Math.min(0, vmax))), "ax ax--base");
  if (spec.y_title) labels.push(label(esc(spec.y_title), 0, (plotTop + plotBottom) / 2, { cls: "ch-lbl ch-axis-t", anchor: "tc", style: "transform:translate(-50%,0) rotate(-90deg) translate(0,-50%);transform-origin:50% 0;" }));

  // category labels, thinned if crowded
  const maxCatW = Math.max(...cats.map((c) => m.size(esc(c)).w));
  const spacing = (W - left - right - 2 * pad) / (n - 1);
  const every = Math.max(1, Math.ceil((maxCatW + fs) / spacing));
  let lastShown = -Infinity;
  cats.forEach((c, i) => {
    const show = i % every === 0 || (i === n - 1 && (i - lastShown) * spacing >= maxCatW + fs);
    if (show) { labels.push(label(esc(c), x(i), plotBottom + fs * 0.45, { anchor: "tc", cls: "ch-lbl" })); lastShown = i; }
  });

  // areas
  if (area) {
    for (let j = k - 1; j >= 0; j--) {
      const upper = stacked[j].map((v, i) => `${r(x(i))},${r(y(v))}`);
      const lower = (j ? stacked[j - 1] : stacked[j].map(() => 0)).map((v, i) => `${r(x(i))},${r(y(v))}`).reverse();
      svg.path(`M${upper.join(" L")} L${lower.join(" L")} Z`, `fill:${colors[j]};opacity:.9;stroke:var(--page-bg);stroke-width:1`);
    }
  }
  // lines: draw muted first so the highlighted one sits on top
  const order = series.map((_, j) => j).sort((a, b) => (a === hs ? 1 : 0) - (b === hs ? 1 : 0));
  for (const j of order) {
    if (area) continue;
    const s = series[j];
    let d = "";
    s.values.forEach((v, i) => {
      if (v === null) return;
      d += `${d && s.values[i - 1] !== null ? " L" : " M"}${r(x(i))},${r(y(v))}`;
    });
    const w = hs !== undefined ? (j === hs ? 3.2 : 1.8) : 2.6;
    svg.path(d.trim(), `fill:none;stroke:${colors[j]};stroke-width:${w};stroke-linejoin:round;stroke-linecap:round`);
    if (n <= 16)
      s.values.forEach((v, i) => {
        if (v !== null) svg.circle(x(i), y(v), w * 1.15, `fill:var(--page-bg);stroke:${colors[j]};stroke-width:${w * 0.8}`);
      });
    if (dl === "ends" && !showAxis && s.values[0] !== null)
      labels.push(label(esc(f(s.values[0])), x(0) - 4, y(s.values[0]!) - 5, { anchor: "br", cls: "ch-dl", style: `color:${textOn(ctx.el, colors[j])};font-size:.95em` }));
    if (dl === "all")
      s.values.forEach((v, i) => {
        if (v !== null && i !== n - 1) labels.push(label(esc(f(v)), x(i), y(v) - 7, { anchor: "bc", cls: "ch-dl", style: "font-size:.92em" }));
      });
  }
  // end labels (direct legend)
  const endY = series.map((s, j) => (area ? y(stacked[j][n - 1] - ((stacked[j][n - 1] - (j ? stacked[j - 1][n - 1] : 0)) / 2)) : y(s.values[endHtml[j].lastIdx] ?? 0)));
  if (!legendTop && spec.legend !== "none") {
    const sizes = endHtml.map((e) => m.size(e.html, { maxWidth: right - 12 }));
    const ys = spread(endY.map((yy, j) => ({ y: yy, h: sizes[j].h })), 0, H);
    endHtml.forEach((e, j) => labels.push(label(e.html, W - right + 10, ys[j], { anchor: "ml", cls: "ch-lbl", style: `white-space:normal;width:${r(right - 10)}px;line-height:1.15` })));
  } else if (dl !== "none") {
    series.forEach((s, j) => labels.push(label(esc(f(s.values[n - 1])), W - right + 6, endY[j], { anchor: "ml", cls: "ch-dl", style: `color:${textOn(ctx.el, colors[j])}` })));
  }
  if (spec.reference_line) {
    const ry = y(spec.reference_line.value);
    svg.line(left, ry, W - right, ry, "conn", `style="stroke:var(--ink)"`);
    if (spec.reference_line.label) labels.push(label(esc(spec.reference_line.label), left + 4, ry - 3, { anchor: "bl", cls: "ch-lbl ch-note" }));
  }
  if (spec.x_title) labels.push(label(esc(spec.x_title), (left + W - right) / 2, H, { anchor: "bc", cls: "ch-lbl ch-axis-t" }));
  return svg.toString(W, H) + legendHtml + labels.join("");
}

/** Waterfall / bridge: start → deltas (→ subtotals) → end. */
export function waterfallChart(ctx: Ctx, spec: ChartSpec): string {
  const { W, H, fs, m } = ctx;
  const steps = spec.steps ?? [];
  need(steps.length >= 2, "Waterfall charts need `steps` (at least a start and one delta).");
  const n = steps.length;
  const kinds = steps.map((s, i) => s.kind ?? (i === 0 ? "start" : i === n - 1 && n > 2 ? "end" : "delta"));
  const nf = spec.number ?? {};
  const auto = autoDecimals(steps.map((s) => s.value));
  const f = (v: number, sign = false) => fmt(v, nf, { auto, sign });
  const pal = spec.palette ?? {};
  const cTotal = col(pal.total, "var(--c1)"), cUp = col(pal.increase, "var(--c2)"), cDown = col(pal.decrease, "var(--neg)");

  let run = 0;
  const bars = steps.map((s, i) => {
    const kd = kinds[i];
    if (kd === "start") { run = s.value; return { y0: 0, y1: s.value, kind: kd, v: s.value }; }
    if (kd === "subtotal" || kd === "end") {
      if (s.value !== undefined && s.value !== null && Math.abs(s.value - run) > Math.max(1e-6, Math.abs(run) * 0.005))
        ctx.warn(`Step "${s.label}" says ${s.value} but the running total is ${Math.round(run * 1000) / 1000}; showing the computed total. Check the deltas.`);
      return { y0: 0, y1: run, kind: kd, v: run };
    }
    const y0 = run; run += s.value;
    return { y0, y1: run, kind: kd, v: s.value };
  });
  let vmin = Math.min(0, ...bars.map((b) => Math.min(b.y0, b.y1)));
  let vmax = Math.max(0, ...bars.map((b) => Math.max(b.y0, b.y1)));
  if (spec.y_min !== undefined) vmin = spec.y_min;
  if (spec.y_max !== undefined) vmax = spec.y_max;
  const dlH = fs * 1.3;
  const top = dlH + 4;
  const band = W / n;
  const labelW = band * 0.94;
  let labelH = 0, maxLines = 1;
  for (const s of steps) {
    const z = m.size(rich(s.label), { maxWidth: labelW, cls: "ch-lbl--wrap" });
    labelH = Math.max(labelH, z.h); maxLines = Math.max(maxLines, z.lines);
  }
  if (maxLines > 3) { ctx.warn("Waterfall step labels wrap to more than 3 lines; shorten them."); labelH = m.size("A<br>A<br>A").h; }
  const bottom = labelH + fs * 0.55 + (vmin < 0 ? dlH : 0);
  const y = linear(vmin, vmax, H - bottom, top);
  const bw = Math.min(band * 0.62, fs * 8);
  const svg = new Svg();
  const labels: string[] = [];
  bars.forEach((b, i) => {
    const cx = band * (i + 0.5);
    const color = b.kind === "delta" ? (b.v >= 0 ? cUp : cDown) : cTotal;
    svg.rect(cx - bw / 2, y(b.y0), bw, y(b.y1) - y(b.y0), color);
    if (i < n - 1) {
      const level = b.y1;
      const nx = band * (i + 1.5) - bw / 2;
      svg.line(cx + bw / 2, y(level), nx, y(level), "conn");
    }
    const isUp = b.kind !== "delta" || b.v >= 0;
    const txt = esc(b.kind === "delta" ? f(b.v, true) : f(b.v));
    const yTop = Math.min(y(b.y0), y(b.y1)), yBot = Math.max(y(b.y0), y(b.y1));
    labels.push(label(txt, cx, isUp ? yTop - 3 : yBot + 3, { anchor: isUp ? "bc" : "tc", cls: `ch-dl${b.kind !== "delta" ? " ch-total" : ""}` }));
    const lab = b.kind !== "delta" ? `<b>${rich(steps[i].label)}</b>` : rich(steps[i].label);
    labels.push(label(lab, cx, H - bottom + (vmin < 0 ? dlH : 0) + fs * 0.45, { anchor: "tc", cls: "ch-lbl ch-lbl--wrap", width: labelW, style: maxLines > 3 ? clampLines(3) : "" }));
  });
  svg.line(0, y(0), W, y(0), "ax ax--base");
  return svg.toString(W, H) + labels.join("");
}

/** Donut with a side legend (or legend below when the slot is narrow). */
export function donutChart(ctx: Ctx, spec: ChartSpec): string {
  const { W, H, fs, m } = ctx;
  const cats = spec.categories ?? [];
  const vals = (spec.series?.[0]?.values ?? []).map((v) => Math.max(0, v ?? 0));
  need(cats.length && vals.length, "Donut charts need `categories` and one series with values.");
  if (cats.length > 7) ctx.warn(`${cats.length} donut segments is hard to read; group the small ones into "Other" (max 6).`);
  const total = sum(vals) || 1;
  const nf = spec.number ?? {};
  const auto = autoDecimals(vals);
  const hl = new Set(spec.highlight ?? []);
  const colors = cats.map((_, i) => (hl.size ? (hl.has(i) ? "var(--hl)" : `color-mix(in srgb, var(--c-muted) ${100 - (i % 3) * 22}%, var(--page-bg))`) : col(undefined, seriesColor(i))));
  const side = W / H >= 1.25;
  const rows = cats.map(
    (c, i) =>
      `<span class="ch-sw" style="background:${colors[i]};width:12px;height:12px;margin-top:.15em"></span><span style="flex:1;min-width:0">${rich(c)}</span><b style="font-variant-numeric:tabular-nums">${esc(fmt(vals[i], nf, { auto }))}</b><span class="muted" style="width:3.2em;text-align:right;font-variant-numeric:tabular-nums">${Math.round((vals[i] / total) * 100)}%</span>`,
  );
  const D = side ? Math.min(H - 4, W * 0.46) : Math.min(W - 4, H * 0.58);
  const R = D / 2, ri = R * 0.6;
  const cx = side ? R + 2 : W / 2, cy = side ? H / 2 : R + 2;
  const svg = new Svg();
  let a = -Math.PI / 2;
  vals.forEach((v, i) => {
    const a2 = a + (v / total) * Math.PI * 2;
    const large = a2 - a > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${r(cx + rad * Math.cos(ang))},${r(cy + rad * Math.sin(ang))}`;
    if (v > 0)
      svg.path(
        v >= total ? `M${p(R, -Math.PI / 2)} A${R},${R} 0 1 1 ${p(R, Math.PI * 1.5 - 0.0001)} L${p(ri, Math.PI * 1.5 - 0.0001)} A${ri},${ri} 0 1 0 ${p(ri, -Math.PI / 2)} Z`
          : `M${p(R, a)} A${R},${R} 0 ${large} 1 ${p(R, a2)} L${p(ri, a2)} A${ri},${ri} 0 ${large} 0 ${p(ri, a)} Z`,
        `fill:${colors[i]};stroke:var(--page-bg);stroke-width:2`,
      );
    a = a2;
  });
  const labels: string[] = [];
  const center = spec.center_label ?? fmt(total, nf, { auto });
  labels.push(label(`<div style="font-family:var(--font-num);font-weight:var(--num-weight);font-size:${r(Math.max(fs * 1.4, Math.min(R * 0.42, fs * 3)))}px;line-height:1;color:var(--ink)">${esc(center)}</div>${spec.center_sublabel ? `<div class="muted" style="margin-top:4px;white-space:normal;max-width:${r(ri * 1.6)}px">${esc(spec.center_sublabel)}</div>` : ""}`, cx, cy, { anchor: "mc", cls: "ch-lbl", style: "text-align:center" }));
  const lx = side ? D + fs * 2.2 : 0, ly = side ? 0 : D + fs * 1.2;
  const lw = side ? W - lx : W;
  const rowHtml = rows.map((h) => `<div style="display:flex;gap:10px;align-items:flex-start;padding:${r(fs * 0.45)}px 0;border-top:1px solid var(--line)">${h}</div>`).join("");
  const sz = m.size(`<div style="width:${r(lw)}px">${rowHtml}</div>`);
  if (sz.h > (side ? H : H - ly) + 2) ctx.warn("Donut legend is taller than the space available; use fewer segments or a taller slot.");
  const legendTop = side ? Math.max(0, (H - sz.h) / 2) : ly;
  labels.push(`<div class="ch-lbl" style="left:${r(lx)}px;top:${r(legendTop)}px;width:${r(lw)}px;white-space:normal">${rowHtml}</div>`);
  return svg.toString(W, H) + labels.join("");
}

/** Scatter / bubble chart with optional quadrant lines. */
export function scatterChart(ctx: Ctx, spec: ChartSpec): string {
  const { W, H, fs, m } = ctx;
  const pts = spec.points ?? [];
  need(pts.length, "Scatter charts need `points` [{label, x, y, size?, group?}].");
  const groups = [...new Set(pts.map((p) => p.group).filter(Boolean))] as string[];
  const gColor = (g?: string) => (g ? seriesColor(groups.indexOf(g)) : "var(--c1)");
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const padded = (lo: number, hi: number, f = 0.08) => { const d = (hi - lo || Math.abs(hi) || 1) * f; return [lo - d, hi + d] as const; };
  const [x0, x1] = padded(Math.min(...xs, spec.quadrants?.x ?? Infinity), Math.max(...xs, spec.quadrants?.x ?? -Infinity), pts.some((p) => p.size) ? 0.1 : 0.04);
  const [y0, y1] = padded(Math.min(...ys, spec.quadrants?.y ?? Infinity), Math.max(...ys, spec.quadrants?.y ?? -Infinity), pts.some((p) => p.size) ? 0.12 : 0.04);
  const tx = niceTicks(x0, x1, 5);
  const ty = niceTicks(spec.y_min ?? y0, spec.y_max ?? y1, 5);
  const nfy = spec.number ?? {}, nfx = spec.x_number ?? {};
  const fy = (v: number) => fmt(v, { ...nfy, decimals: Math.max(nfy.decimals ?? 0, stepDecimals(ty.step)) });
  const fx = (v: number) => fmt(v, { ...nfx, decimals: Math.max(nfx.decimals ?? 0, stepDecimals(tx.step)) });
  let top = fs * 0.6;
  let legendHtml = "";
  if (groups.length > 1 && spec.legend !== "none") {
    const lg = legendRow(groups.map((g) => ({ name: g, color: gColor(g) })), ctx, W);
    legendHtml = lg.html;
    top += lg.h + fs * 0.6;
  }
  const left = Math.max(...ty.ticks.map((v) => m.size(esc(fy(v))).w)) + 10 + (spec.y_title ? fs * 1.6 : 0);
  const bottom = fs * 1.6 + (spec.x_title ? fs * 1.7 : 0);
  const right = fs;
  const x = linear(tx.min, tx.max, left, W - right);
  const y = linear(ty.min, ty.max, H - bottom, top);
  const svg = new Svg();
  const labels: string[] = [];
  for (const v of ty.ticks) {
    svg.line(left, y(v), W - right, y(v), "grid");
    labels.push(label(esc(fy(v)), left - 8, y(v), { anchor: "mr", cls: "ch-lbl ch-axis-t" }));
  }
  for (const v of tx.ticks) labels.push(label(esc(fx(v)), x(v), H - bottom + fs * 0.4, { anchor: "tc", cls: "ch-lbl ch-axis-t" }));
  svg.line(left, H - bottom, W - right, H - bottom, "ax ax--base");
  svg.line(left, top, left, H - bottom, "ax");
  if (spec.x_title) labels.push(label(esc(spec.x_title), (left + W - right) / 2, H, { anchor: "bc", cls: "ch-lbl ch-axis-t", style: "font-weight:600;color:var(--ink-2)" }));
  if (spec.y_title) labels.push(label(esc(spec.y_title), 0, (top + H - bottom) / 2, { cls: "ch-lbl ch-axis-t", anchor: "tc", style: "font-weight:600;color:var(--ink-2);transform:translate(-50%,0) rotate(-90deg) translate(0,-50%);transform-origin:50% 0;" }));
  if (spec.quadrants) {
    const q = spec.quadrants;
    const qx = q.x ?? (tx.min + tx.max) / 2, qy = q.y ?? (ty.min + ty.max) / 2;
    svg.line(x(qx), top, x(qx), H - bottom, "conn", `style="stroke:var(--ink-2)"`);
    svg.line(left, y(qy), W - right, y(qy), "conn", `style="stroke:var(--ink-2)"`);
    const [tl, tr, bl, br] = q.labels ?? [];
    const st = "font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:.86em;color:var(--muted)";
    if (tl) labels.push(label(esc(tl), left + 8, top + 4, { cls: "ch-lbl", style: st }));
    if (tr) labels.push(label(esc(tr), W - right - 6, top + 4, { cls: "ch-lbl", anchor: "tr", style: st }));
    if (bl) labels.push(label(esc(bl), left + 8, H - bottom - 6, { cls: "ch-lbl", anchor: "bl", style: st }));
    if (br) labels.push(label(esc(br), W - right - 6, H - bottom - 6, { cls: "ch-lbl", anchor: "br", style: st }));
  }
  const maxSize = Math.max(...pts.map((p) => p.size ?? 0));
  const rMax = Math.min(W, H) * 0.075;
  const rad = (p: (typeof pts)[number]) => (maxSize > 0 && p.size ? Math.max(4, Math.sqrt(p.size / maxSize) * rMax) : fs * 0.42);
  const anyHl = pts.some((p) => p.highlight);
  const placed: { l: number; t: number; r: number; b: number }[] = [];
  const sorted = [...pts].sort((a, b) => rad(b) - rad(a));
  for (const p of sorted) {
    const color = anyHl ? (p.highlight ? "var(--hl)" : "var(--c-muted)") : gColor(p.group);
    svg.circle(x(p.x), y(p.y), rad(p), `fill:${color};fill-opacity:${maxSize > 0 ? 0.82 : 1};stroke:var(--page-bg);stroke-width:1.2`);
  }
  for (const p of pts) {
    const px = x(p.x), py = y(p.y), pr = rad(p);
    const txt = p.highlight ? `<b>${esc(p.label)}</b>` : esc(p.label);
    const s = m.size(txt);
    const cands = [
      { lx: px + pr + 4, ly: py - s.h / 2, a: "tl" as const },
      { lx: px - pr - 4 - s.w, ly: py - s.h / 2, a: "tl" as const },
      { lx: px - s.w / 2, ly: py - pr - 3 - s.h, a: "tl" as const },
      { lx: px - s.w / 2, ly: py + pr + 3, a: "tl" as const },
    ];
    let best = cands[0], found = false;
    for (const c of cands) {
      const box = { l: c.lx, t: c.ly, r: c.lx + s.w, b: c.ly + s.h };
      const inside = box.l >= 0 && box.r <= W && box.t >= 0 && box.b <= H;
      const hit = placed.some((q) => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t);
      if (inside && !hit) { best = c; found = true; break; }
    }
    if (!found) ctx.warn(`Label "${p.label}" could not be placed without overlapping; consider fewer labelled points.`);
    placed.push({ l: best.lx, t: best.ly, r: best.lx + s.w, b: best.ly + s.h });
    labels.push(label(txt, best.lx, best.ly, { cls: "ch-lbl", style: "color:var(--ink)" }));
  }
  return svg.toString(W, H) + legendHtml + labels.join("");
}

/** Marimekko: column width = size of the segment, column height = 100% split by series. */
export function mekkoChart(ctx: Ctx, spec: ChartSpec): string {
  const { W, H, fs, m } = ctx;
  const cats = spec.categories ?? [];
  const widths = spec.widths ?? [];
  const series = prepSeries(spec, cats.length, ctx);
  need(cats.length && widths.length === cats.length && series.length, "Mekko charts need `categories`, matching `widths` (column sizes) and `series` (segment values per column).");
  const totalW = sum(widths) || 1;
  const colors = series.map((s, j) => col(s.color, seriesColor(j)));
  const legendNames = series.map((s) => esc(s.name));
  const right = Math.min(W * 0.22, Math.max(...legendNames.map((t) => m.size(t, { maxWidth: W * 0.2 }).w)) + 18);
  const showAxis = spec.value_axis ?? true;
  const left = showAxis ? m.size("100%").w + 10 : 0;
  const plotW = W - left - right;
  const gap = 2;
  const nfw = spec.width_number ?? spec.number ?? {};
  // column labels below
  const xs: { x0: number; w: number }[] = [];
  let acc = 0;
  widths.forEach((w) => {
    const x0 = left + (acc / totalW) * plotW;
    const ww = (w / totalW) * plotW;
    xs.push({ x0: x0 + gap / 2, w: Math.max(1, ww - gap) });
    acc += w;
  });
  const catHtml = cats.map((c, i) => `${rich(c)}<br><span class="muted">${esc(fmt(widths[i], nfw, { auto: autoDecimals(widths) }))}</span>`);
  let labelH = 0;
  catHtml.forEach((c, i) => {
    const s = m.size(c, { maxWidth: Math.max(30, xs[i].w), cls: "ch-lbl--wrap" });
    labelH = Math.max(labelH, s.h);
    if (s.w > xs[i].w + 8) ctx.warn(`Column label "${cats[i]}" is wider than its column; shorten it.`);
  });
  const top = fs * 0.5;
  const bottom = labelH + fs * 0.6;
  const y = linear(0, 100, H - bottom, top);
  const svg = new Svg();
  const labels: string[] = [];
  if (showAxis) for (const t of [0, 25, 50, 75, 100]) labels.push(label(`${t}%`, left - 8, y(t), { anchor: "mr", cls: "ch-lbl ch-axis-t" }));
  const lastMid: number[] = [];
  cats.forEach((_, i) => {
    const tot = sum(series.map((s) => Math.max(0, s.values[i] ?? 0))) || 1;
    let base = 0;
    series.forEach((s, j) => {
      const v = (Math.max(0, s.values[i] ?? 0) / tot) * 100;
      if (v <= 0) { if (i === cats.length - 1) lastMid[j] = y(base); return; }
      const y0 = y(base), y1 = y(base + v);
      svg.rect(xs[i].x0, y1, xs[i].w, y0 - y1, colors[j], `stroke="var(--page-bg)" stroke-width="1"`);
      const txt = `${Math.round(v)}%`;
      const sz = m.size(txt, { cls: "ch-dl" });
      if (y0 - y1 >= sz.h + 2 && xs[i].w >= sz.w + 6) labels.push(label(txt, xs[i].x0 + xs[i].w / 2, (y0 + y1) / 2, { anchor: "mc", cls: `ch-dl${isDark(ctx.el, colors[j]) ? " ch-dl--in" : ""}`, style: "font-weight:500" }));
      if (i === cats.length - 1) lastMid[j] = (y0 + y1) / 2;
      base += v;
    });
    labels.push(label(catHtml[i], xs[i].x0 + xs[i].w / 2, H - bottom + fs * 0.45, { anchor: "tc", cls: "ch-lbl ch-lbl--wrap", width: Math.max(30, xs[i].w) }));
  });
  const sizes = legendNames.map((t) => m.size(t, { maxWidth: right - 14 }));
  const ys = spread(lastMid.map((yy, j) => ({ y: yy, h: sizes[j].h })), top, H - bottom);
  series.forEach((_, j) => labels.push(label(`<span style="color:${colors[j]}">■</span> ${legendNames[j]}`, W - right + 10, ys[j], { anchor: "ml", cls: "ch-lbl", style: `white-space:normal;width:${r(right - 10)}px;line-height:1.15` })));
  svg.line(left, y(0), W - right, y(0), "ax ax--base");
  return svg.toString(W, H) + labels.join("");
}

export function renderChart(ctx: Ctx, spec: ChartSpec): string {
  switch (spec.type) {
    case "column": return columnChart(ctx, spec, "single");
    case "grouped-column": return columnChart(ctx, spec, "grouped");
    case "stacked-column": return columnChart(ctx, spec, "stacked");
    case "bar": return barChart(ctx, spec, "single");
    case "grouped-bar": return barChart(ctx, spec, "grouped");
    case "stacked-bar": return barChart(ctx, spec, "stacked");
    case "line": return lineChart(ctx, spec, false);
    case "area": return lineChart(ctx, spec, true);
    case "waterfall": return waterfallChart(ctx, spec);
    case "donut": return donutChart(ctx, spec);
    case "scatter": return scatterChart(ctx, spec);
    case "mekko": return mekkoChart(ctx, spec);
    default: throw new Error(`Unknown chart type: ${(spec as ChartSpec).type}`);
  }
}
