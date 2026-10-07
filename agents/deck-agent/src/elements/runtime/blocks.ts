/* Tables and KPI tiles (HTML). */
import type { KpiSpec, TableSpec, CellValue } from "../types.js";
import type { Ctx } from "./charts.js";
import { autoDecimals, esc, fmt, r, rich, Svg } from "./util.js";

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const num = (v: CellValue) => (typeof v === "number" ? v : typeof v === "string" && /^[-+−]?[\d,.]+$/.test(v.trim()) ? Number(v.replace(/[,+]/g, "").replace("−", "-")) : NaN);

export function renderTable(ctx: Ctx, spec: TableSpec): string {
  const { el, W, H, fs } = ctx;
  const cols = spec.columns ?? [];
  need(cols.length, "Tables need `columns` [{label, align?, width?, type?}].");
  need(spec.rows?.length, "Tables need `rows` [{cells:[…], style?}].");
  const totalW = cols.reduce((s, c) => s + (c.width ?? 1), 0);
  const maxAbs = cols.map((c, j) => (c.type === "bar" ? Math.max(1e-9, ...spec.rows.map((rw) => Math.abs(num(rw.cells[j])) || 0)) : 1));
  const dec = cols.map((c, j) => (c.type === "number" || c.type === "bar" || c.type === "delta" ? autoDecimals(spec.rows.map((rw) => num(rw.cells[j]))) : 0));
  let py = spec.density === "compact" ? fs * 0.38 : spec.density === "spacious" ? fs * 0.95 : fs * 0.62;

  const cell = (v: CellValue, j: number): { html: string; cls: string } => {
    const c = cols[j];
    const align = c.align ?? (c.type === "number" || c.type === "delta" ? "right" : c.type && c.type !== "text" && c.type !== "bar" ? "center" : "left");
    const cls = align === "right" ? "r" : align === "center" ? "c" : "";
    if (v === null || v === undefined || v === "") return { html: "", cls };
    switch (c.type) {
      case "number": {
        const n = num(v);
        return { html: Number.isFinite(n) ? esc(fmt(n, c.number ?? {}, { auto: dec[j] })) : rich(v), cls };
      }
      case "delta": {
        const n = num(v);
        if (!Number.isFinite(n)) return { html: rich(v), cls };
        return { html: `<span class="${n > 0 ? "pos" : n < 0 ? "neg" : "muted"}" style="font-weight:600">${esc(fmt(n, c.number ?? {}, { auto: dec[j], sign: true }))}</span>`, cls };
      }
      case "harvey": {
        const n = Math.max(0, Math.min(4, Math.round(num(v))));
        return { html: `<span class="harvey" data-v="${n}" style="font-size:1.15em"></span>`, cls };
      }
      case "rag": {
        const s = String(v).toLowerCase();
        const k = /^(g|green|on track|ok)/.test(s) ? "g" : /^(a|amber|yellow|at risk)/.test(s) ? "a" : /^(r|red|off|late)/.test(s) ? "r" : "";
        return { html: `<span class="rag rag--${k}"></span>`, cls };
      }
      case "check": {
        const s = String(v).toLowerCase();
        const yes = v === true || ["yes", "y", "true", "1", "✓", "x"].includes(s);
        const no = v === false || ["no", "n", "false", "0", "✗", "-", "–"].includes(s);
        return { html: yes ? `<span class="ok">✓</span>` : no ? `<span class="no">✗</span>` : rich(v), cls };
      }
      case "bar": {
        const n = num(v);
        if (!Number.isFinite(n)) return { html: rich(v), cls };
        const pct = Math.abs(n) / maxAbs[j];
        return { html: `<span class="cell-bar${n < 0 ? " is-neg" : ""}"><i style="width:${r(pct * 62)}%"></i><span>${esc(fmt(n, c.number ?? {}, { auto: dec[j] }))}</span></span>`, cls: "" };
      }
      default:
        return { html: rich(v), cls };
    }
  };

  const colgroup = `<colgroup>${cols.map((c) => `<col style="width:${r(((c.width ?? 1) / totalW) * 100)}%">`).join("")}</colgroup>`;
  const head = `<thead><tr>${cols
    .map((c, j) => {
      const align = c.align ?? (c.type === "number" || c.type === "delta" ? "right" : c.type && c.type !== "text" && c.type !== "bar" ? "center" : "left");
      return `<th class="${align === "right" ? "r" : align === "center" ? "c" : ""}">${rich(c.label)}</th>`;
    })
    .join("")}</tr></thead>`;
  const body = `<tbody>${spec.rows
    .map((rw) => {
      if (rw.cells.length !== cols.length && rw.style !== "group") ctx.warn(`A row has ${rw.cells.length} cells for ${cols.length} columns.`);
      const cls = rw.style === "total" ? "is-total" : rw.style === "group" ? "is-group" : rw.style === "highlight" ? "is-hl" : "";
      if (rw.style === "group") return `<tr class="${cls}"><td colspan="${cols.length}">${rich(rw.cells[0])}</td></tr>`;
      return `<tr class="${cls}">${cols
        .map((_, j) => {
          const c = cell(rw.cells[j] ?? null, j);
          return `<td class="${c.cls}${j === 0 ? " is-first" : ""}">${c.html}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("")}</tbody>`;
  const cls = `tbl${spec.header === "filled" ? " tbl--filled" : ""}${spec.zebra ? " tbl--zebra" : ""}`;
  let scaleFont = 1;
  const build = (pad: number) => `<div class="tbl-wrap"><table class="${cls}" style="--cell-py:${r(pad)}px${scaleFont !== 1 ? `;font-size:${scaleFont}em` : ""}">${colgroup}${head}${body}</table></div>`;
  const measure = (html: string) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;left:-10000px;top:0;width:${W}px;visibility:hidden`;
    probe.innerHTML = html.replace('class="tbl-wrap"', 'class="tbl-wrap" style="position:static"');
    el.appendChild(probe);
    const h = probe.querySelector("table")!.getBoundingClientRect().height;
    probe.remove();
    return h;
  };
  let th = measure(build(py));
  // no density given: let rows breathe to use the space (up to a generous padding)
  if (!spec.density && th < H * 0.8) {
    const rowsN = spec.rows.length;
    const extra = (H * 0.86 - th) / Math.max(1, rowsN) / 2;
    if (th < H * 0.45 && spec.rows.length <= 8) { scaleFont = 1.1; th = measure(build(py)); }
    const extra2 = (H * 0.86 - th) / Math.max(1, rowsN) / 2;
    py = Math.min(fs * 1.45, py + Math.max(0, extra2));
    th = measure(build(py));
    void extra;
  }
  if (th > H + 2) ctx.warn(`Table is ${Math.round(th - H)}px taller than its space: cut rows, use density "compact", or give it more room.`);
  return build(py);
}

export function renderKpis(ctx: Ctx, spec: KpiSpec): string {
  const { W, H, fs } = ctx;
  const items = spec.items ?? [];
  need(items.length, "KPI elements need `items` [{value, label, delta?, sentiment?, note?}].");
  if (items.length > 8) ctx.warn(`${items.length} KPIs is too many for one block (max 6–8).`);
  const colsN = spec.columns ?? (W / H < 1.6 && items.length > 2 ? Math.ceil(items.length / 2) : items.length);
  const rows = Math.ceil(items.length / colsN);
  const style = spec.style ?? "tiles";
  const tiles = items.map((it) => {
    const sent = it.sentiment ?? (it.trend === "up" ? "positive" : it.trend === "down" ? "negative" : "neutral");
    const arrow = it.trend === "up" || (!it.trend && /^\+/.test(it.delta ?? "")) ? "▲" : it.trend === "down" || (!it.trend && /^[-−]/.test(it.delta ?? "")) ? "▼" : "";
    let spark = "";
    if (it.spark && it.spark.length > 1) {
      const vals = it.spark;
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const pts = vals.map((v, i) => `${r((i / (vals.length - 1)) * 100)},${r(26 - ((v - lo) / (hi - lo || 1)) * 22)}`).join(" ");
      const svg = new Svg();
      svg.add(`<polyline points="${pts}" style="fill:none;stroke:${it.highlight && style === "tiles" ? "currentColor" : "var(--accent-text, var(--accent))"};stroke-width:2;vector-effect:non-scaling-stroke"/>`);
      spark = `<div class="kpi-spark">${svg.toString(100, 28).replace('width="100" height="28"', 'preserveAspectRatio="none"')}</div>`;
    }
    return `<div class="kpi${it.highlight ? " is-hl" : ""}">
<div class="kpi-v" data-fit>${esc(it.value)}</div>
<div class="kpi-l">${rich(it.label)}</div>
${it.delta ? `<div class="kpi-d is-${sent === "positive" ? "pos" : sent === "negative" ? "neg" : "neu"}">${arrow ? `<span style="font-size:.75em">${arrow}</span>` : ""}${esc(it.delta)}</div>` : ""}
${it.note ? `<div class="kpi-n">${rich(it.note)}</div>` : ""}
${spark}
</div>`;
  });
  void rows;
  return `<div class="kpis kpis--${style}" style="grid-template-columns:repeat(${colsN},minmax(0,1fr));--kpi-size:${r(Math.max(fs * 1.8, Math.min(fs * 6, (H / Math.ceil(items.length / colsN)) * 0.34, (W / colsN) * 0.2)))}px">${tiles.join("")}</div>`;
}

/** After insertion: shrink KPI values that overflow, then equalise sizes across the block. */
export function fitKpis(el: HTMLElement, ctx: Ctx) {
  const vals = Array.from(el.querySelectorAll<HTMLElement>(".kpi-v"));
  if (!vals.length) return;
  for (const v of vals) {
    let size = parseFloat(getComputedStyle(v).fontSize);
    const box = v.parentElement!;
    const avail = () => box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
    while (size > ctx.fs * 1.2 && v.scrollWidth > avail() + 1) {
      size -= 1;
      v.style.fontSize = `${size}px`;
    }
  }
  const min = Math.min(...vals.map((v) => parseFloat(getComputedStyle(v).fontSize)));
  for (const v of vals) v.style.fontSize = `${min}px`;
  for (const k of Array.from(el.querySelectorAll<HTMLElement>(".kpi"))) {
    if (k.scrollHeight > k.clientHeight + 2) ctx.warn(`KPI tile "${k.querySelector(".kpi-l")?.textContent?.slice(0, 30)}" content is taller than the tile: shorten label/note or give the block more height.`);
  }
}
