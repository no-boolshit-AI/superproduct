import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { FORMATS, listSlides, STYLE_IDS, updateRunRecord, type RunContext } from "./config.js";
import { generateImage, isMockMode } from "./images/generate.js";
import { consistencyNotes, contactSheet, exportCarousel, removeSlide, writeSlide } from "./slides.js";
import { STYLES } from "./styles.js";
import { thumbnail } from "./render/renderer.js";

export const SERVER_NAME = "carousel";
export const TOOL_NAMES = ["set_style", "generate_image", "write_slide", "remove_slide", "review_carousel", "export_carousel"].map(
  (t) => `mcp__${SERVER_NAME}__${t}`,
);

/** Swipe cues that make no sense on a single image post. */
const SWIPE_CUES = /class=["'][^"']*\b(next|swipe|progress|counter)\b/;

const text = (t: string) => ({ type: "text" as const, text: t });
const jpeg = (b: Buffer) => ({ type: "image" as const, data: b.toString("base64"), mimeType: "image/jpeg" });
const fail = (err: unknown) => ({ content: [text(`ERROR: ${(err as Error).message}`)], isError: true });

/** The tool definitions (exported separately so they can be exercised without Claude, see src/smoke.ts). */
export function buildCarouselTools(ctx: RunContext) {
  const { width, height } = FORMATS[ctx.format];
  const defaultAspect = ctx.format === "portrait" ? "portrait" : "square";

  const noStyle = () => fail(new Error("Pick the style first: call set_style (images and slides depend on it)."));

  const setStyleTool = tool(
    "set_style",
    "Choose the visual style for the whole post. Call it once, before generate_image and write_slide. " +
      `Styles: ${STYLE_IDS.map((id) => `${id} (${STYLES[id].bestFor})`).join("; ")}.`,
    {
      style: z.enum(STYLE_IDS),
      reason: z.string().optional().describe("One line: why this style fits the brief"),
    },
    async ({ style }) => {
      if (ctx.styleFixed && style !== ctx.style) return fail(new Error(`The user fixed the style to "${ctx.style}" (--style). Keep it.`));
      const rewrite = ctx.style && ctx.style !== style && listSlides(ctx.dir).length > 0;
      ctx.style = style;
      updateRunRecord(ctx.dir, { style });
      const s = STYLES[style];
      return {
        content: [
          text(
            [
              `Style: ${s.label}. ${s.look}`,
              `Layouts that suit it: ${s.layouts.join(", ")}.`,
              rewrite ? "NOTE: slides written so far now render in this style; check and rewrite them." : "",
            ].filter(Boolean).join("\n"),
          ),
        ],
      };
    },
  );

  const generateImageTool = tool(
    "generate_image",
    `Generate ONE image with OpenAI (${process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare"}) and save it under assets/. ` +
      "Images are raw material only: a background render, a photo or an isolated object. All words, numbers, colour unification " +
      "and layout are done in HTML/CSS afterwards, so describe ONLY the subject and composition. A house-style suffix (palette, " +
      "lighting, 'no text') is appended automatically based on `style`. Identical requests are cached. Returns the file path and a thumbnail.",
    {
      name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/).describe("File stem, kebab-case, e.g. 'cover-shelves'"),
      prompt: z.string().min(10).describe("Subject + composition only, e.g. 'Rows of unbranded pill bottles on pharmacy shelves, seen straight on'"),
      style: z
        .enum(["3d-mono", "photo", "still-life", "illustration", "abstract", "cutout", "raw"])
        .default("3d-mono")
        .describe(
          "3d-mono: monochrome 3D render in the palette (consulting covers, texture posters). photo: candid editorial photo of a scene with people (never a real person). " +
            "still-life: editorial photo of objects in dramatic light (editorial covers). illustration: flat editorial illustration. abstract: soft geometric forms. " +
            "cutout: one isolated object on a transparent background. raw: your prompt verbatim.",
        ),
      aspect: z.enum(["square", "portrait", "landscape", "wide"]).optional().describe(`Defaults to the slide format (${defaultAspect}). Use landscape for photo cards.`),
      resolution: z.enum(["standard", "hd"]).default("hd").describe("hd (~3.5 MP) for full-bleed backgrounds and large photos; standard (1 MP) for small elements"),
      quality: z.enum(["medium", "high", "xhigh"]).default("high"),
      variant: z.enum(["flare", "sunburst"]).optional().describe("gpt-image-2.5 only: flare = fast, everyday (default); sunburst = finer detail / precise edits, slower"),
      reference_images: z.array(z.string()).optional().describe("Paths to reference images (e.g. the user's product shot) to restyle via the edit endpoint"),
    },
    async (args) => {
      if (!ctx.style) return noStyle();
      try {
        const refs = args.reference_images?.map((p) => path.resolve(ctx.dir, p));
        for (const r of refs ?? []) if (!fs.existsSync(r)) throw new Error(`Reference image not found: ${r}`);
        const res = await generateImage(
          {
            name: args.name,
            prompt: args.prompt,
            style: args.style,
            aspect: args.aspect ?? defaultAspect,
            resolution: args.resolution,
            quality: args.quality,
            variant: args.variant,
            referenceImages: refs,
          },
          ctx.dir,
          ctx.brand,
          ctx.style,
        );
        const thumb = await thumbnail(res.absPath, 448);
        return {
          content: [
            text(
              `Saved ${res.file} (${res.size}, ${res.model}${res.cached ? ", cached" : ""}${res.mock ? ", MOCK placeholder because OPENAI_API_KEY is not set" : ""}).\n` +
                `Use it as e.g. <div class="bg bg--duotone"><img src="${res.file}" alt=""></div> or <div class="photo"><img src="${res.file}" alt=""></div>.`,
            ),
            jpeg(thumb),
          ],
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const writeSlideTool = tool(
    "write_slide",
    `Create or overwrite slide N from an HTML fragment (a single <section class="slide ...">…</section>). The design system CSS, ` +
      `brand tokens, fonts and icons are injected automatically. Canvas: ${width}×${height}px. Returns a rendered preview plus ` +
      `layout diagnostics (cut-off text, overlaps, overflow, tiny fonts, missing images). Fix every ERROR before moving on.`,
    {
      index: z.number().int().min(1).max(20).describe("1-based slide number"),
      html: z.string().min(20).describe('Fragment: <section class="slide">…</section>. No <html>, <head>, <script> or external URLs.'),
    },
    async ({ index, html }) => {
      if (!ctx.style) return noStyle();
      if (ctx.single && index !== 1) return fail(new Error("This is a single post: it has one slide, index 1."));
      try {
        const r = await writeSlide(ctx, index, html);
        const d = r.diagnostics;
        if (ctx.single && SWIPE_CUES.test(html)) d.warnings.push("A single post has nothing to swipe to: remove next, swipe, progress and counter.");
        const lines = [
          `Slide ${index} rendered → ${path.relative(ctx.dir, r.previewPath)} (${d.wordCount} words).`,
          ...r.notes.map((n) => `NOTE: ${n}`),
          ...d.errors.map((e) => `ERROR: ${e}`),
          ...d.warnings.map((w) => `WARNING: ${w}`),
          ...consistencyNotes(ctx).map((n) => `NOTE (across slides): ${n}`),
          d.errors.length ? "Fix the errors and call write_slide again." : "No layout errors. Check the preview against the style guide.",
        ];
        return { content: [text(lines.join("\n")), jpeg(r.preview)] };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const removeSlideTool = tool(
    "remove_slide",
    "Delete slide N (e.g. after reducing the slide count). Remaining slides keep their numbers; renumber by rewriting if needed.",
    { index: z.number().int().min(1).max(20) },
    async ({ index }) => {
      removeSlide(ctx, index);
      return { content: [text(`Removed slide ${index}. Slides now: ${listSlides(ctx.dir).map((f) => path.basename(f)).join(", ") || "none"}`)] };
    },
  );

  const reviewTool = tool(
    "review_carousel",
    "Render a contact sheet of every slide side by side. Use it before exporting to check rhythm and consistency: same margins, " +
      "headline sizes, rule positions and colour treatment across slides; one idea per slide; the story reads in order.",
    {},
    async () => {
      try {
        const sheet = await contactSheet(ctx);
        if (!sheet) return { content: [text("No slides yet.")] };
        const notes = consistencyNotes(ctx).map((n) => `NOTE: ${n}`);
        return { content: [text([`${listSlides(ctx.dir).length} slides.`, ...notes].join("\n")), jpeg(sheet)] };
      } catch (err) {
        return fail(err);
      }
    },
  );

  const exportTool = tool(
    "export_carousel",
    "Final step. Renders every slide as a high-resolution PNG, builds carousel.pdf (LinkedIn document/carousel post; not for a single post) " +
      "and writes post.md with the caption and alt text. Call once all slides are final.",
    {
      caption: z.string().min(20).describe("LinkedIn post text that accompanies the post: hook line, 2–4 short paragraphs, a question or CTA, max 3 hashtags at the end"),
      alt_text: z.array(z.string()).describe("One alt-text string per slide, in order, describing the slide's content for screen readers"),
    },
    async ({ caption, alt_text }) => {
      if (!ctx.style) return noStyle();
      try {
        const r = await exportCarousel(ctx, { caption, altText: alt_text });
        const rel = (p: string) => path.relative(ctx.dir, p);
        return {
          content: [
            text(
              [
                `Exported ${r.pngs.length} PNG${r.pngs.length === 1 ? "" : "s"}: ${r.pngs.map(rel).join(", ")}`,
                `${r.pdf ? `PDF: ${rel(r.pdf)}  ` : ""}Post copy: ${rel(r.post)}`,
                ...r.warnings.map((w) => `WARNING: ${w}`),
                isMockMode() ? "NOTE: images are mock placeholders (no OPENAI_API_KEY)." : "",
              ].filter(Boolean).join("\n"),
            ),
          ],
        };
      } catch (err) {
        return fail(err);
      }
    },
  );

  return [setStyleTool, generateImageTool, writeSlideTool, removeSlideTool, reviewTool, exportTool];
}

export function createCarouselServer(ctx: RunContext) {
  return createSdkMcpServer({
    name: SERVER_NAME,
    version: "0.1.0",
    tools: buildCarouselTools(ctx),
    timeout: 10 * 60 * 1000, // image generation at xhigh can take minutes
  });
}
