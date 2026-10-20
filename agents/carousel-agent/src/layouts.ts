/**
 * The layout library (src/design/layouts/<id>.html): style-agnostic slide templates with a header comment
 * (layout, for, needs, notes). The agent adapts them; the gallery renders every layout in every style.
 */
import fs from "node:fs";
import path from "node:path";
import { DESIGN_DIR } from "./config.js";

export interface Layout {
  id: string;
  for: string;
  needs: string;
  notes: string;
  /** The template: the header comment and the <section class="slide"> fragment. */
  source: string;
  /** The fragment alone. */
  html: string;
  /** Image files the sample content uses (assets/…). */
  assets: string[];
}

export const LAYOUTS_DIR = path.join(DESIGN_DIR, "layouts");

let cache: Layout[] | null = null;

export function loadLayouts(): Layout[] {
  if (cache) return cache;
  cache = fs
    .readdirSync(LAYOUTS_DIR)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => {
      const source = fs.readFileSync(path.join(LAYOUTS_DIR, f), "utf8").trim();
      const header = source.match(/^<!--([\s\S]*?)-->/)?.[1] ?? "";
      const field = (k: string) => header.match(new RegExp(`^\\s*${k}:\\s*(.+)$`, "m"))?.[1].trim() ?? "";
      const html = source.replace(/^<!--[\s\S]*?-->\s*/, "");
      const assets = [...new Set([...html.matchAll(/src="(assets\/[^"]+)"/g)].map((m) => m[1]))];
      return { id: field("layout") || path.basename(f, ".html"), for: field("for"), needs: field("needs"), notes: field("notes"), source, html, assets };
    });
  return cache;
}

export const layoutById = (id: string) => loadLayouts().find((l) => l.id === id);
