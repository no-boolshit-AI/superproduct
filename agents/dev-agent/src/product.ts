/**
 * Product folder → dev runs.
 *
 * The product folder (see lib/product.mjs; the workspace's product/ by default) describes the product a repository belongs to:
 * what it is, its glossary, architecture notes, voice and visual rules. A run on that repository gets the compiled
 * context (profiles "development" and, with UI work in mind, "design") plus the brand's CSS variables in its prompts.
 *
 * dev-agent works on many repositories, so a product folder applies only when it is meant for this one:
 * 1. --product <dir|none> on the command line;
 * 2. the project profile's "product" (a path, or "none");
 * 3. $PRODUCT_DIR or the workspace's product/, but only if its product.json → repos lists the repository.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { findProductDir, loadProduct, type Product } from "../../../lib/product.mjs";
import { ROOT } from "./paths.js";

export type { Product };

export interface ProductChoice {
  product: Product | null;
  source: "flag" | "profile" | "env" | "nearest" | "none";
  /** Why a product folder was found but not used. */
  note?: string;
}

const OFF = /^(none|off|false|0)$/i;

/** "owner/name" for GitHub-style references: acme/shop, https://github.com/acme/shop(.git), git@github.com:acme/shop.git. */
export function repoKey(ref: string): string {
  const m = ref.trim().match(/(?:github\.com[/:])?([^/:\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : ref.trim().toLowerCase();
}

/** The product folder for a project's runs (see the module comment for the order). */
export function resolveProductFor(profile: { repo: { owner: string; name: string; url?: string }; product?: string }, explicit?: string): ProductChoice {
  const pick = (value: string | undefined, source: "flag" | "profile"): ProductChoice | undefined => {
    if (value === undefined || value.trim() === "") return undefined;
    const v = value.trim();
    if (OFF.test(v)) return { product: null, source: "none" };
    const abs = path.resolve(source === "profile" ? ROOT : process.cwd(), v);
    // a bare id that isn't a folder here names a product in the workspace's products/, as for the other agents
    const dir = findProductDir({ explicit: existsSync(abs) || !/^[\w-][\w.-]*$/.test(v) ? abs : v, env: {} });
    return { product: dir ? loadProduct(dir) : null, source };
  };
  const chosen = pick(explicit, "flag") ?? pick(profile.product, "profile");
  if (chosen) return chosen;
  const dir = findProductDir({ from: ROOT });
  if (!dir) return { product: null, source: "none" };
  const product = loadProduct(dir);
  const key = repoKey(`${profile.repo.owner}/${profile.repo.name}`);
  const listed = (product.manifest.repos ?? []).some((r) => repoKey(String(r)) === key);
  if (listed) return { product, source: process.env.PRODUCT_DIR?.trim() ? "env" : "nearest" };
  return {
    product: null,
    source: "none",
    note: `The product folder ${dir} (${product.name}) doesn't list ${key} in product.json → repos, so this run doesn't use it. Add the repo there, set "product" in the project profile, or pass --product.`,
  };
}

/** The product section for the agents' prompts: compiled context plus the brand's CSS variables when the design profile is on. */
export function productContextFor(p: Product): string {
  const profiles = p.profilesFor("dev");
  const parts = [p.context("dev", { maxChars: 20000, purpose: "software development on this product" })];
  const css = p.manifest.brand?.css;
  if (profiles.includes("design") && css && existsSync(p.resolve(css))) {
    const text = readFileSync(p.resolve(css), "utf8");
    if (text.length < 8000)
      parts.push(
        `### Design tokens (${path.basename(p.dir)}/${css})\nUse these values for UI work (map them onto the project's own styling system; don't add a second one):\n\n\`\`\`css\n${text.trim()}\n\`\`\``,
      );
  }
  return parts.join("\n\n");
}
