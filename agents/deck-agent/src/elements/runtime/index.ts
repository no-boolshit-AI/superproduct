/* Browser entry: mounts every <div class="el" data-el="id"> using the specs in window.__ELEMENTS. */
import type { ElementSpec, MountResult } from "../types.js";
import { renderChart, type Ctx } from "./charts.js";
import { renderDiagram } from "./diagrams.js";
import { fitKpis, renderKpis, renderTable } from "./blocks.js";
import { esc, fontSize, Measurer } from "./util.js";

declare global {
  interface Window {
    __ELEMENTS?: Record<string, ElementSpec>;
    DeckElements?: { mountAll: typeof mountAll };
  }
}

function defaultAspect(spec: ElementSpec): number {
  if (spec.aspect) return spec.aspect;
  if (spec.kind === "kpis") return Math.max(2.2, spec.items.length * 1.6);
  if (spec.kind === "table") return 2.2;
  if (spec.kind === "diagram") return spec.type === "matrix" || spec.type === "cycle" ? 1.5 : 2.2;
  return spec.type === "donut" ? 2 : 1.9;
}

export function mountAll(specs: Record<string, ElementSpec> = window.__ELEMENTS ?? {}): MountResult[] {
  const results: MountResult[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(".el[data-el]"))) {
    const id = el.dataset.el!;
    const spec = specs[id];
    const warnings: string[] = [];
    if (!spec) {
      el.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border:2px dashed var(--neg);color:var(--neg);font-weight:600">Missing element “${esc(id)}”</div>`;
      results.push({ id, width: el.clientWidth, height: el.clientHeight, warnings: [`ERROR: Element "${id}" does not exist. Create it with create_chart/create_diagram/create_table/create_kpis first.`] });
      continue;
    }
    let W = Math.floor(el.clientWidth);
    let H = Math.floor(el.clientHeight);
    if (H < 30) {
      H = Math.round(W / defaultAspect(spec));
      el.style.height = `${H}px`;
      el.style.flex = "none";
    }
    if (W < 90 || H < 50) warnings.push(`Element is only ${W}×${H}px here; give it a bigger slot.`);
    const m = new Measurer(el);
    const ctx: Ctx = { el, W, H, fs: fontSize(el), m, warn: (s) => warnings.push(s) };
    let html: string;
    try {
      html =
        spec.kind === "chart" ? renderChart(ctx, spec)
        : spec.kind === "diagram" ? renderDiagram(ctx, spec)
        : spec.kind === "table" ? renderTable(ctx, spec)
        : spec.kind === "kpis" ? renderKpis(ctx, spec)
        : (() => { throw new Error(`Unknown element kind ${(spec as ElementSpec).kind}`); })();
    } catch (e) {
      const msg = (e as Error).message;
      warnings.push(`ERROR: ${msg}`);
      html = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;border:2px dashed var(--neg);color:var(--neg);font-weight:600;text-align:center;white-space:normal">${esc(id)}: ${esc(msg)}</div>`;
    }
    m.done();
    if (ctx.usedH && ctx.usedH < H - 24) {
      const report = el.closest("[data-format]")?.getAttribute("data-format") === "report";
      if (report) {
        el.style.height = `${Math.ceil(ctx.usedH)}px`;
        el.style.flex = "none";
        H = Math.ceil(ctx.usedH);
        // let the surrounding exhibit collapse so notes/commentary follow the chart
        const fig = el.closest<HTMLElement>(".exhibit.fill");
        if (fig) { fig.classList.remove("fill"); fig.style.flex = "none"; const b = fig.querySelector<HTMLElement>(".exhibit-body"); if (b) b.style.flex = "none"; }
      } else {
        html = `<div style="position:absolute;left:0;width:${W}px;height:${Math.ceil(ctx.usedH)}px;top:${Math.round((H - ctx.usedH) / 2)}px">${html}</div>`;
      }
    }
    el.innerHTML = html;
    if (spec.kind === "kpis") fitKpis(el, ctx);
    el.dataset.w = String(W);
    el.dataset.h = String(H);
    results.push({ id, width: W, height: H, warnings });
  }
  return results;
}

window.DeckElements = { mountAll };
