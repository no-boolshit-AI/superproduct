/**
 * Style-guide checker for generated sites. Pure Node, no browser.
 * Flags anything that bypasses the Corporate Landing tokens: an unset brand,
 * raw colours, Tailwind palette/size/radius/shadow classes that don't exist in
 * the theme, inline visual styles, content that isn't in a centred container,
 * extra H1s, missing alt text, leftover starter copy and denylisted terms.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export type Severity = "error" | "warning";
export type Issue = { file: string; line: number; rule: string; message: string; severity: Severity };
export type LintReport = { ok: boolean; errors: number; warnings: number; placeholders: number; issues: Issue[] };

type Tokens = { colors: Set<string>; text: Set<string>; radius: Set<string>; shadow: Set<string>; utilities: Set<string> };

export function parseTokens(css: string): Tokens {
  const grab = (prefix: string) =>
    new Set(
      [...css.matchAll(new RegExp(`--${prefix}-([a-z0-9-]+?)\\s*:`, "g"))]
        .map((m) => m[1]!)
        .filter((n) => n !== "*" && !n.includes("--") && !/-(line-height|letter-spacing|font-weight)$/.test(n)),
    );
  const utilities = new Set([...css.matchAll(/@utility\s+([a-z0-9-]+)/g)].map((m) => m[1]!));
  return { colors: grab("color"), text: grab("text"), radius: grab("radius"), shadow: grab("shadow"), utilities };
}

const PALETTE =
  /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d{2,3})?$/;
const DEFAULT_TEXT_SIZES = /^(xs|sm|base|lg|xl|[2-9]xl)$/;
const COLOR_PREFIXES = ["bg", "text", "border", "ring", "fill", "stroke", "from", "to", "via", "divide", "outline", "decoration", "placeholder", "caret", "accent", "shadow"];
const ARBITRARY_FORBIDDEN = ["text", "bg", "border", "shadow", "rounded", "font", "tracking", "leading", "from", "to", "via", "fill", "stroke", "ring", "outline", "decoration", "divide"];
const MISSING_WEIGHTS = /^font-(thin|extralight|light|extrabold|black)$/;
const INLINE_VISUAL = /\b(color|background|backgroundColor|backgroundImage|boxShadow|fontWeight|fontFamily|fontSize|borderRadius|letterSpacing|lineHeight|borderColor)\s*:/;

const CLASS_TOKEN = /^(?=[a-z!\[-])[a-z0-9!@*&\[\]:\/._%(),#'=>~+-]+(?<![.,])$/;
const DEFAULT_TOKENS: Tokens = {
  colors: new Set(),
  text: new Set(["hero", "display", "title", "heading", "subheading", "lead", "body", "label", "small", "kicker", "micro"]),
  radius: new Set(["sm", "md", "lg", "xl", "button", "full"]),
  shadow: new Set(["sm", "md", "lg", "brand"]),
  utilities: new Set(),
};

type Report = (rule: string, message: string, severity?: Severity) => void;

/** Validate one Tailwind class (variants already stripped). */
export function checkClass(cls: string, report: Report, tokens: Tokens = DEFAULT_TOKENS): void {
  const arb = cls.match(/^([a-z]+(?:-[xytrblse]{1,2})?)-\[(.+)\]$/);
  if (arb) {
    const prop = arb[1]!.split("-")[0]!;
    const val = arb[2]!;
    if (ARBITRARY_FORBIDDEN.includes(prop) && !(prop === "bg" && val.startsWith("url("))) {
      report("arbitrary-value", `\`${cls}\` bypasses the tokens. Use a theme class.`);
    }
    return;
  }
  if (MISSING_WEIGHTS.test(cls)) return report("font-weight", `\`${cls}\` does not exist. Use font-normal, font-medium, font-semibold or font-bold.`);
  if (/^shadow(-[a-z0-9]+)?$/.test(cls)) {
    const name = cls.slice(7);
    const sizes = [...tokens.shadow].filter((s) => !tokens.colors.has(s));
    if (name === "" || (!tokens.shadow.has(name) && name !== "none" && !tokens.colors.has(name.replace(/\/\d+$/, "")))) {
      return report("shadow", `\`${cls}\` does not exist. Use ${sizes.map((s) => `shadow-${s}`).join(", ")} (sparingly).`);
    }
    return;
  }
  const rounded = cls.match(/^rounded(?:-[trblse]{1,2})?(?:-([a-z0-9]+))?$/);
  if (rounded) {
    const name = rounded[1];
    if (/^[trblse]{1,2}$/.test(cls.slice(8)) || name === undefined) {
      return report("radius", `\`${cls}\` does not exist. Use rounded-${[...tokens.radius].join("/")}.`);
    }
    if (!tokens.radius.has(name) && name !== "none") return report("radius", `\`${cls}\` does not exist. Use rounded-${[...tokens.radius].join("/")}.`);
    return;
  }
  if (/^(tracking|leading)-(tighter|tight|normal|wide|wider|widest|snug|relaxed|loose)$/.test(cls)) {
    return report("typography", `\`${cls}\` does not exist. Line height and tracking come from the text-* token.`, "warning");
  }
  if (/^(w-screen|min-w-screen|max-w-screen(-[a-z0-9]+)?|max-w-none)$/.test(cls)) {
    return report("container", `\`${cls}\`: content stays in a centred container (container-page/wide/narrow). Only backgrounds run full-bleed.`, "warning");
  }
  const dash = cls.indexOf("-");
  if (dash < 0) return;
  const prefix = cls.slice(0, dash);
  const name = cls.slice(dash + 1).replace(/\/\d+$/, "");
  if (prefix === "text" && DEFAULT_TEXT_SIZES.test(name)) {
    return report("text-size", `\`${cls}\`: use text-${[...tokens.text].join("/")}.`);
  }
  if (COLOR_PREFIXES.includes(prefix) && PALETTE.test(name)) {
    report("palette", `\`${cls}\`: the default Tailwind palette is disabled. Use brand-*, second-*, accent, fg, fg-muted, border, surface, inverse… tokens.`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "out", ".lpa"].includes(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

function stripVariants(cls: string): string {
  // hover:md:bg-accent/50 -> bg-accent/50 ; !bg-x -> bg-x ; -mt-4 -> mt-4
  return cls.split(":").pop()!.replace(/^!/, "").replace(/^-/, "");
}

/** Read-only design-system folders. Linted only on request (they are checked in CI, not by the agent). */
const SYSTEM_DIRS = ["ui", "site", "library"];

/** Names of the library hero components (each renders the page's single H1). */
export function libraryHeroes(siteDir: string): string[] {
  const idx = path.join(siteDir, "components", "library", "index.ts");
  if (!existsSync(idx)) return [];
  return [...readFileSync(idx, "utf8").matchAll(/export \{ (Hero\w+) \}/g)].map((m) => m[1]!);
}

export function lintSite(siteDir: string, opts: { denylist?: string[]; brief?: string; includeSystem?: boolean } = {}): LintReport {
  const tokensPath = path.join(siteDir, "styles", "tokens.css");
  const tokens = existsSync(tokensPath) ? parseTokens(readFileSync(tokensPath, "utf8")) : DEFAULT_TOKENS;
  // The brief plus the product folder's PRODUCT.md: terms that appear in either are the product's own words.
  const readIf = (f: string) => (existsSync(path.join(siteDir, f)) ? readFileSync(path.join(siteDir, f), "utf8") : "");
  const brief = (opts.brief ?? `${readIf("BRIEF.md")}\n${readIf("PRODUCT.md")}`).toLowerCase();
  const systemRe = new RegExp(`components[\\\\/](${SYSTEM_DIRS.join("|")})[\\\\/]`);
  const files = [...walk(path.join(siteDir, "app")), ...walk(path.join(siteDir, "components")), path.join(siteDir, "site.config.ts")].filter(
    (f) => existsSync(f) && (opts.includeSystem || !systemRe.test(f)) && !f.endsWith("fonts.ts"),
  );

  const issues: Issue[] = [];
  let placeholders = 0;
  const add = (file: string, line: number, rule: string, message: string, severity: Severity = "error") =>
    issues.push({ file: path.relative(siteDir, file), line, rule, message, severity });

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    const isCss = file.endsWith(".css");

    lines.forEach((raw, i) => {
      const ln = i + 1;
      const line = raw.trim();
      if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) return;

      // 1. Raw colour literals
      for (const m of raw.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
        const before = raw.slice(Math.max(0, m.index! - 12), m.index);
        if (/href\s*[=:]\s*["'{`]?$/.test(before) || (/["'`]$/.test(before) && /href/.test(raw))) continue;
        if (![3, 4, 6, 8].includes(m[1]!.length)) continue;
        add(file, ln, "raw-color", `Raw colour ${m[0]}. Use a colour token (bg-accent, text-fg-muted, border-border, bg-brand-100…); brand colours come from set_brand.`);
      }
      if (/\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/.test(raw)) add(file, ln, "raw-color", "Raw colour function. Use a colour token.");

      if (isCss) return;

      // 2. Inline visual styles
      const styleIdx = raw.indexOf("style={{");
      if (styleIdx >= 0 && INLINE_VISUAL.test(raw.slice(styleIdx))) {
        add(file, ln, "inline-style", "Inline colour/typography/shadow/radius style. Use token utilities instead.");
      }

      // 4. Images need alt text
      if (/<img\b/.test(raw) && !/\balt=/.test(raw) && !/\balt=/.test(lines.slice(i, i + 4).join(" "))) {
        add(file, ln, "img-alt", "<img> without alt text.");
      }

      // 5. Fonts come from set_brand only
      if (/next\/font\/google|fonts\.googleapis|@fontsource/.test(raw)) add(file, ln, "font", "Fonts are set with the set_brand tool (self-hosted). Don't import fonts yourself.");

      // 6. Placeholders (counted, not errors)
      placeholders += (raw.match(/<Placeholder\b/g) ?? []).length + (raw.match(/\[(?:Placeholder|Metric|Customer[^\]]*|Quote|Logo|Screenshot)[^\]]*\]/g) ?? []).length;

      // 7. Copy hygiene
      if (/lorem ipsum/i.test(raw)) add(file, ln, "copy", "Lorem ipsum left in copy.");
      if (/\bTODO\b|\bFIXME\b/.test(raw)) add(file, ln, "copy", "TODO/FIXME left in code.", "warning");
      for (const term of opts.denylist ?? []) {
        if (term && raw.toLowerCase().includes(term.toLowerCase()) && !brief.includes(term.toLowerCase())) {
          add(file, ln, "denylist", `Denylisted term "${term}".`);
        }
      }
    });

    if (isCss) continue;

    // 3. Class-level checks, on string literals that look like class lists
    for (const m of src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
      const literal = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
      const toks = literal.split(/\s+/).filter(Boolean);
      if (!toks.length || !toks.some((t) => t.includes("-") || t.includes(":"))) continue;
      if (!toks.every((t) => CLASS_TOKEN.test(t))) continue;
      const ln = src.slice(0, m.index).split("\n").length;
      const lineText = lines[ln - 1]?.trim() ?? "";
      if (lineText.startsWith("//") || lineText.startsWith("*") || lineText.startsWith("/*") || /^import\b|from\s+["']/.test(lineText)) continue;
      for (const tok of toks) checkClass(stripVariants(tok), (rule, msg, sev) => add(file, ln, rule, msg, sev), tokens);
    }

    // 8. Centred container: a hand-written <section> must hold its content in a container.
    if (!systemRe.test(file) && /<section\b/.test(src) && !/container-(page|wide|narrow)|mx-auto[^"'`]*max-w-|max-w-[^"'`]*mx-auto/.test(src)) {
      const ln = src.slice(0, src.search(/<section\b/)).split("\n").length;
      add(file, ln, "container", "This <section> has no centred container. Wrap its content in container-page (or -wide/-narrow), or use <Section>, which does it for you.");
    }
  }

  // Brand
  const brandPath = path.join(siteDir, "styles", "brand.css");
  if (existsSync(brandPath) && /DEFAULT BRAND/.test(readFileSync(brandPath, "utf8"))) {
    add(brandPath, 1, "brand", "The brand is still the neutral default. Call set_brand with the product's own colours and fonts.");
  }

  // Page-level checks (page + the agent's own sections)
  const pagePath = path.join(siteDir, "app", "page.tsx");
  const customFiles = walk(path.join(siteDir, "components", "custom")).filter((f) => f.endsWith(".tsx"));
  const pageSources = [pagePath, ...customFiles].filter((f) => existsSync(f)).map((f) => readFileSync(f, "utf8"));
  const count = (re: RegExp) => pageSources.reduce((n, src) => n + (src.match(re) ?? []).length, 0);
  if (existsSync(pagePath)) {
    const heroes = libraryHeroes(siteDir);
    const heroUses = heroes.length ? count(new RegExp(`<(${heroes.join("|")})\\b`, "g")) : 0;
    const h1 = count(/<h1\b|<Display\b/g) + heroUses;
    if (h1 !== 1) add(pagePath, 1, "h1", `Page must have exactly one H1 (found ${h1}). Use one library hero or one <Display>.`);
    const dark = count(/tone="(inverse|inverse-glow|brand-deep|accent)"|tone-(inverse|accent)\b/g);
    if (dark > 3) add(pagePath, 1, "rhythm", `${dark} dark or accent bands; use at most three so they keep their weight.`, "warning");
    if (/STARTER PAGE/.test(readFileSync(pagePath, "utf8"))) add(pagePath, 1, "starter-leftover", "app/page.tsx is still the starter page. Replace it.");
  }
  const configPath = path.join(siteDir, "site.config.ts");
  if (existsSync(configPath) && /"Your brand"|"Your company"|© 2026 Your company/.test(readFileSync(configPath, "utf8"))) {
    add(configPath, 1, "starter-leftover", "site.config.ts still has placeholder values.");
  }
  const planPath = path.join(siteDir, "PLAN.md");
  if (!existsSync(planPath)) add(planPath, 1, "plan", "PLAN.md is missing: plan the sections from the brief first.", "warning");
  if (customFiles.length < 2) {
    add(
      path.join(siteDir, "components", "custom"),
      1,
      "custom-sections",
      `Only ${customFiles.length} section(s) in components/custom/. Design at least two sections specific to this product (new, or adapted from the library).`,
      "warning",
    );
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  return { ok: errors === 0, errors, warnings: issues.length - errors, placeholders, issues };
}

export function formatReport(r: LintReport): string {
  const head = r.ok
    ? `Style check passed (${r.warnings} warnings, ${r.placeholders} placeholders).`
    : `Style check FAILED: ${r.errors} errors, ${r.warnings} warnings, ${r.placeholders} placeholders.`;
  const body = r.issues
    .slice(0, 60)
    .map((i) => `- [${i.severity}] ${i.file}:${i.line} (${i.rule}) ${i.message}`)
    .join("\n");
  return body ? `${head}\n${body}${r.issues.length > 60 ? `\n…and ${r.issues.length - 60} more` : ""}` : head;
}
