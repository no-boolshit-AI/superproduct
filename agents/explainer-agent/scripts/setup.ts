/**
 * One-time machine setup (after npm install): checks Node and FFmpeg, lays explainer-agent's skill extensions
 * (vox-collage) over the bundled HyperFrames skills and checks them against the CLI, downloads the Chrome that
 * HyperFrames renders with, and reports what `hyperframes doctor` sees.
 *   npm run setup
 */
import "../src/env.js";
import { EXTENSION_SKILLS, cliVersion, pluginInfo, skillProblems } from "../src/config.js";
import { applyExtensions } from "../src/extensions.js";
import { hf, preflight, progressPrinter } from "../src/hyperframes.js";
import { soundSettings } from "../src/media/elevenlabs.js";
import { imageSettings } from "../src/media/images.js";
import { brandKit, resolveProduct } from "../src/product.js";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const problems: string[] = [];
const ok = (s: string) => console.log(`${green("✓")} ${s}`);
const bad = (s: string, fix: string) => {
  console.log(`${red("✗")} ${s}\n  ${dim(fix)}`);
  problems.push(s);
};

const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node}: HyperFrames needs Node 22 or newer`, "Install Node 22+ (e.g. brew install node@22, or nvm install 22)");

const cli = cliVersion();
if (cli) ok(`HyperFrames CLI ${cli}`);
else bad("HyperFrames CLI not installed", "Run npm install in this folder");

const ext = applyExtensions();
const changed = ext.copied.length + ext.appended.length;
if (ext.missingTargets.length) bad(`skill extensions: ${ext.missingTargets.join(", ")} not in this HyperFrames release`, "Update extensions/hyperframes for the new release");
else ok(`explainer-agent skill extensions (${EXTENSION_SKILLS.join(", ")})${changed ? `: ${changed} files applied` : " in place"}`);
const plugin = pluginInfo();
const skills = skillProblems(plugin, cli);
if (!skills.length) ok(`HyperFrames skills ${plugin.version}: ${plugin.skills.length} skills (${plugin.skills.join(", ")})`);
else for (const s of skills) bad(s, "npm run skills:update");

if (cli) {
  if (process.env.HYPERFRAMES_BROWSER_PATH?.trim()) ok(`Chrome from HYPERFRAMES_BROWSER_PATH: ${process.env.HYPERFRAMES_BROWSER_PATH}`);
  else {
    console.log(dim("… finding or downloading the Chrome HyperFrames renders with (about 150 MB the first time)"));
    const r = await hf(["browser", "ensure"], { cwd: process.cwd(), timeoutMs: 15 * 60_000, onLine: progressPrinter((l) => console.log(dim(`  ${l}`))) });
    if (r.code !== 0) bad("Chrome download failed", "Run npx hyperframes browser ensure --force, or set HYPERFRAMES_BROWSER_PATH to a Chrome/Chromium binary in .env");
  }
}

const pf = await preflight({ voice: true });
if (pf.ffmpeg) ok("FFmpeg and FFprobe");
else bad("FFmpeg/FFprobe not found", "brew install ffmpeg");
if (pf.browser.ok) ok(`Chrome for rendering: ${pf.browser.detail}`);
else if (cli) bad(`Chrome for rendering: ${pf.browser.detail}`, "npx hyperframes browser ensure --force");
console.log(
  pf.voice.provider
    ? `${green("✓")} Narration (optional, --voice): ${pf.voice.provider}${pf.voice.engine === "explainer" ? " (word timings from ElevenLabs)" : ""}`
    : `${dim("·")} Narration (optional, --voice) is not set up: add ELEVENLABS_API_KEY or HEYGEN_API_KEY to .env, or run npm run setup:voice for the free local voice`,
);
const img = imageSettings();
let illustration = "a neutral built-in style";
try {
  const kit = brandKit(resolveProduct(undefined));
  if (kit.illustration) illustration = `the product's illustration style${kit.illustration.references.length ? ` + ${kit.illustration.references.length} reference image(s)` : ""}`;
} catch {}
console.log(
  img.available
    ? `${green("✓")} Pictures (optional): ${img.mock ? "placeholders (IMAGE_MOCK=1)" : `OpenAI ${img.model}, ${img.quality} quality`}, in ${illustration}`
    : `${dim("·")} Pictures (optional) are off: add OPENAI_API_KEY to .env to generate them in the product's illustration style`,
);
console.log(
  soundSettings().available
    ? `${green("✓")} Music and sound effects (optional, --music auto|<mood>, --sfx): ElevenLabs`
    : `${dim("·")} Composed music and sound effects (optional) are off: add ELEVENLABS_API_KEY to .env`,
);

if (problems.length) {
  console.log(`\n${red(`${problems.length} problem(s)`)} to fix before making videos.`);
  process.exit(1);
}
console.log(`\nReady. Try:\n  npm run video -- "Explain what an AI agent is to a finance team in 30 seconds"\n  npm run web   ${dim("(http://localhost:5050)")}`);
