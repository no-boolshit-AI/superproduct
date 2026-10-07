#!/usr/bin/env node
/**
 * Product folder helper. Zero dependencies, Node 20+.
 *
 *   node scripts/product.mjs show                     what the agents will use: name, CTA, colours, fonts, offers, doc status
 *   node scripts/product.mjs check [--json]           validate product/ (files, tokens, contrast, frontmatter, freshness)
 *   node scripts/product.mjs context <agent|profiles> print the compiled context an agent gets (e.g. carousel, or content,sales)
 *   node scripts/product.mjs tokens                   regenerate brand/tokens.css from the design tokens
 *   node scripts/product.mjs index                    refresh the file index at the end of product/README.md
 *   node scripts/product.mjs fetch [--dry-run]        download the assets listed in assets/manifest.json that are missing and have a source URL
 *   node scripts/product.mjs init [--name "Acme"] [--id acme] [--website https://…] [--archive]
 *                                                     start a new product from templates/product (--archive moves the current one to products-archive/)
 *
 * Options: --product <dir> (default: $PRODUCT_DIR, else ./product).
 * The product folder spec is in product/README.md; a blank copy lives in templates/product/.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkProduct, contrast, findProductDir, listDocs, loadProduct, parseFrontmatter, ProductError, tokensToCss } from "../lib/product.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = path.join(ROOT, "templates", "product");
const tty = process.stdout.isTTY;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = c(1), dim = c(2), green = c(32), red = c(31), yellow = c(33);

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name) => argv.includes(name);
const valueFlags = new Set(["--product", "--name", "--id", "--website", "--max"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !valueFlags.has(argv[i - 1]));
const [cmd, arg] = positional;

function die(msg) {
  console.error(red(`✗ ${msg}`));
  process.exit(1);
}

function productDir({ required = true } = {}) {
  let dir;
  try {
    dir = findProductDir({ explicit: opt("--product"), from: ROOT });
  } catch (e) {
    die(e.message);
  }
  if (!dir && required) die(`No product folder found. Create one with: node scripts/product.mjs init --name "<Product>" --website <url>`);
  return dir;
}

function load() {
  try {
    return loadProduct(productDir());
  } catch (e) {
    die(e instanceof ProductError ? e.message : e.stack);
  }
}

const swatch = (hex) => (tty ? `\x1b[48;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m  \x1b[0m ${hex}` : hex);

switch (cmd) {
  case undefined:
  case "help":
  case "--help": {
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    console.log(src.slice(src.indexOf(" *   node"), src.indexOf(" * Options")).replace(/^ \* ?/gm, ""));
    break;
  }

  case "show": {
    const p = load();
    const m = p.manifest;
    console.log(`${bold(p.name)} ${dim(`(${path.relative(process.cwd(), p.dir) || "."})`)}`);
    if (p.tagline) console.log(`  ${p.tagline}`);
    if (p.website) console.log(`  ${p.website}`);
    if (m.cta?.primary) console.log(`  CTA: ${m.cta.primary.label} → ${m.cta.primary.url}`);
    console.log(bold("\nColour roles"));
    const r = p.roles;
    for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(10)} ${swatch(v)}`);
    console.log(dim(`  on-primary on primary ${contrast(r.onPrimary, r.primary).toFixed(2)}:1 · text on background ${contrast(r.text, r.background).toFixed(2)}:1 · on-inverse on inverse ${contrast(r.onInverse, r.inverse).toFixed(2)}:1`));
    console.log(bold("\nType"));
    for (const role of ["sans", "serif", "mono"]) if (p.fontStack(role)) console.log(`  ${role.padEnd(6)} ${p.fontStack(role)}`);
    for (const f of p.fonts) console.log(dim(`  ${f.family}: ${f.files.filter((x) => x.exists).length}/${f.files.length} files${f.license ? ` · ${f.license}` : ""}`));
    console.log(bold("\nOfferings"));
    for (const o of p.offerings) console.log(`  ${o.name}${o.audience ? dim(` · ${o.audience}`) : ""}${o.price?.from != null ? dim(` · from ${o.price.currency ?? ""} ${o.price.from}`) : ""}${o.status && o.status !== "live" ? yellow(` · ${o.status}`) : ""}`);
    console.log(bold("\nAgents"));
    for (const id of Object.keys({ ...(m.agents ?? {}) })) console.log(`  ${id.padEnd(13)} profiles: ${p.profilesFor(id).join(", ")}${Object.keys(m.agents[id]).filter((k) => k !== "profiles").length ? dim(` · overrides: ${Object.keys(m.agents[id]).filter((k) => k !== "profiles").join(", ")}`) : ""}`);
    const res = checkProduct(p.dir);
    console.log(bold("\nDocs"));
    console.log(`  ${Object.entries(res.info.docs).map(([s, n]) => `${n} ${s}`).join(" · ")} · ${res.info.placeholders} placeholders`);
    console.log(`\n${res.ok ? green("✓ check passes") : red(`✗ ${res.errors.length} error(s)`)}${res.warnings.length ? yellow(` · ${res.warnings.length} warning(s)`) : ""} ${dim("(node scripts/product.mjs check)")}`);
    break;
  }

  case "check": {
    const dir = productDir();
    const res = checkProduct(dir);
    // tokens.css must match the tokens
    if (res.product?.manifest.brand?.css && res.product.manifest.brand.tokens) {
      const cssPath = res.product.resolve(res.product.manifest.brand.css);
      const expected = generatedCss(res.product);
      if (!existsSync(cssPath)) res.warnings.push(`${res.product.manifest.brand.css} is missing: run node scripts/product.mjs tokens`);
      else if (readFileSync(cssPath, "utf8") !== expected) res.warnings.push(`${res.product.manifest.brand.css} is out of date: run node scripts/product.mjs tokens`);
    }
    if (flag("--json")) {
      console.log(JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, info: res.info }, null, 2));
      process.exit(res.ok ? 0 : 1);
    }
    console.log(`${bold("Product")} ${res.product?.name ?? "?"} ${dim(dir)}`);
    for (const e of res.errors) console.log(red(`  ✗ ${e}`));
    for (const w of res.warnings) console.log(yellow(`  ! ${w}`));
    const docs = Object.entries(res.info.docs).map(([s, n]) => `${n} ${s}`).join(", ");
    console.log(dim(`  docs: ${docs || "none"} · placeholders: ${res.info.placeholders} · offerings: ${res.info.offerings} · fonts: ${res.info.fonts} · assets: ${res.info.assets}${res.info.briefWords ? ` · BRIEF.md ${res.info.briefWords} words` : ""}`));
    console.log(res.ok ? green(`✓ OK${res.warnings.length ? ` with ${res.warnings.length} warning(s)` : ""}`) : red(`✗ ${res.errors.length} error(s)`));
    process.exit(res.ok ? 0 : 1);
  }

  case "context": {
    const p = load();
    if (!arg) die("context <agent id | profile[,profile…]>, e.g. context carousel or context content,sales");
    const known = new Set(["carousel", "collage-post", "deck", "landing-page", "dev", ...Object.keys(p.manifest.agents ?? {})]);
    const target = known.has(arg) ? arg : arg.split(",");
    process.stdout.write(p.context(target, { maxChars: Number(opt("--max")) || 24000 }));
    break;
  }

  case "tokens": {
    const p = load();
    const rel = p.manifest.brand?.css ?? "brand/tokens.css";
    const out = p.resolve(rel);
    writeFileSync(out, generatedCss(p));
    console.log(green(`✓ ${path.relative(process.cwd(), out)} (${p.tokens.size} tokens)`));
    break;
  }

  case "index": {
    const p = load();
    const readme = p.resolve("README.md");
    if (!existsSync(readme)) die("product/README.md is missing");
    const rows = listDocs(p.dir)
      .filter((rel) => rel !== "README.md" && !rel.startsWith("knowledge/sources/legacy/"))
      .map((rel) => {
        const { data, body } = parseFrontmatter(readFileSync(p.resolve(rel), "utf8"));
        const title = data.title ?? body.match(/^#\s+(.+)$/m)?.[1] ?? rel;
        return `| [${rel}](${rel}) | ${String(title).replace(/\|/g, "/")} | ${data.status ?? "?"} | ${data.updated ?? ""} |`;
      });
    const table = ["| File | Title | Status | Updated |", "|---|---|---|---|", ...rows].join("\n");
    const text = readFileSync(readme, "utf8");
    const start = "<!-- index:start -->";
    const end = "<!-- index:end -->";
    if (!text.includes(start) || !text.includes(end)) die(`Add ${start} and ${end} to product/README.md first`);
    const next = text.slice(0, text.indexOf(start) + start.length) + `\n${table}\n` + text.slice(text.indexOf(end));
    writeFileSync(readme, next);
    console.log(green(`✓ product/README.md index: ${rows.length} files`));
    break;
  }

  case "fetch": {
    // Downloads only what the manifest lists, from the URL it records, into the path it names inside the product folder.
    const p = load();
    const file = p.resolve("assets/manifest.json");
    if (!existsSync(file)) die("No assets/manifest.json in the product folder.");
    const assets = JSON.parse(readFileSync(file, "utf8")).assets ?? [];
    const todo = assets.filter((a) => a.path && /^https?:\/\//i.test(a.source ?? "") && !existsSync(p.resolve(a.path)));
    if (!todo.length) {
      console.log(green("✓ every asset with a source URL is present"));
      break;
    }
    let failed = 0;
    for (const a of todo) {
      const dest = p.resolve(a.path);
      if (!dest.startsWith(p.dir + path.sep)) {
        console.log(red(`✗ ${a.path}: outside the product folder, skipped`));
        failed++;
        continue;
      }
      if (flag("--dry-run")) {
        console.log(`${a.path} ← ${a.source}`);
        continue;
      }
      try {
        const res = await fetch(a.source, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, buf);
        console.log(green(`✓ ${a.path}`) + dim(` ${Math.round(buf.length / 1024)} KB ← ${a.source}`));
      } catch (e) {
        console.log(red(`✗ ${a.path}: ${e.message}`) + dim(` (${a.source})`));
        failed++;
      }
    }
    if (!flag("--dry-run")) console.log(dim(`Rights: check "rights" for each file in assets/manifest.json before publishing anything new with them.`));
    process.exitCode = failed ? 1 : 0;
    break;
  }

  case "init": {
    if (!existsSync(TEMPLATE)) die(`Template missing: ${TEMPLATE}`);
    const target = path.resolve(opt("--product") ?? process.env.PRODUCT_DIR ?? path.join(ROOT, "product"));
    if (existsSync(path.join(target, "product.json"))) {
      if (!flag("--archive")) die(`${path.relative(process.cwd(), target)} already holds a product. Use --archive to move it to products-archive/ first, or --product <new dir>.`);
      const old = JSON.parse(readFileSync(path.join(target, "product.json"), "utf8"));
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const dest = path.join(ROOT, "products-archive", `${old.id ?? "product"}-${stamp}`);
      mkdirSync(path.dirname(dest), { recursive: true });
      renameSync(target, dest);
      console.log(yellow(`! moved the current product to ${path.relative(process.cwd(), dest)}`));
    }
    const name = opt("--name") ?? "Your Product";
    const id = opt("--id") ?? name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const vars = { name, id: id || "product", website: opt("--website") ?? "https://example.com", date: new Date().toISOString().slice(0, 10) };
    cpSync(TEMPLATE, target, { recursive: true });
    let n = 0;
    const fill = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) fill(p);
        else if (/\.(md|json|css)$/.test(e.name)) {
          const s = readFileSync(p, "utf8");
          const t = s.replace(/\{\{(name|id|website|date)\}\}/g, (_, k) => vars[k]);
          if (t !== s) writeFileSync(p, t), n++;
        }
      }
    };
    fill(target);
    try {
      writeFileSync(path.join(target, "brand", "tokens.css"), generatedCss(loadProduct(target)));
    } catch {
      /* the template tokens are placeholders; check will say what to fix */
    }
    console.log(green(`✓ ${path.relative(process.cwd(), target) || "."}/ created from templates/product (${n} files personalised)`));
    console.log(`Next: ask the main agent to fill it ("initialise the product folder from ${vars.website}"), see skills/product/SKILL.md.`);
    console.log(dim(`Then: node scripts/product.mjs check`));
    break;
  }

  default:
    die(`Unknown command "${cmd}". Try: node scripts/product.mjs help`);
}

function generatedCss(p) {
  const header = `/* GENERATED by scripts/product.mjs tokens from ${p.manifest.brand?.tokens ?? "the design tokens"}. Do not edit by hand. */\n`;
  return header + tokensToCss(p.tokens);
}

