import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { FONT_IDS, FONTS, formatBrandReport, ROUNDNESS, writeBrand, type BrandInput, type FontId } from "./brand.js";
import { buildSite } from "./build.js";
import { config } from "./config.js";
import { formatInteractions, testInteractions } from "./interactions.js";
import { formatReport, lintSite } from "./lint.js";
import { screenshotSite } from "./screenshot.js";

export const SITE_TOOL_NAMES = [
  "mcp__site__set_brand",
  "mcp__site__check_styleguide",
  "mcp__site__build_site",
  "mcp__site__screenshot_site",
  "mcp__site__test_interactions",
] as const;

const HEX = /^#?[0-9a-fA-F]{6}$|^#?[0-9a-fA-F]{3}$/;
const fontEnum = z.enum(FONT_IDS as [FontId, ...FontId[]]);
const fontList = FONT_IDS.map((id) => `${id} (${FONTS[id].feel})`).join("; ");

/** In-process MCP server exposing the brand and verification tools, bound to one site folder. */
export function createSiteTools(siteDir: string) {
  return createSdkMcpServer({
    name: "site",
    version: "0.2.0",
    tools: [
      tool(
        "set_brand",
        `Apply the product's brand to the site: generates the brand colour scale (brand-50…950) from the primary colour, a secondary scale, a contrast-checked accent/button/link colour, the dark inverse colour, fonts, heading weight and corner roundness. Writes styles/brand.css, app/fonts.ts and app/icon.svg (those files are read-only otherwise). Call it before writing any section, and again whenever you change the brand. Fonts: ${fontList}.`,
        {
          primary: z.string().regex(HEX).describe("The brand's main colour as hex, taken from the brief or the brand's own site/logo. Never default to blue unless the brand is blue."),
          secondary: z.string().regex(HEX).optional().describe("Optional second brand colour (hex) for charts, highlights and secondary tiles."),
          dark: z.string().regex(HEX).optional().describe("Optional dark brand colour (hex) used for inverse sections; defaults to a deep shade of the primary."),
          background: z.string().regex(HEX).optional().describe("Optional page background (hex) when the brand uses an off-white or lightly tinted page; must be very light. Default white."),
          displayFont: fontEnum.describe("Font for headings."),
          bodyFont: fontEnum.describe("Font for body text and UI."),
          accentFont: fontEnum.optional().describe("Optional third face (e.g. a serif) available as font-accent for quotes or highlighted words."),
          headingWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).optional().describe("Heading weight; default 600. Serif display faces usually look best at 400–500."),
          roundness: z.enum(Object.keys(ROUNDNESS) as [keyof typeof ROUNDNESS, ...(keyof typeof ROUNDNESS)[]]).optional().describe("Corner style: sharp (engineered, enterprise), soft (default), round (friendly; pill buttons)."),
        },
        async (args) => {
          try {
            const input = args as BrandInput;
            const report = writeBrand(siteDir, input);
            const failed = report.checks.filter((c) => !c.pass);
            return {
              content: [{ type: "text", text: formatBrandReport(report, input) + (failed.length ? "\nSome contrast checks fail — consider a darker primary or a different dark colour." : "") }],
            };
          } catch (err) {
            return { content: [{ type: "text", text: `set_brand failed: ${(err as Error).message}` }], isError: true };
          }
        },
      ),
      tool(
        "check_styleguide",
        "Lint the site against the Corporate Landing style guide: brand not set, raw colours, non-token Tailwind classes, weights, shadows, radii, inline styles, full-bleed content outside a container, H1 count, alt text, leftover starter content, missing or incomplete PLAN.md. Run after every round of edits; fix all errors.",
        {},
        async () => {
          const report = lintSite(siteDir, { denylist: config.denylist });
          return { content: [{ type: "text", text: formatReport(report) }], isError: !report.ok };
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "build_site",
        "Run `next build` (TypeScript check + static export to out/). Returns the end of the build log. Must pass before screenshots and interaction tests.",
        {},
        async () => {
          const r = await buildSite(siteDir);
          const head = r.ok ? `Build succeeded in ${(r.durationMs / 1000).toFixed(1)}s.` : "Build FAILED. Fix the errors below and rebuild.";
          return { content: [{ type: "text", text: `${head}\n\n${r.output.split("\n").slice(r.ok ? -12 : -80).join("\n")}` }], isError: !r.ok };
        },
      ),
      tool(
        "screenshot_site",
        "Render the last successful build in Chromium and return full-page screenshots, sliced top to bottom. Desktop is 1440px wide, mobile 390px. Use it to review the page visually against the style guide.",
        {
          viewport: z.enum(["desktop", "mobile", "both"]).default("desktop").describe("Which viewport(s) to capture."),
          maxChunks: z.number().int().min(1).max(10).optional().describe("Max image slices per viewport (default 8 desktop, 6 mobile)."),
        },
        async ({ viewport, maxChunks }) => {
          try {
            const viewports = viewport === "both" ? (["desktop", "mobile"] as const) : ([viewport] as const);
            const { shots, pageHeights } = await screenshotSite(siteDir, { viewports: [...viewports], maxChunks });
            return {
              content: [
                { type: "text", text: `Captured ${shots.length} slices. Page heights: ${JSON.stringify(pageHeights)}. Files in .lpa/screens/.` },
                ...shots.flatMap((s) => [
                  { type: "text" as const, text: s.label },
                  { type: "image" as const, data: s.base64, mimeType: s.mediaType },
                ]),
              ],
            };
          } catch (err) {
            return { content: [{ type: "text", text: `Screenshot failed: ${(err as Error).message}` }], isError: true };
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "test_interactions",
        "Click through every interactive element of the last successful build in Chromium: tabs (incl. arrow keys), carousels (next/prev and the active index), segmented toggles, filters, accordions and disclosures, dialogs, range sliders and calculators, email forms (invalid input is flagged), in-page anchors and the mobile menu. Also reports console errors. Run after the build passes; fix every failure.",
        {},
        async () => {
          try {
            const r = await testInteractions(siteDir);
            return { content: [{ type: "text", text: formatInteractions(r) }], isError: !r.ok };
          } catch (err) {
            return { content: [{ type: "text", text: `Interaction test failed to run: ${(err as Error).message}` }], isError: true };
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
    ],
  });
}
