import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { copyProductFiles, productDoc, type Product, type ProductFiles } from "./product.js";

const SKIP = new Set(["node_modules", ".next", "out", ".lpa", "next-env.d.ts", "tsconfig.tsbuildinfo"]);

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/-$/, "");
  return s || "page";
}

/** Pick a free folder name under sites/: slug, slug-2, slug-3… */
export function uniqueSlug(slug: string): string {
  let candidate = slug;
  for (let i = 2; existsSync(path.join(config.sitesDir, candidate)); i++) candidate = `${slug}-${i}`;
  return candidate;
}

export type ScaffoldResult = { slug: string; dir: string; assets: string[]; product?: { dir: string; name: string; files: ProductFiles } };

/**
 * Copy the Next.js template into sites/<slug>, install the current tokens,
 * write the brief and copy any supplied assets into public/assets.
 * With a product folder, also write PRODUCT.md and copy the product's logos into public/assets/brand.
 */
export function scaffoldSite(opts: { slug: string; brief: string; assets?: string[]; overwrite?: boolean; product?: Product | null }): ScaffoldResult {
  const slug = opts.overwrite ? opts.slug : uniqueSlug(opts.slug);
  const dir = path.join(config.sitesDir, slug);
  // Overwriting starts from a clean folder so files from an older template never linger.
  if (opts.overwrite && path.dirname(dir) === config.sitesDir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  cpSync(config.templateDir, dir, {
    recursive: true,
    filter: (src) => !SKIP.has(path.basename(src)),
  });
  // Tokens always come fresh from the style guide (single source of truth).
  cpSync(path.join(config.styleguideDir, "tokens.css"), path.join(dir, "styles", "tokens.css"));

  const copied: string[] = [];
  if (opts.assets?.length) {
    const target = path.join(dir, "public", "assets");
    mkdirSync(target, { recursive: true });
    for (const a of opts.assets) {
      const src = path.resolve(a);
      if (!existsSync(src)) continue;
      if (statSync(src).isDirectory()) {
        for (const f of readdirSync(src)) {
          if (statSync(path.join(src, f)).isFile()) {
            cpSync(path.join(src, f), path.join(target, f));
            copied.push(`/assets/${f}`);
          }
        }
      } else {
        cpSync(src, path.join(target, path.basename(src)));
        copied.push(`/assets/${path.basename(src)}`);
      }
    }
  }

  let product: ScaffoldResult["product"];
  if (opts.product) {
    const files = copyProductFiles(opts.product, dir);
    writeFileSync(path.join(dir, "PRODUCT.md"), productDoc(opts.product, files));
    product = { dir: opts.product.dir, name: opts.product.name, files };
  }
  const brandFiles = product ? [...Object.values(product.files.logos).filter(Boolean), ...product.files.assets] : [];

  const assetNote = copied.length
    ? `\n\n## Supplied assets (served from /public)\n${copied.map((c) => `- ${c}`).join("\n")}\n`
    : `\n\n## Supplied assets\nNone. Build product visuals in HTML/CSS from the brief's content; use placeholders for ${brandFiles.length ? "" : "logos, "}quotes and screenshots.\n`;
  const productNote = product
    ? `\n## Product folder\nPRODUCT.md holds ${product.name}'s brand values for set_brand, voice and verified facts.${brandFiles.length ? ` Brand files (served from /public): ${brandFiles.join(", ")}.` : ""}\n`
    : "";
  writeFileSync(path.join(dir, "BRIEF.md"), `# Brief\n\n${opts.brief.trim()}\n${assetNote}${productNote}`);
  mkdirSync(path.join(dir, ".lpa", "screens"), { recursive: true });

  return { slug, dir, assets: copied, product };
}
