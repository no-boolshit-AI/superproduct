import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readdir, readFile, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Emit } from "../events.js";
import { downloadCandidate, findCandidates } from "./commons.js";
import {
  generateImage,
  IMAGE_ASPECTS,
  IMAGE_KINDS,
  IMAGE_MEDIA,
  pool,
  type ImageQuality,
} from "./openaiImage.js";
import { contactSheet, imagePreviews, renderSlides } from "./render.js";

export interface ToolContext {
  jobDir: string;
  imageModel: string;
  imageQuality: ImageQuality;
  maxImages: number;
  allowAttribution: boolean;
  emit: Emit;
  stats: { generated: number; downloaded: number; renders: number };
}

export const SERVER_NAME = "collage";
export const TOOL_NAMES = ["generate_image", "find_public_domain_image", "render_slides", "remove_slides"].map(
  (t) => `mcp__${SERVER_NAME}__${t}`,
);

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const text = (t: string): Content => ({ type: "text", text: t });

export async function listSlides(jobDir: string): Promise<string[]> {
  return (await readdir(jobDir)).filter((f) => /^slide-\d+\.html$/i.test(f)).sort();
}

export function createCollageServer(ctx: ToolContext) {
  const generate = tool(
    "generate_image",
    "Generate image INGREDIENTS with OpenAI GPT Image (never whole graphics, never text). " +
      "Each image is greyscale source material that the HTML re-colours with duotone filters. " +
      "kind=cutout|object come back with a transparent background. Batch all images you need (max 6 per call). " +
      "Never request a real, named person: describe an anonymous archetype instead (use find_public_domain_image for real people). " +
      "Returns file paths (relative to the job folder, e.g. assets/cover.png) and a preview sheet.",
    {
      images: z
        .array(
          z.object({
            subject: z.string().min(3).describe("What to show, concretely: who/what, pose, framing, mood. No names of real people, no brands."),
            kind: z.enum(IMAGE_KINDS).describe("cutout: transparent figure; portrait: frontal head-and-shoulders on dark bg; scene: low-key full-bleed; texture: all-over pattern; object: transparent single object"),
            medium: z.enum(IMAGE_MEDIA).optional().describe("Default photo. engraving/painting suit history; halftone suits news"),
            aspect: z.enum(IMAGE_ASPECTS).optional().describe("cover = exact 4:5 slide ratio; default depends on kind"),
            filename: z.string().min(1).describe("Short slug without extension, e.g. 'cover-scholar'"),
            transparent: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(6),
    },
    async ({ images }) => {
      const left = ctx.maxImages - ctx.stats.generated;
      if (left <= 0) {
        return {
          content: [text(`Image budget used up (${ctx.maxImages} per job). Reuse existing assets in assets/ (different crops, duotones, frames) or use find_public_domain_image.`)],
          isError: true,
        };
      }
      const batch = images.slice(0, left);
      ctx.emit({ type: "tool", name: "generate_image", summary: `Generating ${batch.length} image(s): ${batch.map((b) => b.filename).join(", ")}` });
      const results = await pool(batch, 3, (req) =>
        generateImage(req, ctx.jobDir, { model: ctx.imageModel, quality: ctx.imageQuality }),
      );
      const lines: string[] = [];
      const ok: { file: string; label: string }[] = [];
      results.forEach((r, i) => {
        const req = batch[i];
        if (r instanceof Error) {
          lines.push(`✗ ${req.filename}: ${r.message}`);
        } else {
          ctx.stats.generated++;
          lines.push(`✓ ${r.path}  (${req.kind}, ${r.size}${r.transparent ? ", transparent" : ""})`);
          ok.push({ file: r.absPath, label: r.path });
          ctx.emit({ type: "image", path: r.path, source: "generated", label: req.subject });
        }
      });
      if (images.length > batch.length) lines.push(`Skipped ${images.length - batch.length} request(s): image budget reached.`);
      lines.push(`Images generated so far: ${ctx.stats.generated}/${ctx.maxImages}.`);
      const content: Content[] = [text(lines.join("\n"))];
      if (ok.length) {
        content.push(text("Preview (checkerboard = transparent):"));
        content.push({ type: "image", data: await imagePreviews(ok), mimeType: "image/jpeg" });
      }
      return { content, isError: ok.length === 0 };
    },
  );

  const findPd = tool(
    "find_public_domain_image",
    "Find and download real photographs/artworks from Wikimedia Commons: public domain or CC0" +
      (ctx.allowAttribution ? ", or CC BY / CC BY-SA (credits are recorded automatically)" : "") +
      ". Use this for REAL, NAMED PEOPLE (set person=true: uses the canonical Wikidata portrait first), " +
      "historical artworks, places, events. Downloads up to `count` candidates per query and shows them so you can pick. " +
      "These images are NOT transparent: use them full-bleed, in frames/tiles/cards, or with a .scissor-* clip-path.",
    {
      queries: z
        .array(
          z.object({
            query: z.string().min(2).describe("A person's full name (person=true) or descriptive search terms"),
            person: z.boolean().default(false),
            count: z.number().int().min(1).max(4).default(2),
            filename: z.string().min(1).describe("Slug without extension; candidates are saved as <filename>-1, -2, …"),
          }),
        )
        .min(1)
        .max(8),
    },
    async ({ queries }) => {
      ctx.emit({ type: "tool", name: "find_public_domain_image", summary: `Searching Commons: ${queries.map((q) => q.query).join(", ")}` });
      const lines: string[] = [];
      const previews: { file: string; label: string }[] = [];
      const results = await pool(queries, 3, async (q) => {
        const { candidates, note } = await findCandidates(q.query, q.person, ctx.allowAttribution, q.count);
        const files = [];
        for (const [i, c] of candidates.entries()) {
          try {
            files.push(await downloadCandidate(c, ctx.jobDir, `${q.filename}-${i + 1}`));
          } catch (e) {
            lines.push(`  (download failed for ${c.title}: ${(e as Error).message})`);
          }
        }
        return { q, files, note };
      });
      for (const r of results) {
        if (r instanceof Error) {
          lines.push(`✗ ${r.message}`);
          continue;
        }
        if (!r.files.length) {
          lines.push(`✗ "${r.q.query}": nothing usable under the allowed licences. ${r.note} Try other terms, or generate an archetype instead (never a likeness of the real person).`);
          continue;
        }
        lines.push(`"${r.q.query}" ${r.note}`);
        for (const f of r.files) {
          ctx.stats.downloaded++;
          lines.push(`  ✓ ${f.path}  ${f.width}x${f.height}  ${f.license} · ${f.artist}`);
          previews.push({ file: f.absPath, label: `${f.path} · ${f.license}` });
          ctx.emit({ type: "image", path: f.path, source: "commons", label: `${f.title} (${f.license})` });
        }
      }
      const content: Content[] = [text(lines.join("\n"))];
      if (previews.length) content.push({ type: "image", data: await imagePreviews(previews.slice(0, 12), 240), mimeType: "image/jpeg" });
      return { content, isError: previews.length === 0 };
    },
  );

  const render = tool(
    "render_slides",
    "Render slide-*.html in the job folder to PNG (1080x1350) and run layout checks. Returns warnings per slide plus a contact sheet of all slides. " +
      "Pass `inspect` (e.g. 'slide-03.html') to also get that slide at full size. Call after writing or editing slides; fix every warning.",
    {
      slides: z.array(z.string()).optional().describe("Subset of slide files to render; default all"),
      inspect: z.string().optional().describe("One slide file to return at full size"),
    },
    async ({ slides, inspect }) => {
      const all = await listSlides(ctx.jobDir);
      const chosen = (slides?.length ? slides.map((s) => path.basename(s)) : all).filter((s) => existsSync(path.join(ctx.jobDir, s)));
      if (!chosen.length) return { content: [text("No slide-NN.html files found in the job folder yet.")], isError: true };
      ctx.emit({ type: "tool", name: "render_slides", summary: `Rendering ${chosen.length} slide(s)` });
      const results = await renderSlides(chosen.map((s) => path.join(ctx.jobDir, s)), path.join(ctx.jobDir, "png"));
      ctx.stats.renders++;
      const allPngs = (await readdir(path.join(ctx.jobDir, "png")))
        .filter((f) => /^slide-\d+\.png$/.test(f) && all.includes(f.replace(/\.png$/, ".html")))
        .sort()
        .map((f) => path.join(ctx.jobDir, "png", f));
      const sheet = await contactSheet(allPngs, path.join(ctx.jobDir, "png", "_contact.jpg"), allPngs.length > 6 ? 4 : 3);
      const report = results
        .map((r) => `${path.basename(r.html)}: ${r.warnings.length ? "\n  - " + r.warnings.join("\n  - ") : "no warnings"}`)
        .join("\n");
      const warnings = results.reduce((n, r) => n + r.warnings.length, 0);
      ctx.emit({ type: "render", images: allPngs.map((p) => path.relative(ctx.jobDir, p)), warnings });
      const content: Content[] = [
        text(`Rendered ${results.length} slide(s), ${warnings} warning(s).\n${report}\n\nContact sheet (all slides, in order):`),
        { type: "image", data: (await readFile(sheet)).toString("base64"), mimeType: "image/jpeg" },
      ];
      if (inspect) {
        const name = path.basename(inspect).replace(/\.html$/, "");
        const full = await renderSlides([path.join(ctx.jobDir, `${name}.html`)], path.join(ctx.jobDir, "png", "_inspect"), {
          type: "jpeg",
          quality: 80,
        });
        if (full[0]) {
          content.push(text(`Full size: ${name}.html`));
          content.push({ type: "image", data: (await readFile(full[0].image)).toString("base64"), mimeType: "image/jpeg" });
        }
      }
      return { content };
    },
  );

  const remove = tool(
    "remove_slides",
    "Delete slides from the post (e.g. when asked for a shorter carousel). Remaining slides are renumbered slide-01… in their current order, so re-read file names afterwards.",
    { slides: z.array(z.string()).min(1).describe("Slide files to delete, e.g. ['slide-06.html']") },
    async ({ slides }) => {
      const all = await listSlides(ctx.jobDir);
      const drop = new Set(slides.map((s) => path.basename(s)).filter((s) => all.includes(s)));
      if (!drop.size) return { content: [text(`None of those exist. Current slides: ${all.join(", ")}`)], isError: true };
      for (const s of drop) {
        await rm(path.join(ctx.jobDir, s), { force: true });
        await rm(path.join(ctx.jobDir, "png", s.replace(/\.html$/, ".png")), { force: true });
      }
      const keep = all.filter((s) => !drop.has(s));
      const tmp = keep.map((s, i) => ({ from: s, mid: `__tmp-${i}.html`, to: `slide-${String(i + 1).padStart(2, "0")}.html` }));
      for (const t of tmp) await rename(path.join(ctx.jobDir, t.from), path.join(ctx.jobDir, t.mid));
      for (const t of tmp) await rename(path.join(ctx.jobDir, t.mid), path.join(ctx.jobDir, t.to));
      for (const f of await readdir(path.join(ctx.jobDir, "png"))) if (/^slide-\d+\.png$/.test(f)) await rm(path.join(ctx.jobDir, "png", f), { force: true });
      ctx.emit({ type: "tool", name: "remove_slides", summary: `Removed ${[...drop].join(", ")}` });
      return { content: [text(`Removed ${drop.size}. Slides now: ${tmp.map((t) => `${t.to} (was ${t.from})`).join(", ")}. Run render_slides.`)] };
    },
  );

  return createSdkMcpServer({ name: SERVER_NAME, version: "0.1.0", tools: [generate, findPd, render, remove] });
}
