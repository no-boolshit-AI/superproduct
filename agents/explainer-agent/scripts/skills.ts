/**
 * The bundled HyperFrames plugin (vendor/hyperframes: every published HyperFrames skill, pinned to the CLI version,
 * plus explainer-agent's own extensions from extensions/hyperframes: clear-explainer, editorial, vox-collage).
 *   npm run skills:check              list the skills and check them against the installed CLI
 *   npm run skills:update [-- 0.9.1]  replace them with a release (default: the latest) and pin the CLI to match;
 *                                     then run npm install
 * The skills come from the release's tag on github.com/heygen-com/hyperframes (Apache-2.0), the same files the
 * HyperFrames Claude Code plugin installs.
 */
import "../src/env.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXTENSION_SKILLS, PLUGIN_DIR, REQUIRED_SKILLS, ROOT, cliVersion, pluginInfo, skillProblems } from "../src/config.js";
import { applyExtensions, extensionStatus } from "../src/extensions.js";

const [cmd = "check", wanted] = process.argv.slice(2);
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

if (cmd === "check") {
  const info = pluginInfo();
  const cli = cliVersion();
  console.log(`HyperFrames plugin ${info.version ?? "missing"} in ${path.relative(ROOT, PLUGIN_DIR)} · CLI ${cli ?? "not installed"}`);
  for (const s of info.skills) console.log(`  ${EXTENSION_SKILLS.includes(s) ? "◆" : REQUIRED_SKILLS.includes(s) ? "●" : "○"} hyperframes:${s}`);
  console.log(dim("  ● used by the explainer workflows · ◆ explainer-agent extension · ○ also available to the agent"));
  const ext = extensionStatus();
  if (ext.copied.length || ext.appended.length) console.log(`✗ skill extensions not applied (${ext.copied.length + ext.appended.length} files): run npm run setup`);
  const problems = skillProblems(info, cli);
  for (const p of problems) console.log(`✗ ${p}`);
  process.exit(problems.length ? 1 : 0);
}

if (cmd !== "update") {
  console.log("Usage: npm run skills:check | npm run skills:update [-- <version>]");
  process.exit(1);
}

const version = wanted?.replace(/^v/, "") || ((await (await fetch("https://registry.npmjs.org/hyperframes/latest")).json()) as { version: string }).version;
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) throw new Error(`Not a version: ${version}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hyperframes-skills-"));
const url = `https://codeload.github.com/heygen-com/hyperframes/tar.gz/refs/tags/v${version}`;
console.log(`Downloading HyperFrames ${version} skills… ${dim(url)}`);
const res = await fetch(url);
if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText} (is v${version} a HyperFrames release?)`);
await new Promise<void>((resolve, reject) => {
  const tar = spawn("tar", ["-xzf", "-", "-C", tmp], { stdio: ["pipe", "inherit", "inherit"] });
  tar.on("error", reject);
  tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`))));
  (async () => {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) if (!tar.stdin.write(chunk)) await new Promise((r) => tar.stdin.once("drain", r));
    tar.stdin.end();
  })().catch(reject);
});
const src = path.join(tmp, fs.readdirSync(tmp).find((d) => d.startsWith("hyperframes-")) ?? "");
const manifest = JSON.parse(fs.readFileSync(path.join(src, ".claude-plugin", "plugin.json"), "utf8"));
if (manifest.name !== "hyperframes" || manifest.version !== version) throw new Error(`Unexpected plugin manifest in the release: ${manifest.name}@${manifest.version}`);

// replace the bundle: manifests, licence and skills (tests left out)
const next = `${PLUGIN_DIR}.next`;
fs.rmSync(next, { recursive: true, force: true });
fs.mkdirSync(path.join(next, ".claude-plugin"), { recursive: true });
fs.copyFileSync(path.join(src, ".claude-plugin", "plugin.json"), path.join(next, ".claude-plugin", "plugin.json"));
for (const f of ["plugin.json", "LICENSE"]) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(next, f));
fs.cpSync(path.join(src, "skills"), path.join(next, "skills"), { recursive: true, filter: (p) => !/(\.test\.mjs|_test\.py)$/.test(p) });
const ext = applyExtensions(next); // explainer-agent's own skills, rules, blueprints and preset on top
if (ext.missingTargets.length) console.log(`! skill extensions not appended (missing in ${version}): ${ext.missingTargets.join(", ")}`);
const missing = REQUIRED_SKILLS.filter((s) => !fs.existsSync(path.join(next, "skills", s, "SKILL.md")));
if (missing.length) throw new Error(`The ${version} release lacks skills this agent needs: ${missing.join(", ")}. Kept the current bundle.`);
fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
fs.renameSync(next, PLUGIN_DIR);
fs.rmSync(tmp, { recursive: true, force: true });

// pin the CLI and its helper packages to the same release
const pkgFile = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
for (const name of ["hyperframes", "@hyperframes/core", "@hyperframes/producer"]) if (pkg.dependencies[name]) pkg.dependencies[name] = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + "\n");
const info = pluginInfo();
console.log(`✓ HyperFrames skills ${info.version}: ${info.skills.length} skills. package.json now pins hyperframes ${version}.\nNext: npm install && npm run setup && npm test`);
