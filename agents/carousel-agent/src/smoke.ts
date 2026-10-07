// Exercises every agent tool exactly as Claude would call it, without calling Claude.
// Uses mock images unless OPENAI_API_KEY is set.   npm run smoke
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createRunDir, loadBrand, ROOT, type RunContext } from "./config.js";
import { buildCarouselTools } from "./tools.js";
import { buildSystemPrompt } from "./prompt.js";
import { closeBrowser } from "./render/renderer.js";
import { brandFromProduct, productContext, resolveProduct } from "./product.js";

const ctx: RunContext = { dir: createRunDir("out", "smoke"), format: "portrait", brand: loadBrand() };
const tools = Object.fromEntries(buildCarouselTools(ctx).map((t) => [t.name, t]));

async function call(name: string, args: Record<string, unknown>) {
  const t = tools[name];
  const parsed = z.object(t.inputSchema as z.ZodRawShape).parse(args); // applies schema defaults like the MCP layer
  const res = await t.handler(parsed as never, {});
  const txt = res.content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join(" | ");
  console.log(`${res.isError ? "✗" : "✓"} ${name}: ${txt.slice(0, 400)}`);
  return res;
}

let failures = 0;
const expect = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`  FAILED: ${msg}`); } };

try {
  const prompt = buildSystemPrompt(ctx);
  console.log(`system prompt: ${prompt.length} chars`);
  expect(prompt.includes("glass--cover") && !prompt.includes("{{ICON_NAMES}}"), "system prompt is assembled");

  await call("generate_image", { name: "hero", prompt: "Rows of unbranded vitamin bottles on pharmacy shelves, seen straight on" });
  expect(fs.existsSync(path.join(ctx.dir, "assets/hero.jpg")), "hero image written");

  const good = await call("write_slide", {
    index: 1,
    html: `<section class="slide"><div class="bg bg--duotone"><img src="assets/hero.jpg" alt=""></div><div class="fx-grain"></div>
      <div class="glass glass--cover glass--center"><span class="pill">Smoke test:</span><h1 class="h2">Layout checks<br>are working</h1>
      <hr class="rule"><div class="stat"><span class="stat__value">+12345%</span><div class="stat__meta"><i class="icon icon--growth icon--sm"></i><span class="stat__label">auto-fitted<br>hero number</span></div></div></div>
      <div class="wordmark"></div><div class="next"></div></section>`,
  });
  expect(!good.content.some((c) => c.type === "text" && c.text.includes("ERROR")), "clean slide has no errors");

  const bad = await call("write_slide", {
    index: 2,
    html: `<section class="slide"><h2 class="h1" style="margin-top:1180px">This headline falls off the bottom of the slide</h2>
      <p class="body" style="font-size:14px">tiny</p><img src="assets/missing.jpg"><script>alert(1)</script></section>`,
  });
  const badText = bad.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
  expect(badText.includes("cut off"), "detects text cut off by the edge");
  expect(badText.includes("failed to load"), "detects missing image");
  expect(badText.includes("too small"), "detects tiny font");
  expect(badText.includes("Removed <script>"), "strips scripts");

  await call("remove_slide", { index: 2 });
  await call("review_carousel", {});
  await call("export_carousel", { caption: "Smoke test caption for the exported carousel.", alt_text: ["Cover slide"] });
  expect(fs.existsSync(path.join(ctx.dir, "carousel.pdf")) && fs.existsSync(path.join(ctx.dir, "png/slide-01.png")), "exports PNG + PDF");

  // Product folder → brand. The fixture has a light (yellow) primary: the canvas must move to its dark colour and the
  // primary must become the accent, and the product context must reach the system prompt.
  const fixture = resolveProduct(path.join(ROOT, "..", "..", "lib", "fixtures", "acme"))!;
  const pb = brandFromProduct(fixture);
  expect(pb.colors.primary === fixture.roles.inverse, `light primary moves to the dark canvas (${pb.colors.primary})`);
  expect(pb.colors.accent === fixture.roles.accent && pb.colors.onAccent === fixture.roles.onAccent, "the primary becomes the accent");
  const pctx: RunContext = { dir: createRunDir("out", "smoke-product"), format: "square", brand: pb, product: { dir: fixture.dir, name: fixture.name, context: productContext(fixture) } };
  const pprompt = buildSystemPrompt(pctx);
  expect(pprompt.includes("# The product") && pprompt.includes("Acme Bread") && pprompt.includes("fills the CTA pill"), "product context and accent rules in the prompt");
  const ptools = Object.fromEntries(buildCarouselTools(pctx).map((t) => [t.name, t]));
  const pt = ptools["write_slide"];
  const pres = await pt.handler(z.object(pt.inputSchema as z.ZodRawShape).parse({ index: 1, html: `<section class="slide"><div class="fx-glow"></div><h1 class="h2">Bread on Fridays</h1><p class="body">A brand check.</p><span class="cta">Start a subscription</span><div class="wordmark"></div><div class="next"></div></section>` }) as never, {});
  const ptext = pres.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
  console.log(`${pres.isError ? "✗" : "✓"} write_slide (product brand): ${ptext.slice(0, 160)}`);
  expect(!pres.isError && !ptext.includes("ERROR"), "a slide renders with the product brand");
  const html = fs.readFileSync(path.join(pctx.dir, "build", "slide-01.html"), "utf8");
  expect(html.includes(`--hi:${fixture.roles.accent}`) && html.includes(`--brand:${fixture.roles.inverse}`), "accent and canvas variables injected");

  // The product found from this folder (if any) must load and map without errors.
  const local = resolveProduct();
  if (local) {
    const lb = brandFromProduct(local);
    console.log(`✓ product folder ${local.name}: canvas ${lb.colors.primary}, accent ${lb.colors.accent}, fonts ${lb.fonts.sans.family} / ${lb.fonts.serif.family}${lb.wordmark.logo ? ", logo" : ""}`);
  }
} finally {
  await closeBrowser();
}
console.log(failures ? `\n${failures} check(s) failed` : `\nAll checks passed → ${ctx.dir}`);
process.exit(failures ? 1 : 0);
