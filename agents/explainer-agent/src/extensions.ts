/**
 * explainer-agent's own additions to the HyperFrames skills, kept in extensions/hyperframes/ and laid over the vendored
 * plugin (vendor/hyperframes/) so the agent loads them like the rest (hyperframes:vox-collage, collage-* rules and
 * blueprints, the vox-collage frame preset):
 *   - every file mirrors its path in the plugin and is copied as is;
 *   - <name>.append.md is appended to <name>.md between markers, once (rules/blueprints indexes, the style list).
 * applyExtensions() is idempotent. npm run setup and npm run skills:update apply it, and every job applies it before
 * Claude starts, so a fresh HyperFrames release picks the extensions up again.
 */
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_DIR, ROOT, styleSpec, type Style } from "./config.js";

export const EXTENSIONS_DIR = path.join(ROOT, "extensions", "hyperframes");
const APPEND = ".append.md";
const startMarker = (rel: string) => `<!-- explainer-agent extension: ${rel} -->`;
const END_MARKER = "<!-- /explainer-agent extension -->";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function walk(dir: string, base = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else if (e.isFile()) out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out.sort();
}

export interface ExtensionReport {
  /** files copied into the plugin (new or changed) */
  copied: string[];
  /** plugin files whose extension block was added or updated */
  appended: string[];
  /** everything already in place */
  unchanged: string[];
  /** .append.md files whose target is missing in this HyperFrames release */
  missingTargets: string[];
}

/** What applyExtensions() would change (dry: nothing is written). */
export function extensionStatus(pluginDir = PLUGIN_DIR, extDir = EXTENSIONS_DIR): ExtensionReport {
  return apply(pluginDir, extDir, false);
}

/** Lay extensions/hyperframes over the plugin. Idempotent; returns what changed. */
export function applyExtensions(pluginDir = PLUGIN_DIR, extDir = EXTENSIONS_DIR): ExtensionReport {
  return apply(pluginDir, extDir, true);
}

function apply(pluginDir: string, extDir: string, write: boolean): ExtensionReport {
  const report: ExtensionReport = { copied: [], appended: [], unchanged: [], missingTargets: [] };
  for (const rel of walk(extDir)) {
    const src = path.join(extDir, rel);
    if (rel.endsWith(APPEND)) {
      const targetRel = `${rel.slice(0, -APPEND.length)}.md`;
      const target = path.join(pluginDir, targetRel);
      if (!fs.existsSync(target)) {
        report.missingTargets.push(targetRel);
        continue;
      }
      const block = `${startMarker(rel)}\n${fs.readFileSync(src, "utf8").trim()}\n${END_MARKER}`;
      const current = fs.readFileSync(target, "utf8");
      const re = new RegExp(`${escapeRe(startMarker(rel))}[\\s\\S]*?${escapeRe(END_MARKER)}`);
      const next = re.test(current) ? current.replace(re, () => block) : `${current.trimEnd()}\n\n${block}\n`;
      if (next === current) report.unchanged.push(targetRel);
      else {
        if (write) fs.writeFileSync(target, next);
        report.appended.push(targetRel);
      }
      continue;
    }
    const dest = path.join(pluginDir, rel);
    const same = fs.existsSync(dest) && fs.readFileSync(dest).equals(fs.readFileSync(src));
    if (same) report.unchanged.push(rel);
    else {
      if (write) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      report.copied.push(rel);
    }
  }
  return report;
}

/**
 * Stage a style's kit into the project (vox-collage: the collage kit → assets/collage/), from the plugin copy of its
 * skill. Returns the project-relative folder, or null when the style has no kit.
 */
export function stageStyleKit(projectDir: string, style: Style | undefined, pluginDir = PLUGIN_DIR): string | null {
  const spec = styleSpec(style);
  if (!spec.kit || !spec.skill) return null;
  const [from, to] = spec.kit;
  const src = path.join(pluginDir, "skills", spec.skill, from);
  if (!fs.existsSync(src)) throw new Error(`The ${spec.id} kit is missing (${path.relative(ROOT, src)}); run npm run setup`);
  const dest = path.join(projectDir, to);
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  return to;
}
