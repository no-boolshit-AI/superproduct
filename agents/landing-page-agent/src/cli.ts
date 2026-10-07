#!/usr/bin/env node
/**
 * CLI
 *   npm run page -- "Brief text…"                 build a page from an inline brief
 *   npm run page -- --brief-file briefs/acme.md   build from a file (or pipe via stdin)
 *   npm run page -- --check sites/acme            lint + build + interactions + screenshots, no model
 *   npm run page -- --dry-run                     smoke-test the toolchain on the starter page
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildLandingPage, type AgentEvent } from "./agent.js";
import { buildSite } from "./build.js";
import { config } from "./config.js";
import { formatInteractions, testInteractions } from "./interactions.js";
import { formatReport, lintSite } from "./lint.js";
import { resolveProduct } from "./product.js";
import { scaffoldSite } from "./scaffold.js";
import { screenshotSite } from "./screenshot.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "brief-file": { type: "string", short: "f" },
    slug: { type: "string", short: "s" },
    assets: { type: "string", short: "a", multiple: true },
    model: { type: "string", short: "m" },
    budget: { type: "string" },
    "max-turns": { type: "string" },
    check: { type: "string" },
    replace: { type: "boolean" },
    product: { type: "string", short: "p" },
    "dry-run": { type: "boolean" },
    quiet: { type: "boolean", short: "q" },
    help: { type: "boolean", short: "h" },
  },
});

const HELP = `Corporate Landing agent

Usage:
  npm run page -- "<brief>"                 Build a page from an inline brief
  npm run page -- -f brief.md               Build from a brief file (or pipe the brief on stdin)
  npm run page -- --check <site dir|slug>   Lint, build, test interactions and screenshot a site (no model)
  npm run page -- --dry-run                 Smoke-test setup on the starter page (no model)
  npm run gallery                           Build the reference library gallery and its screenshots

Options:
  -s, --slug <name>        Folder name under sites/ (default: from the brief's first line)
      --replace            Overwrite sites/<slug> if it exists (with --slug)
  -a, --assets <path>      File or folder copied into public/assets (repeatable)
  -p, --product <dir>      Product folder (brand, voice, facts), or "none" (default: $PRODUCT_DIR, then the
                           nearest product/ folder above the agent)
  -m, --model <id|alias>   Model (default: ${config.model})
      --budget <usd>       Max spend for this run (default: ${config.maxBudgetUsd})
      --max-turns <n>      Max agent turns (default: ${config.maxTurns})
  -q, --quiet              Only print the final result`;

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function resolveSite(arg: string): string {
  const direct = path.resolve(arg);
  if (existsSync(path.join(direct, "app"))) return direct;
  const inSites = path.join(config.sitesDir, arg);
  if (existsSync(path.join(inSites, "app"))) return inSites;
  throw new Error(`No site found at ${arg}`);
}

async function verify(dir: string, opts: { allowExample?: boolean } = {}): Promise<boolean> {
  const report = lintSite(dir, { denylist: config.denylist });
  if (opts.allowExample) {
    report.issues = report.issues.filter((i) => !["starter-leftover", "plan", "custom-sections", "brand"].includes(i.rule));
    report.errors = report.issues.filter((i) => i.severity === "error").length;
    report.warnings = report.issues.length - report.errors;
    report.ok = report.errors === 0;
  }
  console.log(formatReport(report));
  process.stdout.write("Building… ");
  const build = await buildSite(dir);
  console.log(build.ok ? green(`ok (${(build.durationMs / 1000).toFixed(1)}s)`) : red("failed"));
  if (!build.ok) {
    console.log(build.output);
    return false;
  }
  const ix = await testInteractions(dir);
  console.log(formatInteractions(ix));
  process.stdout.write("Screenshots… ");
  const { shots, pageHeights } = await screenshotSite(dir);
  console.log(green(`${shots.length} slices`), dim(JSON.stringify(pageHeights)));
  console.log(dim(`  ${path.join(dir, ".lpa", "screens")}`));
  return report.ok && ix.ok;
}

function printEvent(e: AgentEvent) {
  if (values.quiet && e.type !== "done") return;
  switch (e.type) {
    case "scaffolded":
      console.log(`${bold("Site")} ${e.slug} ${dim(e.dir)}`);
      break;
    case "text":
      console.log(`\n${e.text}\n`);
      break;
    case "tool":
      console.log(dim(`  → ${e.detail}`));
      break;
    case "verify":
      console.log(
        `\n${bold("Verify")} lint ${e.lint.ok ? green("pass") : red(`${e.lint.errors} errors`)} · build ${e.build ? green("pass") : red("fail")} · interactions ${e.interactions ? (e.interactions.ok ? green(`pass (${e.interactions.checks})`) : red(`${e.interactions.failed} failed`)) : dim("skipped")} · ${e.lint.placeholders} placeholders`,
      );
      break;
    case "done": {
      const r = e.result;
      console.log(`\n${r.ok ? green("✔ Done") : red(`✖ ${r.status}`)}  ${dim(`$${r.costUsd.toFixed(2)} · ${r.turns} turns · ${(r.durationMs / 1000).toFixed(0)}s`)}`);
      if (r.error) console.log(red(r.error));
      if (r.interactions && !r.interactions.ok) console.log(r.interactions.report);
      if (r.summary) console.log(`\n${r.summary}\n`);
      if (r.buildOk) {
        console.log(`Static site: ${r.outDir}`);
        console.log(`Preview:     npx serve ${path.relative(process.cwd(), r.outDir) || "."}   (or npm run serve → /preview/${r.slug}/)`);
      }
      console.log(`Source:      ${r.dir}`);
      break;
    }
  }
}

async function main() {
  if (values.help) return console.log(HELP);

  if (values.check) {
    const ok = await verify(resolveSite(values.check));
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (values["dry-run"]) {
    const product = resolveProduct(values.product);
    const site = scaffoldSite({ slug: "dry-run", brief: "Dry run of the starter page. No model is called.", overwrite: true, product });
    console.log(`${bold("Dry run")} ${dim(site.dir)}${product ? dim(` · product ${product.name}: PRODUCT.md + ${Object.values(site.product?.files.logos ?? {}).filter(Boolean).length} logo file(s)`) : ""}`);
    const ok = await verify(site.dir, { allowExample: true });
    console.log(ok ? green("\nToolchain OK. Log in to Claude (or set ANTHROPIC_API_KEY) and run with a brief.") : red("\nToolchain check failed."));
    process.exitCode = ok ? 0 : 1;
    return;
  }

  let brief = positionals.join(" ").trim();
  if (values["brief-file"]) brief = readFileSync(values["brief-file"], "utf8");
  if (!brief) brief = (await readStdin()).trim();
  if (!brief) {
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  const product = resolveProduct(values.product);
  console.log(dim(product ? `Product: ${product.name} (${product.dir}) · PRODUCT.md and logos go into the site` : "Product: none (brand from the brief)"));

  const abortController = new AbortController();
  process.once("SIGINT", () => {
    console.log(red("\nStopping…"));
    abortController.abort();
  });

  const result = await buildLandingPage(
    {
      brief,
      slug: values.slug,
      assets: values.assets,
      model: values.model,
      maxBudgetUsd: values.budget ? Number(values.budget) : undefined,
      maxTurns: values["max-turns"] ? Number(values["max-turns"]) : undefined,
      replace: values.replace,
      product: values.product,
    },
    { onEvent: printEvent, abortController },
  );
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(red((err as Error).stack ?? String(err)));
  process.exitCode = 1;
});
