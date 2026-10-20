// Exercises every agent tool exactly as Claude would call it, without calling Claude.
// Uses mock images unless OPENAI_API_KEY is set.   npm run smoke
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createRunDir, loadBrand, ROOT, STYLE_IDS, type RunContext } from "./config.js";
import { buildCarouselTools } from "./tools.js";
import { buildSystemPrompt } from "./prompt.js";
import { closeBrowser } from "./render/renderer.js";
import { brandFromProduct, productContext, resolveProduct } from "./product.js";
import { layoutById } from "./layouts.js";
import { prepareSampleAssets } from "./samples.js";
import { writeSlide } from "./slides.js";
import { STYLES } from "./styles.js";

const ctx: RunContext = { dir: createRunDir("out", "smoke"), format: "portrait", brand: loadBrand(), style: "consulting", styleFixed: true };

function toolsFor(c: RunContext) {
  const tools = Object.fromEntries(buildCarouselTools(c).map((t) => [t.name, t]));
  return async (name: string, args: Record<string, unknown>) => {
    const t = tools[name];
    const parsed = z.object(t.inputSchema as z.ZodRawShape).parse(args); // applies schema defaults like the MCP layer
    const res = await t.handler(parsed as never, {});
    const txt = res.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join(" | ");
    console.log(`${res.isError ? "✗" : "✓"} ${name}: ${txt.slice(0, 400)}`);
    return { ...res, txt };
  };
}
const call = toolsFor(ctx);

let failures = 0;
const expect = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`  FAILED: ${msg}`); } };

try {
  const prompt = buildSystemPrompt(ctx);
  console.log(`system prompt (fixed style): ${prompt.length} chars`);
  expect(prompt.includes("glass--cover") && !prompt.includes("{{ICON_NAMES}}") && !prompt.includes("{{SHAPE_NAMES}}"), "system prompt is assembled");
  expect(prompt.includes("fixed by the user") && !prompt.includes("## Tech (`tech`)"), "a fixed style's prompt holds only that style");

  const other = await call("set_style", { style: "bold" });
  expect(!!other.isError && other.txt.includes("fixed the style"), "a fixed style can't be changed");
  await call("set_style", { style: "consulting" });

  await call("generate_image", { name: "hero", prompt: "Rows of unbranded vitamin bottles on pharmacy shelves, seen straight on" });
  expect(fs.existsSync(path.join(ctx.dir, "assets/hero.jpg")), "hero image written");

  const good = await call("write_slide", {
    index: 1,
    html: `<section class="slide"><div class="bg bg--duotone"><img src="assets/hero.jpg" alt=""></div><div class="fx-grain"></div>
      <div class="glass glass--cover glass--center"><span class="pill">Smoke test:</span><h1 class="h2">Layout checks<br>are working</h1>
      <hr class="rule"><div class="stat"><span class="stat__value">+12345%</span><div class="stat__meta"><i class="icon icon--growth icon--sm"></i><span class="stat__label">auto-fitted<br>hero number</span></div></div></div>
      <div class="wordmark"></div><div class="next"></div></section>`,
  });
  expect(!good.txt.includes("ERROR"), "clean slide has no errors");

  const bad = await call("write_slide", {
    index: 2,
    html: `<section class="slide"><h2 class="h1" style="margin-top:1180px">This headline falls off the bottom of the slide</h2>
      <p class="body" style="font-size:14px">tiny</p><img src="assets/missing.jpg"><script>alert(1)</script></section>`,
  });
  expect(bad.txt.includes("cut off"), "detects text cut off by the edge");
  expect(bad.txt.includes("failed to load"), "detects missing image");
  expect(bad.txt.includes("too small"), "detects tiny font");
  expect(bad.txt.includes("Removed <script>"), "strips scripts");

  await call("remove_slide", { index: 2 });
  await call("review_carousel", {});
  await call("export_carousel", { caption: "Smoke test caption for the exported carousel.", alt_text: ["Cover slide"] });
  expect(fs.existsSync(path.join(ctx.dir, "carousel.pdf")) && fs.existsSync(path.join(ctx.dir, "png/slide-01.png")), "exports PNG + PDF");

  // --style auto: nothing renders before set_style; set_style records the choice.
  const auto: RunContext = { dir: createRunDir("out", "smoke-auto"), format: "square", brand: loadBrand(), style: null };
  const autoPrompt = buildSystemPrompt(auto);
  expect(STYLE_IDS.every((id) => autoPrompt.includes(`(\`${id}\`)`)) && autoPrompt.includes("set_style"), "the auto prompt lists every style");
  const callAuto = toolsFor(auto);
  const early = await callAuto("write_slide", { index: 1, html: `<section class="slide"><h1 class="h1">Too early</h1></section>` });
  expect(!!early.isError && early.txt.includes("set_style"), "write_slide needs a style first");
  await callAuto("set_style", { style: "tech", reason: "a product update" });
  expect(auto.style === "tech" && JSON.parse(fs.readFileSync(path.join(auto.dir, "run.json"), "utf8")).style === "tech", "set_style records the style in run.json");

  // Every style renders the layouts that suit it without layout errors.
  for (const style of STYLE_IDS) {
    const sctx: RunContext = { dir: createRunDir("out", `smoke-${style}`), format: "portrait", brand: loadBrand(), style };
    const layouts = STYLES[style].layouts.map((id) => layoutById(id)!);
    await prepareSampleAssets(sctx.dir, sctx.brand, style, sctx.format, layouts.flatMap((l) => l.assets));
    const errs: string[] = [];
    for (const [i, l] of layouts.entries()) errs.push(...(await writeSlide(sctx, i + 1, l.html)).diagnostics.errors.map((e) => `${l.id}: ${e}`));
    console.log(`${errs.length ? "✗" : "✓"} ${style}: ${layouts.length} layouts${errs.length ? `\n    ${errs.join("\n    ")}` : ", no layout errors"}`);
    expect(!errs.length, `${style} renders its layouts without errors`);
  }

  // Composition QA: an empty band, content in the next cue's corner, a sticker over a UI mock, a logo that moves.
  const comp: RunContext = { dir: createRunDir("out", "smoke-composition"), format: "portrait", brand: loadBrand(), style: "bold" };
  const callComp = toolsFor(comp);
  const sparse = await callComp("write_slide", { index: 1, html: `<section class="slide"><div class="wordmark wordmark--top"></div><h2 class="h1">A short list</h2><p class="body">One line at the top of an empty slide.</p></section>` });
  expect(sparse.txt.includes("empty band"), "warns about an empty band");
  const corner = await callComp("write_slide", {
    index: 2,
    html: `<section class="slide slide--light"><div class="wordmark wordmark--top"></div><h2 class="h1">Into the corner</h2><div class="panel mt-auto"><p class="body">A full-width panel at the bottom.</p></div><div class="next"></div></section>`,
  });
  expect(corner.txt.includes("runs into the next-slide cue"), "detects content in the next cue's corner");
  const covered = await callComp("write_slide", {
    index: 3,
    html: `<section class="slide"><div class="wordmark wordmark--top"></div><h2 class="h1">Covered</h2><div class="anchor my-auto"><div class="device device--laptop"><div class="device__screen"><div class="ui">
      <div class="ui-bar"><span>Ticket</span></div><div class="ui-card">Fix the export</div><div class="ui-check">Tests pass</div><div class="ui-check">Reviewed</div><span class="ui-btn">Open</span>
      </div></div></div><span class="sticker sticker--float" style="left:200px;top:120px">Over it</span></div></section>`,
  });
  expect(covered.txt.includes("covers"), "warns about a sticker over a UI mock");
  await callComp("write_slide", { index: 4, html: `<section class="slide"><div class="row between row--top"><div class="wordmark wordmark--inline"></div><span class="sticker">Inline</span></div><h2 class="h1" style="margin-top:40px">Same spot</h2><p class="body">The logo lands where wordmark--top does.</p></section>` });
  const moved = await callComp("write_slide", { index: 5, html: `<section class="slide"><h2 class="h1">Logo at the bottom</h2><p class="body">A different place.</p><div class="wordmark"></div></section>` });
  expect(moved.txt.includes("NOTE (across slides): The logo moves"), "write_slide notes a logo that moves");
  const review = await callComp("review_carousel", {});
  expect(review.txt.includes("logo moves") && review.txt.includes("slides 1, 2, 3, 4 at"), "review notes the moved logo; wordmark--top and an inline top-row logo share one spot");

  // A single post: one slide, no swipe cues, a PNG and no PDF.
  const single: RunContext = { dir: createRunDir("out", "smoke-single"), format: "portrait", brand: loadBrand(), style: "minimal", single: true };
  expect(buildSystemPrompt(single).includes("# Single graphic post"), "single-post prompt");
  const callSingle = toolsFor(single);
  const second = await callSingle("write_slide", { index: 2, html: `<section class="slide"><h1 class="h1">Two</h1></section>` });
  expect(!!second.isError, "a single post refuses slide 2");
  const cue = await callSingle("write_slide", { index: 1, html: layoutById("statement")!.html.replace("</section>", `<div class="next"></div></section>`) });
  expect(cue.txt.includes("nothing to swipe"), "warns about swipe cues on a single post");
  await callSingle("write_slide", { index: 1, html: layoutById("statement")!.html });
  await callSingle("export_carousel", { caption: "Smoke test caption for a single image post.", alt_text: ["A question and its answer"] });
  expect(fs.existsSync(path.join(single.dir, "png/slide-01.png")) && !fs.existsSync(path.join(single.dir, "carousel.pdf")), "a single post exports a PNG and no PDF");
  expect(fs.readFileSync(path.join(single.dir, "post.md"), "utf8").includes("as an image post"), "post.md says image post");

  // Product folder → brand. The fixture has a light (yellow) primary: the canvas must move to its dark colour and the
  // primary must become the accent, and the product context must reach the system prompt.
  const fixture = resolveProduct(path.join(ROOT, "..", "..", "lib", "fixtures", "acme"))!;
  const pb = brandFromProduct(fixture);
  expect(pb.colors.primary === fixture.roles.inverse, `light primary moves to the dark canvas (${pb.colors.primary})`);
  expect(pb.colors.accent === fixture.roles.accent && pb.colors.onAccent === fixture.roles.onAccent, "the primary becomes the accent");
  expect(!!pb.palette && pb.palette.primary === fixture.roles.primary && pb.palette.highlights[0].bg === fixture.roles.primary, "palette: primary and the bright yellow as highlight");
  const pctx: RunContext = { dir: createRunDir("out", "smoke-product"), format: "square", brand: pb, style: "consulting", styleFixed: true, product: { dir: fixture.dir, name: fixture.name, context: productContext(fixture) } };
  const pprompt = buildSystemPrompt(pctx);
  expect(pprompt.includes("# The product") && pprompt.includes("Acme Bread") && pprompt.includes("fills the CTA pill"), "product context and accent rules in the prompt");
  const callProduct = toolsFor(pctx);
  const pres = await callProduct("write_slide", { index: 1, html: `<section class="slide"><div class="fx-glow"></div><h1 class="h2">Bread on Fridays</h1><p class="body">A brand check.</p><span class="cta">Start a subscription</span><div class="wordmark"></div><div class="next"></div></section>` });
  expect(!pres.isError && !pres.txt.includes("ERROR"), "a slide renders with the product brand");
  const html = fs.readFileSync(path.join(pctx.dir, "build", "slide-01.html"), "utf8");
  expect(html.includes(`--hi:${fixture.roles.accent}`) && html.includes(`--brand:${fixture.roles.inverse}`), "accent and canvas variables injected");
  expect(html.includes(`--c-primary:${fixture.roles.primary}`) && html.includes(`font-family:"Acme Sans"`), "palette variables and the product font injected");

  // The product found from this folder (if any) must load and map without errors.
  const local = resolveProduct();
  if (local) {
    const lb = brandFromProduct(local);
    console.log(`✓ product folder ${local.name}: canvas ${lb.colors.primary}, accent ${lb.colors.accent}, highlights ${lb.palette?.highlights.map((h) => h.bg).join(" ")}, fonts ${lb.fonts.sans.family} / ${lb.fonts.display?.family ?? "-"}${lb.wordmark.logo ? ", logo" : ""}${lb.houseStyle ? `, house style ${lb.houseStyle}` : ""}`);
  }
} finally {
  await closeBrowser();
}
console.log(failures ? `\n${failures} check(s) failed` : `\nAll checks passed → ${ctx.dir}`);
process.exit(failures ? 1 : 0);
