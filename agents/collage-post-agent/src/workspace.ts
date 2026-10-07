import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DESIGN_DIR } from "./paths.js";
import { palettesCss } from "./palettes.js";

/** Files every job needs at runtime, copied so a job folder is portable/offline. */
const RUNTIME = ["collage.css", "collage.js", "fonts"];

export async function writePalettesCss(): Promise<void> {
  await writeFile(path.join(DESIGN_DIR, "palettes.css"), palettesCss());
}

/** Extra design files for one job: brand font files (copied to _design/fonts/brand/) and CSS appended to palettes.css. */
export interface JobDesignExtras {
  fontFiles?: string[];
  css?: string;
}

export async function prepareJobDir(jobDir: string, extras: JobDesignExtras = {}): Promise<void> {
  await mkdir(path.join(jobDir, "assets"), { recursive: true });
  await mkdir(path.join(jobDir, "png"), { recursive: true });
  const target = path.join(jobDir, "_design");
  await mkdir(target, { recursive: true });
  for (const item of RUNTIME) {
    await cp(path.join(DESIGN_DIR, item), path.join(target, item), { recursive: true });
  }
  if (extras.fontFiles?.length) {
    await mkdir(path.join(target, "fonts", "brand"), { recursive: true });
    for (const f of extras.fontFiles) await cp(f, path.join(target, "fonts", "brand", path.basename(f)));
  }
  // palettes.css is imported first by collage.css, so per-job brand rules live at its end
  await writeFile(path.join(target, "palettes.css"), palettesCss() + (extras.css ? `\n${extras.css}` : ""));
}

export function slugify(s: string, max = 48): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "post"
  );
}
