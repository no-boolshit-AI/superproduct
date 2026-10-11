/** The Bash and file policy: what a HyperFrames run needs is allowed, everything risky is refused with a reason. */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { checkBash, checkFileTool, localCli, parseShell, rootsFor } from "../src/guard.js";

const agent = path.resolve("/opt/agents/explainer-agent");
const job = path.join(agent, "out", "20261007-120000-what-is-rag");
const project = path.join(job, "project");
const plugin = path.join(agent, "vendor", "hyperframes");
const r = rootsFor(job, project, plugin, agent);
const S = (s: string) => path.join(plugin, "skills", s);

const allowed: string[] = [
  "hyperframes lint",
  "npx hyperframes check",
  "npx --yes hyperframes@0.8.140 snapshot --at 1.5,4.2",
  `node "${S("faceless-explainer/scripts/build-frame.mjs")}" --preset cobalt-grid --hyperframes .`,
  `node "${S("hyperframes/scripts/plugin-cli.mjs")}" render --quality delivery --output renders/video.mp4`,
  `node "${S("hyperframes/scripts/plugin-cli.mjs")}" --script "${S("faceless-explainer/scripts/frame-packets.mjs")}" --project "${project}"`,
  `node ${S("faceless-explainer/scripts/audio.mjs")} --script ./SCRIPT.md --storyboard ./STORYBOARD.md --hyperframes . --out ./audio_meta.json &`,
  `node ${S("faceless-explainer/scripts/frame-packets.mjs")} --project "$PROJECT_DIR" --storyboard "$PROJECT_DIR/STORYBOARD.md"`,
  "mkdir -p compositions/frames && ls compositions",
  "cat <<'EOF' > compositions/frames/01-hook.html\n<template><script>const t = `${x}`; $(foo)</script></template>\nEOF",
  "ffprobe -v error -show_entries format=duration -of csv=p=0 renders/video.mp4",
  "ffmpeg -y -i renders/video.mp4 -vf fps=2,scale=270:-1,tile=6x5 -frames:v 1 snapshots/sheet.jpg",
  "cd compositions && ls -la frames",
  "sleep 20; ls audio_meta.json 2>/dev/null || echo waiting",
  "hyperframes auth status",
  'hyperframes catalog --query "film grain" --json',
  'grep -rn "data-start" compositions/frames | head -20',
  "python3 --version",
  "HYPERFRAMES_X=1 hyperframes render --output renders/draft.mp4 --quality draft 2>&1 | tail -20",
  'echo "/etc/passwd is just text here"',
  `cat ${S("hyperframes/references/brief-format.md")}`,
  `ls ${os.tmpdir()}`,
  "npm run check",
  "timeout 600 hyperframes render -o renders/video.mp4",
  "hyperframes browser path",
];

const denied: [string, RegExp][] = [
  ["curl https://example.com", /network/],
  ["cat ~/.ssh/id_rsa", /outside/],
  ["cat ../../../.env", /secrets/],
  ["hyperframes preview --background", /headless/],
  ["npx hyperframes skills update faceless-explainer", /plugin owns the skills/],
  ["hyperframes upgrade --project .", /pins the HyperFrames version/],
  ["hyperframes publish", /never uploads/],
  ["hyperframes auth login", /auth status/],
  [`node "${S("hyperframes/scripts/plugin-cli.mjs")}" preview`, /headless/],
  ["rm -rf /", /outside/],
  ["rm -rf .", /whole project/],
  ['node -e "require(\'fs\').rmSync(\'/\')"', /bundled HyperFrames skill scripts/],
  ["node ./helper.mjs", /isn't one/],
  ['python3 -c "print(1)"', /bundled/],
  ['bash -c "ls"', /run commands directly/],
  ["echo $(whoami)", /substitution/],
  ["cat <<EOF > x.txt\n$(id)\nEOF", /substitution/],
  ["open renders/video.mp4", /headless/],
  ["ls > /etc/hosts", /redirect/],
  ["cp renders/video.mp4 ~/Desktop/", /outside/],
  ["find . -name '*.html' -delete", /only list files/],
  ["npm install left-pad", /npm is limited/],
  ["git status", /isn't part of a video run/],
  ["ls | xargs rm", /run commands directly/],
  ["hyperframes render -o /Users/someone/video.mp4", /outside/],
  ["env", /run commands directly/],
  ["perl -e 'print 1'", /command list/],
  [`cp x.html ${S("faceless-explainer/SKILL.md")}`, /read-only/],
];

for (const cmd of allowed) {
  const res = checkBash(cmd, r);
  assert.equal(res.ok, true, `should allow: ${cmd}\n  → ${res.reason}`);
}
for (const [cmd, re] of denied) {
  const res = checkBash(cmd, r);
  assert.equal(res.ok, false, `should deny: ${cmd}`);
  assert.match(res.reason ?? "", re, `reason for ${cmd}: ${res.reason}`);
}
assert.equal(checkBash("hyperframes render --output renders/video.mp4", r).rendersCompositions, true);
assert.equal(checkBash("ls compositions", r).rendersCompositions, false);

// parser details
const segs = parseShell("export A=1; B=two; cmd --x 'y z' \"$A-$B\" 2>&1 | tail -5 && echo done &");
assert.deepEqual(segs.map((s) => s.words[0]), ["export", "B=two", "cmd", "tail", "echo"]);
assert.deepEqual(segs[2].words, ["cmd", "--x", "y z", "1-two"], "variables set earlier in the command expand later");
assert.deepEqual(parseShell("C=3 cmd $C")[0].words, ["C=3", "cmd", ""], "a prefix assignment doesn't expand on its own line (bash semantics)");

// npx / the plugin launcher / npm scripts run the installed CLI instead of fetching another copy
const launcher = `node "${S("hyperframes/scripts/plugin-cli.mjs")}"`;
const rewrites: [string, string][] = [
  ["npx hyperframes lint", "hyperframes lint"],
  ["npx --yes hyperframes@0.8.140 snapshot --at 1.5,4.2 && npx -y hyperframes check", "hyperframes snapshot --at 1.5,4.2 && hyperframes check"],
  [`${launcher} render --output renders/video.mp4`, "hyperframes render --output renders/video.mp4"],
  [`${launcher} --script "${S("faceless-explainer/scripts/frame-packets.mjs")}" --project .`, `node "${S("faceless-explainer/scripts/frame-packets.mjs")}" --project .`],
  ["npm run render -- --quality draft", "hyperframes render --quality draft"],
  ["cd compositions; npm run check", "cd compositions; hyperframes check"],
  ["hyperframes lint", "hyperframes lint"],
  ["ls npx-notes", "ls npx-notes"],
];
// an agent folder with spaces in its path (the plugin launcher is quoted)
const spaced = path.resolve("/Users/someone/Projects/no boolshit AI/agents/explainer-agent");
const sp = (x: string) => path.join(spaced, "vendor", "hyperframes", "skills", x);
const rs = rootsFor(path.join(spaced, "out", "j"), path.join(spaced, "out", "j", "project"), path.join(spaced, "vendor", "hyperframes"), spaced);
rewrites.push(
  [`node "${sp("hyperframes/scripts/plugin-cli.mjs")}" lint`, "hyperframes lint"],
  [`node '${sp("hyperframes/scripts/plugin-cli.mjs")}' --script '${sp("faceless-explainer/scripts/frame-packets.mjs")}' --project .`, `node '${sp("faceless-explainer/scripts/frame-packets.mjs")}' --project .`],
);
assert.equal(checkBash(`node "${sp("faceless-explainer/scripts/build-frame.mjs")}" --preset cobalt-grid --hyperframes .`, rs).ok, true, "quoted plugin paths with spaces");
assert.equal(checkBash(`cat "${sp("faceless-explainer/SKILL.md")}"`, rs).ok, true);
for (const [from, to] of rewrites) {
  assert.equal(localCli(from), to, from);
  assert.equal(checkBash(to, to.includes("no boolshit AI") ? rs : r).ok, true, `rewritten form allowed: ${to}`);
}

// file tools
const ft = (tool: string, input: Record<string, unknown>) => checkFileTool(tool, input, r);
assert.equal(ft("Read", { file_path: path.join(plugin, "skills/faceless-explainer/SKILL.md") }), null);
assert.equal(ft("Read", { file_path: path.join(job, "brief.md") }), null);
assert.equal(ft("Read", { file_path: "STORYBOARD.md" }), null);
assert.match(ft("Read", { file_path: "/etc/passwd" }) ?? "", /outside/);
assert.match(ft("Read", { file_path: path.join(agent, ".env") }) ?? "", /secrets/);
assert.equal(ft("Write", { file_path: "compositions/frames/01-hook.html" }), null);
assert.match(ft("Write", { file_path: path.join(plugin, "skills/x/SKILL.md") }) ?? "", /read-only/);
assert.match(ft("Write", { file_path: path.join(job, "job.json") }) ?? "", /limited to the HyperFrames project/);
assert.match(ft("Edit", { file_path: "/Users/someone/notes.md" }) ?? "", /outside|limited/);
assert.equal(ft("Grep", { pattern: "data-start", path: "compositions" }), null);
assert.match(ft("Glob", { pattern: "/etc/**" }) ?? "", /outside/);

console.log(`✓ guard OK: ${allowed.length} allowed, ${denied.length} denied`);
