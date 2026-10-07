/* Diagram renderers: process, timeline, roadmap (Gantt), 2×2 matrix, pyramid, funnel, issue/driver tree, cycle. */
import type { DiagramSpec } from "../types.js";
import type { Ctx } from "./charts.js";
import { col, esc, isDark, label, r, rich, Svg } from "./util.js";

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const icon = (name?: string, size = "1.9em", color = "var(--accent-text, var(--accent))") =>
  name ? `<i class="icon icon--${esc(name)}" style="--icon-size:${size};--icon-color:${color}"></i>` : "";

/** Chevron / box / numbered process flow with descriptions underneath. */
function process(ctx: Ctx, spec: DiagramSpec): string {
  const { W, H, fs, m } = ctx;
  const steps = spec.steps ?? [];
  need(steps.length >= 2, "Process diagrams need at least 2 `steps` [{title, text?, icon?, highlight?}].");
  const n = steps.length;
  if (n > 7) ctx.warn(`${n} process steps is a lot for one row; group them (max 6–7).`);
  const style = spec.style ?? "chevron";
  const anyHl = steps.some((s) => s.highlight);
  const fill = (s: (typeof steps)[number]) => (anyHl ? (s.highlight ? "var(--accent)" : "var(--node)") : "var(--node)");
  const out: string[] = [];
  if (style === "numbered") {
    const colW = W / n;
    const dot = fs * 2.6;
    const svg = new Svg();
    svg.line(colW / 2, dot / 2, W - colW / 2, dot / 2, "ax", `style="stroke:var(--line);stroke-width:2"`);
    steps.forEach((s, i) => {
      const cx = colW * (i + 0.5);
      const c = s.highlight ? "var(--accent)" : "var(--node)";
      svg.circle(cx, dot / 2, dot / 2, `fill:${c}`);
      out.push(label(`${i + 1}`, cx, dot / 2, { anchor: "mc", cls: "ch-lbl", style: "color:#fff;font-weight:700;font-size:1.15em" }));
      const html = `${icon(s.icon, "1.6em")}<div class="dg-step-title" style="margin:${s.icon ? "6px" : "0"} 0 6px;font-size:1.12em">${rich(s.title)}</div>${s.text ? `<div class="dg-text">${rich(s.text)}</div>` : ""}`;
      const w = colW - fs * 1.6;
      const sz = m.size(html, { maxWidth: w });
      if (dot + fs + sz.h > H) ctx.warn(`Step "${s.title}" text is too long for the height available.`);
      out.push(`<div class="dg-abs" style="left:${r(cx - w / 2)}px;top:${r(dot + fs)}px;width:${r(w)}px;text-align:center">${html}</div>`);
    });
    return svg.toString(W, H) + out.join("");
  }
  const gap = style === "boxes" ? fs * 2.4 : fs * 0.35;
  let oy = 0; // vertical offset to centre short diagrams in tall slots
  const tip = style === "chevron" ? Math.min(fs * 1.5, W / n / 6) : 0;
  const colW = (W - gap * (n - 1) + (style === "chevron" ? tip * (n - 1) : 0)) / n;
  // header height: tallest title
  const titleHtml = steps.map((s) => `<div class="dg-step-title">${rich(s.title)}</div>`);
  const innerW = colW - tip * 2 - fs * 1.2;
  const headH = Math.max(fs * 3.4, ...titleHtml.map((t) => m.size(t, { maxWidth: innerW }).h + fs * 1.6));
  {
    const tw0 = colW - tip * 2 - fs * 0.4;
    const textH = Math.max(0, ...steps.map((s) => (s.text || s.icon ? m.size(`${s.icon ? `<div style="margin-bottom:8px">${icon(s.icon, "1.7em")}</div>` : ""}${s.value ? `<div class="dg-v" style="font-size:1.4em;margin-bottom:4px">${esc(s.value)}</div>` : ""}<div class="dg-text">${rich(s.text ?? "")}</div>`, { maxWidth: tw0 }).h + fs * 1.1 : 0)));
    const total = headH + textH;
    if (total < H * 0.7) oy = (H - total) * 0.38;
  }
  steps.forEach((s, i) => {
    const x = i * (colW + gap - tip);
    const c = fill(s);
    const first = i === 0;
    const poly =
      style === "chevron"
        ? first
          ? `polygon(0 0, calc(100% - ${tip}px) 0, 100% 50%, calc(100% - ${tip}px) 100%, 0 100%)`
          : `polygon(0 0, calc(100% - ${tip}px) 0, 100% 50%, calc(100% - ${tip}px) 100%, 0 100%, ${tip}px 50%)`
        : "none";
    const textColor = isDark(ctx.el, c) ? "#fff" : "var(--ink)";
    out.push(
      `<div class="dg-abs" style="left:${r(x)}px;top:${r(oy)}px;width:${r(colW)}px;height:${r(headH)}px;background:${c};clip-path:${poly};border-radius:${style === "boxes" ? "var(--radius)" : "0"};display:flex;align-items:center;justify-content:center;text-align:center;padding:0 ${r(tip + fs * 0.6)}px;color:${textColor}">${titleHtml[i]}</div>`,
    );
    if (style === "boxes" && i < n - 1)
      out.push(`<div class="dg-abs arrow-right" style="left:${r(x + colW + gap / 2 - fs * 0.8)}px;top:${r(oy + headH / 2 - fs * 0.8)}px;width:${r(fs * 1.6)}px;height:${r(fs * 1.6)}px"></div>`);
    if (s.text || s.icon) {
      const tx = x + (first ? 0 : tip);
      const tw = colW - (first ? tip : tip * 2) - fs * 0.4;
      const html = `${s.icon ? `<div style="margin-bottom:8px">${icon(s.icon, "1.7em", s.highlight ? "var(--accent-text, var(--accent))" : "var(--ink-2)")}</div>` : ""}${s.value ? `<div class="dg-v" style="font-size:1.4em;margin-bottom:4px">${esc(s.value)}</div>` : ""}<div class="dg-text">${rich(s.text ?? "")}</div>`;
      const sz = m.size(html, { maxWidth: tw });
      if (oy + headH + fs + sz.h > H + 1) ctx.warn(`Description under "${s.title}" overflows the diagram height by ${Math.round(headH + fs + sz.h - H)}px.`);
      out.push(`<div class="dg-abs" style="left:${r(tx)}px;top:${r(oy + headH + fs * 1.1)}px;width:${r(tw)}px;white-space:normal">${html}</div>`);
    }
  });
  return out.join("");
}

/** Horizontal timeline with milestones. */
function timeline(ctx: Ctx, spec: DiagramSpec): string {
  const { W, H, fs, m } = ctx;
  const ev = spec.events ?? [];
  need(ev.length >= 2, "Timeline diagrams need at least 2 `events` [{date, title, text?}].");
  const n = ev.length;
  const colW = W / n;
  const dateH = m.size("<b>2025</b>").h;
  const lineY = dateH + fs * 1.2;
  const svg = new Svg();
  svg.line(0, lineY, W, lineY, "ax", `style="stroke:var(--ink);stroke-width:2"`);
  svg.add(`<path d="M${W - 8},${lineY - 5} L${W},${lineY} L${W - 8},${lineY + 5}" style="fill:none;stroke:var(--ink);stroke-width:2"/>`);
  const out: string[] = [];
  ev.forEach((e, i) => {
    const cx = colW * (i + 0.5);
    const c = e.highlight ? "var(--accent)" : "var(--node)";
    svg.circle(cx, lineY, e.highlight ? fs * 0.62 : fs * 0.46, `fill:${c};stroke:var(--page-bg);stroke-width:2`);
    out.push(label(`<b style="color:${e.highlight ? "var(--accent-text, var(--accent))" : "var(--ink)"}">${esc(e.date)}</b>`, cx, lineY - fs * 0.9, { anchor: "bc", cls: "ch-lbl" }));
    const w = colW - fs * 1.2;
    const html = `<div class="dg-step-title" style="margin-bottom:4px;${e.highlight ? "color:var(--accent-text, var(--accent))" : ""}">${rich(e.title)}</div>${e.text ? `<div class="dg-text">${rich(e.text)}</div>` : ""}`;
    const sz = m.size(html, { maxWidth: w });
    if (lineY + fs * 1.4 + sz.h > H + 1) ctx.warn(`Timeline text for "${e.title}" is too long for the height.`);
    out.push(`<div class="dg-abs" style="left:${r(cx - w / 2)}px;top:${r(lineY + fs * 1.3)}px;width:${r(w)}px;text-align:center">${html}</div>`);
  });
  return svg.toString(W, H) + out.join("");
}

/** Roadmap / Gantt: workstreams × periods with bars and milestones. */
function roadmap(ctx: Ctx, spec: DiagramSpec): string {
  const { W, H, fs, m } = ctx;
  const periods = spec.periods ?? [];
  const rows = spec.rows ?? [];
  need(periods.length && rows.length, "Roadmap diagrams need `periods` (column labels) and `rows` [{label, bars:[{start,end,label}]}]. start/end are period indexes; end is exclusive (0→2 spans two periods).");
  const P = periods.length;
  const labelW = Math.min(W * 0.26, Math.max(...rows.map((rw) => m.size(rw.group ? `<b>${esc(rw.label)}</b>` : esc(rw.label), { maxWidth: W * 0.26 }).w)) + fs);
  const headH = m.size("<b>Q1</b>").h + fs * 0.9;
  const rowH = Math.min(fs * 4.4, (H - headH) / rows.length);
  if (rowH < fs * 1.7) ctx.warn("Roadmap rows are cramped: fewer rows or more height.");
  const tl = labelW, tw = W - labelW;
  const px = (p: number) => tl + (p / P) * tw;
  const svg = new Svg();
  const out: string[] = [];
  periods.forEach((p, i) => {
    if (i % 2 === 1) svg.rect(px(i), headH, tw / P, rowH * rows.length, "var(--surface)", `opacity=".55"`);
    out.push(label(`<b>${esc(p)}</b>`, px(i) + tw / P / 2, headH / 2, { anchor: "mc", cls: "ch-lbl", style: "color:var(--ink)" }));
  });
  svg.line(tl, headH, W, headH, "ax ax--base");
  rows.forEach((rw, j) => {
    const y0 = headH + j * rowH;
    const cy = y0 + rowH / 2;
    if (j > 0) svg.line(0, y0, W, y0, "grid");
    out.push(label(rw.group ? `<b style="color:var(--ink)">${esc(rw.label)}</b>` : esc(rw.label), 0, cy, { anchor: "ml", cls: "ch-lbl", style: `white-space:normal;width:${r(labelW - fs * 0.8)}px;line-height:1.2;${rw.group ? "" : "padding-left:" + (rows.some((x) => x.group) ? "0.8em" : "0")}` }));
    for (const b of rw.bars ?? []) {
      if (b.end <= b.start) { ctx.warn(`Bar "${b.label ?? rw.label}" has end ≤ start.`); continue; }
      const x0 = px(b.start) + 2, x1 = px(b.end) - 2;
      const bh = rw.group ? Math.max(3, rowH * 0.14) : Math.min(rowH * 0.6, fs * 2.1);
      const c = col(b.color, rw.group ? "var(--node)" : "var(--c2)");
      svg.rect(x0, cy - bh / 2, x1 - x0, bh, c, `rx="${rw.group ? 1 : 2}"`);
      if (b.label && !rw.group) {
        const s = m.size(esc(b.label));
        if (s.w + fs <= x1 - x0) out.push(label(esc(b.label), x0 + fs * 0.5, cy, { anchor: "ml", cls: "ch-lbl", style: `color:${isDark(ctx.el, c) ? "#fff" : "var(--ink)"};font-weight:500` }));
        else out.push(label(esc(b.label), x1 + 6, cy, { anchor: "ml", cls: "ch-lbl", style: "font-size:.92em" }));
      }
    }
    for (const ms of rw.milestones ?? []) {
      const mx = px(ms.at);
      const d = fs * 0.55;
      svg.path(`M${r(mx)},${r(cy - d)} L${r(mx + d)},${r(cy)} L${r(mx)},${r(cy + d)} L${r(mx - d)},${r(cy)} Z`, "fill:var(--accent-text, var(--accent))");
      if (ms.label) out.push(label(esc(ms.label), mx + d + 4, cy, { anchor: "ml", cls: "ch-lbl", style: "font-size:.9em;color:var(--accent-text, var(--accent));font-weight:600" }));
    }
  });
  svg.line(0, headH + rows.length * rowH, W, headH + rows.length * rowH, "grid");
  if (spec.now !== undefined) {
    const nx = px(spec.now);
    const yEnd = headH + rows.length * rowH;
    svg.line(nx, headH, nx, yEnd, "conn", `style="stroke:var(--accent-text, var(--accent));stroke-width:1.5"`);
    out.push(label("Today", nx, yEnd + 3, { anchor: "tc", cls: "ch-lbl", style: "color:var(--accent-text, var(--accent));font-weight:600;font-size:.88em" }));
  }
  return svg.toString(W, H) + out.join("");
}

/** 2×2 matrix with axis labels, quadrant texts and optional plotted items. */
function matrix(ctx: Ctx, spec: DiagramSpec): string {
  const { W, H, fs, m } = ctx;
  const q = spec.quadrants ?? [];
  need(q.length === 4 || (spec.items?.length ?? 0) > 0, "Matrix diagrams need 4 `quadrants` (top-left, top-right, bottom-left, bottom-right) and/or `items` [{label, x, y}] with x/y in 0–100.");
  const xa = spec.x_axis ?? { label: "" }, ya = spec.y_axis ?? { label: "" };
  const left = fs * 2.4, bottom = fs * 2.6;
  const side = Math.min(W - left, (H - bottom) * (spec.items?.length ? 1.25 : 1.9));
  const gw = side, gh = H - bottom;
  const x0 = left + (W - left - gw) / 2 * 0, y0 = 0;
  const g = 3;
  const qw = (gw - g) / 2, qh = (gh - g) / 2;
  const out: string[] = [];
  const pos = [
    [x0, y0], [x0 + qw + g, y0], [x0, y0 + qh + g], [x0 + qw + g, y0 + qh + g],
  ];
  q.forEach((qq, i) => {
    const [qx, qy] = pos[i];
    const bg = qq.highlight ? "color-mix(in srgb, var(--accent) 14%, var(--page-bg))" : "var(--surface)";
    const html = `<div class="dg-step-title" style="color:${qq.highlight ? "var(--accent-text, var(--accent))" : "var(--ink)"};margin-bottom:4px">${rich(qq.title)}</div>${qq.text ? `<div class="dg-text">${rich(qq.text)}</div>` : ""}`;
    const sz = m.size(html, { maxWidth: qw - fs * 1.8 });
    if (sz.h > qh - fs * 1.4 && !spec.items?.length) ctx.warn(`Quadrant "${qq.title}" text overflows its box.`);
    out.push(`<div class="dg-abs" style="left:${r(qx)}px;top:${r(qy)}px;width:${r(qw)}px;height:${r(qh)}px;background:${bg};border-radius:var(--radius);padding:${r(fs * 0.9)}px;${qq.highlight ? "outline:1.5px solid var(--accent-text, var(--accent));outline-offset:-1.5px;" : ""}">${html}</div>`);
  });
  const svg = new Svg();
  // axes with arrows
  const ah = svg.arrowDef();
  svg.add(`<path d="M${r(x0 - fs * 0.9)},${r(gh)} L${r(x0 - fs * 0.9)},${r(fs * 0.2)}" class="ann" marker-end="${ah}"/>`);
  svg.add(`<path d="M${r(x0)},${r(gh + fs * 0.9)} L${r(x0 + gw - fs * 0.2)},${r(gh + fs * 0.9)}" class="ann" marker-end="${ah}"/>`);
  out.push(label(`<b>${esc(xa.label)}</b>`, x0 + gw / 2, H, { anchor: "bc", cls: "ch-lbl", style: "color:var(--ink)" }));
  if (xa.low) out.push(label(esc(xa.low), x0, H, { anchor: "bl", cls: "ch-lbl ch-axis-t" }));
  if (xa.high) out.push(label(esc(xa.high), x0 + gw, H, { anchor: "br", cls: "ch-lbl ch-axis-t" }));
  const rot = "transform-origin:0 0;";
  out.push(`<div class="ch-lbl" style="left:0;top:${r(gh / 2)}px;transform:rotate(-90deg) translate(-50%,0);${rot}color:var(--ink)"><b>${esc(ya.label)}</b></div>`);
  if (ya.low) out.push(`<div class="ch-lbl ch-axis-t" style="left:0;top:${r(gh)}px;transform:rotate(-90deg);${rot}">${esc(ya.low)}</div>`);
  if (ya.high) out.push(`<div class="ch-lbl ch-axis-t" style="left:0;top:${r(0)}px;transform:rotate(-90deg) translate(-100%,0);${rot}">${esc(ya.high)}</div>`);
  // items
  for (const it of spec.items ?? []) {
    const ix = x0 + (Math.max(0, Math.min(100, it.x)) / 100) * gw;
    const iy = gh - (Math.max(0, Math.min(100, it.y)) / 100) * gh;
    const rad = it.size ? Math.max(fs * 0.4, Math.min(fs * 1.8, fs * 0.4 * Math.sqrt(it.size))) : fs * 0.5;
    svg.circle(ix, iy, rad, `fill:${it.highlight ? "var(--accent)" : "var(--node)"};stroke:var(--page-bg);stroke-width:1.5`);
    out.push(label(it.highlight ? `<b>${esc(it.label)}</b>` : esc(it.label), ix + rad + 4, iy, { anchor: "ml", cls: "ch-lbl", style: "color:var(--ink)" }));
  }
  return out.join("") + svg.toString(W, H);
}

/** Pyramid (top = narrowest) with descriptions to the right. */
function pyramid(ctx: Ctx, spec: DiagramSpec): string {
  const { W, H, fs, m } = ctx;
  const lv = spec.steps ?? [];
  need(lv.length >= 2, "Pyramid diagrams need at least 2 `steps` (levels, top first).");
  const n = lv.length;
  const hasText = lv.some((l) => l.text);
  const pw = hasText ? Math.min(W * 0.46, H * 1.25) : Math.min(W, H * 1.5);
  const px0 = hasText ? 0 : (W - pw) / 2;
  const gap = 3;
  const lh = (H - gap * (n - 1)) / n;
  const out: string[] = [];
  const svg = new Svg();
  lv.forEach((l, i) => {
    const yTop = i * (lh + gap), yBot = yTop + lh;
    const wTop = (pw * (yTop / H)), wBot = (pw * (yBot / H));
    const cx = px0 + pw / 2;
    const c = l.highlight ? "var(--accent)" : `color-mix(in srgb, var(--node) ${100 - Math.round((i / Math.max(1, n - 1)) * 45)}%, var(--page-bg))`;
    svg.path(`M${r(cx - wTop / 2)},${r(yTop)} L${r(cx + wTop / 2)},${r(yTop)} L${r(cx + wBot / 2)},${r(yBot)} L${r(cx - wBot / 2)},${r(yBot)} Z`, `fill:${c}`);
    const tw = Math.max(wBot * 0.72, fs * 4);
    const dark = isDark(ctx.el, c);
    out.push(label(`<span class="dg-step-title">${rich(l.title)}</span>`, cx, yTop + lh / 2 + (i === 0 ? lh * 0.18 : 0), { anchor: "mc", cls: "ch-lbl", width: tw, style: `white-space:normal;text-align:center;color:${dark ? "#fff" : "var(--ink)"}` }));
    if (hasText && l.text) {
      const tx = px0 + pw + fs * 2;
      const w = W - tx;
      const html = `${l.value ? `<span class="dg-v">${esc(l.value)}</span> ` : ""}<span class="dg-text">${rich(l.text)}</span>`;
      const sz = m.size(html, { maxWidth: w });
      if (sz.h > lh + gap) ctx.warn(`Pyramid text for "${l.title}" is taller than its level.`);
      svg.line(cx + (wTop + wBot) / 4 + 6, yTop + lh / 2, tx - 8, yTop + lh / 2, "lead-line");
      out.push(label(html, tx, yTop + lh / 2, { anchor: "ml", cls: "ch-lbl", width: w, style: "white-space:normal;line-height:1.35" }));
    }
  });
  return svg.toString(W, H) + out.join("");
}

/** Funnel: stages narrowing top → bottom, with optional values and conversion rates. */
function funnel(ctx: Ctx, spec: DiagramSpec): string {
  const { W, H, fs, m } = ctx;
  const st = spec.steps ?? [];
  need(st.length >= 2, "Funnel diagrams need at least 2 `steps` [{title, value?, text?}].");
  const n = st.length;
  const nums = st.map((s) => parseFloat(String(s.value ?? "").replace(/[^0-9.\-]/g, "")));
  const hasNums = nums.every((v) => Number.isFinite(v) && v > 0);
  const hasText = st.some((s) => s.text);
  const fw = hasText ? W * 0.55 : W;
  const gap = 4;
  const sh = (H - gap * (n - 1)) / n;
  const out: string[] = [];
  const svg = new Svg();
  st.forEach((s, i) => {
    const frac = hasNums ? Math.max(0.28, nums[i] / nums[0]) : 1 - (i / n) * 0.62;
    const fracNext = hasNums ? Math.max(0.28, (nums[i + 1] ?? nums[i] * 0.8) / nums[0]) : 1 - ((i + 1) / n) * 0.62;
    const y0 = i * (sh + gap);
    const cx = fw / 2;
    const wT = fw * frac, wB = fw * Math.min(frac, fracNext);
    const c = s.highlight ? "var(--accent)" : `color-mix(in srgb, var(--node) ${100 - Math.round((i / Math.max(1, n - 1)) * 40)}%, var(--page-bg))`;
    svg.path(`M${r(cx - wT / 2)},${r(y0)} L${r(cx + wT / 2)},${r(y0)} L${r(cx + wB / 2)},${r(y0 + sh)} L${r(cx - wB / 2)},${r(y0 + sh)} Z`, `fill:${c}`);
    const dark = isDark(ctx.el, c);
    out.push(label(`<b>${rich(s.title)}</b>${s.value ? ` <span style="opacity:.85">· ${esc(s.value)}</span>` : ""}`, cx, y0 + sh / 2, { anchor: "mc", cls: "ch-lbl", style: `color:${dark ? "#fff" : "var(--ink)"}` }));
    const tx = fw + fs * 1.8;
    if (hasNums && i > 0) out.push(label(`${Math.round((nums[i] / nums[i - 1]) * 100)}%`, hasText ? fw + 4 : cx + wT / 2 + 8, y0 - gap / 2, { anchor: "ml", cls: "ch-lbl", style: "color:var(--accent-text, var(--accent));font-weight:600;font-size:.9em;background:var(--page-bg);padding:0 4px" }));
    if (hasText && s.text) {
      const sz = m.size(rich(s.text), { maxWidth: W - tx - fs * 2.2 });
      if (sz.h > sh + gap) ctx.warn(`Funnel text for "${s.title}" is taller than its stage.`);
      out.push(label(`<span class="dg-text">${rich(s.text)}</span>`, tx + fs * 2.2, y0 + sh / 2, { anchor: "ml", cls: "ch-lbl", width: W - tx - fs * 2.2, style: "white-space:normal;line-height:1.35" }));
    }
  });
  return svg.toString(W, H) + out.join("");
}

/** Issue tree / driver tree, left to right. Nodes are a flat list with parent ids. */
function tree(ctx: Ctx, spec: DiagramSpec): string {
  const { W, H, fs, m } = ctx;
  const nodes = spec.nodes ?? [];
  need(nodes.length >= 2, "Tree diagrams need `nodes` [{id, parent?, label, value?, note?, operator?}] with exactly one root (no parent).");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = nodes.filter((n) => !n.parent || !byId.has(n.parent));
  need(roots.length === 1, `Tree diagrams need exactly one root node (found ${roots.length}).`);
  const kids = new Map<string, typeof nodes>();
  for (const n of nodes) if (n.parent && byId.has(n.parent)) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n]);
  const depth = new Map<string, number>();
  const leaves: string[] = [];
  const walk = (id: string, d: number) => {
    depth.set(id, d);
    const ch = kids.get(id) ?? [];
    if (!ch.length) leaves.push(id);
    ch.forEach((c) => walk(c.id, d + 1));
  };
  walk(roots[0].id, 0);
  const levels = Math.max(...depth.values()) + 1;
  const gapX = fs * 2.6;
  const colW = (W - gapX * (levels - 1)) / levels;
  const slot = H / leaves.length;
  const html = (n: (typeof nodes)[number]) =>
    `<b>${rich(n.label)}</b>${n.value ? `<div class="dg-v">${esc(n.value)}</div>` : ""}${n.note ? `<div class="dg-text" style="font-size:.9em">${rich(n.note)}</div>` : ""}`;
  const cy = new Map<string, number>();
  const place = (id: string): number => {
    const ch = kids.get(id) ?? [];
    const y = ch.length ? ch.map((c) => place(c.id)).reduce((a, b) => a + b, 0) / ch.length : (leaves.indexOf(id) + 0.5) * slot;
    cy.set(id, y);
    return y;
  };
  place(roots[0].id);
  const svg = new Svg();
  const out: string[] = [];
  const heights = new Map<string, number>();
  for (const n of nodes) {
    if (!depth.has(n.id)) continue;
    const h = m.size(html(n), { maxWidth: colW - fs * 1.6, style: "line-height:1.25" }).h + fs * 1.0;
    heights.set(n.id, h);
    if (!(kids.get(n.id) ?? []).length && h > slot - 4) ctx.warn(`Tree node "${n.label}" is taller than its slot (${Math.round(h)} > ${Math.round(slot)}px): shorten the text or give the tree more height.`);
  }
  for (const n of nodes) {
    if (!depth.has(n.id)) continue;
    const d = depth.get(n.id)!;
    const x = d * (colW + gapX);
    const y = cy.get(n.id)!;
    const h = heights.get(n.id)!;
    const cls = `dg-node${d === 0 ? " is-root" : ""}${n.highlight ? " is-hl" : ""}`;
    out.push(`<div class="${cls}" style="left:${r(x)}px;top:${r(y - h / 2)}px;width:${r(colW)}px;height:${r(h)}px">${html(n)}</div>`);
    const ch = kids.get(n.id) ?? [];
    if (ch.length) {
      const midX = x + colW + gapX / 2;
      svg.line(x + colW, y, midX, y, "ax", `style="stroke:var(--c-axis)"`);
      const ys = ch.map((c) => cy.get(c.id)!);
      svg.line(midX, Math.min(...ys), midX, Math.max(...ys), "ax", `style="stroke:var(--c-axis)"`);
      for (const yy of ys) svg.line(midX, yy, x + colW + gapX, yy, "ax", `style="stroke:var(--c-axis)"`);
      if (n.operator) {
        svg.circle(midX, y, fs * 0.75, "fill:var(--page-bg);stroke:var(--c-axis);stroke-width:1");
        out.push(label(`<b>${esc(n.operator)}</b>`, midX, y, { anchor: "mc", cls: "ch-lbl", style: "color:var(--ink)" }));
      }
    }
  }
  return svg.toString(W, H) + out.join("");
}

/** Cycle: steps around an ellipse with arrows between them. */
function cycle(ctx: Ctx, spec: DiagramSpec): string {
  const { W, H, fs, m } = ctx;
  const st = spec.steps ?? [];
  need(st.length >= 3, "Cycle diagrams need at least 3 `steps`.");
  const n = st.length;
  const cardW = Math.min(W * 0.26, fs * 15);
  const html = st.map((s) => `${s.icon ? `<div style="margin-bottom:4px">${icon(s.icon, "1.5em", s.highlight ? "var(--accent-text, var(--accent))" : "var(--ink-2)")}</div>` : ""}<div class="dg-step-title">${rich(s.title)}</div>${s.text ? `<div class="dg-text" style="margin-top:3px">${rich(s.text)}</div>` : ""}`);
  const hs = html.map((h) => m.size(h, { maxWidth: cardW - fs * 1.4 }).h + fs * 1.2);
  const cardH = Math.max(...hs);
  const rx = W / 2 - cardW / 2 - 2, ry = H / 2 - cardH / 2 - 2;
  const cx = W / 2, cy = H / 2;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const svg = new Svg();
  const ah = svg.arrowDef();
  // arcs between consecutive cards
  for (let i = 0; i < n; i++) {
    const a1 = ang(i) + 0.32, a2 = ang(i + 1) - 0.32;
    const steps = 18;
    let d = "";
    for (let k = 0; k <= steps; k++) {
      const a = a1 + ((a2 - a1) * k) / steps;
      d += `${k ? " L" : "M"}${r(cx + rx * 0.98 * Math.cos(a))},${r(cy + ry * 0.98 * Math.sin(a))}`;
    }
    svg.add(`<path d="${d}" class="ann" style="stroke:var(--c-axis);stroke-width:1.6" marker-end="${ah}"/>`);
  }
  const out: string[] = [];
  st.forEach((s, i) => {
    const x = cx + rx * Math.cos(ang(i)), y = cy + ry * Math.sin(ang(i));
    const bg = s.highlight ? "var(--accent)" : "var(--surface)";
    const ink = s.highlight ? "color:var(--on-accent);--ink:var(--on-accent);--ink-2:var(--on-accent);" : "";
    out.push(`<div class="dg-abs" style="left:${r(x - cardW / 2)}px;top:${r(y - cardH / 2)}px;width:${r(cardW)}px;height:${r(cardH)}px;background:${bg};border-radius:var(--radius);padding:${r(fs * 0.6)}px ${r(fs * 0.7)}px;text-align:center;display:flex;flex-direction:column;justify-content:center;${ink}">${html[i]}</div>`);
  });
  if (spec.center) out.push(label(`<b style="font-size:1.25em;color:var(--ink)">${rich(spec.center)}</b>`, cx, cy, { anchor: "mc", cls: "ch-lbl", width: rx * 0.9, style: "white-space:normal;text-align:center" }));
  return svg.toString(W, H) + out.join("");
}

export function renderDiagram(ctx: Ctx, spec: DiagramSpec): string {
  switch (spec.type) {
    case "process": return process(ctx, spec);
    case "timeline": return timeline(ctx, spec);
    case "roadmap": return roadmap(ctx, spec);
    case "matrix": return matrix(ctx, spec);
    case "pyramid": return pyramid(ctx, spec);
    case "funnel": return funnel(ctx, spec);
    case "tree": return tree(ctx, spec);
    case "cycle": return cycle(ctx, spec);
    default: throw new Error(`Unknown diagram type: ${(spec as DiagramSpec).type}`);
  }
}
