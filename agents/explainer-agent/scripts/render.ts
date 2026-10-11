/**
 * Render a finished job again, without Claude: another quality, or a format for editing.
 *   npm run render -- <job-id> [--format mp4|mov|webm] [--quality draft|standard|high]
 * mov is ProRes 4444 with alpha, for DaVinci Resolve, Premiere or Final Cut. The file lands in the job folder
 * (video.mp4 is replaced only by an mp4 render).
 */
import "../src/env.js";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { jobDirFor, readJob } from "../src/agent.js";
import { QUALITIES, isQuality, styleSpec } from "../src/config.js";
import { failureText, hf, localizeGsap, probeVideo } from "../src/hyperframes.js";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { format: { type: "string" }, quality: { type: "string" } } });
const id = positionals[0];
const job = id ? readJob(id) : null;
if (!job) {
  console.log("Usage: npm run render -- <job-id> [--format mp4|mov|webm] [--quality draft|standard|high]");
  process.exit(1);
}
const format = values.format ?? "mp4";
if (!["mp4", "mov", "webm"].includes(format)) throw new Error("--format must be mp4, mov or webm");
const quality = values.quality ?? job.options.quality ?? "high";
if (!isQuality(quality)) throw new Error("--quality must be draft, standard or high");
// the job folder where it is now (job.json keeps the path it was created at, which moves with the folder)
const jobDir = jobDirFor(job.id);
const project = path.join(jobDir, "project");
if (!fs.existsSync(path.join(project, "index.html"))) throw new Error(`${job.id} has no assembled project to render`);

localizeGsap(project);
const out = `renders/video.${format}`;
console.log(`Rendering ${job.id} → ${out} (${format}, ${quality})…`);
const fps = styleSpec(job.options.style).fps; // vox-collage is animated on twos at 24 fps
const r = await hf(["render", `--skill=${job.workflow ?? "faceless-explainer"}`, "--quality", QUALITIES[quality], ...(fps ? ["--fps", String(fps)] : []), "--format", format, "--output", out], {
  cwd: project,
  timeoutMs: 60 * 60_000,
  onLine: (l) => {
    const m = l.match(/(\d+)%/);
    if (m) process.stdout.write(`\r  ${m[1]}%`);
  },
});
if (r.code !== 0) throw new Error(`Render failed:\n${failureText(r)}`);
const dest = path.join(jobDir, `video.${format}`);
fs.copyFileSync(path.join(project, out), dest);
const info = probeVideo(dest);
console.log(`\n✓ ${path.relative(process.cwd(), dest)}${info ? ` · ${info.width}×${info.height} · ${info.durationSec} s` : ""}`);
