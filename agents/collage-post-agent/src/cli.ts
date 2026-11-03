#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { checkKeys, defaults, type JobOptions } from "./config.js";
import { describeAuth, runJob } from "./agent.js";
import { PALETTE_NAMES } from "./palettes.js";
import { closeBrowser } from "./tools/render.js";
import type { JobEvent } from "./events.js";

const HELP = `
Collage post agent: designs social posts as HTML + PNG in the collage style.

Usage
  npm run post -- "brief text"                 new post (agent decides length + palette)
  npm run post -- --file brief.md              brief from a file (topic, angle, or finished copy)
  npm run post -- --revise <job-id> "change slide 3 to a quote from Hannah Arendt"

Options
  --slides <n|auto>     number of slides (default: auto)
  --palette <name|auto> ${PALETTE_NAMES.join(", ")} (default: auto)
  --brand <text>        masthead text (default: the product's wordmark, else $BRAND_NAME or "Your Brand")
  --product <dir|id>    product folder, or the id of one in workspace/products (default: $PRODUCT_DIR, else
                        workspace/product); "none" to ignore it
  --model <name>        Claude model for the agent (default: $AGENT_MODEL or "opus")
  --image-model <id>    gpt-image-2.5-flare (default) | gpt-image-2.5-sunburst | …
  --quality <q>         image quality low|medium|high|xhigh|max|auto (default: medium)
  --max-images <n>      generated images per job (default: 10)
  --cc-by               also allow CC BY / CC BY-SA photos from Wikimedia (credits written to CREDITS.md)
  --scale <1|2>         PNG export: 1 = 1080x1350, 2 = 2160x2700 (default: 1)
  --budget <usd>        max Claude spend for this run (default: 6)
  -h, --help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string", short: "f" },
    revise: { type: "string" },
    slides: { type: "string" },
    palette: { type: "string" },
    brand: { type: "string" },
    product: { type: "string" },
    model: { type: "string" },
    "image-model": { type: "string" },
    quality: { type: "string" },
    "max-images": { type: "string" },
    "cc-by": { type: "boolean" },
    scale: { type: "string" },
    budget: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(HELP);
  process.exit(0);
}

// --product decides which product folder defaults() reads (palette, masthead, fonts, context)
if (values.product) process.env.PRODUCT_DIR = values.product;
const o: JobOptions = defaults();
let text = positionals.join(" ").trim();
if (values.file) text = (await readFile(path.resolve(values.file), "utf8")).trim() + (text ? `\n\n${text}` : "");
if (!text) {
  console.error(values.revise ? "Give the revision instructions after the job id." : "Give a brief (text or --file).");
  console.log(HELP);
  process.exit(1);
}

o.brief = text;
if (values.slides) o.slides = values.slides === "auto" ? "auto" : Math.max(1, Math.min(10, Number(values.slides)));
if (values.palette) {
  if (values.palette !== "auto" && !PALETTE_NAMES.includes(values.palette)) {
    console.error(`Unknown palette "${values.palette}". Choose: auto, ${PALETTE_NAMES.join(", ")}`);
    process.exit(1);
  }
  o.palette = values.palette;
}
if (values.brand) o.brand = values.brand;
if (values.model) o.model = values.model;
if (values["image-model"]) o.imageModel = values["image-model"];
if (values.quality) o.imageQuality = values.quality as JobOptions["imageQuality"];
if (values["max-images"]) o.maxImages = Number(values["max-images"]);
if (values["cc-by"]) o.allowAttribution = true;
if (values.scale) o.scale = values.scale === "2" ? 2 : 1;
if (values.budget) o.maxBudgetUsd = Number(values.budget);

const missing = checkKeys();
if (missing.length) {
  console.error(`Missing ${missing.join(" and ")}. Copy .env.example to .env and fill it in.`);
  process.exit(1);
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
console.log(dim(`Claude auth: ${describeAuth()}`));
if (!values.revise) console.log(dim(o.product ? `Product: ${o.product} · palette ${o.palette} · masthead "${o.brand}"${o.brandFonts ? " · brand fonts" : ""}` : `No product folder · palette ${o.palette} · masthead "${o.brand}"`));

function log(e: JobEvent) {
  switch (e.type) {
    case "status":
      console.log(bold(`▸ ${e.message}`));
      break;
    case "text":
      console.log(`\n${e.text}\n`);
      break;
    case "tool":
      console.log(dim(`  · ${e.summary}`));
      break;
    case "image":
      console.log(dim(`    ${e.source === "commons" ? "⌕" : "✦"} ${e.path}`));
      break;
    case "render":
      console.log(dim(`    rendered ${e.images.length} slide(s), ${e.warnings} warning(s)`));
      break;
    case "cost":
      console.log(dim(`  $${e.usd.toFixed(2)} Claude spend, ${e.turns} turns`));
      break;
    case "error":
      console.error(`✗ ${e.message}`);
      break;
    case "done": {
      const j = e.job;
      console.log(`\n${bold(j.status === "done" ? "Done." : `Finished with status: ${j.status}`)}${j.error ? ` (${j.error})` : ""}`);
      console.log(`  folder   ${j.dir}`);
      if (j.slides.length) {
        console.log(`  gallery  ${path.join(j.dir, "index.html")}`);
        console.log(`  zip      ${path.join(j.dir, j.zip ?? "")}`);
        for (const s of j.slides) console.log(dim(`  ${s.html}  →  ${s.png}`));
      }
      console.log(dim(`  revise:  npm run post -- --revise ${j.id} "…"`));
      break;
    }
  }
}

const ac = new AbortController();
process.on("SIGINT", () => {
  console.log("\nCancelling… (press Ctrl+C again to force quit)");
  ac.abort();
  process.once("SIGINT", () => process.exit(130));
});

try {
  const job = await runJob({
    options: o,
    emit: log,
    signal: ac.signal,
    ...(values.revise ? { reviseJobId: values.revise, instructions: text } : {}),
  });
  process.exitCode = job.status === "done" ? 0 : 1;
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await closeBrowser();
}
