/**
 * Build the reference-library gallery (all heroes and sections with sample
 * content), test every interaction, and save one screenshot per component to
 * docs/library/. Usage:
 *   npm run gallery -- [--primary "#0f766e"] [--secondary] [--dark] [--background] [--display manrope] [--body inter] [--accent font] [--roundness soft] [--no-shots]
 */
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { FONT_IDS, formatBrandReport, writeBrand, type BrandInput, type FontId } from "./brand.js";
import { buildSite } from "./build.js";
import { config } from "./config.js";
import { formatInteractions, testInteractions } from "./interactions.js";
import { scaffoldSite } from "./scaffold.js";
import { serveStatic } from "./screenshot.js";

const { values } = parseArgs({
  options: {
    primary: { type: "string", default: "#0f766e" },
    secondary: { type: "string" },
    dark: { type: "string" },
    background: { type: "string" },
    accent: { type: "string" },
    display: { type: "string", default: "manrope" },
    body: { type: "string", default: "inter" },
    roundness: { type: "string", default: "soft" },
    slug: { type: "string", default: "_gallery" },
    "no-shots": { type: "boolean" },
  },
});

const asFont = (v: string | undefined, d: FontId): FontId => (v && (FONT_IDS as string[]).includes(v) ? (v as FontId) : d);

async function main() {
  const site = scaffoldSite({ slug: values.slug!, brief: "Reference library gallery (fictional company Orbit).", overwrite: true });
  cpSync(path.join(config.root, "gallery", "page.tsx"), path.join(site.dir, "app", "page.tsx"));
  cpSync(path.join(config.root, "gallery", "visuals.tsx"), path.join(site.dir, "app", "gallery-visuals.tsx"));
  writeFileSync(
    path.join(site.dir, "site.config.ts"),
    `export type NavLink = { label: string; href: string };
export type FooterColumn = { title: string; links: { label: string; href: string }[] };
export type SiteConfig = {
  brand: { name: string; logoSrc?: string };
  metadata: { title: string; description: string };
  nav: { links: NavLink[]; cta: { label: string; href: string } };
  footer: { tagline: string; social: { label: string; href: string }[]; columns: FooterColumn[]; legal: string[] };
};
export const site = {
  brand: { name: "Orbit" },
  metadata: { title: "Reference library", description: "All heroes and sections with sample content." },
  nav: { links: [{ label: "Heroes", href: "#top" }, { label: "Sections", href: "#top" }], cta: { label: "Book a walkthrough", href: "#top" } },
  footer: { tagline: "Sample content for a fictional company.", social: [], columns: [{ title: "Library", links: [{ label: "Top", href: "#top" }] }], legal: ["Gallery build"] },
} satisfies SiteConfig;
`,
  );
  const brand: BrandInput = {
    primary: values.primary!,
    secondary: values.secondary,
    dark: values.dark,
    background: values.background,
    accentFont: values.accent && (FONT_IDS as string[]).includes(values.accent) ? (values.accent as FontId) : undefined,
    displayFont: asFont(values.display, "manrope"),
    bodyFont: asFont(values.body, "inter"),
    roundness: (["sharp", "soft", "round"].includes(values.roundness!) ? values.roundness : "soft") as BrandInput["roundness"],
  };
  console.log(formatBrandReport(writeBrand(site.dir, brand), brand));

  process.stdout.write("Building… ");
  const build = await buildSite(site.dir);
  if (!build.ok) {
    console.log("failed\n" + build.output);
    process.exitCode = 1;
    return;
  }
  console.log(`ok (${(build.durationMs / 1000).toFixed(1)}s)`);

  const report = await testInteractions(site.dir);
  console.log(formatInteractions(report));
  if (!report.ok) process.exitCode = 1;

  if (values["no-shots"]) return;
  const shotsDir = path.join(config.root, "docs", "library");
  mkdirSync(shotsDir, { recursive: true });
  const server = await serveStatic(path.join(site.dir, "out"));
  const browser = await chromium.launch({ executablePath: config.chromiumPath });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await page.goto(server.url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Element screenshots scroll the page; un-stick pinned elements so they don't overlap or drift.
    await page.addStyleTag({ content: "header, [class*='sticky'] { position: static !important; }" });
    const items = page.locator("[data-gallery-item]");
    const n = await items.count();
    for (let i = 0; i < n; i++) {
      const name = await items.nth(i).getAttribute("data-gallery-item");
      await items.nth(i).screenshot({ path: path.join(shotsDir, `${String(i + 1).padStart(2, "0")}-${name}.jpg`), type: "jpeg", quality: 70 });
    }
    console.log(`Saved ${n} screenshots to ${path.relative(process.cwd(), shotsDir)}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
